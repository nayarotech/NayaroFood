import { fetchTenant } from '@/lib/dashboard-api';
import { MenuManager, type MenuCategory, type MenuItem } from '@/components/menu-manager';

export const metadata = { title: 'Menu' };
export const dynamic = 'force-dynamic';

export default async function MenuPage() {
  const [categories, items] = await Promise.all([
    fetchTenant<MenuCategory[]>('/restaurant/menu/categories'),
    fetchTenant<MenuItem[]>('/restaurant/menu/items'),
  ]);

  return (
    <div className="max-w-4xl">
      <header className="mb-5">
        <h1 className="font-display text-xl font-bold tracking-tight">Menu</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Add, edit and photograph your dishes. Customers only see categories that are shown and
          dishes that are in stock.
        </p>
      </header>

      {categories && items ? (
        <MenuManager categories={categories} items={items} />
      ) : (
        <p className="rounded-ny-card border border-dashed border-line-strong bg-surface p-8 text-center text-sm text-ink-muted">
          Couldn&rsquo;t load your menu.
        </p>
      )}
    </div>
  );
}
