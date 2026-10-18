import Link from 'next/link';
import type { Route } from 'next';
import { fetchPaged, param, toQuery } from '@/lib/dashboard-api';
import { EmptyState } from '@/components/admin/page-header';
import { Pagination } from '@/components/pagination';
import { MessageInbox, type ContactMessage } from '@/components/admin/site/message-inbox';

export const metadata = { title: 'Messages · Site content' };
export const dynamic = 'force-dynamic';

export default async function MessagesPage({ searchParams }: PageProps<'/admin/site/messages'>) {
  const query = await searchParams;
  const status = param(query.status) === 'unread' ? 'unread' : undefined;
  const page = Math.max(1, Number(param(query.page)) || 1);
  const result = await fetchPaged<ContactMessage>(`/admin/site/messages${toQuery({ status, page, perPage: 25 })}`);

  const tab = (label: string, value?: string) => (
    <Link href={`/admin/site/messages${toQuery({ status: value })}` as Route}
      className={`rounded-ny-pill px-3 py-1.5 text-sm ${status === value ? 'bg-accent font-semibold text-on-accent' : 'border border-line bg-surface text-ink-muted hover:border-accent-border'}`}>
      {label}
    </Link>
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {tab('All')}
        {tab('Unread', 'unread')}
        <p className="ml-auto text-xs text-ink-label">From the contact form on your Contact page.</p>
      </div>
      {!result ? (
        <EmptyState>Couldn&rsquo;t load messages.</EmptyState>
      ) : result.items.length === 0 ? (
        <EmptyState>{status ? 'No unread messages.' : 'No messages yet.'}</EmptyState>
      ) : (
        <>
          <MessageInbox messages={result.items} />
          <Pagination basePath="/admin/site/messages" params={{ status }} page={result.meta.page}
            totalPages={result.meta.totalPages} total={result.meta.total} perPage={result.meta.perPage} />
        </>
      )}
    </div>
  );
}
