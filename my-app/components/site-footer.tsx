import Link from 'next/link';
import type { Route } from 'next';
import { getSite } from '@/lib/site';
import { Mail, MapPin, Phone } from 'lucide-react';

const SOCIAL: { key: 'facebook' | 'instagram' | 'tiktok' | 'youtube'; label: string; path: string }[] = [
  { key: 'facebook', label: 'Facebook', path: 'M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9v2.3H8v3h2.6V21' },
  { key: 'instagram', label: 'Instagram', path: 'M7.5 3h9A4.5 4.5 0 0 1 21 7.5v9a4.5 4.5 0 0 1-4.5 4.5h-9A4.5 4.5 0 0 1 3 16.5v-9A4.5 4.5 0 0 1 7.5 3Zm4.5 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm5-1.2a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8Z' },
  { key: 'tiktok', label: 'TikTok', path: 'M15.5 3c.3 2.2 1.6 3.6 3.8 3.8v3a7 7 0 0 1-3.8-1.2v6.2a5.7 5.7 0 1 1-5.7-5.7l.7.1v3.1a2.6 2.6 0 1 0 1.9 2.5V3h3.1Z' },
  { key: 'youtube', label: 'YouTube', path: 'M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.3 5 12 5 12 5s-6.3 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.8 1.8c1.5.4 7.8.4 7.8.4s6.3 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8ZM10 15V9l5.2 3L10 15Z' },
];

/** A link that may be internal (client-side navigation) or external. */
export function SiteLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  if (href.startsWith('/')) return <Link href={href as Route} className={className}>{children}</Link>;
  const external = /^https?:/i.test(href);
  return (
    <a href={href} className={className} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      {children}
    </a>
  );
}

/** Footer, edited by the Super Admin under Site content → Header & footer. */
export async function SiteFooter() {
  const site = await getSite();
  const footer = site?.chrome.footer;
  const pages = site?.footerPages ?? [];
  const social = SOCIAL.filter((s) => footer?.social[s.key]);
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="min-w-0">
          <Link href="/" className="flex items-center gap-2.5">
            <span aria-hidden className="grid size-8 place-items-center rounded-ny bg-accent font-display text-sm font-bold text-on-accent">N</span>
            <span className="font-display text-[15px] font-semibold tracking-tight">Nayaro <span className="text-ink-muted">Food</span></span>
          </Link>
          {footer?.tagline && <p className="mt-3 max-w-xs text-sm text-ink-muted">{footer.tagline}</p>}
          {footer && (footer.contact.email || footer.contact.phone || footer.contact.address) && (
            <ul className="mt-4 space-y-1 text-sm text-ink-muted">
              {footer.contact.email && (
                <li><a href={`mailto:${footer.contact.email}`} className="inline-flex items-center gap-2 hover:text-accent-label"><Mail aria-hidden className="size-4 text-ink-label" /> {footer.contact.email}</a></li>
              )}
              {footer.contact.phone && (
                <li><a href={`tel:${footer.contact.phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-2 hover:text-accent-label"><Phone aria-hidden className="size-4 text-ink-label" /> {footer.contact.phone}</a></li>
              )}
              {footer.contact.address && <li className="inline-flex items-center gap-2"><MapPin aria-hidden className="size-4 text-ink-label" /> {footer.contact.address}</li>}
            </ul>
          )}
          {social.length > 0 && (
            <div className="mt-4 flex gap-2">
              {social.map((s) => (
                <a key={s.key} href={footer!.social[s.key]} target="_blank" rel="noopener noreferrer" aria-label={s.label}
                  className="grid size-9 place-items-center rounded-full border border-line text-ink-muted transition-colors hover:border-accent-border hover:text-accent-label">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="size-4" aria-hidden><path d={s.path} /></svg>
                </a>
              ))}
            </div>
          )}
        </div>

        {footer?.columns.map((column) => (
          <nav key={column.title} aria-label={column.title}>
            <h2 className="text-xs font-semibold tracking-wider text-ink-label uppercase">{column.title}</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {column.links.map((link) => (
                <li key={`${link.label}-${link.href}`}>
                  <SiteLink href={link.href} className="text-ink-muted transition-colors hover:text-accent-label">{link.label}</SiteLink>
                </li>
              ))}
            </ul>
          </nav>
        ))}

        {pages.length > 0 && (
          <nav aria-label="Company">
            <h2 className="text-xs font-semibold tracking-wider text-ink-label uppercase">Company</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {pages.map((page) => (
                <li key={page.slug}>
                  <Link href={`/${page.slug}` as Route} className="text-ink-muted transition-colors hover:text-accent-label">{page.title}</Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>

      <div className="border-t border-line-soft">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-4 text-xs text-ink-label sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} {footer?.copyright || 'Nayaro Tech'}. All rights reserved.</p>
          <p>
            Built by{' '}
            <a href="https://nayaro.tech" target="_blank" rel="noopener noreferrer" className="font-medium text-accent-label hover:text-accent-hover">
              Nayaro Tech
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
