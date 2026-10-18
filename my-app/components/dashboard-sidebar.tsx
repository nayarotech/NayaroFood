'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  Bell,
  ChartNoAxesColumn,
  ClipboardList,
  Menu as MenuIcon,
  MapPinned,
  Settings,
  Star,
  UsersRound,
  UtensilsCrossed,
  ContactRound,
  type LucideIcon,
} from 'lucide-react';
import type { StaffPermission } from '@/lib/roles';

interface NavItem {
  href: Route;
  label: string;
  icon: LucideIcon;
  /** Shown only with this permission; undefined = everyone on the team. */
  needs?: StaffPermission;
  ownerOnly?: boolean;
  badge?: number;
}

export function DashboardSidebar({
  openOrders = 0,
  permissions,
  isOwner,
}: {
  openOrders?: number;
  permissions: readonly StaffPermission[];
  isOwner: boolean;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const all: NavItem[] = [
    { href: '/dashboard', label: 'Overview', icon: ChartNoAxesColumn },
    { href: '/dashboard/orders', label: 'Orders', icon: ClipboardList, needs: 'ORDERS', badge: openOrders },
    { href: '/dashboard/menu', label: 'Menu', icon: UtensilsCrossed, needs: 'MENU' },
    { href: '/dashboard/customers', label: 'Customers', icon: ContactRound, needs: 'CUSTOMERS' },
    { href: '/dashboard/reviews' as Route, label: 'Reviews', icon: Star, needs: 'REVIEWS' },
    { href: '/dashboard/team' as Route, label: isOwner ? 'Team & riders' : 'Riders', icon: UsersRound, needs: 'RIDERS' },
    { href: '/dashboard/zones', label: 'Delivery zones', icon: MapPinned, needs: 'SETTINGS' },
    { href: '/dashboard/notifications', label: 'Notifications', icon: Bell },
    { href: '/dashboard/settings', label: 'Settings', icon: Settings, needs: 'SETTINGS' },
  ];
  const items = all.filter((item) => (item.ownerOnly ? isOwner : !item.needs || permissions.includes(item.needs)));

  const isActive = (href: string) => (href === '/dashboard' ? pathname === href : pathname.startsWith(href));

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen((open) => !open)}
        aria-expanded={mobileOpen}
        aria-controls="dashboard-nav"
        className="mb-3 flex items-center gap-2 rounded-ny border border-line bg-surface px-3 py-2 text-sm font-medium text-ink-muted lg:hidden"
      >
        <MenuIcon aria-hidden className="size-4" />
        Menu
        {openOrders > 0 && (
          <span className="rounded-ny-pill bg-warning-soft px-1.5 text-[11px] font-semibold text-warning">{openOrders}</span>
        )}
      </button>

      <nav
        id="dashboard-nav"
        aria-label="Dashboard"
        className={`${mobileOpen ? 'block' : 'hidden'} mb-4 rounded-ny-card border border-line bg-surface p-1.5 lg:mb-0 lg:block lg:border-0 lg:bg-transparent lg:p-0`}
      >
        <ul className="space-y-0.5">
          {items.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-2.5 rounded-ny px-3 py-2 text-sm transition-colors ${
                    active ? 'bg-surface font-semibold text-ink shadow-[var(--ny-shadow-card)] ring-1 ring-line' : 'text-ink-muted hover:bg-surface-muted hover:text-ink'
                  }`}
                >
                  <Icon aria-hidden className={`size-4 shrink-0 ${active ? 'text-accent' : ''}`} strokeWidth={1.75} />
                  <span className="flex-1">{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="rounded-ny-pill bg-accent px-1.5 text-[11px] font-semibold text-on-accent tabular-nums">
                      {item.badge}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
