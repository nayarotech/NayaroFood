import Link from 'next/link';
import { getSession } from '@/lib/session';
import { SignOutButton } from '@/components/sign-out-button';
import { SiteLink } from '@/components/site-footer';
import { getSite } from '@/lib/site';

export async function SiteHeader() {
  const [session, site] = await Promise.all([getSession(), getSite()]);
  const extraLinks = site?.chrome.headerLinks ?? [];
  const isSuperAdmin = session?.user.role === 'SUPER_ADMIN';

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="grid size-8 place-items-center rounded-ny bg-accent font-display text-sm font-bold text-on-accent shadow-[var(--ny-shadow-accent)]"
          >
            N
          </span>
          <span className="font-display text-[15px] font-semibold tracking-tight">
            Nayaro <span className="text-ink-muted">Food</span>
          </span>
        </Link>

        <nav className="flex items-center gap-1 text-sm">
          {extraLinks.map((link) => (
            <SiteLink
              key={`${link.label}-${link.href}`}
              href={link.href}
              className="hidden rounded-ny px-3 py-1.5 text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink md:block"
            >
              {link.label}
            </SiteLink>
          ))}
          {session ? (
            <>
              <Link
                href={isSuperAdmin ? '/admin' : '/dashboard'}
                className="rounded-ny px-3 py-1.5 font-medium text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
              >
                {isSuperAdmin ? 'Platform admin' : 'Dashboard'}
              </Link>
              <SignOutButton />
            </>
          ) : (
            <>
              <Link
                href="/orders"
                className="hidden rounded-ny px-3 py-1.5 text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink sm:block"
              >
                Track order
              </Link>
              <Link
                href="/login"
                className="rounded-ny px-3 py-1.5 text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="rounded-ny-pill bg-accent px-4 py-2 font-semibold text-on-accent shadow-[var(--ny-shadow-accent)] transition-colors hover:bg-accent-hover"
              >
                <span className="hidden sm:inline">List your restaurant</span>
                <span className="sm:hidden">List</span>
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
