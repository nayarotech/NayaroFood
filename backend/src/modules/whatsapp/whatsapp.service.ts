import { eq } from 'drizzle-orm';
import {
  NotificationChannel,
  NotificationStatus,
  WhatsAppStatus,
  formatMoney,
  maskPhone,
} from '@nayaro/shared';
import { db } from '../../db/client.js';
import { notificationLogs, restaurantSettings } from '../../db/schema/index.js';
import { logger } from '../../config/logger.js';
import { getWhatsAppProvider } from './provider.js';

/**
 * WhatsApp delivery, logged.
 *
 * Two rules the rest of the system depends on:
 *   1. A message is only ever sent to a number whose status is VERIFIED.
 *   2. Sending is best-effort. A failure is recorded and never propagates into
 *      the caller, so a provider outage cannot invalidate a committed order.
 */

export interface OrderNotification {
  restaurantId: number;
  orderId: number;
  orderNumber: string;
  restaurantName: string;
  items: { name: string; quantity: number }[];
  subtotalMinor: number;
  deliveryFeeMinor: number;
  totalMinor: number;
  customerName: string;
  customerPhone: string;
  address: string;
  distanceKm: number;
  scheduledFor?: Date | null;
  scheduleTimezone?: string | null;
  note?: string | null | undefined;
}

function renderOrderMessage(order: OrderNotification): string {
  const lines = [
    `New Food Order #${order.orderNumber}`,
    '',
    `Restaurant: ${order.restaurantName}`,
    '',
    'Items:',
    ...order.items.map((item) => `${item.quantity} x ${item.name}`),
    '',
    `Subtotal: ${formatMoney(order.subtotalMinor)}`,
    `Delivery: ${formatMoney(order.deliveryFeeMinor)}`,
    `Total: ${formatMoney(order.totalMinor)}`,
    '',
    'Customer:',
    `Name: ${order.customerName}`,
    `Phone: ${order.customerPhone}`,
    '',
    'Delivery:',
    `Address: ${order.address}`,
    `Distance: ${order.distanceKm} km`,
  ];
  if (order.scheduledFor) lines.push('', `Scheduled dispatch: ${new Intl.DateTimeFormat('en-GB', { timeZone: order.scheduleTimezone ?? 'Asia/Kathmandu', dateStyle: 'medium', timeStyle: 'short' }).format(order.scheduledFor)} (${order.scheduleTimezone ?? 'Asia/Kathmandu'})`);
  if (order.note) lines.push('', `Note: ${order.note}`);
  lines.push('', 'Order Status:', 'PENDING');
  return lines.join('\n');
}

/** The verified destination for a restaurant, or null if it has none. */
async function verifiedNumber(restaurantId: number): Promise<string | null> {
  const [row] = await db
    .select({
      whatsappNumber: restaurantSettings.whatsappNumber,
      whatsappStatus: restaurantSettings.whatsappStatus,
    })
    .from(restaurantSettings)
    .where(eq(restaurantSettings.restaurantId, restaurantId))
    .limit(1);

  if (!row?.whatsappNumber) return null;
  // An unverified number is treated as no number at all.
  return row.whatsappStatus === WhatsAppStatus.VERIFIED ? row.whatsappNumber : null;
}

async function dispatch(params: {
  restaurantId: number;
  orderId: number | null;
  template: string;
  recipient: string;
  body: string;
}): Promise<void> {
  const provider = getWhatsAppProvider();

  const [inserted] = await db.insert(notificationLogs).values({
    restaurantId: params.restaurantId,
    orderId: params.orderId,
    channel: NotificationChannel.WHATSAPP,
    provider: provider.name,
    template: params.template,
    recipient: params.recipient,
    status: NotificationStatus.PENDING,
    attempts: 1,
    payload: { body: params.body },
  });

  const result = await provider.sendText(params.recipient, params.body);

  await db
    .update(notificationLogs)
    .set({
      status: result.ok ? NotificationStatus.SENT : NotificationStatus.FAILED,
      providerMessageId: result.providerMessageId ?? null,
      error: result.error ?? null,
      sentAt: result.ok ? new Date() : null,
    })
    .where(eq(notificationLogs.id, inserted.insertId));

  if (!result.ok) {
    logger.warn(
      { restaurantId: params.restaurantId, orderId: params.orderId, error: result.error },
      'WhatsApp send failed',
    );
  }
}

/**
 * Notify a restaurant of a new order.
 *
 * Never throws. The order is already committed by the time this runs, and a
 * messaging failure must not surface as a failed checkout to the customer.
 */
export async function sendOrderNotification(order: OrderNotification): Promise<void> {
  try {
    const recipient = await verifiedNumber(order.restaurantId);
    if (!recipient) {
      logger.info(
        { restaurantId: order.restaurantId, orderId: order.orderId },
        'No verified WhatsApp number; order notification skipped',
      );
      await db.insert(notificationLogs).values({
        restaurantId: order.restaurantId,
        orderId: order.orderId,
        channel: NotificationChannel.WHATSAPP,
        provider: getWhatsAppProvider().name,
        template: 'order.created',
        recipient: '',
        status: NotificationStatus.FAILED,
        error: 'No verified WhatsApp number configured.',
      });
      return;
    }

    await dispatch({
      restaurantId: order.restaurantId,
      orderId: order.orderId,
      template: 'order.created',
      recipient,
      body: renderOrderMessage(order),
    });
  } catch (error) {
    logger.error({ err: error, orderId: order.orderId }, 'Order notification threw');
  }
}

/** Used by the number-verification flow, which sends to an unverified number by design. */
export async function sendVerificationCode(
  restaurantId: number,
  phone: string,
  code: string,
  ttlMinutes: number,
): Promise<void> {
  logger.info({ restaurantId, phone: maskPhone(phone) }, 'Sending WhatsApp verification code');
  await dispatch({
    restaurantId,
    orderId: null,
    template: 'whatsapp.verify',
    recipient: phone,
    body: `Your Nayaro Food verification code is ${code}.\n\nIt expires in ${ttlMinutes} minutes. If you did not request this, ignore this message.`,
  });
}
