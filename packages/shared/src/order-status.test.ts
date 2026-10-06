import { describe, expect, it } from 'vitest';
import { OrderStatus } from './enums.js';
import {
  Actor,
  TransitionError,
  allowedTransitions,
  canTransition,
  isTerminal,
} from './order-status.js';

describe('canTransition', () => {
  it('walks the full happy path', () => {
    const path: [OrderStatus, OrderStatus][] = [
      [OrderStatus.PENDING, OrderStatus.ACCEPTED],
      [OrderStatus.ACCEPTED, OrderStatus.PREPARING],
      [OrderStatus.PREPARING, OrderStatus.READY],
      [OrderStatus.READY, OrderStatus.OUT_FOR_DELIVERY],
      [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED],
    ];
    for (const [from, to] of path) {
      expect(canTransition(from, to, Actor.RESTAURANT).ok, `${from} -> ${to}`).toBe(true);
    }
  });

  it('refuses to skip a step', () => {
    const check = canTransition(OrderStatus.PENDING, OrderStatus.DELIVERED, Actor.RESTAURANT);
    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.code).toBe(TransitionError.ILLEGAL);
  });

  it('refuses to move backwards', () => {
    expect(canTransition(OrderStatus.READY, OrderStatus.PREPARING, Actor.RESTAURANT).ok).toBe(false);
  });

  it('refuses any change once an order is terminal', () => {
    for (const status of [OrderStatus.DELIVERED, OrderStatus.REJECTED, OrderStatus.CANCELLED]) {
      expect(isTerminal(status)).toBe(true);
      const check = canTransition(status, OrderStatus.PREPARING, Actor.RESTAURANT);
      expect(check.ok).toBe(false);
      if (check.ok) continue;
      expect(check.code).toBe(TransitionError.TERMINAL);
    }
  });

  it('requires a reason for rejection and cancellation', () => {
    const noReason = canTransition(OrderStatus.PENDING, OrderStatus.REJECTED, Actor.RESTAURANT);
    expect(noReason.ok).toBe(false);
    if (!noReason.ok) expect(noReason.code).toBe(TransitionError.REASON_REQUIRED);

    expect(
      canTransition(OrderStatus.PENDING, OrderStatus.REJECTED, Actor.RESTAURANT, 'Out of stock').ok,
    ).toBe(true);
  });

  it('treats a whitespace-only reason as no reason', () => {
    expect(canTransition(OrderStatus.PENDING, OrderStatus.REJECTED, Actor.RESTAURANT, '   ').ok).toBe(
      false,
    );
  });

  describe('actor permissions', () => {
    it('lets a customer cancel only while the order is still PENDING', () => {
      expect(canTransition(OrderStatus.PENDING, OrderStatus.CANCELLED, Actor.CUSTOMER, 'Changed my mind').ok).toBe(true);
      const afterAccept = canTransition(
        OrderStatus.ACCEPTED,
        OrderStatus.CANCELLED,
        Actor.CUSTOMER,
        'Changed my mind',
      );
      expect(afterAccept.ok).toBe(false);
      if (!afterAccept.ok) expect(afterAccept.code).toBe(TransitionError.FORBIDDEN);
    });

    it('never lets a customer accept their own order', () => {
      const check = canTransition(OrderStatus.PENDING, OrderStatus.ACCEPTED, Actor.CUSTOMER);
      expect(check.ok).toBe(false);
      if (!check.ok) expect(check.code).toBe(TransitionError.FORBIDDEN);
    });

    it('gives the Super Admin the same transitions as the restaurant', () => {
      expect(canTransition(OrderStatus.PENDING, OrderStatus.ACCEPTED, Actor.SUPER_ADMIN).ok).toBe(true);
    });
  });
});

describe('allowedTransitions', () => {
  it('offers Accept and Reject on a pending order', () => {
    const labels = allowedTransitions(OrderStatus.PENDING, Actor.RESTAURANT).map((t) => t.label);
    expect(labels).toContain('Accept');
    expect(labels).toContain('Reject');
  });

  it('offers nothing on a delivered order', () => {
    expect(allowedTransitions(OrderStatus.DELIVERED, Actor.RESTAURANT)).toEqual([]);
  });

  it('only ever offers transitions the API would accept', () => {
    // Guards against the dashboard rendering a button that the backend rejects.
    for (const from of Object.values(OrderStatus)) {
      for (const actor of [Actor.RESTAURANT, Actor.CUSTOMER, Actor.SUPER_ADMIN]) {
        for (const rule of allowedTransitions(from, actor)) {
          const reason = rule.requiresReason ? 'because' : undefined;
          expect(canTransition(from, rule.to, actor, reason).ok, `${actor}: ${from} -> ${rule.to}`).toBe(true);
        }
      }
    }
  });
});

import { formatTrackingCode, normaliseTrackingCode, trackingCodeSchema } from './schemas/order.js';

describe('tracking codes', () => {
  it('normalises what people actually type', () => {
    expect(normaliseTrackingCode(' ny-7k3q-f9tz ')).toBe('NY7K3QF9TZ');
    expect(formatTrackingCode('NY7K3QF9TZ')).toBe('NY-7K3Q-F9TZ');
  });

  it('rejects anything that is not a tracking code', () => {
    expect(trackingCodeSchema.safeParse('NY-7K3Q-F9TZ').success).toBe(true);
    expect(trackingCodeSchema.safeParse('1001').success).toBe(false);
    expect(trackingCodeSchema.safeParse('NY7K3Q').success).toBe(false);
  });
});
