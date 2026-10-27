import { scheduleFromSettings } from '../restaurant/schedule.service.js';
import { and, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm';
import {
  resolveMenuOptions,
  optionSummary,
  type SelectedMenuOption,
  isWithinHours,
  isValidScheduledTime,
  Actor,
  OrderStatus,
  RestaurantStatus,
  canTransition,
  fromDecimalString,
  haversineKm,
  matchDeliveryZone,
  multiply,
  sum,
  toDecimalString,
  type DeliveryZoneRule,
  type PlaceOrderInput,
} from '@nayaro/shared';
import { db } from '../../db/client.js';
import {
  deliveryZones,
  foodItems,
  orderItems,
  orderStatusHistory,
  orders,
  restaurantCustomers,
  restaurantSettings,
  restaurants,
} from '../../db/schema/index.js';
import { badRequest, conflict, notFound, unprocessable } from '../../http/errors.js';
import type { CustomerContext } from '../auth/auth.types.js';
import { sendOrderNotification } from '../whatsapp/whatsapp.service.js';
import { emitRealtime, emitToUser } from '../realtime/events.js';
import { pushToRestaurant } from '../../lib/push.js';
import { TRACKING_ALPHABET, formatMoney } from '@nayaro/shared';
import { randomBytes } from 'node:crypto';
import { env } from '../../config/env.js';

export interface PlacedOrder {
  id: number;
  orderNumber: string;
  trackingCode: string;
  status: OrderStatus;
  subtotalMinor: number;
  deliveryFeeMinor: number;
  totalMinor: number;
  distanceKm: number;
  scheduledFor: Date | null;
  prepareAt: Date | null;
  scheduleTimezone: string | null;
  items: { name: string; quantity: number; unitPriceMinor: number; lineTotalMinor: number; selections: SelectedMenuOption[] }[];
}

/** "NY" + 8 unambiguous characters: ~10¹² combinations, so codes are not guessable. */
export function generateTrackingCode(): string {
  const bytes = randomBytes(8);
  let code = 'NY';
  for (const byte of bytes) code += TRACKING_ALPHABET[byte % TRACKING_ALPHABET.length];
  return code;
}

/**
 * Place an order.
 *
 * Everything that costs money is derived here, inside one transaction, from
 * rows the client cannot touch:
 *
 *   - unit prices come from `food_items`, never from the request
 *   - the distance is recomputed with Haversine from the restaurant's stored
 *     coordinates and the customer's pin
 *   - the delivery fee comes from whichever zone that distance falls into
 *   - if no zone matches, the order is refused outright
 *
 * The request contributes only item ids, quantities, contact details and a
 * destination. A tampered price, distance or fee is not rejected — it is simply
 * never read.
 */
export async function placeOrder(input: PlaceOrderInput, customer: CustomerContext): Promise<PlacedOrder> {
  // Replay of the same submission returns the original order rather than a duplicate.
  if (input.idempotencyKey) {
    const [existing] = await db
      .select({ id: orders.id, orderNumber: orders.orderNumber })
      .from(orders)
      .where(
        and(
          eq(orders.restaurantId, input.restaurantId),
          eq(orders.idempotencyKey, input.idempotencyKey),
          eq(orders.customerId, customer.customerId),
        ),
      )
      .limit(1);
    if (existing) return loadPlacedOrder(existing.id);
  }

  const result = await db.transaction(async (tx) => {
    const [restaurant] = await tx
      .select({
        id: restaurants.id,
        name: restaurants.name,
        status: restaurants.status,
        isOpen: restaurants.isOpen,
        latitude: restaurants.latitude,
        longitude: restaurants.longitude,
      })
      .from(restaurants)
      .where(and(eq(restaurants.id, input.restaurantId), isNull(restaurants.deletedAt)))
      .limit(1);

    if (!restaurant) throw notFound('That restaurant is not available.', 'RESTAURANT_NOT_FOUND');
    if (restaurant.status !== RestaurantStatus.ACTIVE) {
      throw unprocessable('This restaurant is not accepting orders.', 'RESTAURANT_INACTIVE');
    }
    if (restaurant.isOpen !== 1) {
      throw unprocessable('This restaurant is currently closed.', 'RESTAURANT_CLOSED');
    }
    if (restaurant.latitude === null || restaurant.longitude === null) {
      throw unprocessable(
        'This restaurant has not set its location, so delivery cannot be calculated.',
        'RESTAURANT_LOCATION_MISSING',
      );
    }

    // Settings row is locked first: it holds the order-number counter, and
    // taking it in a consistent order avoids deadlocks between concurrent orders.
    const [settings] = await tx
      .select({
        timezone: restaurantSettings.timezone,
        weeklyHours: restaurantSettings.weeklyHours,
        holidayClosures: restaurantSettings.holidayClosures,
        schedulingEnabled: restaurantSettings.schedulingEnabled,
        maxOrdersPerSlot: restaurantSettings.maxOrdersPerSlot,
        defaultPrepTimeMinutes: restaurantSettings.defaultPrepTimeMinutes,
        acceptsOrders: restaurantSettings.acceptsOrders,
        minOrderAmount: restaurantSettings.minOrderAmount,
        orderNumberPrefix: restaurantSettings.orderNumberPrefix,
        nextOrderNumber: restaurantSettings.nextOrderNumber,
      })
      .from(restaurantSettings)
      .where(eq(restaurantSettings.restaurantId, restaurant.id))
      .for('update')
      .limit(1);

    if (!settings || settings.acceptsOrders !== 1) {
      throw unprocessable('This restaurant is not accepting orders.', 'ORDERS_PAUSED');
    }

    if (input.idempotencyKey) {
      const [existing] = await tx.select({ id: orders.id, customerId: orders.customerId })
        .from(orders)
        .where(and(eq(orders.restaurantId, restaurant.id), eq(orders.idempotencyKey, input.idempotencyKey)))
        .for('update').limit(1);
      if (existing) {
        if (existing.customerId !== customer.customerId) throw conflict('That checkout key is already in use.', 'IDEMPOTENCY_CONFLICT');
        return { replayOrderId: existing.id };
      }
    }

    const now = new Date();
    const schedule = scheduleFromSettings(settings);
    const scheduledFor = input.scheduledFor ? new Date(input.scheduledFor) : null;
    if (scheduledFor) {
      if (!isValidScheduledTime(schedule, scheduledFor, now)) {
        throw unprocessable('Choose an available dispatch slot with enough preparation time, within the next seven days.', 'SCHEDULE_UNAVAILABLE');
      }
      // The settings lock serializes slot reservations, including simultaneous checkouts.
      const reserved = await tx.select({ id: orders.id }).from(orders)
        .where(and(eq(orders.restaurantId, restaurant.id), eq(orders.scheduledFor, scheduledFor), notInArray(orders.status, [OrderStatus.CANCELLED, OrderStatus.REJECTED])))
        .for('update');
      if (reserved.length >= schedule.maxOrdersPerSlot) throw conflict('That slot just filled up. Please choose another time.', 'SLOT_FULL');
    } else if (!isWithinHours(schedule, now)) {
      throw unprocessable('This restaurant is outside its opening hours. Choose a scheduled slot if available.', 'OUTSIDE_OPENING_HOURS');
    }
    const prepareAt = scheduledFor ? new Date(scheduledFor.getTime() - schedule.defaultPrepTimeMinutes * 60_000) : null;

    /* ---- prices, straight from the menu ---- */

    const requestedIds = [...new Set(input.items.map((item) => item.foodItemId))];
    const menuRows = await tx
      .select({
        id: foodItems.id,
        name: foodItems.name,
        optionGroups: foodItems.optionGroups,
        price: foodItems.price,
        discountPrice: foodItems.discountPrice,
        isAvailable: foodItems.isAvailable,
      })
      .from(foodItems)
      .where(
        and(
          inArray(foodItems.id, requestedIds),
          // Scoping to the tenant here is what stops a customer ordering one
          // restaurant's dish at another restaurant's checkout.
          eq(foodItems.restaurantId, restaurant.id),
          isNull(foodItems.deletedAt),
        ),
      )
      .for('update');

    const menu = new Map(menuRows.map((row) => [row.id, row]));

    for (const id of requestedIds) {
      const row = menu.get(id);
      if (!row) throw badRequest('One of the items is no longer on the menu.', 'ITEM_NOT_FOUND');
      if (row.isAvailable !== 1) {
        throw unprocessable(`${row.name} is currently unavailable.`, 'ITEM_UNAVAILABLE');
      }
    }

    const lines = input.items.map((line) => {
      const row = menu.get(line.foodItemId)!;
      const price = fromDecimalString(row.price);
      const discount = row.discountPrice ? fromDecimalString(row.discountPrice) : null;
      const resolved = resolveMenuOptions(row.optionGroups ?? [], line.optionIds ?? []);
      if (!resolved.ok) throw unprocessable(`${row.name}: ${resolved.message}`, 'INVALID_ITEM_OPTIONS');
      const unitPriceMinor = (discount !== null && discount < price ? discount : price) + resolved.extraMinor;
      return {
        selections: resolved.selections,
        foodItemId: row.id,
        name: row.name,
        quantity: line.quantity,
        unitPriceMinor,
        lineTotalMinor: multiply(unitPriceMinor, line.quantity),
        note: line.note ?? null,
      };
    });

    const subtotalMinor = sum(lines.map((line) => line.lineTotalMinor));

    const minOrderMinor = fromDecimalString(settings.minOrderAmount);
    if (minOrderMinor > 0 && subtotalMinor < minOrderMinor) {
      throw unprocessable(
        `This restaurant has a minimum order of ${toDecimalString(minOrderMinor)}.`,
        'BELOW_MINIMUM_ORDER',
      );
    }

    /* ---- distance and fee, recomputed server-side ---- */

    const zoneRows = await tx
      .select()
      .from(deliveryZones)
      .where(and(eq(deliveryZones.restaurantId, restaurant.id), eq(deliveryZones.isActive, 1)));

    const zones: DeliveryZoneRule[] = zoneRows.map((row) => ({
      id: row.id,
      name: row.name,
      minDistanceKm: row.minDistanceKm,
      maxDistanceKm: row.maxDistanceKm,
      feeMinor: fromDecimalString(row.deliveryFee),
      isActive: true,
    }));

    const distanceKm = haversineKm(
      { latitude: restaurant.latitude, longitude: restaurant.longitude },
      { latitude: input.delivery.latitude, longitude: input.delivery.longitude },
    );

    const quote = matchDeliveryZone(distanceKm, zones);
    if (!quote.deliverable) {
      throw unprocessable(
        quote.reason === 'NO_ZONES_CONFIGURED'
          ? 'This restaurant has not set up delivery yet.'
          : `Sorry — you are ${quote.distanceKm} km away, outside this restaurant's delivery area.`,
        'OUTSIDE_DELIVERY_AREA',
        { distanceKm: quote.distanceKm, maxSupportedKm: quote.maxSupportedKm },
      );
    }

    const deliveryFeeMinor = quote.feeMinor;
    const totalMinor = subtotalMinor + deliveryFeeMinor;
    if (totalMinor > 9_999_999_999) throw unprocessable('This order exceeds the maximum supported total. Please reduce quantities.', 'ORDER_TOTAL_TOO_LARGE');

    /* ---- customer: always the signed-in account, never the request body ---- */

    const customerId = customer.customerId;

    /* ---- order number, reserved under the settings row lock ---- */

    const orderNumber = `${settings.orderNumberPrefix}${settings.nextOrderNumber}`;
    const trackingCode = generateTrackingCode();
    await tx
      .update(restaurantSettings)
      .set({ nextOrderNumber: settings.nextOrderNumber + 1 })
      .where(eq(restaurantSettings.restaurantId, restaurant.id));

    const [orderInsert] = await tx.insert(orders).values({
      restaurantId: restaurant.id,
      orderNumber,
      trackingCode,
      customerId,
      customerName: customer.name,
      customerPhone: customer.phone,
      customerEmail: customer.email,
      deliveryAddress: input.delivery.address,
      deliveryLandmark: input.delivery.landmark ?? null,
      deliveryLatitude: input.delivery.latitude,
      deliveryLongitude: input.delivery.longitude,
      distanceKm: quote.distanceKm,
      deliveryZoneId: quote.zone.id,
      subtotal: toDecimalString(subtotalMinor),
      deliveryFee: toDecimalString(deliveryFeeMinor),
      total: toDecimalString(totalMinor),
      status: OrderStatus.PENDING,
      paymentMethod: input.paymentMethod,
      note: input.note ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      scheduledFor,
      prepareAt,
      scheduleTimezone: scheduledFor ? schedule.timezone : null,
    });

    const orderId = orderInsert.insertId;

    await tx.insert(orderItems).values(
      lines.map((line) => ({
        orderId,
        restaurantId: restaurant.id,
        foodItemId: line.foodItemId,
        selections: line.selections,
        nameSnapshot: line.name,
        unitPrice: toDecimalString(line.unitPriceMinor),
        quantity: line.quantity,
        lineTotal: toDecimalString(line.lineTotalMinor),
        note: line.note,
      })),
    );

    await tx.insert(orderStatusHistory).values({
      orderId,
      restaurantId: restaurant.id,
      fromStatus: null,
      toStatus: OrderStatus.PENDING,
      changedByActor: Actor.CUSTOMER,
      note: 'Order placed',
    });

    /* ---- per-tenant customer aggregate, for repeat-customer reporting ---- */

    await tx
      .insert(restaurantCustomers)
      .values({
        restaurantId: restaurant.id,
        customerId,
        orderCount: 1,
        firstOrderAt: new Date(),
        lastOrderAt: new Date(),
      })
      .onDuplicateKeyUpdate({
        set: {
          orderCount: sql`${restaurantCustomers.orderCount} + 1`,
          lastOrderAt: new Date(),
        },
      });

    return {
      id: orderId,
      orderNumber,
      trackingCode,
      status: OrderStatus.PENDING,
      subtotalMinor,
      deliveryFeeMinor,
      totalMinor,
      distanceKm: quote.distanceKm,
      restaurantName: restaurant.name,
      scheduledFor,
      prepareAt,
      scheduleTimezone: scheduledFor ? schedule.timezone : null,
      items: lines.map((line) => ({
        name: line.name,
        selections: line.selections,
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor,
        lineTotalMinor: line.lineTotalMinor,
      })),
    };
  });

  if ('replayOrderId' in result && result.replayOrderId !== undefined) return loadPlacedOrder(result.replayOrderId);

  /* ---- fan-out, all post-commit and all best-effort ----
     Three independent channels, because each covers a case the others cannot:
       SSE   — the dashboard is open right now
       Push  — the dashboard is closed; the OS wakes the service worker
       WhatsApp — the restaurant is not at a computer at all (behind
                  WHATSAPP_ENABLED until that integration ships)
     None of them is awaited into the caller: the order is already committed,
     and a notification outage must never surface as a failed checkout. */

  emitRealtime({
    type: 'order.created',
    restaurantId: input.restaurantId,
    restaurantName: result.restaurantName,
    order: {
      id: result.id,
      orderNumber: result.orderNumber,
      status: result.status,
      customerName: customer.name,
      totalMinor: result.totalMinor,
      distanceKm: result.distanceKm,
      placedAt: new Date().toISOString(),
      scheduledFor: result.scheduledFor,
      items: result.items.map((item) => ({ name: item.selections.length ? `${item.name} (${optionSummary(item.selections)})` : item.name, quantity: item.quantity })),
    },
  });

  void pushToRestaurant(input.restaurantId, {
    title: `${result.scheduledFor ? 'Scheduled order' : 'New order'} #${result.orderNumber}`,
    body: `${customer.name} · ${formatMoney(result.totalMinor)} · ${result.scheduledFor ? `Dispatch ${new Intl.DateTimeFormat('en-GB', { timeZone: result.scheduleTimezone ?? 'Asia/Kathmandu', dateStyle: 'short', timeStyle: 'short' }).format(result.scheduledFor)}` : `${result.distanceKm} km`}`,
    url: '/dashboard/orders',
    tag: `order-${result.id}`,
    orderId: result.id,
  });

  if (env.WHATSAPP_ENABLED) void sendOrderNotification({
    restaurantId: input.restaurantId,
    orderId: result.id,
    orderNumber: result.orderNumber,
    restaurantName: result.restaurantName,
    items: result.items.map((item) => ({ name: item.selections.length ? `${item.name} (${optionSummary(item.selections)})` : item.name, quantity: item.quantity })),
    subtotalMinor: result.subtotalMinor,
    deliveryFeeMinor: result.deliveryFeeMinor,
    totalMinor: result.totalMinor,
    customerName: customer.name,
    customerPhone: customer.phone,
    address: input.delivery.address,
    distanceKm: result.distanceKm,
    note: input.note,
    scheduledFor: result.scheduledFor,
    scheduleTimezone: result.scheduleTimezone,
  });

  const { restaurantName: _unused, ...placed } = result;
  return placed;
}

async function loadPlacedOrder(orderId: number): Promise<PlacedOrder> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw notFound('Order not found.', 'ORDER_NOT_FOUND');

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    trackingCode: order.trackingCode ?? '',
    status: order.status,
    subtotalMinor: fromDecimalString(order.subtotal),
    deliveryFeeMinor: fromDecimalString(order.deliveryFee),
    totalMinor: fromDecimalString(order.total),
    distanceKm: order.distanceKm,
    scheduledFor: order.scheduledFor,
    prepareAt: order.prepareAt,
    scheduleTimezone: order.scheduleTimezone,
    items: items.map((item) => ({
      name: item.nameSnapshot,
      selections: item.selections ?? [],
      quantity: item.quantity,
      unitPriceMinor: fromDecimalString(item.unitPrice),
      lineTotalMinor: fromDecimalString(item.lineTotal),
    })),
  };
}

/**
 * Move an order to a new status.
 *
 * The transition table is the single authority on what is legal; the tenant
 * predicate is what stops one restaurant touching another's orders.
 */
export async function updateOrderStatus(params: {
  restaurantId: number;
  orderId: number;
  to: OrderStatus;
  actor: Actor;
  userId: number | null;
  reason?: string | undefined;
}): Promise<{ id: number; status: OrderStatus }> {
  const result = await db.transaction(async (tx) => {
    const [order] = await tx
      .select({
        id: orders.id,
        status: orders.status,
        customerId: orders.customerId,
        total: orders.total,
        riderUserId: orders.riderUserId,
        prepareAt: orders.prepareAt,
      })
      .from(orders)
      .where(and(eq(orders.id, params.orderId), eq(orders.restaurantId, params.restaurantId)))
      .for('update')
      .limit(1);

    if (!order || (params.actor === Actor.RIDER && (params.userId === null || order.riderUserId !== params.userId))) {
      throw notFound('Order not found.', 'ORDER_NOT_FOUND');
    }

    if (params.to === OrderStatus.PREPARING && order.prepareAt && order.prepareAt.getTime() > Date.now()) {
      throw conflict('This scheduled order is not due for preparation yet.', 'PREPARATION_TOO_EARLY');
    }

    const check = canTransition(order.status, params.to, params.actor, params.reason);
    if (!check.ok) throw conflict(check.message, check.code);

    const now = new Date();
    await tx
      .update(orders)
      .set({
        status: params.to,
        ...(params.to === OrderStatus.ACCEPTED ? { acceptedAt: now } : {}),
        ...(params.to === OrderStatus.READY ? { readyAt: now } : {}),
        ...(params.to === OrderStatus.OUT_FOR_DELIVERY ? { pickedUpAt: now } : {}),
        ...(params.to === OrderStatus.DELIVERED ? { deliveredAt: now } : {}),
        ...(params.to === OrderStatus.CANCELLED || params.to === OrderStatus.REJECTED
          ? { cancelledReason: params.reason ?? null }
          : {}),
      })
      .where(eq(orders.id, order.id));

    await tx.insert(orderStatusHistory).values({
      orderId: order.id,
      restaurantId: params.restaurantId,
      fromStatus: order.status,
      toStatus: params.to,
      changedByUserId: params.userId,
      changedByActor: params.actor,
      note: params.reason ?? null,
    });

    // Lifetime value counts delivered orders only; cancellations are tracked
    // separately so a restaurant can spot a problem customer.
    if (params.to === OrderStatus.DELIVERED) {
      await tx
        .update(restaurantCustomers)
        .set({ totalSpent: sql`${restaurantCustomers.totalSpent} + ${order.total}` })
        .where(
          and(
            eq(restaurantCustomers.restaurantId, params.restaurantId),
            eq(restaurantCustomers.customerId, order.customerId),
          ),
        );
    } else if (params.to === OrderStatus.CANCELLED) {
      await tx
        .update(restaurantCustomers)
        .set({ cancelledCount: sql`${restaurantCustomers.cancelledCount} + 1` })
        .where(
          and(
            eq(restaurantCustomers.restaurantId, params.restaurantId),
            eq(restaurantCustomers.customerId, order.customerId),
          ),
        );
    }

    return { id: order.id, status: params.to, riderUserId: order.riderUserId };
  });

  emitRealtime({ type: 'order.status', restaurantId: params.restaurantId, orderId: result.id, status: result.status });
  if (result.riderUserId) {
    emitToUser(result.riderUserId, { type: 'order.status', orderId: result.id, status: result.status });
  }
  return { id: result.id, status: result.status };
}
