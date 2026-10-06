'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, apiPost } from '@/lib/api';

export interface AdminRestaurant {
  id: number;
  name: string;
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';
  statusReason?: string | null;
  score: number | null;
  manualBoost: number | null;
  pinnedPosition: number | null;
  completenessScore: number | null;
  orders30d: number | null;
  whatsappStatus: string | null;
}

/**
 * Manual ranking control.
 *
 * Order is edited locally and only written when saved, so a Super Admin can
 * arrange the whole page before committing rather than firing a request per
 * nudge and watching the list rearrange under them.
 */
export function RankManager({ initial }: { initial: AdminRestaurant[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [pinnedIds, setPinnedIds] = useState<number[]>(
    initial.filter((r) => r.pinnedPosition !== null).map((r) => r.id),
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const dirty =
    JSON.stringify(pinnedIds) !==
    JSON.stringify(initial.filter((r) => r.pinnedPosition !== null).map((r) => r.id));

  function move(id: number, direction: -1 | 1) {
    setPinnedIds((current) => {
      const list = current.includes(id) ? [...current] : [...current, id];
      const index = list.indexOf(id);
      const target = index + direction;
      if (target < 0 || target >= list.length) return list;
      [list[index], list[target]] = [list[target]!, list[index]!];
      return list;
    });
  }

  function togglePin(id: number) {
    setPinnedIds((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      await apiPost('/admin/rankings/reorder', { order: pinnedIds, unpinOthers: true });
      setMessage({ tone: 'ok', text: 'Order saved. The public listing is updated.' });
      router.refresh();
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof ApiError ? error.message : 'Could not save the order.',
      });
    }
    setSaving(false);
  }

  async function recompute() {
    setSaving(true);
    setMessage(null);
    try {
      const result = await apiPost<{ updated: number }>('/admin/rankings/recompute', {});
      setMessage({ tone: 'ok', text: `Recomputed ${result.updated} restaurants.` });
      router.refresh();
      setRows((current) => current);
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof ApiError ? error.message : 'Recompute failed.',
      });
    }
    setSaving(false);
  }

  const pinned = pinnedIds
    .map((id) => rows.find((r) => r.id === id))
    .filter((r): r is AdminRestaurant => Boolean(r));
  const organic = rows
    .filter((r) => !pinnedIds.includes(r.id))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="rounded-ny bg-accent px-4 py-2 text-sm font-semibold text-on-accent shadow-[var(--ny-shadow-accent)] transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {saving ? 'Saving…' : dirty ? 'Save order' : 'Order saved'}
        </button>
        <button
          type="button"
          onClick={recompute}
          disabled={saving}
          className="rounded-ny border border-line bg-surface px-4 py-2 text-sm font-medium text-ink-muted transition-colors hover:border-accent-border hover:text-accent-label disabled:opacity-50"
        >
          Recompute scores
        </button>
        {message && (
          <span
            role="status"
            className={`text-sm ${message.tone === 'ok' ? 'text-success' : 'text-danger'}`}
          >
            {message.text}
          </span>
        )}
      </div>

      <section className="mb-6">
        <h2 className="mb-2 font-display text-sm font-semibold tracking-tight">
          Pinned positions{' '}
          <span className="font-normal text-ink-label">
            — these appear first, in this order, regardless of score
          </span>
        </h2>
        {pinned.length === 0 ? (
          <p className="rounded-ny-card border border-dashed border-line-strong bg-surface px-4 py-6 text-center text-sm text-ink-muted">
            Nothing pinned. The listing is ordered purely by score.
          </p>
        ) : (
          <ol className="space-y-2">
            {pinned.map((restaurant, index) => (
              <li
                key={restaurant.id}
                className="flex items-center gap-3 rounded-ny-card border border-accent-border bg-accent-soft p-3"
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-ny bg-accent font-mono text-xs font-bold text-on-accent">
                  {index + 1}
                </span>
                <RestaurantMeta restaurant={restaurant} />
                <div className="flex shrink-0 gap-1">
                  <IconButton label="Move up" onClick={() => move(restaurant.id, -1)} disabled={index === 0}>
                    ↑
                  </IconButton>
                  <IconButton
                    label="Move down"
                    onClick={() => move(restaurant.id, 1)}
                    disabled={index === pinned.length - 1}
                  >
                    ↓
                  </IconButton>
                  <IconButton label="Unpin" onClick={() => togglePin(restaurant.id)}>
                    ✕
                  </IconButton>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-display text-sm font-semibold tracking-tight">
          Ranked by score{' '}
          <span className="font-normal text-ink-label">— the organic order</span>
        </h2>
        <ol className="space-y-2">
          {organic.map((restaurant, index) => (
            <li
              key={restaurant.id}
              className="flex items-center gap-3 rounded-ny-card border border-line bg-surface p-3"
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-ny bg-surface-inset font-mono text-xs font-medium text-ink-muted">
                {pinned.length + index + 1}
              </span>
              <RestaurantMeta restaurant={restaurant} />
              <button
                type="button"
                onClick={() => togglePin(restaurant.id)}
                className="shrink-0 rounded-ny border border-line px-2.5 py-1 text-xs font-medium text-ink-muted transition-colors hover:border-accent-border hover:text-accent-label"
              >
                Pin
              </button>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function RestaurantMeta({ restaurant }: { restaurant: AdminRestaurant }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium">{restaurant.name}</p>
      <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-ink-label">
        <span className="font-mono tabular-nums">score {(restaurant.score ?? 0).toFixed(1)}</span>
        <span>·</span>
        <span>{restaurant.orders30d ?? 0} orders/30d</span>
        <span>·</span>
        <span>{restaurant.status.toLowerCase()}</span>
        {restaurant.whatsappStatus !== 'VERIFIED' && (
          <>
            <span>·</span>
            <span className="text-warning">WhatsApp unverified</span>
          </>
        )}
      </p>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="grid size-7 place-items-center rounded-ny border border-line bg-surface text-sm text-ink-muted transition-colors hover:border-accent-border hover:text-accent-label disabled:opacity-35"
    >
      {children}
    </button>
  );
}
