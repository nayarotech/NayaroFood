import { redirect } from 'next/navigation';
import { AsideList, AuthShell } from '@/components/auth-shell';
import { LoginForm } from '@/components/login-form';
import { getSession } from '@/lib/session';
import { SilentSignIn } from '@/components/silent-sign-in';
import { safeNext } from '@/lib/safe-next';

export const metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const next = (await searchParams).next;
  const nextPath = safeNext(Array.isArray(next) ? next[0] : next) ?? undefined;

  // Someone already signed in has no business on the sign-in screen.
  const session = await getSession();
  if (session) redirect(session.user.role === 'SUPER_ADMIN' ? '/admin' : '/dashboard');

  return (
    <AuthShell
      title="Sign in"
      subtitle="Manage your menu, delivery zones and incoming orders."
      aside={
        <AsideList
          heading="Your restaurant dashboard"
          items={[
            'Set delivery zones and fees by distance',
            'Get new orders live, with sound and phone alerts',
            'Track repeat customers and reward them',
          ]}
        />
      }
    >
      <SilentSignIn next={nextPath}>
        <LoginForm next={nextPath} />
      </SilentSignIn>
    </AuthShell>
  );
}
