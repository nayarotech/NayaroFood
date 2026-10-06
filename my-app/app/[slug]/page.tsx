import { notFound } from 'next/navigation';
import { API_URL } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { Markdown } from '@/components/site/markdown';
import { ContactForm } from '@/components/site/contact-form';

/**
 * Content pages written by the Super Admin — About, Privacy policy, Terms,
 * Contact and any others they add — served at /<slug>. Real app routes are
 * static and always win; anything else unknown is a 404.
 */

interface SitePage {
  slug: string;
  title: string;
  summary: string;
  body: string;
  showContactForm: boolean;
  updatedAt: string;
  contact: { email: string; phone: string; address: string };
}

async function loadPage(slug: string): Promise<SitePage | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  try {
    const response = await fetch(`${API_URL}/public/pages/${slug}`, { next: { revalidate: 15, tags: ['site'] } });
    if (!response.ok) return null;
    return ((await response.json()) as { data: SitePage }).data;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: PageProps<'/[slug]'>) {
  const page = await loadPage((await params).slug);
  return page ? { title: page.title, description: page.summary || undefined } : { title: 'Page not found' };
}

export default async function ContentPage({ params }: PageProps<'/[slug]'>) {
  const page = await loadPage((await params).slug);
  if (!page) notFound();

  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <header className="border-b border-line pb-6">
        <h1 className="font-display text-4xl font-bold tracking-tight">{page.title}</h1>
        {page.summary && <p className="mt-3 text-lg text-ink-muted">{page.summary}</p>}
        <p className="mt-3 text-xs text-ink-label">Last updated {formatDate(page.updatedAt)}</p>
      </header>

      <div className="mt-8">
        <Markdown source={page.body} />
      </div>

      {page.showContactForm && (
        <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_260px]">
          <ContactForm />
          {(page.contact.email || page.contact.phone || page.contact.address) && (
            <aside className="h-fit rounded-ny-card border border-line bg-surface-muted p-5 text-sm">
              <h2 className="font-display text-base font-semibold tracking-tight">Reach us directly</h2>
              <ul className="mt-3 space-y-2 text-ink-muted">
                {page.contact.email && <li><a href={`mailto:${page.contact.email}`} className="font-medium text-accent-label hover:underline">{page.contact.email}</a></li>}
                {page.contact.phone && <li><a href={`tel:${page.contact.phone.replace(/\s/g, '')}`} className="font-medium text-accent-label hover:underline">{page.contact.phone}</a></li>}
                {page.contact.address && <li>{page.contact.address}</li>}
              </ul>
            </aside>
          )}
        </div>
      )}
    </article>
  );
}
