import { fetchTenant } from '@/lib/dashboard-api';
import { PushToggle } from '@/components/push-toggle';
import { LiveAlertSettings } from '@/components/live-alert-settings';
import { WhatsAppVerify } from '@/components/whatsapp-verify';

export const metadata = { title: 'Notifications' };
export const dynamic = 'force-dynamic';

interface Overview {
  whatsappNumber: string | null;
  whatsappStatus: 'UNVERIFIED' | 'PENDING' | 'VERIFIED';
  whatsappEnabled: boolean;
}

export default async function NotificationsPage() {
  const overview = await fetchTenant<Overview>('/restaurant/overview');

  return (
    <div className="max-w-3xl">
      <header className="mb-5">
        <h1 className="font-display text-xl font-bold tracking-tight">Notifications</h1>
        <p className="mt-1 text-sm text-ink-muted">How new orders reach you, the moment they&rsquo;re placed.</p>
      </header>

      <div className="space-y-5">
        <LiveAlertSettings />
        <PushToggle />

        {overview?.whatsappEnabled ? (
          <WhatsAppVerify currentNumber={overview.whatsappNumber} status={overview.whatsappStatus} />
        ) : (
          <section className="rounded-ny-card border border-dashed border-line-strong bg-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-display text-base font-semibold tracking-tight">
                  WhatsApp order messages
                </h2>
                <p className="mt-1 max-w-md text-sm text-ink-muted">
                  Every new order sent to your verified WhatsApp number — useful when nobody is at
                  a screen. We&rsquo;ll let you know when it&rsquo;s ready to switch on.
                </p>
              </div>
              <span className="rounded-ny-pill bg-accent-pill px-2.5 py-1 text-[11px] font-bold text-accent-label">
                UPCOMING
              </span>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
