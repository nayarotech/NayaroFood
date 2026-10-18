import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/auth-shell';
import { RegisterForm } from '@/components/register-form';
import { getSession, homeFor } from '@/lib/session';

export const metadata = { title: 'List your restaurant' };
export const dynamic = 'force-dynamic';

export default async function RegisterPage() {
  const session = await getSession();
  if (session) redirect(homeFor(session.user.role));

  return (
    <AuthShell
      wide
      title="List your restaurant"
      subtitle="Create your owner account. After we verify your restaurant, customers can order from you."
      footer={
        <>
          Already listed?{' '}
          <Link href="/login" className="font-semibold text-accent-label hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthShell>
  );
}
