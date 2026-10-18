import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import { logger } from '../../config/logger.js';

/**
 * Live dashboard updates over Server-Sent Events.
 *
 * SSE rather than a WebSocket because the traffic is entirely one-way
 * (server → dashboard), it rides on plain HTTP so it survives proxies and
 * needs no separate upgrade path, and the browser reconnects on its own.
 *
 * This is the "tab is open" channel. When the tab is closed it goes silent by
 * design — that case is covered by Web Push, which the OS delivers.
 *
 * The bus is in-process. Behind more than one API instance this must move to
 * Redis pub/sub, or a dashboard will only see events from the instance it
 * happens to be connected to.
 */

export type RealtimeEvent =
  | { type: 'order.created'; restaurantId: number; restaurantName?: string; order: unknown }
  | { type: 'order.status'; restaurantId: number; orderId: number; status: string }
  /** The platform changed this restaurant's status — its dashboard must re-render. */
  | { type: 'restaurant.status'; restaurantId: number; status: string; reason: string | null }
  | { type: 'restaurant.registered'; restaurantId: number; name: string }
  /** An order was assigned to (or taken away from) a rider. */
  | { type: 'order.assigned'; restaurantId: number; orderId: number; riderUserId: number | null };

const bus = new EventEmitter();
// One listener per open dashboard tab; the default cap of 10 is far too low.
bus.setMaxListeners(0);

const channel = (restaurantId: number): string => `restaurant:${restaurantId}`;
/** Every event, for the Super Admin console. Never exposed to a tenant. */
const PLATFORM_CHANNEL = 'platform';

const orderChannel = (orderId: number): string => `order:${orderId}`;
const userChannel = (userId: number): string => `user:${userId}`;

/** Something for one person only — e.g. a rider's newly assigned delivery. */
export function emitToUser(userId: number, event: { type: string; [key: string]: unknown }): void {
  bus.emit(userChannel(userId), event);
}

/** A rider's private stream: their assignments and their orders' status changes. */
export function subscribeUser(userId: number, res: Response): () => void {
  return attach(userChannel(userId), res, { userId });
}

export function emitRealtime(event: RealtimeEvent): void {
  bus.emit(channel(event.restaurantId), event);
  bus.emit(PLATFORM_CHANNEL, event);
  // The customer's tracking page listens to its one order only.
  if (event.type === 'order.status') {
    bus.emit(orderChannel(event.orderId), { type: 'order.status', status: event.status });
  }
}

/**
 * Attach an SSE stream to a response, scoped to one restaurant.
 *
 * The subscription is keyed by the tenant resolved from the session, so a
 * dashboard can only ever receive its own restaurant's events.
 */
export function subscribe(restaurantId: number, res: Response): () => void {
  return attach(channel(restaurantId), res, { restaurantId });
}

/**
 * One order's status changes, for the customer's tracking page. Carries the
 * new status only — the page refetches the details over the normal endpoint.
 */
export function subscribeOrder(orderId: number, res: Response): () => void {
  return attach(orderChannel(orderId), res, { orderId });
}

/** Platform-wide stream. Only mount behind requireSuperAdmin. */
export function subscribePlatform(res: Response): () => void {
  return attach(PLATFORM_CHANNEL, res, { platform: true });
}

function attach(name: string, res: Response, context: Record<string, unknown>): () => void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Stops nginx buffering the stream into uselessness.
    'X-Accel-Buffering': 'no',
  });
  // Tells the client it is live; also flushes headers through any proxy.
  res.write('retry: 5000\n\n');
  res.write(`event: ready\ndata: {}\n\n`);

  const onEvent = (event: { type: string }): void => {
    res.write(`event: ${event.type}\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  bus.on(name, onEvent);

  // Comment frames keep intermediaries from closing an idle connection.
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000);

  const cleanup = (): void => {
    clearInterval(heartbeat);
    bus.off(name, onEvent);
    logger.debug(context, 'SSE client disconnected');
  };

  res.on('close', cleanup);
  return cleanup;
}

export function listenerCount(restaurantId: number): number {
  return bus.listenerCount(channel(restaurantId));
}
