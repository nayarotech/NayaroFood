import { fetchTenant } from '@/lib/dashboard-api';
import { can, getSession } from '@/lib/session';
import { NoAccess } from '@/components/no-access';
import { SettingsForm, type RestaurantOverview } from '@/components/settings-form';

export const metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const accessSession = await getSession();
  if (!can(accessSession, 'SETTINGS')) return <NoAccess what="settings" />;
  const [overview, session] = await Promise.all([
    fetchTenant<RestaurantOverview>('/restaurant/overview'),
    getSession(),
  ]);

  return (
    <div className="max-w-3xl">
      <header className="mb-5">
        <h1 className="font-display text-xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Your storefront, location, ordering rules and account.
        </p>
      </header>

      {overview && session ? (
        <SettingsForm
          overview={overview}
          account={{ name: session.user.name, email: session.user.email, phone: session.user.phone }}
        />
      ) : (
        <p className="rounded-ny-card border border-dashed border-line-strong bg-surface p-8 text-center text-sm text-ink-muted">
          Couldn&rsquo;t load your settings.
        </p>
      )}
    </div>
  );
}
