import { fetchTenant } from '@/lib/dashboard-api';
import { can, getSession } from '@/lib/session';
import { NoAccess } from '@/components/no-access';
import { TeamManager, type TeamMember } from '@/components/team-manager';

export const metadata = { title: 'Team' };
export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  const session = await getSession();
  const isOwner = session?.restaurant?.role === 'OWNER';
  if (!isOwner && !can(session, 'RIDERS')) return <NoAccess what="the team" />;

  const members = await fetchTenant<TeamMember[]>('/restaurant/team');
  return (
    <div className="max-w-4xl">
      <header className="mb-5">
        <h1 className="font-display text-xl font-bold tracking-tight">{isOwner ? 'Team & riders' : 'Riders'}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {isOwner
            ? 'Add managers to run the restaurant when you’re away, and riders to deliver orders.'
            : 'Add riders and keep their access up to date.'}
        </p>
      </header>
      {members ? (
        <TeamManager members={members} isOwner={isOwner} currentUserId={session!.user.id} />
      ) : (
        <p className="rounded-ny-card border border-line bg-surface p-6 text-sm text-ink-muted">Couldn’t load the team.</p>
      )}
    </div>
  );
}
