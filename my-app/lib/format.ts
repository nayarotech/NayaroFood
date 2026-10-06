/**
 * Display helpers. The backend sends money as integer minor units (paisa), so
 * formatting is the only place a major-unit value is ever produced.
 */

export function formatMoney(minor: number, currency = 'Rs.'): string {
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const grouped = whole.toLocaleString('en-IN');
  const body = frac === 0 ? grouped : `${grouped}.${String(frac).padStart(2, '0')}`;
  return `${negative ? '-' : ''}${currency} ${body}`;
}

/** "FREE" reads better than "Rs. 0" on a delivery badge. */
export function formatDeliveryFee(minor: number): string {
  return minor === 0 ? 'FREE' : formatMoney(minor);
}

export function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

export function formatPrepTime(minutes: number | null): string | null {
  if (minutes === null || minutes <= 0) return null;
  return `${minutes} min`;
}

const DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Kathmandu',
});
const DATE_ONLY = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Kathmandu',
});

/** Absolute time in Nepal time, which is where every restaurant trades. */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return DATE_TIME.format(new Date(value));
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return DATE_ONLY.format(new Date(value));
}

/** "just now", "12 min ago", "3 h ago", then a date. */
export function timeAgo(value: string | Date | null | undefined, now = Date.now()): string {
  if (!value) return '—';
  const seconds = Math.max(0, Math.round((now - new Date(value).getTime()) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return formatDate(value);
}
