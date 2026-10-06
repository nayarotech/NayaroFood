'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

interface NavItem {
  href: Route;
  label: string;
  icon: React.ReactNode;
  badge?: number;
  soon?: boolean;
}

const icon = (path: React.ReactNode) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"
    strokeLinecap="round" strokeLinejoin="round" className="size-[18px] shrink-0" aria-hidden>
    {path}
  </svg>
);

const ICONS = {
  overview: icon(<><rect x="2.5" y="2.5" width="6" height="6" rx="1.5" /><rect x="11.5" y="2.5" width="6" height="6" rx="1.5" /><rect x="2.5" y="11.5" width="6" height="6" rx="1.5" /><rect x="11.5" y="11.5" width="6" height="6" rx="1.5" /></>),
  restaurants: icon(<><path d="M3 8.5 4.5 3.5h11L17 8.5" /><path d="M3 8.5a2.3 2.3 0 0 0 4.7 0 2.3 2.3 0 0 0 4.6 0 2.3 2.3 0 0 0 4.7 0" /><path d="M4.5 10.5v6h11v-6" /><path d="M8.5 16.5v-3.5h3v3.5" /></>),
  orders: icon(<><path d="M3.5 5.5h13l-1 10a1.5 1.5 0 0 1-1.5 1.35H6a1.5 1.5 0 0 1-1.5-1.35Z" /><path d="M7 5.5a3 3 0 0 1 6 0" /></>),
  customers: icon(<><circle cx="7.5" cy="7" r="2.75" /><path d="M2.75 16.5a4.75 4.75 0 0 1 9.5 0" /><path d="M13.5 5.2a2.6 2.6 0 0 1 0 5" /><path d="M14.5 12.2a4.4 4.4 0 0 1 3 4.3" /></>),
  ranking: icon(<><path d="M4 16.5v-5" /><path d="M10 16.5v-10" /><path d="M16 16.5v-7.5" /><path d="M2.5 16.5h15" /></>),
  site: icon(<><rect x="2.5" y="3.5" width="15" height="13" rx="2" /><path d="M2.5 7.5h15" /><path d="M6 11h5M6 13.5h8" /></>),
  activity: icon(<><path d="M2.5 10h3l2-5 3 10 2-5h5" /></>),
  upcoming: icon(<><path d="M3.5 16.5 4.6 13A6.5 6.5 0 1 1 7 15.4Z" /><path d="M7.5 8.2c.3 1.6 1.7 3 3.3 3.3l.8-1 1.7.8-.4 1.3a4.9 4.9 0 0 1-5.7-5.7l1.3-.4.8 1.7Z" /></>),
} as const;

/**
 * The Super Admin console navigation: a fixed left rail on desktop, a
 * collapsible menu on phones.
 */
export function AdminSidebar({
  pendingApprovals = 0,
  openOrders = 0,
  unreadMessages = 0,
}: {
  pendingApprovals?: number;
  openOrders?: number;
  unreadMessages?: number;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const groups: { heading: string; items: NavItem[] }[] = [
    {
      heading: 'Operate',
      items: [
        { href: '/admin', label: 'Overview', icon: ICONS.overview },
        { href: '/admin/restaurants', label: 'Restaurants', icon: ICONS.restaurants, badge: pendingApprovals },
        { href: '/admin/orders', label: 'Orders', icon: ICONS.orders, badge: openOrders },
        { href: '/admin/customers', label: 'Customers', icon: ICONS.customers },
      ],
    },
    {
      heading: 'Platform',
      items: [
        { href: '/admin/site' as Route, label: 'Site content', icon: ICONS.site, badge: unreadMessages },
        { href: '/admin/ranking', label: 'Ranking', icon: ICONS.ranking },
        { href: '/admin/activity', label: 'Activity log', icon: ICONS.activity },
        { href: '/admin/upcoming', label: 'WhatsApp', icon: ICONS.upcoming, soon: true },
      ],
    },
  ];

  const isActive = (href: string) => (href === '/admin' ? pathname === href : pathname.startsWith(href));

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen((open) => !open)}
        aria-expanded={mobileOpen}
        aria-controls="admin-nav"
        className="mb-3 flex items-center gap-2 rounded-ny border border-line bg-surface px-3 py-2 text-sm font-medium text-ink-muted lg:hidden"
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4" aria-hidden>
          <path d="M3 5.5h14M3 10h14M3 14.5h14" strokeLinecap="round" />
        </svg>
        Admin menu
        {pendingApprovals > 0 && (
          <span className="rounded-ny-pill bg-warning-soft px-1.5 py-0.5 text-[10px] font-bold text-warning">
            {pendingApprovals}
          </span>
        )}
      </button>

      <nav
        id="admin-nav"
        aria-label="Admin"
        className={`${mobileOpen ? 'block' : 'hidden'} mb-4 space-y-4 rounded-ny-card border border-line bg-surface p-2 lg:mb-0 lg:block lg:border-0 lg:bg-transparent lg:p-0`}
      >
        {groups.map((group) => (
          <div key={group.heading}>
            <p className="mb-1 px-3 text-[10px] font-semibold tracking-wider text-ink-label uppercase">
              {group.heading}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
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
                      {item.soon && (
                        <span
                          className={`rounded-ny-pill px-1.5 py-0.5 text-[9px] font-bold tracking-wide uppercase ${
                            active ? 'bg-white/25 text-on-accent' : 'bg-accent-pill text-accent-label'
                          }`}
                        >
                          Soon
                        </span>
                      )}
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
          </div>
        ))}
      </nav>
    </>
  );
}
