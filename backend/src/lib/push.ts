import { and, eq } from 'drizzle-orm';
import webpush from 'web-push';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { db } from '../db/client.js';
import { pushSubscriptions } from '../db/schema/index.js';

/**
 * Web Push delivery.
 *
 * This is the only channel that reaches a restaurant when the dashboard is
 * closed: the browser's push service holds the connection and wakes the
 * service worker. A WebSocket cannot do this — it dies with the tab.
 */

const configured = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

if (configured) {
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
} else {
  logger.warn('VAPID keys not set — push notifications are disabled.');
}

export const pushEnabled = configured;
export const vapidPublicKey = env.VAPID_PUBLIC_KEY ?? null;

export interface PushPayload {
  title: string;
  body: string;
  /** Where the service worker sends the user when the notification is clicked. */
  url?: string;
  tag?: string;
  orderId?: number;
}

/**
 * Push to every device a restaurant has registered.
 *
 * Never throws: this runs after an order is already committed, and a dead
 * browser endpoint must not surface as a failed checkout. Endpoints the push
 * service reports as gone (404/410) are deleted, since they can never work again.
 */
export async function pushToRestaurant(restaurantId: number, payload: PushPayload): Promise<void> {
  if (!configured) return;

  try {
    const subscriptions = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.restaurantId, restaurantId));

    if (subscriptions.length === 0) return;

    const body = JSON.stringify(payload);

    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            body,
            { TTL: 60 * 60, urgency: 'high' },
          );
          await db
            .update(pushSubscriptions)
            .set({ lastSentAt: new Date(), lastFailureAt: null, lastError: null })
            .where(eq(pushSubscriptions.id, subscription.id));
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            // The browser revoked this subscription; it will never work again.
            await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscription.id));
            return;
          }
          await db
            .update(pushSubscriptions)
            .set({
              lastFailureAt: new Date(),
              lastError: error instanceof Error ? error.message : String(error),
            })
            .where(eq(pushSubscriptions.id, subscription.id));
          logger.warn({ err: error, restaurantId, status }, 'Push send failed');
        }
      }),
    );
  } catch (error) {
    logger.error({ err: error, restaurantId }, 'pushToRestaurant threw');
  }
}

export async function removeSubscription(restaurantId: number, endpoint: string): Promise<void> {
  await db
    .delete(pushSubscriptions)
    .where(
      and(eq(pushSubscriptions.restaurantId, restaurantId), eq(pushSubscriptions.endpoint, endpoint)),
    );
}
