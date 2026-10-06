/**
 * Order status machine. The backend validates every transition against this
 * table before writing; the dashboard uses the same table to decide which
 * buttons to render, so the UI can never offer an action the API will reject.
 */

import { OrderStatus } from './enums.js';

/** Who is asking for the transition. */
export const Actor = {
  RESTAURANT: 'RESTAURANT',
  CUSTOMER: 'CUSTOMER',
  SUPER_ADMIN: 'SUPER_ADMIN',
  SYSTEM: 'SYSTEM',
} as const;
export type Actor = (typeof Actor)[keyof typeof Actor];

interface TransitionRule {
  readonly to: OrderStatus;
  readonly actors: readonly Actor[];
  /** Label for the dashboard button that performs this transition. */
  readonly label: string;
  /** Transitions that discard an order require a reason string. */
  readonly requiresReason?: boolean;
}

const TRANSITIONS: Readonly<Record<OrderStatus, readonly TransitionRule[]>> = {
  [OrderStatus.PENDING]: [
    { to: OrderStatus.ACCEPTED, actors: [Actor.RESTAURANT, Actor.SUPER_ADMIN], label: 'Accept' },
    {
      to: OrderStatus.REJECTED,
      actors: [Actor.RESTAURANT, Actor.SUPER_ADMIN],
      label: 'Reject',
      requiresReason: true,
    },
    {
      to: OrderStatus.CANCELLED,
      actors: [Actor.CUSTOMER, Actor.RESTAURANT, Actor.SUPER_ADMIN],
      label: 'Cancel',
      requiresReason: true,
    },
  ],
  [OrderStatus.ACCEPTED]: [
    { to: OrderStatus.PREPARING, actors: [Actor.RESTAURANT, Actor.SUPER_ADMIN], label: 'Start preparing' },
    {
      to: OrderStatus.CANCELLED,
      actors: [Actor.RESTAURANT, Actor.SUPER_ADMIN],
      label: 'Cancel',
      requiresReason: true,
    },
  ],
  [OrderStatus.PREPARING]: [
    { to: OrderStatus.READY, actors: [Actor.RESTAURANT, Actor.SUPER_ADMIN], label: 'Mark ready' },
    {
      to: OrderStatus.CANCELLED,
      actors: [Actor.RESTAURANT, Actor.SUPER_ADMIN],
      label: 'Cancel',
      requiresReason: true,
    },
  ],
  [OrderStatus.READY]: [
    {
      to: OrderStatus.OUT_FOR_DELIVERY,
      actors: [Actor.RESTAURANT, Actor.SUPER_ADMIN],
      label: 'Send out for delivery',
    },
    {
      to: OrderStatus.CANCELLED,
      actors: [Actor.RESTAURANT, Actor.SUPER_ADMIN],
      label: 'Cancel',
      requiresReason: true,
    },
  ],
  [OrderStatus.OUT_FOR_DELIVERY]: [
    { to: OrderStatus.DELIVERED, actors: [Actor.RESTAURANT, Actor.SUPER_ADMIN], label: 'Mark delivered' },
    {
      to: OrderStatus.CANCELLED,
      actors: [Actor.RESTAURANT, Actor.SUPER_ADMIN],
      label: 'Cancel',
      requiresReason: true,
    },
  ],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.REJECTED]: [],
  [OrderStatus.CANCELLED]: [],
};

/** Statuses from which no further transition is possible. */
export const TERMINAL_STATUSES: readonly OrderStatus[] = [
  OrderStatus.DELIVERED,
  OrderStatus.REJECTED,
  OrderStatus.CANCELLED,
];

export function isTerminal(status: OrderStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/** The happy path shown as a progress bar to the customer. */
export const FULFILMENT_SEQUENCE: readonly OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.ACCEPTED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
  OrderStatus.OUT_FOR_DELIVERY,
  OrderStatus.DELIVERED,
];

/** Transitions `actor` is allowed to perform from `status`, for rendering buttons. */
export function allowedTransitions(
  status: OrderStatus,
  actor: Actor,
): readonly TransitionRule[] {
  return TRANSITIONS[status].filter((rule) => rule.actors.includes(actor));
}

export type TransitionCheck =
  | { readonly ok: true; readonly requiresReason: boolean }
  | { readonly ok: false; readonly code: TransitionError; readonly message: string };

export const TransitionError = {
  TERMINAL: 'ORDER_ALREADY_FINAL',
  ILLEGAL: 'ILLEGAL_STATUS_TRANSITION',
  FORBIDDEN: 'TRANSITION_NOT_ALLOWED_FOR_ACTOR',
  REASON_REQUIRED: 'TRANSITION_REASON_REQUIRED',
} as const;
export type TransitionError = (typeof TransitionError)[keyof typeof TransitionError];

/** The single gate every status write goes through. */
export function canTransition(
  from: OrderStatus,
  to: OrderStatus,
  actor: Actor,
  reason?: string | null,
): TransitionCheck {
  if (isTerminal(from)) {
    return {
      ok: false,
      code: TransitionError.TERMINAL,
      message: `Order is already ${from} and cannot change status.`,
    };
  }

  const rule = TRANSITIONS[from].find((r) => r.to === to);
  if (!rule) {
    return {
      ok: false,
      code: TransitionError.ILLEGAL,
      message: `Cannot move an order from ${from} to ${to}.`,
    };
  }

  if (!rule.actors.includes(actor)) {
    return {
      ok: false,
      code: TransitionError.FORBIDDEN,
      message: `${actor} is not permitted to move an order from ${from} to ${to}.`,
    };
  }

  if (rule.requiresReason && !reason?.trim()) {
    return {
      ok: false,
      code: TransitionError.REASON_REQUIRED,
      message: `Moving an order to ${to} requires a reason.`,
    };
  }

  return { ok: true, requiresReason: Boolean(rule.requiresReason) };
}

/** Presentation metadata, keyed by status, shared by both dashboards. */
export const ORDER_STATUS_META: Readonly<
  Record<OrderStatus, { label: string; tone: 'neutral' | 'info' | 'accent' | 'success' | 'danger' }>
> = {
  [OrderStatus.PENDING]: { label: 'Pending', tone: 'neutral' },
  [OrderStatus.ACCEPTED]: { label: 'Accepted', tone: 'info' },
  [OrderStatus.PREPARING]: { label: 'Preparing', tone: 'accent' },
  [OrderStatus.READY]: { label: 'Ready', tone: 'accent' },
  [OrderStatus.OUT_FOR_DELIVERY]: { label: 'Out for delivery', tone: 'info' },
  [OrderStatus.DELIVERED]: { label: 'Delivered', tone: 'success' },
  [OrderStatus.REJECTED]: { label: 'Rejected', tone: 'danger' },
  [OrderStatus.CANCELLED]: { label: 'Cancelled', tone: 'danger' },
};
