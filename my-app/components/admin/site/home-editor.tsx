'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { HomeContent, HomeSection, SitePhoto } from '@nayaro/shared';
import { ApiError, apiPost, apiPut } from '@/lib/api';
import { ImageUpload } from '@/components/image-upload';
import { refreshSiteContent } from '@/app/admin/site/actions';
import { EditorCard, SaveBar, SmallButton, TextArea, TextField, useUnsavedWarning } from './form-ui';

type Notice = { tone: 'ok' | 'error'; text: string } | null;

const SECTION_LABEL: Record<HomeSection['type'], string> = {
  features: 'Feature cards',
  text: 'Text & image',
  cta: 'Call to action',
};

const newId = (type: string) => `${type}-${Math.random().toString(36).slice(2, 7)}`;

function blankSection(type: HomeSection['type']): HomeSection {
  if (type === 'features') {
    return { id: newId('features'), type, title: 'Why order with us', subtitle: '', items: [{ icon: '⭐', title: 'A great reason', text: '' }] };
  }
  if (type === 'text') return { id: newId('text'), type, title: 'A new section', body: '', image: null };
  return { id: newId('cta'), type, title: 'Ready to order?', body: '', buttonLabel: 'Browse restaurants', buttonHref: '/' };
}

/**
 * The homepage, field by field. Edits stay local until "Save & publish",
 * which validates on the server, stores the whole document, and refreshes
 * the public site's cache so the change is live on the next visit.
 */
export function HomeEditor({ initial }: { initial: HomeContent }) {
  const router = useRouter();
  const [home, setHome] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(null);

  const dirty = useMemo(() => JSON.stringify(home) !== JSON.stringify(saved), [home, saved]);
  useUnsavedWarning(dirty);

  const patch = (update: Partial<HomeContent>) => {
    setHome((current) => ({ ...current, ...update }));
    setNotice(null);
  };
  const setHero = (key: keyof HomeContent['hero'], value: string) => patch({ hero: { ...home.hero, [key]: value } });
  const setPhoto = (index: number, update: Partial<SitePhoto> | null) => {
    const photos = [...home.photos];
    if (update === null) photos.splice(index, 1);
    else photos[index] = { ...photos[index]!, ...update };
    patch({ photos });
  };
  const setSection = (index: number, section: HomeSection | null) => {
    const sections = [...home.sections];
    if (section === null) sections.splice(index, 1);
    else sections[index] = section;
    patch({ sections });
  };
  const moveSection = (index: number, direction: -1 | 1) => {
    const sections = [...home.sections];
    const target = index + direction;
    if (target < 0 || target >= sections.length) return;
    [sections[index], sections[target]] = [sections[target]!, sections[index]!];
    patch({ sections });
  };

  async function save() {
    setBusy(true);
    setNotice(null);
    setErrors({});
    try {
      const result = await apiPut<HomeContent>('/admin/site/home', home);
      setHome(result);
      setSaved(result);
      await refreshSiteContent();
      router.refresh();
      setNotice({ tone: 'ok', text: 'Published — the homepage is updated.' });
    } catch (caught) {
      if (caught instanceof ApiError) {
        setErrors(caught.fields ?? {});
        setNotice({ tone: 'error', text: caught.fields ? 'Fix the highlighted fields, then save again.' : caught.message });
      } else setNotice({ tone: 'error', text: 'Could not save.' });
    }
    setBusy(false);
  }

  async function reset() {
    if (!window.confirm('Replace the homepage with the original default content? This cannot be undone.')) return;
    setBusy(true);
    try {
      const result = await apiPost<HomeContent>('/admin/site/reset/home', {});
      setHome(result);
      setSaved(result);
      await refreshSiteContent();
      setNotice({ tone: 'ok', text: 'Default homepage restored.' });
    } catch {
      setNotice({ tone: 'error', text: 'Could not restore defaults.' });
    }
    setBusy(false);
  }

  const err = (path: string) => errors[path];

  return (
    <div className="space-y-5">
      <EditorCard title="Hero" description="The first thing visitors see. The highlighted words get the blue gradient.">
        <TextField label="Badge" value={home.hero.badge} onChange={(v) => setHero('badge', v)} maxLength={60}
          hint="Small pill above the headline. Leave empty to hide it." error={err('hero.badge')} />
        <div className="grid gap-3 sm:grid-cols-3">
          <TextField label="Headline — start" value={home.hero.titleStart} onChange={(v) => setHero('titleStart', v)} maxLength={60} />
          <TextField label="Highlighted words" value={home.hero.titleHighlight} onChange={(v) => setHero('titleHighlight', v)} maxLength={40} />
          <TextField label="Headline — end" value={home.hero.titleEnd} onChange={(v) => setHero('titleEnd', v)} maxLength={60} />
        </div>
        <p className="rounded-ny bg-surface-muted px-4 py-3 font-display text-2xl leading-tight font-bold tracking-tight">
          {home.hero.titleStart}{' '}
          <span className="bg-gradient-to-br from-accent-bright to-accent-deep bg-clip-text text-transparent">{home.hero.titleHighlight}</span>{' '}
          {home.hero.titleEnd}
        </p>
        <TextArea label="Intro text" value={home.hero.subtitle} onChange={(v) => setHero('subtitle', v)} maxLength={300} rows={2} />
      </EditorCard>

      <EditorCard
        title="Photos"
        description="The first photo is large; up to three more sit in a row beneath it. Use bright, appetising food photos."
        actions={
          home.photos.length < 4 && (
            <SmallButton onClick={() => patch({ photos: [...home.photos, { url: '', alt: '', label: '' }] })}>+ Add photo</SmallButton>
          )
        }
      >
        {home.photos.length === 0 && <p className="text-sm text-ink-muted">No photos — the hero shows text only.</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          {home.photos.map((photo, index) => (
            <div key={index} className="rounded-ny border border-line-soft p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-ink-label uppercase">{index === 0 ? 'Main photo' : `Small photo ${index}`}</span>
                <div className="flex gap-1">
                  <SmallButton disabled={index === 0} onClick={() => {
                    const photos = [...home.photos];
                    [photos[index - 1], photos[index]] = [photos[index]!, photos[index - 1]!];
                    patch({ photos });
                  }}>↑</SmallButton>
                  <SmallButton danger onClick={() => setPhoto(index, null)}>Remove</SmallButton>
                </div>
              </div>
              <ImageUpload kind="site" shape="wide" label="Image" value={photo.url || null}
                onChange={(url) => setPhoto(index, { url: url ?? '' })} />
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <TextField label="Description (for screen readers)" value={photo.alt} onChange={(v) => setPhoto(index, { alt: v })} maxLength={160} />
                {index > 0 && <TextField label="Label on photo" value={photo.label} onChange={(v) => setPhoto(index, { label: v })} maxLength={40} placeholder="e.g. Momo" />}
              </div>
              {err(`photos.${index}.url`) && <p className="mt-1 text-xs text-danger">Upload an image or remove this slot.</p>}
            </div>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Caption on main photo — title" value={home.heroCaption.title}
            onChange={(v) => patch({ heroCaption: { ...home.heroCaption, title: v } })} maxLength={80} />
          <TextField label="Caption — line below" value={home.heroCaption.body}
            onChange={(v) => patch({ heroCaption: { ...home.heroCaption, body: v } })} maxLength={160} />
        </div>
      </EditorCard>

      <EditorCard
        title="Sections"
        description="Shown below the restaurant list, in this order."
        actions={
          home.sections.length < 12 && (
            <div className="flex flex-wrap gap-1">
              {(['features', 'text', 'cta'] as const).map((type) => (
                <SmallButton key={type} onClick={() => {
                  const section = blankSection(type);
                  patch({ sections: [...home.sections, section] });
                  setOpen(section.id);
                }}>+ {SECTION_LABEL[type]}</SmallButton>
              ))}
            </div>
          )
        }
      >
        {home.sections.length === 0 && <p className="text-sm text-ink-muted">No sections yet. Add one above.</p>}
        <ol className="space-y-2">
          {home.sections.map((section, index) => {
            const expanded = open === section.id;
            const hasError = Object.keys(errors).some((key) => key.startsWith(`sections.${index}.`));
            return (
              <li key={section.id} className={`rounded-ny border ${hasError ? 'border-danger' : expanded ? 'border-accent-border' : 'border-line'}`}>
                <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                  <button type="button" onClick={() => setOpen(expanded ? null : section.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    <span aria-hidden className="text-ink-label">{expanded ? '▾' : '▸'}</span>
                    <span className="rounded-ny-pill bg-surface-inset px-2 py-0.5 text-[11px] font-semibold text-ink-muted">{SECTION_LABEL[section.type]}</span>
                    <span className="truncate text-sm font-medium">{section.title || 'Untitled section'}</span>
                  </button>
                  <SmallButton aria-label="Move up" disabled={index === 0} onClick={() => moveSection(index, -1)}>↑</SmallButton>
                  <SmallButton aria-label="Move down" disabled={index === home.sections.length - 1} onClick={() => moveSection(index, 1)}>↓</SmallButton>
                  <SmallButton danger onClick={() => {
                    if (window.confirm(`Remove the “${section.title || 'untitled'}” section?`)) setSection(index, null);
                  }}>Remove</SmallButton>
                </div>
                {expanded && (
                  <div className="space-y-3 border-t border-line-soft p-3">
                    <SectionFields section={section} onChange={(next) => setSection(index, next)} errors={errors} prefix={`sections.${index}.`} />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </EditorCard>

      <SaveBar dirty={dirty} busy={busy} notice={notice} onSave={save} onReset={reset} />
    </div>
  );
}

function SectionFields({ section, onChange, errors, prefix }: {
  section: HomeSection; onChange: (s: HomeSection) => void; errors: Record<string, string>; prefix: string;
}) {
  const err = (key: string) => errors[`${prefix}${key}`];

  if (section.type === 'features') {
    const setItem = (index: number, update: Partial<(typeof section.items)[number]> | null) => {
      const items = [...section.items];
      if (update === null) items.splice(index, 1);
      else items[index] = { ...items[index]!, ...update };
      onChange({ ...section, items });
    };
    return (
      <>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Title" value={section.title} onChange={(v) => onChange({ ...section, title: v })} maxLength={120} />
          <TextField label="Subtitle" value={section.subtitle} onChange={(v) => onChange({ ...section, subtitle: v })} maxLength={300} />
        </div>
        <div className="space-y-2">
          {section.items.map((item, index) => (
            <div key={index} className="grid gap-2 rounded-ny bg-surface-muted p-2.5 sm:grid-cols-[70px_1fr_2fr_auto] sm:items-end">
              <TextField label="Icon" value={item.icon} onChange={(v) => setItem(index, { icon: v })} maxLength={8} placeholder="🍜" />
              <TextField label="Card title" value={item.title} onChange={(v) => setItem(index, { title: v })} maxLength={80} error={err(`items.${index}.title`)} />
              <TextField label="Text" value={item.text} onChange={(v) => setItem(index, { text: v })} maxLength={300} />
              <SmallButton danger onClick={() => setItem(index, null)}>✕</SmallButton>
            </div>
          ))}
          {section.items.length < 6 && (
            <SmallButton onClick={() => onChange({ ...section, items: [...section.items, { icon: '', title: '', text: '' }] })}>+ Add card</SmallButton>
          )}
          <p className="text-xs text-ink-label">Tip: an emoji makes a good icon — 🛵 🍜 💵 📍 ⭐</p>
        </div>
      </>
    );
  }

  if (section.type === 'text') {
    return (
      <>
        <TextField label="Title" value={section.title} onChange={(v) => onChange({ ...section, title: v })} maxLength={120} />
        <TextArea label="Text" value={section.body} onChange={(v) => onChange({ ...section, body: v })} rows={6} maxLength={4000} mono
          hint="Supports **bold**, *italic*, [links](/about), - lists and ## headings." />
        <ImageUpload kind="site" shape="wide" label="Image (optional)" value={section.image?.url ?? null}
          onChange={(url) => onChange({ ...section, image: url ? { url, alt: section.image?.alt ?? '', label: '' } : null })} />
        {section.image && (
          <TextField label="Image description" value={section.image.alt}
            onChange={(v) => onChange({ ...section, image: { ...section.image!, alt: v } })} maxLength={160} />
        )}
      </>
    );
  }

  return (
    <>
      <TextField label="Title" value={section.title} onChange={(v) => onChange({ ...section, title: v })} maxLength={120} />
      <TextArea label="Text" value={section.body} onChange={(v) => onChange({ ...section, body: v })} rows={2} maxLength={400} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Button label" value={section.buttonLabel} onChange={(v) => onChange({ ...section, buttonLabel: v })} maxLength={40} />
        <TextField label="Button link" value={section.buttonHref} onChange={(v) => onChange({ ...section, buttonHref: v })}
          placeholder="/register or https://…" error={err('buttonHref')} />
      </div>
    </>
  );
}
