import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { AuthShell } from '@/components/auth-shell';
import { SignupForm } from '@/components/signup-form';
import { getSession, homeFor } from '@/lib/session';
import { safeNext } from '@/lib/safe-next';

export const metadata = { title: 'Create an account' };
export const dynamic = 'force-dynamic';

export default async function SignupPage({ searchParams }: PageProps<'/signup'>) {
  const next = (await searchParams).next;
  const nextPath = safeNext(Array.isArray(next) ? next[0] : next) ?? undefined;
  const session = await getSession();
  if (session) redirect((nextPath ?? homeFor(session.user.role)) as Route);

  return (
    <AuthShell
      title="Create an account"
      subtitle="Start with your email — we’ll confirm it, then you set up your account."
      footer={
        <>
          Already have an account?{' '}
          <Link href={(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : '/login') as '/login'} className="font-semibold text-accent-label hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <SignupForm next={nextPath} />
    </AuthShell>
  );
}
