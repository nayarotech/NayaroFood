import { fetchAdmin } from '@/lib/dashboard-api';
import { RankManager, type AdminRestaurant } from '@/components/rank-manager';
import { EmptyState, PageHeader } from '@/components/admin/page-header';

export const metadata = { title: 'Ranking · Admin' };
export const dynamic = 'force-dynamic';

export default async function AdminRankingPage() {
  const restaurants = await fetchAdmin<AdminRestaurant[]>('/admin/restaurants?perPage=100&sort=rank&status=ACTIVE');

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Ranking"
        description="Ranking is computed from real signals. Pinning overrides it for promotions and launch partners. Only verified restaurants are listed."
      />
      {restaurants ? <RankManager initial={restaurants} /> : <EmptyState>Couldn&rsquo;t load restaurants.</EmptyState>}
    </div>
  );
}
