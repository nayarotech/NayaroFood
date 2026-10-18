'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ApiError, apiPost } from '@/lib/api';
import { AuthField } from '@/components/auth-field';
import { CodeInput, ResendButton } from '@/components/code-input';

/** Email → code + new password → done. Riders without an email ask their restaurant owner instead. */
export function ForgotPasswordForm() {
  const [step, setStep] = useState<'email' | 'reset' | 'done'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function requestCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = String(new FormData(event.currentTarget).get('email') ?? '').trim();
    setSubmitting(true);
    setFormError(null);
    setFields({});
    try {
      await apiPost('/auth/password/forgot', { email: address });
      setEmail(address.toLowerCase());
      setStep('reset');
    } catch (error) {
      if (error instanceof ApiError) {
        setFields(error.fields ?? {});
        if (!error.fields) setFormError(error.message);
      } else setFormError('Something went wrong. Please try again.');
    }
    setSubmitting(false);
  }

  async function reset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get('newPassword') ?? '');
    const confirmPassword = String(form.get('confirmPassword') ?? '');
    const errors: Record<string, string> = {};
    if (code.length < 6) errors.code = 'Enter the 6-digit code.';
    if (newPassword.length < 10) errors.newPassword = 'Use at least 10 characters.';
    if (confirmPassword !== newPassword) errors.confirmPassword = 'Passwords do not match.';
    if (Object.keys(errors).length > 0) {
      setFields(errors);
      return;
    }
    setSubmitting(true);
    setFormError(null);
    setFields({});
    try {
      await apiPost('/auth/password/reset', { email, code, newPassword, confirmPassword });
      setStep('done');
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.fields) setFields(error.fields);
        else if (error.code.startsWith('CODE') || error.code === 'NO_ACTIVE_CODE') setFields({ code: error.message });
        else setFormError(error.message);
      } else setFormError('Something went wrong. Please try again.');
    }
    setSubmitting(false);
  }

  if (step === 'done') {
    return (
      <div className="space-y-4">
        <p role="status" className="rounded-ny bg-success-soft px-3 py-2 text-sm text-success">
          Your password has been changed. For your security, you’ve been signed out on every device.
        </p>
        <Link href="/login" className="block w-full rounded-ny bg-accent px-4 py-2.5 text-center text-sm font-semibold text-on-accent hover:bg-accent-hover">
          Sign in
        </Link>
      </div>
    );
  }

  if (step === 'reset') {
    return (
      <form onSubmit={reset} className="space-y-4" noValidate>
        <p className="text-sm text-ink-muted">
          If <span className="font-medium text-ink">{email}</span> has an account, we’ve sent it a 6-digit code.
        </p>
        {formError && <p role="alert" className="rounded-ny bg-danger-soft px-3 py-2 text-sm text-danger">{formError}</p>}
        {notice && <p role="status" className="rounded-ny bg-success-soft px-3 py-2 text-sm text-success">{notice}</p>}
        <CodeInput value={code} onChange={setCode} error={fields.code} />
        <AuthField label="New password" name="newPassword" type="password" autoComplete="new-password"
          hint="At least 10 characters." error={fields.newPassword} />
        <AuthField label="Confirm new password" name="confirmPassword" type="password" autoComplete="new-password"
          error={fields.confirmPassword} />
        <button type="submit" disabled={submitting}
          className="w-full rounded-ny bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-60">
          {submitting ? 'Saving…' : 'Set new password'}
        </button>
        <div className="flex items-center justify-between">
          <ResendButton
            onResend={async () => {
              setNotice(null);
              await apiPost('/auth/password/forgot', { email }).catch(() => undefined);
              setNotice('If the account exists, a new code is on its way.');
            }}
          />
          <button type="button" onClick={() => { setStep('email'); setCode(''); setFields({}); }}
            className="text-sm text-ink-muted hover:text-ink">
            Use another email
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={requestCode} className="space-y-4" noValidate>
      {formError && <p role="alert" className="rounded-ny bg-danger-soft px-3 py-2 text-sm text-danger">{formError}</p>}
      <AuthField label="Email" name="email" type="email" autoComplete="email" required defaultValue={email} error={fields.email} />
      <button type="submit" disabled={submitting}
        className="w-full rounded-ny bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-60">
        {submitting ? 'Sending…' : 'Send code'}
      </button>
      <p className="text-xs text-ink-label">Riders who sign in with a phone number: ask your restaurant owner to reset your password.</p>
    </form>
  );
}
