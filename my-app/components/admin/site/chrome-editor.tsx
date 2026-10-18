'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ChromeContent, SiteLink } from '@nayaro/shared';
import { ApiError, apiPost, apiPut } from '@/lib/api';
import { refreshSiteContent } from '@/app/admin/site/actions';
import { EditorCard, SaveBar, SmallButton, TextField, useUnsavedWarning } from './form-ui';
import { ChevronUp, X } from 'lucide-react';

type Notice = { tone: 'ok' | 'error'; text: string } | null;

/** Header links and the whole footer. Pages are listed in the footer automatically. */
export function ChromeEditor({ initial, pages }: { initial: ChromeContent; pages: { slug: string; title: string }[] }) {
  const router = useRouter();
  const [chrome, setChrome] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const dirty = useMemo(() => JSON.stringify(chrome) !== JSON.stringify(saved), [chrome, saved]);
  useUnsavedWarning(dirty);

  const footer = chrome.footer;
  const setFooter = (update: Partial<ChromeContent['footer']>) => {
    setChrome((c) => ({ ...c, footer: { ...c.footer, ...update } }));
    setNotice(null);
  };

  async function save() {
    setBusy(true);
    setNotice(null);
    setErrors({});
    try {
      const result = await apiPut<ChromeContent>('/admin/site/chrome', chrome);
      setChrome(result);
      setSaved(result);
      await refreshSiteContent();
      router.refresh();
      setNotice({ tone: 'ok', text: 'Published — header and footer updated everywhere.' });
    } catch (caught) {
      if (caught instanceof ApiError) {
        setErrors(caught.fields ?? {});
        setNotice({ tone: 'error', text: caught.fields ? 'Fix the highlighted fields, then save again.' : caught.message });
      } else setNotice({ tone: 'error', text: 'Could not save.' });
    }
    setBusy(false);
  }

  async function reset() {
    if (!window.confirm('Replace the header links and footer with the original defaults?')) return;
    setBusy(true);
    try {
      const result = await apiPost<ChromeContent>('/admin/site/reset/chrome', {});
      setChrome(result);
      setSaved(result);
      await refreshSiteContent();
      router.refresh();
      setNotice({ tone: 'ok', text: 'Defaults restored.' });
    } catch {
      setNotice({ tone: 'error', text: 'Could not restore defaults.' });
    }
    setBusy(false);
  }

  return (
    <div className="space-y-5">
      <EditorCard
        title="Header links"
        description="Extra links in the top bar, next to Track order and Sign in. Hidden on small phones."
        actions={chrome.headerLinks.length < 5 && (
          <SmallButton onClick={() => setChrome((c) => ({ ...c, headerLinks: [...c.headerLinks, { label: '', href: '/' }] }))}>+ Add link</SmallButton>
        )}
      >
        <LinkList
          links={chrome.headerLinks}
          onChange={(headerLinks) => { setChrome((c) => ({ ...c, headerLinks })); setNotice(null); }}
          errors={errors}
          prefix="headerLinks"
          pages={pages}
        />
      </EditorCard>

      <EditorCard title="Footer — about & contact">
        <TextField label="Tagline" value={footer.tagline} onChange={(v) => setFooter({ tagline: v })} maxLength={200} />
        <div className="grid gap-3 sm:grid-cols-3">
          <TextField label="Contact email" type="email" value={footer.contact.email}
            onChange={(v) => setFooter({ contact: { ...footer.contact, email: v } })} error={errors['footer.contact.email']} />
          <TextField label="Contact phone" value={footer.contact.phone}
            onChange={(v) => setFooter({ contact: { ...footer.contact, phone: v } })} maxLength={30} placeholder="+977 98…" />
          <TextField label="Address" value={footer.contact.address}
            onChange={(v) => setFooter({ contact: { ...footer.contact, address: v } })} maxLength={200} />
        </div>
        <TextField label="Copyright holder" value={footer.copyright} onChange={(v) => setFooter({ copyright: v })} maxLength={120}
          hint={`Shown as “© ${new Date().getFullYear()} ${footer.copyright || '…'}. All rights reserved.”`} />
      </EditorCard>

      <EditorCard title="Social media" description="Full https:// links. Empty ones are hidden.">
        <div className="grid gap-3 sm:grid-cols-2">
          {(['facebook', 'instagram', 'tiktok', 'youtube'] as const).map((key) => (
            <TextField key={key} label={key[0]!.toUpperCase() + key.slice(1)} value={footer.social[key]}
              onChange={(v) => setFooter({ social: { ...footer.social, [key]: v } })}
              placeholder={`https://${key}.com/…`} error={errors[`footer.social.${key}`]} />
          ))}
        </div>
      </EditorCard>

      <EditorCard
        title="Footer link columns"
        description="Up to four columns. Published pages (About, Privacy …) are added automatically under “Company”."
        actions={footer.columns.length < 4 && (
          <SmallButton onClick={() => setFooter({ columns: [...footer.columns, { title: 'New column', links: [] }] })}>+ Add column</SmallButton>
        )}
      >
        {footer.columns.map((column, index) => (
          <div key={index} className="rounded-ny border border-line-soft p-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1">
                <TextField label="Column title" value={column.title} maxLength={40} error={errors[`footer.columns.${index}.title`]}
                  onChange={(v) => setFooter({ columns: footer.columns.map((c, i) => (i === index ? { ...c, title: v } : c)) })} />
              </div>
              {column.links.length < 8 && (
                <SmallButton onClick={() => setFooter({ columns: footer.columns.map((c, i) => (i === index ? { ...c, links: [...c.links, { label: '', href: '/' }] } : c)) })}>
                  + Link
                </SmallButton>
              )}
              <SmallButton danger onClick={() => setFooter({ columns: footer.columns.filter((_, i) => i !== index) })}>Remove column</SmallButton>
            </div>
            <div className="mt-3">
              <LinkList
                links={column.links}
                onChange={(links) => setFooter({ columns: footer.columns.map((c, i) => (i === index ? { ...c, links } : c)) })}
                errors={errors}
                prefix={`footer.columns.${index}.links`}
                pages={pages}
              />
            </div>
          </div>
        ))}
      </EditorCard>

      <SaveBar dirty={dirty} busy={busy} notice={notice} onSave={save} onReset={reset} />
    </div>
  );
}

function LinkList({ links, onChange, errors, prefix, pages }: {
  links: SiteLink[]; onChange: (links: SiteLink[]) => void; errors: Record<string, string>; prefix: string;
  pages: { slug: string; title: string }[];
}) {
  const listId = `${prefix}-suggestions`;
  if (links.length === 0) return <p className="text-sm text-ink-muted">No links.</p>;
  return (
    <div className="space-y-2">
      {/* Suggest existing pages and app routes in the link field. */}
      <datalist id={listId}>
        {['/', '/orders', '/register', '/login', ...pages.map((p) => `/${p.slug}`)].map((href) => <option key={href} value={href} />)}
      </datalist>
      {links.map((link, index) => (
        <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto_auto] sm:items-end">
          <TextField label="Label" value={link.label} maxLength={40} error={errors[`${prefix}.${index}.label`]}
            onChange={(v) => onChange(links.map((l, i) => (i === index ? { ...l, label: v } : l)))} />
          <div>
            <label className="mb-1 block text-sm font-medium text-ink-hi">Link</label>
            <input list={listId} value={link.href} placeholder="/about"
              onChange={(e) => onChange(links.map((l, i) => (i === index ? { ...l, href: e.target.value } : l)))}
              className={`w-full rounded-ny border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none ${errors[`${prefix}.${index}.href`] ? 'border-danger' : 'border-line'}`} />
            {errors[`${prefix}.${index}.href`] && <p className="mt-1 text-xs text-danger">{errors[`${prefix}.${index}.href`]}</p>}
          </div>
          <SmallButton aria-label="Move up" disabled={index === 0}
            onClick={() => { const next = [...links]; [next[index - 1], next[index]] = [next[index]!, next[index - 1]!]; onChange(next); }}><ChevronUp aria-hidden className="size-3.5" /></SmallButton>
          <SmallButton danger onClick={() => onChange(links.filter((_, i) => i !== index))}><X aria-hidden className="size-3.5" /></SmallButton>
        </div>
      ))}
    </div>
  );
}
