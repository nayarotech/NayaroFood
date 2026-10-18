import { fetchTenant } from '@/lib/dashboard-api';
import { can, getSession } from '@/lib/session';
import { NoAccess } from '@/components/no-access';
import { CustomerReportButton } from '@/components/customer-report-button';
import { formatMoney } from '@/lib/format';

export const metadata = { title: 'Customers' };
export const dynamic = 'force-dynamic';

interface CustomersResponse {
  summary: { total: number; repeat: number; repeatRate: number; lifetimeValueMinor: number };
  customers: {
    customerId: number;
    name: string;
    phone: string;
    orderCount: number;
    totalSpentMinor: number;
    cancelledCount: number;
    lastOrderAt: string | null;
    isRepeat: boolean;
    reports: number;
    reportingRestaurants: number;
    blocked: boolean;
    myReports: number;
  }[];
}

export default async function CustomersPage() {
  const session = await getSession();
  if (!can(session, 'CUSTOMERS')) return <NoAccess what="customers" />;
  const data = await fetchTenant<CustomersResponse>('/restaurant/customers');

  return (
    <div>
      <header className="mb-5">
        <h1 className="font-display text-xl font-bold tracking-tight">Customers</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Who orders from you and who comes back. Report customers who don’t pick up or cancel at the door.
        </p>
      </header>

      {!data ? (
        <p className="rounded-ny-card border border-dashed border-line-strong bg-surface p-8 text-center text-sm text-ink-muted">
          Couldn&rsquo;t load your customers.
        </p>
      ) : data.customers.length === 0 ? (
        <p className="rounded-ny-card border border-dashed border-line-strong bg-surface p-10 text-center text-sm text-ink-muted">
          No customers yet. They appear here after your first order.
        </p>
      ) : (
        <>
          <dl className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Customers" value={String(data.summary.total)} />
            <Stat label="Repeat customers" value={String(data.summary.repeat)} tone="accent" />
            <Stat label="Repeat rate" value={`${data.summary.repeatRate}%`} tone="success" />
            <Stat label="Lifetime value" value={formatMoney(data.summary.lifetimeValueMinor)} />
          </dl>

          <div className="overflow-x-auto rounded-ny-card border border-line bg-surface">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-muted text-left text-xs text-ink-label">
                  <th className="px-4 py-2.5 font-medium">Customer</th>
                  <th className="px-4 py-2.5 text-right font-medium">Orders</th>
                  <th className="px-4 py-2.5 text-right font-medium">Spent</th>
                  <th className="px-4 py-2.5 text-right font-medium">Last order</th>
                  <th className="px-4 py-2.5 font-medium">Reliability</th>
                  <th className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {data.customers.map((customer) => (
                  <tr key={customer.customerId} className="border-b border-line-soft last:border-0">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{customer.name}</span>
                        {customer.isRepeat && (
                          <span className="rounded-ny-pill bg-accent-pill px-1.5 py-0.5 text-[11px] font-medium text-accent-label">
                            Repeat
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-xs text-ink-label">{customer.phone}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{customer.orderCount}</td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                      {formatMoney(customer.totalSpentMinor)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-ink-muted tabular-nums">
                      {customer.lastOrderAt
                        ? new Date(customer.lastOrderAt).toLocaleDateString('en-GB')
                        : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {customer.blocked ? (
                        <span className="font-medium text-danger">Blocked by Nayaro</span>
                      ) : customer.reports > 0 ? (
                        <span className="text-warning">
                          Reported {customer.reports}×{customer.myReports > 0 ? ` (${customer.myReports} by you)` : ''}
                        </span>
                      ) : (
                        <span className="text-ink-label">No reports</span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <CustomerReportButton customerId={customer.customerId} customerName={customer.name} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-ink-label">
            Repeat customers are the ones worth a discount — they have already decided your food is
            worth returning for.
          </p>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'accent' | 'success';
}) {
  const tones = { default: 'text-ink', accent: 'text-accent', success: 'text-success' } as const;
  return (
    <div className="rounded-ny-card border border-line bg-surface p-4">
      <dt className="text-xs text-ink-label">{label}</dt>
      <dd className={`mt-0.5 font-display text-xl font-bold tabular-nums ${tones[tone]}`}>{value}</dd>
    </div>
  );
}
