import { redirect } from 'next/navigation';
import { AsideList, AuthShell } from '@/components/auth-shell';
import { RegisterForm } from '@/components/register-form';
import { getSession } from '@/lib/session';

export const metadata = { title: 'List your restaurant' };
export const dynamic = 'force-dynamic';

export default async function RegisterPage() {
  const session = await getSession();
  if (session) redirect(session.user.role === 'SUPER_ADMIN' ? '/admin' : '/dashboard');

  return (
    <AuthShell
      title="List your restaurant"
      subtitle="Create your account, then set up your menu and delivery zones. No setup fee."
      aside={
        <AsideList
          heading="How ranking works"
          items={[
            'A complete storefront ranks before it has any orders',
            'Verifying your WhatsApp number is the single biggest boost',
            'Repeat customers and accepted orders lift you further',
          ]}
        />
      }
    >
      <RegisterForm />
    </AuthShell>
  );
}
