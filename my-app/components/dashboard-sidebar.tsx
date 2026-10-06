'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

// `typedRoutes` needs the literal href union, not a widened `string`.
type DashboardRoute =
  | '/dashboard'
  | '/dashboard/orders'
  | '/dashboard/menu'
  | '/dashboard/zones'
  | '/dashboard/customers'
  | '/dashboard/notifications'
  | '/dashboard/settings';

interface NavItem {
  href: DashboardRoute;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}

/** Inline, currentColor-driven icons — no icon dependency, no flash of missing glyphs. */
const icon = (path: React.ReactNode) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"
    strokeLinecap="round" strokeLinejoin="round" className="size-[18px] shrink-0" aria-hidden>
    {path}
  </svg>
);

const ICONS = {
  overview: icon(<><rect x="2.5" y="2.5" width="6" height="6" rx="1.5" /><rect x="11.5" y="2.5" width="6" height="6" rx="1.5" /><rect x="2.5" y="11.5" width="6" height="6" rx="1.5" /><rect x="11.5" y="11.5" width="6" height="6" rx="1.5" /></>),
  orders: icon(<><path d="M3.5 5.5h13l-1 10a1.5 1.5 0 0 1-1.5 1.35H6a1.5 1.5 0 0 1-1.5-1.35Z" /><path d="M7 5.5a3 3 0 0 1 6 0" /></>),
  menu: icon(<><path d="M4 3.5v13" /><path d="M7 3.5v5a1.5 1.5 0 0 1-3 0" /><path d="M13 16.5v-6h1.5a2 2 0 0 0 2-2v-5" /><path d="M13 10.5a3 3 0 0 1 0-6" /></>),
  zones: icon(<><circle cx="10" cy="10" r="7" /><circle cx="10" cy="10" r="3" /><circle cx="10" cy="10" r="0.8" fill="currentColor" /></>),
  customers: icon(<><circle cx="7.5" cy="7" r="2.75" /><path d="M2.75 16.5a4.75 4.75 0 0 1 9.5 0" /><path d="M13.5 5.2a2.6 2.6 0 0 1 0 5" /><path d="M14.5 12.2a4.4 4.4 0 0 1 3 4.3" /></>),
  notifications: icon(<><path d="M5 8a5 5 0 0 1 10 0c0 4.5 1.5 6 1.5 6h-13S5 12.5 5 8Z" /><path d="M8.5 16.5a1.6 1.6 0 0 0 3 0" /></>),
  settings: icon(<><circle cx="10" cy="10" r="2.75" /><path d="M10 2.5v1.6M10 15.9v1.6M17.5 10h-1.6M4.1 10H2.5M15.3 4.7l-1.1 1.1M5.8 14.2l-1.1 1.1M15.3 15.3l-1.1-1.1M5.8 5.8 4.7 4.7" /></>),
} as const;

export function DashboardSidebar({ openOrders = 0 }: { openOrders?: number }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const items: NavItem[] = [
    { href: '/dashboard', label: 'Overview', icon: ICONS.overview },
    { href: '/dashboard/orders', label: 'Orders', icon: ICONS.orders, badge: openOrders },
    { href: '/dashboard/menu', label: 'Menu', icon: ICONS.menu },
    { href: '/dashboard/zones', label: 'Delivery zones', icon: ICONS.zones },
    { href: '/dashboard/customers', label: 'Customers', icon: ICONS.customers },
    { href: '/dashboard/notifications', label: 'Notifications', icon: ICONS.notifications },
    { href: '/dashboard/settings', label: 'Settings', icon: ICONS.settings },
  ];

  const isActive = (href: DashboardRoute) =>
    href === '/dashboard' ? pathname === href : pathname.startsWith(href);

  const nav = (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const active = isActive(item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={() => setMobileOpen(false)}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-2.5 rounded-ny px-3 py-2 text-sm transition-colors ${
                active
                  ? 'bg-accent font-semibold text-on-accent shadow-[var(--ny-shadow-accent)]'
                  : 'text-ink-muted hover:bg-surface-muted hover:text-ink'
              }`}
            >
              {item.icon}
              <span className="flex-1">{item.label}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <span
                  className={`rounded-ny-pill px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                    active ? 'bg-white/25 text-on-accent' : 'bg-warning-soft text-warning'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      {/* Mobile: a toggle, since a permanent sidebar would eat the screen. */}
      <button
        type="button"
        onClick={() => setMobileOpen((open) => !open)}
        aria-expanded={mobileOpen}
        aria-controls="dashboard-nav"
        className="mb-3 flex items-center gap-2 rounded-ny border border-line bg-surface px-3 py-2 text-sm font-medium text-ink-muted lg:hidden"
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4" aria-hidden>
          <path d="M3 5.5h14M3 10h14M3 14.5h14" strokeLinecap="round" />
        </svg>
        Menu
        {openOrders > 0 && (
          <span className="rounded-ny-pill bg-warning-soft px-1.5 py-0.5 text-[10px] font-bold text-warning">
            {openOrders}
          </span>
        )}
      </button>

      <nav
        id="dashboard-nav"
        aria-label="Dashboard"
        className={`${mobileOpen ? 'block' : 'hidden'} mb-4 rounded-ny-card border border-line bg-surface p-2 lg:mb-0 lg:block lg:border-0 lg:bg-transparent lg:p-0`}
      >
        {nav}
      </nav>
    </>
  );
}
