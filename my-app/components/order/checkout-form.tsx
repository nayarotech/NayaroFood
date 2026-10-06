'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ApiError, apiPost } from '@/lib/api';
import { loadCustomer, rememberOrder, saveCustomer, useCart } from '@/lib/cart';
import { formatDistance, formatMoney } from '@/lib/format';
import type { DeliveryQuote } from '@/lib/types';

interface PlacedOrder {
  id: number;
  orderNumber: string;
  trackingCode: string;
  totalMinor: number;
}

/**
 * Contact details, delivery pin and the final total, then one button.
 *
 * The delivery fee shown is the server's own quote for the pin in the URL.
 * Moving the pin re-renders the page so the fee always matches what the
 * order endpoint will charge — it recomputes everything regardless.
 */
export function CheckoutForm({
  restaurant,
  menu,
  delivery,
  location,
}: {
  restaurant: { id: number; name: string; slug: string; minOrderMinor: number; closed: boolean };
  menu: { id: number; name: string; priceMinor: number }[];
  delivery: DeliveryQuote | null;
  location: { lat: number; lng: number } | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const cart = useCart(restaurant.id);
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [landmark, setLandmark] = useState('');
  const [note, setNote] = useState('');
  const [remember, setRemember] = useState(true);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [locating, setLocating] = useState(false);
  const [manual, setManual] = useState('');
  // One key per checkout: a double-tap or a retry after a timeout returns the
  // same order instead of placing a second one.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  // Returning customers: fill in what they typed last time.
  useEffect(() => {
    const saved = loadCustomer();
    if (!saved) return;
    /* eslint-disable react-hooks/set-state-in-effect -- one-time hydration from localStorage */
    setName((v) => v || saved.name);
    setPhone((v) => v || saved.phone);
    setAddress((v) => v || saved.address);
    setLandmark((v) => v || saved.landmark);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Reprice against the live menu and drop anything no longer sold.
  const { lines, removed } = useMemo(() => {
    const byId = new Map(menu.map((m) => [m.id, m]));
    const kept = cart.lines
      .filter((l) => byId.has(l.id))
      .map((l) => ({ ...l, priceMinor: byId.get(l.id)!.priceMinor, name: byId.get(l.id)!.name }));
    return { lines: kept, removed: cart.lines.filter((l) => !byId.has(l.id)) };
  }, [cart.lines, menu]);

  const subtotal = lines.reduce((n, l) => n + l.priceMinor * l.quantity, 0);
  const fee = delivery?.deliverable ? delivery.feeMinor : null;
  const total = subtotal + (fee ?? 0);
  const belowMinimum = restaurant.minOrderMinor > 0 && subtotal < restaurant.minOrderMinor;

  function clearLocationError() {
    setFields((current) => {
      const next = { ...current };
      delete next.location;
      return next;
    });
  }

  function setPin(lat: number, lng: number) {
    startTransition(() => {
      router.replace(`${pathname}?lat=${lat.toFixed(7)}&lng=${lng.toFixed(7)}` as Route, { scroll: false });
    });
  }

  function useMyLocation() {
    if (!('geolocation' in navigator)) {
      setFields((f) => ({ ...f, location: 'This browser cannot share your location — paste coordinates below.' }));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        clearLocationError();
        setPin(position.coords.latitude, position.coords.longitude);
      },
      (err) => {
        setLocating(false);
        setFields((f) => ({
          ...f,
          location:
            err.code === err.PERMISSION_DENIED
              ? 'Location permission was denied. Allow it in your browser, or paste coordinates below.'
              : 'Could not get your location. Try again, or paste coordinates below.',
        }));
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  function applyManual() {
    const match = /(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/.exec(manual);
    if (!match) {
      setFields((f) => ({ ...f, location: 'Paste coordinates like 27.7172, 85.3240.' }));
      return;
    }
    clearLocationError();
    setPin(Number(match[1]), Number(match[2]));
  }

  async function placeOrder(event: React.FormEvent) {
    event.preventDefault();
    const errors: Record<string, string> = {};
    if (name.trim().length < 2) errors.name = 'Enter your name.';
    if (phone.replace(/\D/g, '').length < 7) errors.phone = 'Enter a phone number the rider can call.';
    if (address.trim().length < 5) errors.address = 'Enter your delivery address.';
    if (!location) errors.location = 'Set your delivery location so we can work out the delivery fee.';
    if (Object.keys(errors).length > 0) {
      setFields(errors);
      document.getElementById(`checkout-${Object.keys(errors)[0]}`)?.focus();
      return;
    }

    setPlacing(true);
    setError(null);
    setFields({});
    try {
      const order = await apiPost<PlacedOrder>('/public/orders', {
        restaurantId: restaurant.id,
        items: lines.map((l) => ({ foodItemId: l.id, quantity: l.quantity })),
        customer: { name: name.trim(), phone: phone.trim() },
        delivery: {
          address: address.trim(),
          latitude: location!.lat,
          longitude: location!.lng,
          ...(landmark.trim() ? { landmark: landmark.trim() } : {}),
        },
        paymentMethod: 'COD',
        ...(note.trim() ? { note: note.trim() } : {}),
        idempotencyKey,
      });

      if (remember) saveCustomer({ name: name.trim(), phone: phone.trim(), address: address.trim(), landmark: landmark.trim() });
      rememberOrder({
        trackingCode: order.trackingCode,
        orderNumber: order.orderNumber,
        restaurantName: restaurant.name,
        totalMinor: order.totalMinor,
        placedAt: new Date().toISOString(),
      });
      cart.clear();
      router.push(`/orders/${order.trackingCode}?placed=1` as Route);
    } catch (caught) {
      setPlacing(false);
      if (caught instanceof ApiError) {
        // Map nested API field paths ("customer.phone") onto our inputs.
        const mapped: Record<string, string> = {};
        for (const [path, message] of Object.entries(caught.fields ?? {})) {
          const leaf = path.split('.').pop() ?? path;
          mapped[leaf === 'latitude' || leaf === 'longitude' ? 'location' : leaf] = message;
        }
        setFields(mapped);
        setError(caught.message);
      } else {
        setError('Something went wrong. Your order was not placed — please try again.');
      }
    }
  }

  if (cart.lines.length === 0 && !placing) {
    return (
      <div className="mt-8 rounded-ny-card border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
        <p className="text-sm text-ink-muted">Your cart is empty.</p>
        <Link href={`/r/${restaurant.slug}` as Route} className="mt-3 inline-block rounded-ny bg-accent px-4 py-2 text-sm font-semibold text-on-accent">
          Browse the menu
        </Link>
      </div>
    );
  }

  const canPlace = !restaurant.closed && !belowMinimum && delivery?.deliverable === true && lines.length > 0;

  return (
    <form onSubmit={placeOrder} noValidate className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="min-w-0 space-y-5">
        <Section step={1} title="Your details">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input id="checkout-name" label="Name" value={name} onChange={setName} autoComplete="name" error={fields.name} />
            <Input id="checkout-phone" label="Phone" value={phone} onChange={setPhone} type="tel" autoComplete="tel"
              placeholder="98XXXXXXXX" error={fields.phone} hint="The restaurant and rider will call this number." />
          </div>
        </Section>

        <Section step={2} title="Delivery location">
          {location ? (
            <div className="overflow-hidden rounded-ny border border-line">
              <iframe
                title="Your delivery pin"
                loading="lazy"
                className="block h-44 w-full"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${location.lng - 0.006}%2C${location.lat - 0.004}%2C${location.lng + 0.006}%2C${location.lat + 0.004}&layer=mapnik&marker=${location.lat}%2C${location.lng}`}
              />
              <div className="flex flex-wrap items-center justify-between gap-2 bg-surface-muted px-3 py-2 text-xs">
                <span className="text-ink-muted">
                  {delivery?.deliverable
                    ? `${formatDistance(delivery.distanceKm)} from ${restaurant.name}`
                    : 'Pin set'}
                </span>
                <button type="button" onClick={useMyLocation} disabled={locating || pending}
                  className="font-semibold text-accent-label hover:underline disabled:opacity-50">
                  {locating ? 'Locating…' : pending ? 'Updating…' : 'Use my current location again'}
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-ny border border-dashed border-line-strong bg-surface-muted p-4 text-center">
              <p className="text-sm text-ink-muted">We need your location to calculate the delivery fee.</p>
              <button type="button" onClick={useMyLocation} disabled={locating || pending}
                className="mt-3 rounded-ny bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent shadow-[var(--ny-shadow-accent)] disabled:opacity-50">
                {locating ? 'Getting your location…' : pending ? 'Calculating…' : '📍 Use my current location'}
              </button>
            </div>
          )}

          {delivery && !delivery.deliverable && (
            <p className="mt-3 rounded-ny bg-danger-soft px-3 py-2 text-sm text-danger">
              {delivery.reason === 'NO_ZONES_CONFIGURED'
                ? 'This restaurant hasn’t set up delivery yet.'
                : `This pin is ${formatDistance(delivery.distanceKm)} away — beyond ${restaurant.name}’s ${delivery.maxSupportedKm} km delivery range.`}
            </p>
          )}
          {fields.location && <p role="alert" className="mt-2 text-sm text-danger">{fields.location}</p>}

          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-ink-muted hover:text-ink">Not at the delivery address? Paste its coordinates</summary>
            <div className="mt-2 flex gap-2">
              <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="27.7172, 85.3240"
                aria-label="Delivery coordinates"
                className="min-w-0 flex-1 rounded-ny border border-line bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none" />
              <button type="button" onClick={applyManual} className="rounded-ny border border-line px-3 py-2 text-sm font-medium text-ink-muted hover:border-accent-border">
                Set pin
              </button>
            </div>
            <p className="mt-1 text-xs text-ink-label">In Google Maps, long-press the spot and copy the numbers shown.</p>
          </details>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Input id="checkout-address" label="Address" value={address} onChange={setAddress} autoComplete="street-address"
              placeholder="House no., street, area" error={fields.address} />
            <Input id="checkout-landmark" label="Landmark (optional)" value={landmark} onChange={setLandmark}
              placeholder="Near the temple, blue gate…" error={fields.landmark} />
          </div>
        </Section>

        <Section step={3} title="Anything else?">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500}
            aria-label="Note for the restaurant" placeholder="Note for the restaurant — less spicy, extra achar, call on arrival…"
            className="w-full rounded-ny border border-line bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none" />
          <label className="mt-3 flex items-center gap-2 text-sm text-ink-muted">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="size-4 accent-[var(--ny-accent)]" />
            Remember my details on this device
          </label>
        </Section>
      </div>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <div className="rounded-ny-card border border-line bg-surface p-5 shadow-[var(--ny-shadow-card)]">
          <h2 className="font-display text-base font-semibold tracking-tight">Order summary</h2>
          {removed.length > 0 && (
            <p className="mt-2 rounded-ny bg-warning-soft px-2.5 py-1.5 text-xs text-warning">
              Removed — no longer available: {removed.map((r) => r.name).join(', ')}
            </p>
          )}
          <ul className="mt-3 space-y-2 text-sm">
            {lines.map((line) => (
              <li key={line.id} className="flex items-center gap-2">
                <div className="flex items-center rounded-ny-pill border border-line text-xs">
                  <button type="button" aria-label={`One less ${line.name}`} onClick={() => cart.setQuantity(line, line.quantity - 1)} className="px-2 py-0.5">−</button>
                  <span className="min-w-4 text-center font-semibold tabular-nums">{line.quantity}</span>
                  <button type="button" aria-label={`One more ${line.name}`} onClick={() => cart.setQuantity(line, line.quantity + 1)} className="px-2 py-0.5">+</button>
                </div>
                <span className="min-w-0 flex-1 truncate">{line.name}</span>
                <span className="tabular-nums">{formatMoney(line.priceMinor * line.quantity)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-1.5 border-t border-line-soft pt-3 text-sm">
            <div className="flex justify-between text-ink-muted"><dt>Subtotal</dt><dd className="tabular-nums">{formatMoney(subtotal)}</dd></div>
            <div className="flex justify-between text-ink-muted">
              <dt>Delivery{delivery?.deliverable ? ` (${formatDistance(delivery.distanceKm)})` : ''}</dt>
              <dd className="tabular-nums">{fee === null ? '—' : fee === 0 ? 'Free' : formatMoney(fee)}</dd>
            </div>
            <div className="flex justify-between pt-2 font-display text-lg font-bold"><dt>Total</dt><dd className="tabular-nums">{formatMoney(total)}</dd></div>
            <p className="text-xs text-ink-label">Pay cash when your food arrives.</p>
          </dl>

          {belowMinimum && (
            <p className="mt-3 rounded-ny bg-warning-soft px-2.5 py-1.5 text-xs text-warning">
              Minimum order is {formatMoney(restaurant.minOrderMinor)} — add {formatMoney(restaurant.minOrderMinor - subtotal)} more.
            </p>
          )}
          {restaurant.closed && (
            <p className="mt-3 rounded-ny bg-surface-inset px-2.5 py-1.5 text-xs text-ink-muted">{restaurant.name} isn&rsquo;t taking orders right now.</p>
          )}
          {error && <p role="alert" className="mt-3 rounded-ny bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

          <button
            type="submit"
            disabled={placing || pending || restaurant.closed || belowMinimum || lines.length === 0 || (location !== null && !canPlace)}
            className="mt-4 w-full rounded-ny bg-accent px-4 py-3 text-base font-semibold text-on-accent shadow-[var(--ny-shadow-accent)] transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {placing ? 'Placing your order…' : `Place order · ${formatMoney(total)}`}
          </button>
          <p className="mt-2 text-center text-[11px] text-ink-label">
            You&rsquo;ll get a tracking code to follow your order live.
          </p>
        </div>
      </aside>
    </form>
  );
}

function Section({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-ny-card border border-line bg-surface p-5">
      <h2 className="mb-4 flex items-center gap-2.5 font-display text-base font-semibold tracking-tight">
        <span className="grid size-6 place-items-center rounded-full bg-accent text-xs font-bold text-on-accent">{step}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Input({
  id, label, value, onChange, error, hint, ...rest
}: {
  id: string; label: string; value: string; onChange: (v: string) => void; error?: string; hint?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'id'>) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink-hi">{label}</label>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={error ? true : undefined}
        className={`w-full rounded-ny border bg-surface px-3.5 py-2.5 text-sm focus:border-accent focus:outline-none ${error ? 'border-danger' : 'border-line'}`}
        {...rest} />
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : hint && <p className="mt-1 text-xs text-ink-label">{hint}</p>}
    </div>
  );
}
