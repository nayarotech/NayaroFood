import Link from 'next/link';
import { ShoppingBag, UserRound } from 'lucide-react';
import { getSession, homeFor } from '@/lib/session';
import { SignOutButton } from '@/components/sign-out-button';
import { SiteLink } from '@/components/site-footer';
import { getSite } from '@/lib/site';

const STAFF_LABEL = { SUPER_ADMIN: 'Admin', RESTAURANT_ADMIN: 'Dashboard', RIDER: 'My deliveries' } as const;

export async function SiteHeader() {
  const [session, site] = await Promise.all([getSession(), getSite()]);
  const extraLinks = site?.chrome.headerLinks ?? [];
  const role = session?.user.role;

  const link = 'rounded-ny px-3 py-1.5 text-sm text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink';

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-2" aria-label="Nayaro Food home">
          <span aria-hidden className="grid size-7 place-items-center rounded-ny bg-accent font-display text-sm font-bold text-on-accent">
            N
          </span>
          <span className="font-display text-[15px] font-semibold tracking-tight">Nayaro Food</span>
        </Link>

        <nav className="flex items-center gap-0.5" aria-label="Main">
          {extraLinks.map((item) => (
            <SiteLink key={`${item.label}-${item.href}`} href={item.href} className={`hidden md:block ${link}`}>
              {item.label}
            </SiteLink>
          ))}

          {!session && (
            <>
              <Link href="/orders" className={`hidden sm:block ${link}`}>
                Track order
              </Link>
              <Link href="/login" className={link}>
                Sign in
              </Link>
              <Link
                href="/register"
                className="ml-1 hidden rounded-ny border border-line px-3 py-1.5 text-sm font-medium text-ink-hi transition-colors hover:border-line-strong sm:block"
              >
                For restaurants
              </Link>
            </>
          )}

          {role === 'CUSTOMER' && (
            <>
              <Link href="/account" className={`flex items-center gap-1.5 ${link}`}>
                <ShoppingBag aria-hidden className="size-4" />
                <span className="hidden sm:inline">My orders</span>
              </Link>
              <Link href={'/account/profile' as '/account'} className={`flex items-center gap-1.5 ${link}`}>
                <UserRound aria-hidden className="size-4" />
                <span className="hidden max-w-32 truncate sm:inline">{session?.user.name.split(' ')[0]}</span>
              </Link>
              <SignOutButton />
            </>
          )}

          {role && role !== 'CUSTOMER' && (
            <>
              <Link href={homeFor(role)} className={`font-medium ${link}`}>
                {STAFF_LABEL[role]}
              </Link>
              <SignOutButton />
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
