'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { slugify } from '@nayaro/shared';
import { ApiError, apiDelete, apiPatch, apiPost } from '@/lib/api';
import { Markdown } from '@/components/site/markdown';
import { refreshSiteContent } from '@/app/admin/site/actions';
import { EditorCard, SaveBar, TextArea, TextField, Toggle, useUnsavedWarning } from './form-ui';

export interface EditablePage {
  id?: number;
  slug: string;
  title: string;
  summary: string;
  body: string;
  showContactForm: boolean;
  isPublished: boolean;
  showInFooter: boolean;
  sortOrder: number;
}

type Notice = { tone: 'ok' | 'error'; text: string } | null;

const FORMAT_HELP = [
  ['## Heading', 'Section heading'],
  ['**bold**', 'Bold text'],
  ['*italic*', 'Italic text'],
  ['- item', 'Bullet list'],
  ['1. item', 'Numbered list'],
  ['[Contact us](/contact)', 'Link'],
  ['> note', 'Highlighted note'],
];

/**
 * Write a page in simple Markdown with a live preview. A new page's address
 * follows its title until the admin edits the address themselves.
 */
export function PageEditor({ initial }: { initial: EditablePage }) {
  const router = useRouter();
  const isNew = initial.id === undefined;
  const [page, setPage] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const dirty = useMemo(() => JSON.stringify(page) !== JSON.stringify(saved), [page, saved]);
  useUnsavedWarning(dirty);

  const set = (update: Partial<EditablePage>) => {
    setPage((p) => ({ ...p, ...update }));
    setNotice(null);
  };

  async function save() {
    setBusy(true);
    setNotice(null);
    setErrors({});
    const { id, ...body } = page;
    try {
      const result = isNew
        ? await apiPost<EditablePage>('/admin/site/pages', body)
        : await apiPatch<EditablePage>(`/admin/site/pages/${id}`, body);
      setPage(result);
      setSaved(result);
      await refreshSiteContent();
      if (isNew) {
        router.replace(`/admin/site/pages/${result.id}` as Route);
        return;
      }
      router.refresh();
      setNotice({ tone: 'ok', text: result.isPublished ? `Published at /${result.slug}` : 'Saved as a draft (not public).' });
    } catch (caught) {
      if (caught instanceof ApiError) {
        setErrors(caught.fields ?? (caught.code === 'SLUG_TAKEN' ? { slug: caught.message } : {}));
        setNotice({ tone: 'error', text: caught.message });
      } else setNotice({ tone: 'error', text: 'Could not save the page.' });
    }
    setBusy(false);
  }

  async function remove() {
    if (!page.id || !window.confirm(`Delete “${page.title}”? Links to /${page.slug} will stop working.`)) return;
    setBusy(true);
    try {
      await apiDelete(`/admin/site/pages/${page.id}`);
      await refreshSiteContent();
      router.push('/admin/site/pages' as Route);
      router.refresh();
    } catch {
      setNotice({ tone: 'error', text: 'Could not delete the page.' });
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <EditorCard title="Page details">
        <div className="grid gap-3 sm:grid-cols-[1.5fr_1fr]">
          <TextField label="Title" value={page.title} maxLength={120} error={errors.title}
            onChange={(title) => set({ title, ...(slugTouched ? {} : { slug: slugify(title).slice(0, 60) }) })} />
          <div>
            <TextField label="Address" value={page.slug} error={errors.slug} hint={`Lives at /${page.slug || '…'}`}
              onChange={(slug) => { setSlugTouched(true); set({ slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, '-') }); }} />
          </div>
        </div>
        <TextArea label="Summary" value={page.summary} onChange={(summary) => set({ summary })} maxLength={300} rows={2}
          hint="One or two sentences under the title. Also used by search engines." />
      </EditorCard>

      <EditorCard
        title="Content"
        actions={
          <div className="flex rounded-ny border border-line p-0.5 text-xs">
            {(['write', 'preview'] as const).map((value) => (
              <button key={value} type="button" onClick={() => setTab(value)}
                className={`rounded-[7px] px-3 py-1 font-medium capitalize ${tab === value ? 'bg-accent text-on-accent' : 'text-ink-muted hover:text-ink'}`}>
                {value}
              </button>
            ))}
          </div>
        }
      >
        {tab === 'write' ? (
          <div className="grid gap-4 lg:grid-cols-[1fr_200px]">
            <TextArea label="Page text" value={page.body} onChange={(body) => set({ body })} rows={20} maxLength={40000} mono error={errors.body} />
            <div className="h-fit rounded-ny bg-surface-muted p-3 text-xs">
              <p className="mb-2 font-semibold text-ink-hi">Formatting</p>
              <dl className="space-y-1.5">
                {FORMAT_HELP.map(([code, label]) => (
                  <div key={code}>
                    <dt className="font-mono text-[11px] text-accent-label">{code}</dt>
                    <dd className="text-ink-label">{label}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-ink-label">Leave a blank line between paragraphs.</p>
            </div>
          </div>
        ) : (
          <div className="rounded-ny border border-line-soft bg-background p-6">
            <h1 className="font-display text-3xl font-bold tracking-tight">{page.title || 'Untitled'}</h1>
            {page.summary && <p className="mt-2 text-ink-muted">{page.summary}</p>}
            <div className="mt-6"><Markdown source={page.body || '*Nothing written yet.*'} /></div>
            {page.showContactForm && (
              <p className="mt-6 rounded-ny border border-dashed border-line-strong p-4 text-center text-sm text-ink-label">
                [ Contact form and contact details appear here ]
              </p>
            )}
          </div>
        )}
      </EditorCard>

      <EditorCard title="Publishing">
        <div className="grid gap-3 sm:grid-cols-2">
          <Toggle label="Published" hint="Off = draft. Visitors get a 404 until you publish." checked={page.isPublished} onChange={(isPublished) => set({ isPublished })} />
          <Toggle label="Show in footer" hint="Listed under “Company” in the footer." checked={page.showInFooter} onChange={(showInFooter) => set({ showInFooter })} />
          <Toggle label="Show contact form" hint="Adds the message form and your contact details below the text." checked={page.showContactForm} onChange={(showContactForm) => set({ showContactForm })} />
          <div className="max-w-40">
            <TextField label="Footer order" type="number" value={String(page.sortOrder)}
              onChange={(v) => set({ sortOrder: Math.max(0, Math.min(999, Number(v) || 0)) })} hint="Lower numbers come first." />
          </div>
        </div>
        {!isNew && (
          <button type="button" onClick={remove} disabled={busy} className="text-sm font-medium text-danger hover:underline disabled:opacity-50">
            Delete this page
          </button>
        )}
      </EditorCard>

      <SaveBar dirty={dirty || isNew} busy={busy} notice={notice} onSave={save} viewHref={`/${saved.slug || ''}`} />
    </div>
  );
}
