'use client';

import { Star } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, apiPut } from '@/lib/api';

const LABELS = ['', 'Poor', 'Not great', 'Okay', 'Good', 'Excellent'];

/** "Rate" / "Your rating: 4" button that opens the review dialog. */
export function ReviewButton({
  code,
  restaurant,
  existing,
}: {
  code: string;
  restaurant: string;
  existing: { rating: number; comment: string } | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1 rounded-ny px-3 py-1.5 text-sm font-medium ${
          existing ? 'text-ink-muted hover:text-ink' : 'border border-accent-border text-accent-label hover:bg-accent-soft'
        }`}
      >
        <Star aria-hidden className={`size-4 ${existing ? 'fill-[#f5a524] text-[#f5a524]' : ''}`} strokeWidth={1.5} />
        {existing ? `${existing.rating}/5` : 'Rate'}
      </button>
      {open && <ReviewDialog code={code} restaurant={restaurant} existing={existing} onClose={() => setOpen(false)} />}
    </>
  );
}

export function ReviewDialog({
  code,
  restaurant,
  existing,
  onClose,
}: {
  code: string;
  restaurant: string;
  existing: { rating: number; comment: string } | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState(existing?.comment ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (rating === 0) {
      setError('Choose a rating.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiPut(`/customer/orders/${code}/review`, { rating, comment: comment.trim() });
      ref.current?.close();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not save your review.');
      setBusy(false);
    }
  }

  const shown = hover || rating;
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="review-title"
      className="m-auto w-[min(420px,calc(100vw-32px))] rounded-ny-card border border-line bg-surface p-0 text-ink shadow-[var(--ny-shadow-card-hover)] backdrop:bg-black/40"
    >
      <form onSubmit={save} className="p-5">
        <h2 id="review-title" className="font-display text-lg font-bold tracking-tight">
          Rate {restaurant}
        </h2>
        <div className="mt-4 flex items-center gap-1" role="radiogroup" aria-label="Rating" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} star${n > 1 ? 's' : ''} — ${LABELS[n]}`}
              onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)}
              className="rounded p-0.5"
            >
              <Star
                aria-hidden
                className={`size-8 transition-colors ${n <= shown ? 'fill-[#f5a524] text-[#f5a524]' : 'text-line-strong'}`}
                strokeWidth={1.5}
              />
            </button>
          ))}
          <span className="ml-2 text-sm text-ink-muted">{LABELS[shown]}</span>
        </div>
        <label htmlFor="review-comment" className="mt-4 mb-1 block text-sm font-medium text-ink-hi">
          Comment <span className="font-normal text-ink-label">(optional)</span>
        </label>
        <textarea
          id="review-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="What was good? What could be better?"
          className="w-full rounded-ny border border-line bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
        <p className="mt-1 text-xs text-ink-label">Only the restaurant sees your comment. Other customers see the average rating.</p>
        {error && <p role="alert" className="mt-3 rounded-ny bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => ref.current?.close()} disabled={busy}
            className="rounded-ny border border-line px-4 py-2 text-sm font-medium text-ink-muted hover:text-ink">
            Cancel
          </button>
          <button type="submit" disabled={busy}
            className="rounded-ny bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50">
            {busy ? 'Saving…' : existing ? 'Update review' : 'Submit review'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
