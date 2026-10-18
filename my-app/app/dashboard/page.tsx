import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { API_URL } from '@/lib/api';
import { getSession } from '@/lib/session';
import { ScoreBar } from '@/components/score-bar';
import { RestaurantStatusPill } from '@/components/restaurant-status-pill';

export const metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

interface RankingResponse {
  score: number;
  promoted: boolean;
  weights: Record<string, number>;
  breakdown: {
    popularityScore: number;
    loyaltyScore: number;
    reliabilityScore: number;
    completenessScore: number;
    freshnessScore: number;
  };
  signals: { orders30d: number; totalCustomers: number; repeatCustomers: number };
  suggestions: { action: string; detail: string; points: number }[];
}

async function fetchTenant<T>(path: string): Promise<T | null> {
  const token = (await cookies()).get('access_token');
  if (!token) return null;
  try {
    const response = await fetch(`${API_URL}${path}`, {
      headers: { cookie: `access_token=${token.value}` },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    return ((await response.json()) as { data: T }).data;
  } catch {
    return null;
  }
}

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect('/login?next=/dashboard');
  if (session.user.role === 'SUPER_ADMIN') redirect('/admin');

  const ranking = await fetchTenant<RankingResponse>('/restaurant/ranking');
  const restaurant = session.restaurant;

  return (
    <div className="max-w-5xl">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            {restaurant?.name ?? 'Your restaurant'}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">Signed in as {session.user.name}</p>
        </div>
        {restaurant && <RestaurantStatusPill status={restaurant.status} />}
      </header>

      {restaurant?.status === 'PENDING' && (
        <p className="mt-5 rounded-ny-card border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
          Your restaurant is awaiting review by Nayaro Tech. You can finish setting up now — you
          just won&rsquo;t appear publicly until it&rsquo;s approved.
        </p>
      )}

      {ranking ? (
        <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_320px]">
          <section className="rounded-ny-card border border-line bg-surface p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-display text-lg font-semibold tracking-tight">
                Your visibility score
              </h2>
              <span className="font-display text-3xl font-bold tabular-nums text-accent">
                {ranking.score.toFixed(0)}
                <span className="text-base text-ink-label">/100</span>
              </span>
            </div>
            <p className="mt-1 mb-5 text-sm text-ink-muted">
              Decides where you appear in search and on the homepage.
            </p>

            <div className="space-y-4">
              <ScoreBar
                label="Popularity"
                score={ranking.breakdown.popularityScore}
                weight={ranking.weights.popularity ?? 0}
                hint={`${ranking.signals.orders30d} orders in the last 30 days.`}
              />
              <ScoreBar
                label="Loyalty"
                score={ranking.breakdown.loyaltyScore}
                weight={ranking.weights.loyalty ?? 0}
                hint={`${ranking.signals.repeatCustomers} of ${ranking.signals.totalCustomers} customers ordered more than once.`}
              />
              <ScoreBar
                label="Reliability"
                score={ranking.breakdown.reliabilityScore}
                weight={ranking.weights.reliability ?? 0}
                hint="Accepting orders and not cancelling them."
              />
              <ScoreBar
                label="Storefront completeness"
                score={ranking.breakdown.completenessScore}
                weight={ranking.weights.completeness ?? 0}
                hint="The part you control entirely, even before your first order."
              />
              <ScoreBar
                label="Freshness"
                score={ranking.breakdown.freshnessScore}
                weight={ranking.weights.freshness ?? 0}
                hint="Recent trading activity."
              />
            </div>

            {ranking.promoted && (
              <p className="mt-5 rounded-ny bg-accent-soft px-3 py-2 text-xs text-accent-label">
                Nayaro Tech has pinned your restaurant to a fixed position in the listing.
              </p>
            )}
          </section>

          <aside className="rounded-ny-card border border-line bg-surface p-5">
            <h2 className="font-display text-sm font-semibold tracking-tight">
              Raise your score
            </h2>
            {ranking.suggestions.length === 0 ? (
              <p className="mt-2 text-sm text-ink-muted">
                Your storefront is complete. From here, score is driven by orders and repeat
                customers.
              </p>
            ) : (
              <ol className="mt-3 space-y-3">
                {ranking.suggestions.map((suggestion) => (
                  <li key={suggestion.action} className="border-b border-line-soft pb-3 last:border-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-ink-hi">{suggestion.action}</p>
                      <span className="shrink-0 rounded-ny-pill bg-success-soft px-1.5 py-0.5 text-[10px] font-bold text-success">
                        +{suggestion.points}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-ink-subtle">{suggestion.detail}</p>
                  </li>
                ))}
              </ol>
            )}
          </aside>
        </div>
      ) : (
        <p className="mt-6 rounded-ny-card border border-dashed border-line-strong bg-surface p-8 text-center text-sm text-ink-muted">
          Couldn&rsquo;t load your visibility score. Try again in a moment.
        </p>
      )}

    </div>
  );
}
