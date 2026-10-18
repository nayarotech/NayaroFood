import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/auth-shell';
import { LoginForm } from '@/components/login-form';
import { SilentSignIn } from '@/components/silent-sign-in';
import { getSession, homeFor } from '@/lib/session';
import { safeNext } from '@/lib/safe-next';

export const metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const next = (await searchParams).next;
  const nextPath = safeNext(Array.isArray(next) ? next[0] : next) ?? undefined;

  const session = await getSession();
  if (session) redirect(homeFor(session.user.role));

  return (
    <AuthShell
      title="Sign in"
      subtitle={nextPath?.includes('/checkout') ? 'Sign in to place your order.' : 'Welcome back.'}
      footer={
        <>
          New to Nayaro Food?{' '}
          <Link href={(nextPath ? `/signup?next=${encodeURIComponent(nextPath)}` : '/signup') as '/signup'} className="font-semibold text-accent-label hover:underline">
            Create an account
          </Link>
          <span className="mx-2 text-ink-label">·</span>
          <Link href="/register" className="hover:text-ink">
            List your restaurant
          </Link>
        </>
      }
    >
      <SilentSignIn next={nextPath}>
        <LoginForm next={nextPath} />
      </SilentSignIn>
    </AuthShell>
  );
}
