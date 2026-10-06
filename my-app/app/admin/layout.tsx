import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { fetchAdmin } from '@/lib/dashboard-api';
import { AdminSidebar } from '@/components/admin/admin-sidebar';
import { AdminLiveListener } from '@/components/admin/admin-live-listener';
import { SessionKeeper } from '@/components/session-keeper';

export const dynamic = 'force-dynamic';

interface NavCounts {
  restaurants: { pending: number };
  orders: { open: number };
}

/**
 * The Super Admin console shell: navigation rail on the left, the page on the
 * right. Role is checked here as defence in depth — the API enforces it on
 * every request regardless.
 */
export default async function AdminLayout({ children }: LayoutProps<'/admin'>) {
  const session = await getSession();
  if (!session) redirect('/login?next=/admin');
  if (session.user.role !== 'SUPER_ADMIN') redirect('/dashboard');

  const [stats, site] = await Promise.all([
    fetchAdmin<NavCounts>('/admin/stats'),
    fetchAdmin<{ unreadMessages: number }>('/admin/site/content'),
  ]);

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-5">
      <SessionKeeper />

      <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-8">
        <aside className="lg:sticky lg:top-20 lg:h-fit">
          <div className="mb-5 hidden lg:block">
            <p className="text-[10px] font-semibold tracking-wider text-accent-label uppercase">Nayaro Tech</p>
            <p className="font-display text-[15px] font-bold tracking-tight">Platform admin</p>
            <p className="truncate text-xs text-ink-label">{session.user.email}</p>
          </div>
          <AdminLiveListener />
          <AdminSidebar
            pendingApprovals={stats?.restaurants.pending ?? 0}
            openOrders={stats?.orders.open ?? 0}
            unreadMessages={site?.unreadMessages ?? 0}
          />
        </aside>

        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
