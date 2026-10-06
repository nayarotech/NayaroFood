import { PageHeader } from '@/components/admin/page-header';

export const metadata = { title: 'Upcoming · Admin' };

const ROADMAP = [
  {
    title: 'WhatsApp order notifications',
    status: 'Next up',
    body: 'Every new order sent to the restaurant’s verified WhatsApp number, for kitchens without a screen. The number verification flow and message templates are already built and switched off behind WHATSAPP_ENABLED; enabling it needs a Meta Cloud API or Twilio account.',
    points: [
      'Restaurants verify their number with a one-time code',
      'Order messages only ever go to a verified number',
      'Every send is logged; a failed message never cancels an order',
    ],
  },
  {
    title: 'Customer order updates on WhatsApp',
    status: 'Planned',
    body: 'Tell customers when their order is accepted, ready, and on the way.',
    points: [],
  },
];

export default function AdminUpcomingPage() {
  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Upcoming"
        description="Features that are designed but not switched on yet. Orders reach restaurants today through the live dashboard and browser push alerts."
      />
      <div className="space-y-4">
        {ROADMAP.map((item) => (
          <section key={item.title} className="rounded-ny-card border border-dashed border-line-strong bg-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-base font-semibold tracking-tight">{item.title}</h2>
              <span className="rounded-ny-pill bg-accent-pill px-2.5 py-1 text-[11px] font-bold text-accent-label uppercase">
                {item.status}
              </span>
            </div>
            <p className="mt-2 text-sm text-ink-muted">{item.body}</p>
            {item.points.length > 0 && (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink-muted">
                {item.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
