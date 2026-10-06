import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { fetchTenant } from '@/lib/dashboard-api';
import { DashboardSidebar } from '@/components/dashboard-sidebar';
import { RestaurantStatusPill } from '@/components/restaurant-status-pill';
import { LiveOrderListener } from '@/components/live-order-listener';
import { SessionKeeper } from '@/components/session-keeper';
import { SignOutButton } from '@/components/sign-out-button';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: LayoutProps<'/dashboard'>) {
  const session = await getSession();
  if (!session) redirect('/login?next=/dashboard');
  if (session.user.role === 'SUPER_ADMIN') redirect('/admin');

  const restaurant = session.restaurant;

  // Blocked restaurants lose the dashboard entirely — every tenant API call
  // would 403 anyway, so show why instead of a page of empty states.
  if (restaurant?.status === 'SUSPENDED') {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <div className="rounded-ny-card border border-danger/30 bg-surface p-6 shadow-[var(--ny-shadow-card)]">
          <RestaurantStatusPill status="SUSPENDED" />
          <h1 className="mt-3 font-display text-2xl font-bold tracking-tight">
            {restaurant.name} has been blocked
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            Nayaro Tech has blocked this restaurant. It is hidden from customers and cannot take
            orders, and the dashboard is unavailable.
          </p>
          {restaurant.statusReason && (
            <p className="mt-4 rounded-ny bg-danger-soft px-3 py-2 text-sm text-danger">
              <span className="font-semibold">Reason:</span> {restaurant.statusReason}
            </p>
          )}
          <p className="mt-4 text-sm text-ink-muted">
            If you think this is a mistake, contact{' '}
            <a href="mailto:support@nayaro.tech" className="font-medium text-accent-label hover:underline">
              support@nayaro.tech
            </a>
            .
          </p>
          <div className="mt-5 -ml-3">
            <SignOutButton />
          </div>
        </div>
      </div>
    );
  }

  const summary = await fetchTenant<{ openOrders: number }>('/restaurant/orders/summary');

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-5">
      <SessionKeeper />

      <div className="lg:grid lg:grid-cols-[228px_1fr] lg:gap-7">
        <aside className="lg:sticky lg:top-20 lg:h-fit">
          <div className="mb-4 hidden lg:block">
            <p className="truncate font-display text-[15px] font-bold tracking-tight">
              {restaurant?.name ?? 'Your restaurant'}
            </p>
            <p className="truncate text-xs text-ink-label">{session.user.email}</p>
            {restaurant && (
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <RestaurantStatusPill status={restaurant.status} />
                {restaurant.status === 'ACTIVE' && (
                  <Link
                    href={`/r/${restaurant.slug}`}
                    className="rounded-ny-pill border border-line px-2 py-0.5 text-[11px] font-medium text-ink-muted transition-colors hover:border-accent-border hover:text-accent-label"
                  >
                    View public page
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* Keeps the open dashboard in sync without a refresh; shows a Live pill here. */}
          <LiveOrderListener />
          <DashboardSidebar openOrders={summary?.openOrders ?? 0} />
        </aside>

        <main className="min-w-0">
          {restaurant?.status === 'INACTIVE' && (
            <div className="mb-5 rounded-ny-card border border-line-strong bg-surface-muted px-4 py-3 text-sm">
              <p className="font-semibold text-ink">Your restaurant has been deactivated</p>
              <p className="mt-0.5 text-ink-muted">
                You&rsquo;re hidden from customers and can&rsquo;t take new orders. Your menu and
                history are safe.
                {restaurant.statusReason && (
                  <>
                    {' '}
                    <span className="font-medium text-ink-hi">Reason: {restaurant.statusReason}</span>
                  </>
                )}{' '}
                Contact{' '}
                <a href="mailto:support@nayaro.tech" className="font-medium text-accent-label hover:underline">
                  support@nayaro.tech
                </a>{' '}
                to reactivate.
              </p>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
