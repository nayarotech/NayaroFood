'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/orders', label: 'Orders' },
  { href: '/dashboard/menu', label: 'Menu' },
  { href: '/dashboard/zones', label: 'Delivery zones' },
] as const;

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav className="mt-5 -mx-4 overflow-x-auto border-b border-line px-4">
      <ul className="flex w-max gap-1">
        {TABS.map((tab) => {
          // Exact match for the overview tab, prefix match for the rest, so
          // /dashboard doesn't stay highlighted on every child route.
          const active = tab.href === '/dashboard' ? pathname === tab.href : pathname.startsWith(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`-mb-px block border-b-2 px-3.5 py-2.5 text-sm transition-colors ${
                  active
                    ? 'border-accent font-semibold text-accent-label'
                    : 'border-transparent text-ink-muted hover:border-line-strong hover:text-ink'
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
