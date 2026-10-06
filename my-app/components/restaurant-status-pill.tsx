export type RestaurantStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';

const TONES: Record<RestaurantStatus, string> = {
  ACTIVE: 'bg-success-soft text-success',
  PENDING: 'bg-warning-soft text-warning',
  SUSPENDED: 'bg-danger-soft text-danger',
  INACTIVE: 'bg-surface-inset text-ink-muted',
};

/** Owner-facing wording; the admin console uses `ADMIN_LABELS`. */
const LABELS: Record<RestaurantStatus, string> = {
  ACTIVE: 'Live',
  PENDING: 'Awaiting approval',
  SUSPENDED: 'Blocked',
  INACTIVE: 'Deactivated',
};

export const ADMIN_LABELS: Record<RestaurantStatus, string> = {
  ACTIVE: 'Verified',
  PENDING: 'Pending review',
  SUSPENDED: 'Blocked',
  INACTIVE: 'Deactivated',
};

export function RestaurantStatusPill({
  status,
  admin = false,
}: {
  status: RestaurantStatus;
  admin?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-ny-pill px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap ${TONES[status]}`}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {(admin ? ADMIN_LABELS : LABELS)[status]}
    </span>
  );
}
