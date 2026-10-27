import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import { Actor, OrderStatus, PaymentMethod, RestaurantStatus, UserRole } from '@nayaro/shared';
import { closeDatabase, db } from '../src/db/client.js';
import { categories, customers, deliveryZones, emailCodes, foodItems, orders, refreshTokens, restaurantCustomers, restaurantSettings, restaurants, users } from '../src/db/schema/index.js';
import { hashToken } from '../src/lib/tokens.js';
import { refreshSession } from '../src/modules/auth/auth.service.js';
import { consumeCode } from '../src/modules/auth/email-codes.service.js';
import * as events from '../src/modules/realtime/events.js';
import { placeOrder, updateOrderStatus } from '../src/modules/orders/orders.service.js';

// Run only against a dedicated migrated test database. Never truncate shared data.
if (process.env.NODE_ENV !== 'test' || !process.env.DB_NAME?.endsWith('_test')) {
  throw new Error('Integration tests require NODE_ENV=test and a DB_NAME ending in _test.');
}
const suffix = randomUUID();
const email = `${suffix}@example.test`;
let userId: number;
let restaurantId: number;
let customerId: number;
let orderId: number;
let checkoutOrderId: number;
afterAll(async () => {
  vi.restoreAllMocks();
  if (checkoutOrderId) await db.delete(orders).where(eq(orders.id, checkoutOrderId));
  if (restaurantId) await db.delete(restaurantCustomers).where(eq(restaurantCustomers.restaurantId, restaurantId));
  if (orderId) await db.delete(orders).where(eq(orders.id, orderId));
  if (customerId) await db.delete(customers).where(eq(customers.id, customerId));
  if (restaurantId) await db.delete(foodItems).where(eq(foodItems.restaurantId, restaurantId));
  if (restaurantId) await db.delete(restaurants).where(eq(restaurants.id, restaurantId));
  if (userId) await db.delete(users).where(eq(users.id, userId));
  await db.delete(emailCodes).where(eq(emailCodes.email, email));
  await closeDatabase();
});

describe.sequential('database concurrency protections', () => {
  it('counts every parallel wrong guess and refuses the correct code after the limit', async () => {
    await db.insert(emailCodes).values({ email, purpose: 'PASSWORD_RESET', codeHash: hashToken('123456'), expiresAt: new Date(Date.now() + 60_000), maxAttempts: 5 });
    const attempts = await Promise.allSettled(Array.from({ length: 8 }, () => consumeCode('PASSWORD_RESET', email, '000000')));
    expect(attempts.every((result) => result.status === 'rejected')).toBe(true);
    const [row] = await db.select().from(emailCodes).where(eq(emailCodes.email, email));
    expect(row?.attempts).toBe(5);
    await expect(consumeCode('PASSWORD_RESET', email, '123456')).rejects.toMatchObject({ code: 'CODE_ATTEMPTS_EXCEEDED' });
  });

  it('allows a correct code to be consumed once across parallel requests', async () => {
    await db.update(emailCodes).set({ attempts: 0 }).where(eq(emailCodes.email, email));
    const results = await Promise.allSettled(Array.from({ length: 4 }, () => consumeCode('PASSWORD_RESET', email, '123456')));
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  });

  it('rotates a refresh token once and commits replay revocations', async () => {
    const [inserted] = await db.insert(users).values({ email, name: 'Test customer', passwordHash: 'unused', role: UserRole.CUSTOMER });
    userId = inserted.insertId;
    const token = randomUUID();
    await db.insert(refreshTokens).values({ userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60_000) });
    const results = await Promise.allSettled([refreshSession(token, {}), refreshSession(token, {})]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find((result) => result.status === 'rejected');
    expect(failed?.status === 'rejected' && failed.reason.code).toBe('REFRESH_REPLAYED');
    const live = await db.select().from(refreshTokens).where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
    expect(live).toHaveLength(0);
  });

  it('rejects a former rider and cross-tenant status changes', async () => {
    const [restaurant] = await db.insert(restaurants).values({ slug: suffix, name: 'Test', phone: '+9779800000000', address: 'Test', latitude: 27, longitude: 85, status: RestaurantStatus.ACTIVE });
    restaurantId = restaurant.insertId;
    const [customer] = await db.insert(customers).values({ userId, name: 'Test', phone: `+1${Date.now().toString().slice(-10)}` });
    customerId = customer.insertId;
    const [order] = await db.insert(orders).values({ restaurantId, customerId, orderNumber: suffix.slice(0, 16), customerName: 'Test', customerPhone: '+9779800000000', deliveryAddress: 'Test', deliveryLatitude: 27, deliveryLongitude: 85, distanceKm: 1, subtotal: '100.00', deliveryFee: '0.00', total: '100.00', status: OrderStatus.OUT_FOR_DELIVERY, riderUserId: null });
    orderId = order.insertId;
    await expect(updateOrderStatus({ restaurantId, orderId, to: OrderStatus.DELIVERED, actor: Actor.RIDER, userId })).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' });
    await expect(updateOrderStatus({ restaurantId: restaurantId + 1, orderId, to: OrderStatus.DELIVERED, actor: Actor.RESTAURANT, userId })).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' });
    const [unchanged] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(unchanged?.status).toBe(OrderStatus.OUT_FOR_DELIVERY);
  });

  it('returns the same order for concurrent checkout retries and emits one creation event', async () => {
    await db.insert(restaurantSettings).values({ restaurantId });
    const [category] = await db.insert(categories).values({ restaurantId, name: 'Test', slug: 'test' });
    const [item] = await db.insert(foodItems).values({ restaurantId, categoryId: category.insertId, name: 'Test dish', slug: 'test', price: '100.00' });
    await db.insert(deliveryZones).values({ restaurantId, minDistanceKm: 0, maxDistanceKm: 5, deliveryFee: '10.00' });
    const emitted = vi.spyOn(events, 'emitRealtime');
    const input = { restaurantId, idempotencyKey: randomUUID(), items: [{ foodItemId: item.insertId, quantity: 2 }], delivery: { address: 'Test address', latitude: 27, longitude: 85 }, paymentMethod: PaymentMethod.COD };
    const customer = { customerId, name: 'Test', phone: '+9779800000000', email };
    const results = await Promise.all([placeOrder(input, customer), placeOrder(input, customer)]);
    checkoutOrderId = results[0]!.id;
    expect(results[1]!.id).toBe(checkoutOrderId);
    expect(results[0]!.totalMinor).toBe(21000);
    expect(emitted.mock.calls.filter(([event]) => event.type === 'order.created')).toHaveLength(1);
    const saved = await db.select().from(orders).where(eq(orders.idempotencyKey, input.idempotencyKey));
    expect(saved).toHaveLength(1);
    emitted.mockRestore();
  });

  it('publishes status only after another connection can read the committed change', async () => {
    let observed: Promise<{ status: OrderStatus }[]> | undefined;
    const emitted = vi.spyOn(events, 'emitRealtime').mockImplementation((event) => {
      if (event.type === 'order.status') {
        observed = db.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId)).execute();
      }
    });
    await updateOrderStatus({ restaurantId, orderId, to: OrderStatus.DELIVERED, actor: Actor.RESTAURANT, userId });
    expect((await observed)?.[0]?.status).toBe(OrderStatus.DELIVERED);
    expect(emitted).toHaveBeenCalledTimes(1);
    emitted.mockRestore();
  });
});
