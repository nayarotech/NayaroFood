import type { HomeSection } from '@nayaro/shared';
import { Markdown } from '@/components/site/markdown';
import { SiteLink } from '@/components/site-footer';
import { SiteIcon } from '@/components/site/site-icon';

/** Homepage sections the Super Admin adds and orders under Site content. */
export function HomeSections({ sections }: { sections: HomeSection[] }) {
  if (sections.length === 0) return null;
  return (
    <div className="pb-14">
      {sections.map((section) => (
        <section key={section.id} id={section.id} className="mx-auto max-w-6xl scroll-mt-20 px-4 py-8">
          {section.type === 'features' && <Features section={section} />}
          {section.type === 'text' && <TextBlock section={section} />}
          {section.type === 'cta' && <CallToAction section={section} />}
        </section>
      ))}
    </div>
  );
}

function Heading({ title, subtitle }: { title: string; subtitle?: string }) {
  if (!title && !subtitle) return null;
  return (
    <div className="mb-6 max-w-2xl">
      {title && <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>}
      {subtitle && <p className="mt-2 text-[15px] text-ink-muted">{subtitle}</p>}
    </div>
  );
}

function Features({ section }: { section: Extract<HomeSection, { type: 'features' }> }) {
  return (
    <>
      <Heading title={section.title} subtitle={section.subtitle} />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {section.items.map((item, index) => (
          <li key={`${item.title}-${index}`} className="rounded-ny-card border border-line bg-surface p-5 shadow-[var(--ny-shadow-card)]">
            {item.icon && (
              <span className="grid size-10 place-items-center rounded-ny bg-accent-soft text-accent-label">
                <SiteIcon name={item.icon} className="size-5" />
              </span>
            )}
            <h3 className="mt-3 font-display text-lg font-semibold tracking-tight">{item.title}</h3>
            {item.text && <p className="mt-1 text-sm text-ink-muted">{item.text}</p>}
          </li>
        ))}
      </ul>
    </>
  );
}

function TextBlock({ section }: { section: Extract<HomeSection, { type: 'text' }> }) {
  return (
    <div className={`grid items-center gap-8 ${section.image ? 'lg:grid-cols-2' : ''}`}>
      <div className="min-w-0 max-w-2xl">
        <Heading title={section.title} />
        <Markdown source={section.body} />
      </div>
      {section.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={section.image.url} alt={section.image.alt} loading="lazy"
          className="aspect-[4/3] w-full rounded-ny-card object-cover shadow-[var(--ny-shadow-card-hover)]" />
      )}
    </div>
  );
}

function CallToAction({ section }: { section: Extract<HomeSection, { type: 'cta' }> }) {
  return (
    <div
      className="relative overflow-hidden rounded-ny-card px-6 py-10 text-white shadow-[var(--ny-shadow-accent)] sm:px-10"
      style={{ backgroundImage: 'var(--ny-accent-gradient)' }}
    >
      <div aria-hidden className="pointer-events-none absolute -top-24 -right-20 size-72 rounded-full bg-white/10 blur-2xl" />
      <div className="relative flex flex-wrap items-center justify-between gap-6">
        <div className="max-w-xl">
          {section.title && <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{section.title}</h2>}
          {section.body && <p className="mt-2 text-[15px] text-white/85">{section.body}</p>}
        </div>
        {section.buttonLabel && section.buttonHref && (
          <SiteLink href={section.buttonHref}
            className="rounded-ny-pill bg-white px-6 py-3 text-sm font-semibold text-accent-label shadow-lg transition-transform hover:-translate-y-0.5">
            {section.buttonLabel}
          </SiteLink>
        )}
      </div>
    </div>
  );
}
