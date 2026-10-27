'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, apiPatch, apiPost } from '@/lib/api';
import { HoursSettingsCard, type HoursSettings } from '@/components/hours-settings';
import { ImageUpload } from '@/components/image-upload';

export interface RestaurantOverview extends HoursSettings {
  name: string;
  logoUrl: string | null;
  coverUrl: string | null;
  description: string | null;
  phone: string;
  email: string | null;
  address: string;
  latitude: number | null;
  longitude: number | null;
  isOpen: number;
  acceptsOrders: number | null;
  minOrderMinor: number;
  defaultPrepTimeMinutes: number | null;
  orderNumberPrefix: string | null;
}

export interface AccountDetails {
  name: string;
  email: string | null;
  phone: string | null;
}

type Notice = { tone: 'ok' | 'error'; text: string } | null;

/** Turn an API error into a message plus per-field errors for the form. */
function describe(error: unknown, fallback: string): { text: string; fields: Record<string, string> } {
  if (error instanceof ApiError) return { text: error.message, fields: error.fields ?? {} };
  return { text: fallback, fields: {} };
}

/**
 * Restaurant settings, one card per concern, each saving independently so a
 * validation error in one never blocks another.
 */
export function SettingsForm({
  overview,
  account,
}: {
  overview: RestaurantOverview;
  account: AccountDetails;
}) {
  return (
    <div className="space-y-5">
      <TradingCard overview={overview} />
      <HoursSettingsCard settings={overview} />
      <LocationCard overview={overview} />
      <PhotosCard overview={overview} />
      <ProfileCard overview={overview} />
      <OrderingCard overview={overview} />
      <AccountCard account={account} />
      <PasswordCard />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function TradingCard({ overview }: { overview: RestaurantOverview }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(overview.isOpen === 1);
  const [accepts, setAccepts] = useState(overview.acceptsOrders === 1);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  async function toggle(path: string, body: unknown, apply: () => void, revert: () => void) {
    setBusy(true);
    setNotice(null);
    apply(); // Optimistic: a switch should feel instant.
    try {
      await apiPatch(path, body);
      router.refresh();
    } catch (error) {
      revert();
      setNotice({ tone: 'error', text: describe(error, 'Could not save.').text });
    }
    setBusy(false);
  }

  return (
    <Card title="Trading" description="Manual switches override weekly hours and stop all new orders, including scheduled orders." notice={notice}>
      <div className="space-y-3">
        <Toggle
          label="Allow orders during opening hours"
          hint="When off, customers see you as closed and cannot check out."
          checked={isOpen}
          disabled={busy}
          onChange={(value) =>
            toggle('/restaurant/open', { isOpen: value }, () => setIsOpen(value), () => setIsOpen(!value))
          }
        />
        <Toggle
          label="Accepting orders"
          hint="A harder stop than closing — use it if your kitchen is overwhelmed."
          checked={accepts}
          disabled={busy}
          onChange={(value) =>
            toggle('/restaurant/settings', { acceptsOrders: value }, () => setAccepts(value), () => setAccepts(!value))
          }
        />
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function LocationCard({ overview }: { overview: RestaurantOverview }) {
  const router = useRouter();
  const [address, setAddress] = useState(overview.address);
  const [latitude, setLatitude] = useState(overview.latitude?.toString() ?? '');
  const [longitude, setLongitude] = useState(overview.longitude?.toString() ?? '');
  const [saved, setSaved] = useState(
    overview.latitude !== null && overview.longitude !== null
      ? { lat: overview.latitude, lng: overview.longitude }
      : null,
  );
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function save(lat: number, lng: number, successText: string) {
    setBusy(true);
    setNotice(null);
    setFields({});
    try {
      await apiPatch('/restaurant/location', {
        latitude: lat,
        longitude: lng,
        ...(address.trim() && address.trim() !== overview.address ? { address: address.trim() } : {}),
      });
      setSaved({ lat, lng });
      setNotice({ tone: 'ok', text: successText });
      router.refresh();
    } catch (error) {
      const { text, fields } = describe(error, 'Could not save your location.');
      setFields(fields);
      setNotice({ tone: 'error', text });
    }
    setBusy(false);
  }

  function useMyLocation() {
    if (!('geolocation' in navigator)) {
      setNotice({ tone: 'error', text: 'This browser cannot share your location. Enter it manually.' });
      return;
    }
    setLocating(true);
    setNotice(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        // Six decimals is ~10 cm — more is false precision.
        const lat = Number(position.coords.latitude.toFixed(6));
        const lng = Number(position.coords.longitude.toFixed(6));
        // Fill BOTH fields so the owner sees exactly what was saved.
        setLatitude(String(lat));
        setLongitude(String(lng));
        const accuracy = Math.round(position.coords.accuracy);
        void save(
          lat,
          lng,
          `Location saved (accurate to about ${accuracy} m). Check the pin below is on your kitchen.`,
        );
      },
      (error) => {
        setLocating(false);
        setNotice({
          tone: 'error',
          text:
            error.code === error.PERMISSION_DENIED
              ? 'Location permission was denied. Allow it in your browser, or enter the coordinates manually.'
              : 'Could not get your location. Enter it manually below.',
        });
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const lat = Number(latitude);
    const lng = Number(longitude);
    const errors: Record<string, string> = {};
    if (latitude.trim() === '' || !Number.isFinite(lat) || lat < -90 || lat > 90) {
      errors.latitude = 'Enter a latitude between -90 and 90.';
    }
    if (longitude.trim() === '' || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      errors.longitude = 'Enter a longitude between -180 and 180.';
    }
    if (Object.keys(errors).length > 0) {
      setFields(errors);
      return;
    }
    void save(lat, lng, 'Location saved. Delivery distances are calculated from here.');
  }

  /** Paste "27.7172, 85.3240" (as Google Maps copies it) into either box. */
  function onPaste(event: React.ClipboardEvent<HTMLInputElement>) {
    const match = /(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/.exec(event.clipboardData.getData('text'));
    if (!match) return;
    event.preventDefault();
    setLatitude(match[1]!);
    setLongitude(match[2]!);
  }

  return (
    <Card
      title="Location"
      description="Every delivery fee is measured from this point. Without it, nobody can order."
      notice={notice}
    >
      {!saved && (
        <p className="mb-3 rounded-ny bg-warning-soft px-3 py-2 text-sm text-warning">
          No location set yet — your restaurant cannot take orders.
        </p>
      )}

      <form onSubmit={submit} className="space-y-3" noValidate>
        <Field
          label="Address"
          name="address"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          error={fields.address}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Latitude"
            name="latitude"
            inputMode="decimal"
            placeholder="27.717200"
            value={latitude}
            onChange={(event) => setLatitude(event.target.value)}
            onPaste={onPaste}
            error={fields.latitude}
          />
          <Field
            label="Longitude"
            name="longitude"
            inputMode="decimal"
            placeholder="85.324000"
            value={longitude}
            onChange={(event) => setLongitude(event.target.value)}
            onPaste={onPaste}
            error={fields.longitude}
          />
        </div>
        <p className="text-xs text-ink-label">
          Tip: in Google Maps, right-click your restaurant and click the coordinates to copy them, then
          paste into either box.
        </p>
        <div className="flex flex-wrap gap-2">
          <PrimaryButton busy={busy}>Save location</PrimaryButton>
          <button
            type="button"
            onClick={useMyLocation}
            disabled={busy || locating}
            className="rounded-ny border border-line px-4 py-2.5 text-sm font-medium text-ink-muted transition-colors hover:border-accent-border hover:text-accent-label disabled:opacity-50"
          >
            {locating ? 'Locating…' : 'Use my current location'}
          </button>
        </div>
      </form>

      {saved && (
        <div className="mt-4 overflow-hidden rounded-ny border border-line">
          <iframe
            title="Restaurant location"
            loading="lazy"
            className="block h-56 w-full"
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${saved.lng - 0.008}%2C${saved.lat - 0.005}%2C${saved.lng + 0.008}%2C${saved.lat + 0.005}&layer=mapnik&marker=${saved.lat}%2C${saved.lng}`}
          />
          <div className="flex items-center justify-between gap-2 border-t border-line bg-surface-muted px-3 py-2 text-xs text-ink-muted">
            <span className="font-mono tabular-nums">
              {saved.lat.toFixed(6)}, {saved.lng.toFixed(6)}
            </span>
            <a
              href={`https://www.google.com/maps?q=${saved.lat},${saved.lng}`}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-accent-label hover:underline"
            >
              Open in Google Maps
            </a>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function PhotosCard({ overview }: { overview: RestaurantOverview }) {
  const router = useRouter();
  const [logo, setLogo] = useState(overview.logoUrl);
  const [cover, setCover] = useState(overview.coverUrl);
  const [notice, setNotice] = useState<Notice>(null);

  // Photos save the moment they upload — there is nothing else to confirm.
  async function save(field: 'logoUrl' | 'coverUrl', url: string | null, apply: (v: string | null) => void) {
    const previous = field === 'logoUrl' ? logo : cover;
    apply(url);
    setNotice(null);
    try {
      await apiPatch('/restaurant/profile', { [field]: url });
      setNotice({ tone: 'ok', text: url ? 'Photo saved — it’s live on your page.' : 'Photo removed.' });
      router.refresh();
    } catch (error) {
      apply(previous);
      setNotice({ tone: 'error', text: describe(error, 'Could not save the photo.').text });
    }
  }

  return (
    <Card
      title="Photos"
      description="Your logo and a cover photo make your page and your card in the listing look like you."
      notice={notice}
    >
      <div className="space-y-5">
        <ImageUpload
          kind="cover"
          shape="wide"
          label="Cover photo"
          hint="Shown across the top of your page. A wide shot of your best dish or your shopfront works well."
          value={cover}
          onChange={(url) => void save('coverUrl', url, setCover)}
        />
        <ImageUpload
          kind="logo"
          shape="round"
          label="Logo"
          hint="A square image looks best."
          value={logo}
          onChange={(url) => void save('logoUrl', url, setLogo)}
        />
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function ProfileCard({ overview }: { overview: RestaurantOverview }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const description = String(form.get('description') ?? '').trim();
    setBusy(true);
    setNotice(null);
    setFields({});
    try {
      await apiPatch('/restaurant/profile', {
        name: String(form.get('name') ?? '').trim(),
        phone: String(form.get('phone') ?? '').trim(),
        email: email || null,
        description: description || null,
      });
      setNotice({ tone: 'ok', text: 'Profile saved.' });
      router.refresh();
    } catch (error) {
      const { text, fields } = describe(error, 'Could not save your profile.');
      setFields(fields);
      setNotice({ tone: 'error', text });
    }
    setBusy(false);
  }

  return (
    <Card title="Restaurant profile" description="What customers see on your public page." notice={notice}>
      <form onSubmit={submit} className="space-y-3" noValidate>
        <Field label="Restaurant name" name="name" defaultValue={overview.name} required error={fields.name} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Phone" name="phone" type="tel" defaultValue={overview.phone} required error={fields.phone} />
          <Field label="Email" name="email" type="email" defaultValue={overview.email ?? ''} error={fields.email} />
        </div>
        <div>
          <label htmlFor="description" className="mb-1 block text-sm font-medium text-ink-hi">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            maxLength={1000}
            defaultValue={overview.description ?? ''}
            placeholder="A sentence about your food — it shows on your public page."
            className="w-full rounded-ny border border-line bg-surface px-3.5 py-2.5 text-sm focus:border-accent focus:outline-none"
          />
          {fields.description && <p className="mt-1 text-xs text-danger">{fields.description}</p>}
        </div>
        <PrimaryButton busy={busy}>Save profile</PrimaryButton>
      </form>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function OrderingCard({ overview }: { overview: RestaurantOverview }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setNotice(null);
    setFields({});
    try {
      await apiPatch('/restaurant/settings', {
        minOrderAmount: Number(form.get('minOrderAmount') || 0),
        defaultPrepTimeMinutes: Number(form.get('defaultPrepTimeMinutes') || 0),
        orderNumberPrefix: String(form.get('orderNumberPrefix') ?? '').trim(),
      });
      setNotice({ tone: 'ok', text: 'Ordering rules saved.' });
      router.refresh();
    } catch (error) {
      const { text, fields } = describe(error, 'Could not save.');
      setFields(fields);
      setNotice({ tone: 'error', text });
    }
    setBusy(false);
  }

  return (
    <Card title="Ordering rules" description="Applied at checkout, on the server — customers cannot get around them." notice={notice}>
      <form onSubmit={submit} className="space-y-3" noValidate>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field
            label="Minimum order (Rs.)"
            name="minOrderAmount"
            type="number"
            min={0}
            step="1"
            defaultValue={overview.minOrderMinor / 100}
            error={fields.minOrderAmount}
          />
          <Field
            label="Typical prep time (min)"
            name="defaultPrepTimeMinutes"
            type="number"
            min={0}
            max={360}
            defaultValue={overview.defaultPrepTimeMinutes ?? 30}
            error={fields.defaultPrepTimeMinutes}
          />
          <Field
            label="Order number prefix"
            name="orderNumberPrefix"
            maxLength={8}
            placeholder="e.g. EV-"
            defaultValue={overview.orderNumberPrefix ?? ''}
            error={fields.orderNumberPrefix}
          />
        </div>
        <PrimaryButton busy={busy}>Save ordering rules</PrimaryButton>
      </form>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function AccountCard({ account }: { account: AccountDetails }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const phone = String(form.get('accountPhone') ?? '').trim();
    setBusy(true);
    setNotice(null);
    setFields({});
    try {
      await apiPatch('/auth/profile', {
        name: String(form.get('accountName') ?? '').trim(),
        ...(phone ? { phone } : {}),
      });
      setNotice({ tone: 'ok', text: 'Your details are saved.' });
      router.refresh();
    } catch (error) {
      const { text, fields } = describe(error, 'Could not save your details.');
      setFields({ accountName: fields.name ?? '', accountPhone: fields.phone ?? '' });
      setNotice({ tone: 'error', text });
    }
    setBusy(false);
  }

  return (
    <Card title="Your account" description="The person who signs in — separate from the restaurant's own contact details." notice={notice}>
      <form onSubmit={submit} className="space-y-3" noValidate>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Your name" name="accountName" defaultValue={account.name} required error={fields.accountName} />
          <Field label="Your phone" name="accountPhone" type="tel" defaultValue={account.phone ?? ''} error={fields.accountPhone} />
        </div>
        <Field label="Sign-in email" name="accountEmail" value={account.email ?? '—'} readOnly disabled />
        <PrimaryButton busy={busy}>Save my details</PrimaryButton>
      </form>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function PasswordCard() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [show, setShow] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const currentPassword = String(form.get('currentPassword') ?? '');
    const newPassword = String(form.get('newPassword') ?? '');
    const confirmPassword = String(form.get('confirmPassword') ?? '');

    // Instant feedback for the obvious mistakes; the API re-checks everything.
    const errors: Record<string, string> = {};
    if (!currentPassword) errors.currentPassword = 'Enter your current password.';
    if (newPassword.length < 10) errors.newPassword = 'Use at least 10 characters.';
    else if (newPassword === currentPassword) errors.newPassword = 'Choose a password different from your current one.';
    if (confirmPassword !== newPassword) errors.confirmPassword = 'Passwords do not match.';
    if (Object.keys(errors).length > 0) {
      setFields(errors);
      return;
    }

    setBusy(true);
    setNotice(null);
    setFields({});
    try {
      await apiPost('/auth/change-password', { currentPassword, newPassword, confirmPassword });
      formElement.reset();
      // The API revokes every session, this one included — sign in fresh.
      setNotice({ tone: 'ok', text: 'Password changed. Signing you out of every device…' });
      setTimeout(() => {
        router.push('/login');
        router.refresh();
      }, 1500);
    } catch (error) {
      const { text, fields } = describe(error, 'Could not change your password.');
      setFields(error instanceof ApiError && error.code === 'WRONG_PASSWORD' ? { currentPassword: text } : fields);
      setNotice({ tone: 'error', text });
      setBusy(false);
    }
  }

  return (
    <Card
      title="Change password"
      description="Changing it signs you out everywhere, including other phones and computers."
      notice={notice}
    >
      <form onSubmit={submit} className="space-y-3" noValidate>
        <Field
          label="Current password"
          name="currentPassword"
          type={show ? 'text' : 'password'}
          autoComplete="current-password"
          error={fields.currentPassword}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="New password"
            name="newPassword"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            minLength={10}
            hint="At least 10 characters. A short phrase is easier to remember than symbols."
            error={fields.newPassword}
          />
          <Field
            label="Confirm new password"
            name="confirmPassword"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            error={fields.confirmPassword}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="size-4 accent-[var(--ny-accent)]" />
          Show passwords
        </label>
        <PrimaryButton busy={busy}>Change password</PrimaryButton>
      </form>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function Card({
  title,
  description,
  notice,
  children,
}: {
  title: string;
  description?: string;
  notice: Notice;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-ny-card border border-line bg-surface p-5">
      <h2 className="font-display text-base font-semibold tracking-tight">{title}</h2>
      {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
      {notice && (
        <p
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={`mt-3 rounded-ny px-3 py-2 text-sm ${
            notice.tone === 'ok' ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'
          }`}
        >
          {notice.text}
        </p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function PrimaryButton({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="rounded-ny bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
    >
      {busy ? 'Saving…' : children}
    </button>
  );
}

function Field({
  label,
  name,
  error,
  hint,
  ...rest
}: { label: string; name: string; error?: string; hint?: string } & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'name'
>) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-sm font-medium text-ink-hi">
        {label}
      </label>
      <input
        id={name}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${name}-error` : hint ? `${name}-hint` : undefined}
        className={`w-full rounded-ny border bg-surface px-3.5 py-2.5 text-sm focus:border-accent focus:outline-none disabled:bg-surface-muted disabled:text-ink-muted ${
          error ? 'border-danger' : 'border-line'
        }`}
        {...rest}
      />
      {error ? (
        <p id={`${name}-error`} className="mt-1 text-xs text-danger">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${name}-hint`} className="mt-1 text-xs text-ink-label">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 accent-[var(--ny-accent)]"
      />
      <span>
        <span className="block text-sm font-medium text-ink-hi">{label}</span>
        <span className="block text-xs text-ink-label">{hint}</span>
      </span>
    </label>
  );
}
