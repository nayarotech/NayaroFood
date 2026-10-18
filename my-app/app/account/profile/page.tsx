import { fetchTenant } from '@/lib/dashboard-api';
import { CustomerProfileForm } from '@/components/account/profile-form';

export const metadata = { title: 'Profile' };
export const dynamic = 'force-dynamic';

interface Me {
  name: string;
  phone: string;
  email: string | null;
}

export default async function ProfilePage() {
  const me = await fetchTenant<Me>('/customer/me');
  if (!me) return <p className="text-sm text-ink-muted">Couldn’t load your profile.</p>;
  return <CustomerProfileForm me={me} />;
}
