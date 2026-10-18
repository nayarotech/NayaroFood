import { redirect } from 'next/navigation';
import { getSession, homeFor } from '@/lib/session';
import { SessionKeeper } from '@/components/session-keeper';
import { RiderLive } from '@/components/rider/rider-live';

export const dynamic = 'force-dynamic';

export default async function RiderLayout({ children }: LayoutProps<'/rider'>) {
  const session = await getSession();
  if (!session) redirect('/login?next=/rider');
  if (session.user.role !== 'RIDER') redirect(homeFor(session.user.role));

  return (
    <div className="mx-auto max-w-2xl px-4 py-5">
      <SessionKeeper />
      <RiderLive />
      {children}
    </div>
  );
}
