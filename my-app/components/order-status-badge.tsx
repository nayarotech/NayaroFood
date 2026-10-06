export type OrderStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'PREPARING'
  | 'READY'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED';

export const ORDER_STATUSES: OrderStatus[] = [
  'PENDING',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'REJECTED',
  'CANCELLED',
];

export const OPEN_ORDER_STATUSES: OrderStatus[] = [
  'PENDING',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Pending',
  ACCEPTED: 'Accepted',
  PREPARING: 'Preparing',
  READY: 'Ready',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

const TONE: Record<OrderStatus, string> = {
  PENDING: 'bg-warning-soft text-warning',
  ACCEPTED: 'bg-accent-pill text-accent-label',
  PREPARING: 'bg-accent-pill text-accent-label',
  READY: 'bg-accent-pill text-accent-label',
  OUT_FOR_DELIVERY: 'bg-accent-pill text-accent-label',
  DELIVERED: 'bg-success-soft text-success',
  REJECTED: 'bg-danger-soft text-danger',
  CANCELLED: 'bg-danger-soft text-danger',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={`inline-block rounded-ny-pill px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${TONE[status]}`}
    >
      {ORDER_STATUS_LABEL[status]}
    </span>
  );
}
