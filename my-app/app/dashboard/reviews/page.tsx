import { fetchTenant } from '@/lib/dashboard-api';
import { can, getSession } from '@/lib/session';
import { formatDate } from '@/lib/format';
import { NoAccess } from '@/components/no-access';
import { Stars } from '@/components/stars';

export const metadata = { title: 'Reviews' };
export const dynamic = 'force-dynamic';

interface ReviewsResponse {
  summary: { total: number; average: number | null; distribution: { stars: number; count: number }[] };
  reviews: { id: number; rating: number; comment: string; createdAt: string; orderNumber: string; customerName: string }[];
}

export default async function ReviewsPage() {
  const session = await getSession();
  if (!can(session, 'REVIEWS')) return <NoAccess what="reviews" />;
  const data = await fetchTenant<ReviewsResponse>('/restaurant/reviews');

  return (
    <div className="max-w-4xl">
      <header className="mb-5">
        <h1 className="font-display text-xl font-bold tracking-tight">Reviews</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Customers rate orders after delivery. Only the average is public — the comments are for you.
        </p>
      </header>

      {!data ? (
        <p className="rounded-ny-card border border-line bg-surface p-6 text-sm text-ink-muted">Couldn’t load reviews.</p>
      ) : data.summary.total === 0 ? (
        <p className="rounded-ny-card border border-line bg-surface px-6 py-10 text-center text-sm text-ink-muted">
          No reviews yet. Customers can rate an order once it’s delivered.
        </p>
      ) : (
        <>
          <section className="mb-5 grid gap-5 rounded-ny-card border border-line bg-surface p-5 sm:grid-cols-[180px_1fr]">
            <div>
              <p className="font-display text-4xl font-bold tabular-nums">{data.summary.average?.toFixed(1)}</p>
              <Stars value={data.summary.average ?? 0} size={16} className="mt-1" />
              <p className="mt-1 text-sm text-ink-muted">{data.summary.total} review{data.summary.total === 1 ? '' : 's'}</p>
            </div>
            <ul className="space-y-1.5" aria-label="Ratings breakdown">
              {data.summary.distribution.map((row) => {
                const share = data.summary.total > 0 ? (row.count / data.summary.total) * 100 : 0;
                return (
                  <li key={row.stars} className="flex items-center gap-3 text-sm">
                    <span className="w-12 text-ink-muted tabular-nums">{row.stars} star</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-inset">
                      <span className="block h-full rounded-full bg-[#f5a524]" style={{ width: `${share}%` }} />
                    </span>
                    <span className="w-8 text-right text-ink-muted tabular-nums">{row.count}</span>
                  </li>
                );
              })}
            </ul>
          </section>

          <ul className="divide-y divide-line overflow-hidden rounded-ny-card border border-line bg-surface">
            {data.reviews.map((review) => (
              <li key={review.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Stars value={review.rating} />
                    <span className="text-sm font-medium">{review.customerName}</span>
                  </div>
                  <span className="text-xs text-ink-label">
                    Order #{review.orderNumber} · {formatDate(review.createdAt)}
                  </span>
                </div>
                {review.comment ? (
                  <p className="mt-2 text-sm text-ink-hi">{review.comment}</p>
                ) : (
                  <p className="mt-2 text-sm text-ink-label">No comment</p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
