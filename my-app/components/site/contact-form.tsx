'use client';

import { useState } from 'react';
import { ApiError, apiPost } from '@/lib/api';

const TOPICS = [
  { value: 'general', label: 'General question' },
  { value: 'order', label: 'About an order' },
  { value: 'restaurant', label: 'Listing my restaurant' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'other', label: 'Something else' },
];

/** Public contact form. Messages land in the Super Admin's inbox. */
export function ContactForm() {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? '').trim();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await apiPost('/public/contact', {
        name: value('name'),
        email: value('email'),
        phone: value('phone'),
        topic: value('topic'),
        message: value('message'),
        website: value('website'),
      });
      setSent(true);
    } catch (caught) {
      if (caught instanceof ApiError) {
        setFields(caught.fields ?? {});
        setError(caught.status === 429 ? 'You’ve sent several messages already — please try again later.' : caught.message);
      } else {
        setError('Could not send your message. Please try again.');
      }
    }
    setBusy(false);
  }

  if (sent) {
    return (
      <div role="status" className="rounded-ny-card border border-success/30 bg-success-soft p-6 text-success">
        <p className="font-display text-lg font-semibold">Thanks — your message is on its way.</p>
        <p className="mt-1 text-sm">We usually reply within one working day.</p>
      </div>
    );
  }

  const input = 'w-full rounded-ny border bg-surface px-3.5 py-2.5 text-sm focus:border-accent focus:outline-none';
  return (
    <form onSubmit={submit} noValidate className="rounded-ny-card border border-line bg-surface p-5 shadow-[var(--ny-shadow-card)]">
      <h2 className="font-display text-lg font-semibold tracking-tight">Send us a message</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Your name" error={fields.name}>
          <input name="name" autoComplete="name" required className={`${input} ${fields.name ? 'border-danger' : 'border-line'}`} />
        </Field>
        <Field label="Topic">
          <select name="topic" defaultValue="general" className={`${input} border-line`}>
            {TOPICS.map((topic) => <option key={topic.value} value={topic.value}>{topic.label}</option>)}
          </select>
        </Field>
        <Field label="Email" error={fields.email}>
          <input name="email" type="email" autoComplete="email" className={`${input} ${fields.email ? 'border-danger' : 'border-line'}`} />
        </Field>
        <Field label="Phone (optional)" error={fields.phone}>
          <input name="phone" type="tel" autoComplete="tel" className={`${input} border-line`} />
        </Field>
      </div>
      <div className="mt-3">
        <Field label="Message" error={fields.message}>
          <textarea name="message" rows={5} maxLength={4000} required className={`${input} ${fields.message ? 'border-danger' : 'border-line'}`} />
        </Field>
      </div>
      {/* Honeypot: hidden from people, irresistible to bots. */}
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] size-px opacity-0" />
      {error && <p role="alert" className="mt-3 rounded-ny bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <button type="submit" disabled={busy}
        className="mt-4 rounded-ny bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent shadow-[var(--ny-shadow-accent)] hover:bg-accent-hover disabled:opacity-50">
        {busy ? 'Sending…' : 'Send message'}
      </button>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink-hi">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-danger">{error}</span>}
    </label>
  );
}
