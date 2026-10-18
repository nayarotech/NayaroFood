import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession, homeFor } from '@/lib/session';
import { SessionKeeper } from '@/components/session-keeper';
import { AccountTabs } from '@/components/account/account-tabs';

export const dynamic = 'force-dynamic';

export default async function AccountLayout({ children }: LayoutProps<'/account'>) {
  const session = await getSession();
  if (!session) redirect('/login?next=/account');
  if (session.user.role !== 'CUSTOMER') redirect(homeFor(session.user.role));

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <SessionKeeper />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">{session.user.name}</h1>
          <p className="text-sm text-ink-muted">{session.customer?.phone}</p>
        </div>
        <Link href="/" className="rounded-ny bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover">
          Order food
        </Link>
      </div>
      <AccountTabs />
      {children}
    </div>
  );
}
