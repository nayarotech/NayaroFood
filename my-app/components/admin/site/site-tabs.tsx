'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';

const TABS: { href: Route; label: string; exact?: boolean }[] = [
  { href: '/admin/site', label: 'Homepage', exact: true },
  { href: '/admin/site/footer' as Route, label: 'Header & footer' },
  { href: '/admin/site/pages' as Route, label: 'Pages' },
  { href: '/admin/site/messages' as Route, label: 'Messages' },
];

export function SiteTabs({ unread = 0 }: { unread?: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Site content" className="-mx-4 mb-6 overflow-x-auto border-b border-line px-4">
      <ul className="flex w-max gap-1">
        {TABS.map((tab) => {
          const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
          return (
            <li key={tab.href}>
              <Link href={tab.href} aria-current={active ? 'page' : undefined}
                className={`-mb-px flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-sm transition-colors ${
                  active ? 'border-accent font-semibold text-accent-label' : 'border-transparent text-ink-muted hover:text-ink'
                }`}>
                {tab.label}
                {tab.label === 'Messages' && unread > 0 && (
                  <span className="rounded-ny-pill bg-warning-soft px-1.5 text-[10px] font-bold text-warning tabular-nums">{unread}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
