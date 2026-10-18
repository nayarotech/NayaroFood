'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, apiPatch, apiPost } from '@/lib/api';
import { AuthField } from '@/components/auth-field';

type Notice = { tone: 'ok' | 'error'; text: string } | null;

export function CustomerProfileForm({ me }: { me: { name: string; phone: string; email: string | null } }) {
  return (
    <div className="space-y-5">
      <DetailsCard me={me} />
      <PasswordCard />
    </div>
  );
}

function Card({ title, children, notice }: { title: string; children: React.ReactNode; notice: Notice }) {
  return (
    <section className="rounded-ny-card border border-line bg-surface p-5">
      <h2 className="font-display text-base font-semibold">{title}</h2>
      {notice && (
        <p role={notice.tone === 'error' ? 'alert' : 'status'}
          className={`mt-3 rounded-ny px-3 py-2 text-sm ${notice.tone === 'ok' ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'}`}>
          {notice.text}
        </p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function DetailsCard({ me }: { me: { name: string; phone: string; email: string | null } }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setNotice(null);
    setFields({});
    try {
      await apiPatch('/customer/me', { name: String(form.get('name') ?? '').trim(), email: String(form.get('email') ?? '').trim() });
      setNotice({ tone: 'ok', text: 'Saved.' });
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError) {
        setFields(error.fields ?? {});
        setNotice({ tone: 'error', text: error.message });
      } else setNotice({ tone: 'error', text: 'Could not save.' });
    }
    setBusy(false);
  }

  return (
    <Card title="Your details" notice={notice}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <AuthField label="Full name" name="name" defaultValue={me.name} error={fields.name} />
        <AuthField label="Email" name="email" type="email" defaultValue={me.email ?? ''} error={fields.email} />
        <AuthField label="Phone" name="phone" defaultValue={me.phone} disabled
          hint="Your phone is your account’s identity. Contact support to change it." />
        <button type="submit" disabled={busy}
          className="rounded-ny bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50">
          {busy ? 'Saving…' : 'Save'}
        </button>
      </form>
    </Card>
  );
}

function PasswordCard() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const body = {
      currentPassword: String(form.get('currentPassword') ?? ''),
      newPassword: String(form.get('newPassword') ?? ''),
      confirmPassword: String(form.get('confirmPassword') ?? ''),
    };
    if (body.newPassword !== body.confirmPassword) {
      setFields({ confirmPassword: 'Passwords do not match.' });
      return;
    }
    setBusy(true);
    setNotice(null);
    setFields({});
    try {
      await apiPost('/auth/change-password', body);
      formElement.reset();
      setNotice({ tone: 'ok', text: 'Password changed. Please sign in again.' });
      setTimeout(() => {
        router.push('/login');
        router.refresh();
      }, 1200);
    } catch (error) {
      if (error instanceof ApiError) {
        setFields(error.code === 'WRONG_PASSWORD' ? { currentPassword: error.message } : error.fields ?? {});
        setNotice({ tone: 'error', text: error.message });
      } else setNotice({ tone: 'error', text: 'Could not change your password.' });
      setBusy(false);
    }
  }

  return (
    <Card title="Password" notice={notice}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <AuthField label="Current password" name="currentPassword" type="password" autoComplete="current-password" error={fields.currentPassword} />
        <div className="grid gap-4 sm:grid-cols-2">
          <AuthField label="New password" name="newPassword" type="password" autoComplete="new-password" hint="At least 10 characters." error={fields.newPassword} />
          <AuthField label="Confirm new password" name="confirmPassword" type="password" autoComplete="new-password" error={fields.confirmPassword} />
        </div>
        <button type="submit" disabled={busy}
          className="rounded-ny border border-line px-4 py-2 text-sm font-semibold text-ink-hi hover:border-line-strong disabled:opacity-50">
          {busy ? 'Changing…' : 'Change password'}
        </button>
      </form>
    </Card>
  );
}
