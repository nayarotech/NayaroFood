'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CircleCheck } from 'lucide-react';
import { ApiError, apiPost } from '@/lib/api';
import { AuthField } from '@/components/auth-field';
import { CodeInput, ResendButton } from '@/components/code-input';

type Step = 'email' | 'code' | 'details';

const STEPS: { key: Step; label: string }[] = [
  { key: 'email', label: 'Email' },
  { key: 'code', label: 'Verify' },
  { key: 'details', label: 'Your details' },
];

/**
 * Customer sign-up: confirm the email first, then set up the account.
 *   1. email   → we send a code
 *   2. code    → proves the inbox is theirs
 *   3. details → name, phone, password → account created and signed in
 * Restaurants use /register.
 */
export function SignupForm({ next }: { next?: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [signupToken, setSignupToken] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset(nextStep: Step) {
    setFields({});
    setFormError(null);
    setNotice(null);
    setStep(nextStep);
  }

  function fail(error: unknown, fallback: string) {
    if (error instanceof ApiError) {
      setFields(error.fields ?? {});
      if (!error.fields) setFormError(error.message);
    } else setFormError(fallback);
  }

  async function sendCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = String(new FormData(event.currentTarget).get('email') ?? '').trim();
    setSubmitting(true);
    setFields({});
    setFormError(null);
    try {
      await apiPost('/auth/register-customer/start', { email: address });
      setEmail(address.toLowerCase());
      setCode('');
      reset('code');
    } catch (error) {
      fail(error, 'Something went wrong. Please try again.');
    }
    setSubmitting(false);
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    if (code.length < 6) {
      setFields({ code: 'Enter the 6-digit code.' });
      return;
    }
    setSubmitting(true);
    setFields({});
    setFormError(null);
    try {
      const result = await apiPost<{ signupToken: string }>('/auth/register-customer/verify', { email, code });
      setSignupToken(result.signupToken);
      reset('details');
    } catch (error) {
      if (error instanceof ApiError && !error.fields) setFields({ code: error.message });
      else fail(error, 'Something went wrong. Please try again.');
    }
    setSubmitting(false);
  }

  async function createAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setFields({});
    setFormError(null);
    try {
      await apiPost('/auth/register-customer/complete', {
        signupToken,
        name: String(form.get('name') ?? '').trim(),
        phone: String(form.get('phone') ?? '').trim(),
        password: form.get('password'),
        confirmPassword: form.get('confirmPassword'),
        acceptTerms: form.get('acceptTerms') === 'on',
      });
      // Back to where they were (usually checkout), not a dashboard.
      const target = next && !/^\/(admin|dashboard|rider)/.test(next) ? next : '/';
      router.push(target as Route);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'SIGNUP_TOKEN_INVALID') {
        reset('email');
        setFormError(error.message);
      } else {
        fail(error, 'Something went wrong. Please try again.');
      }
      setSubmitting(false);
    }
  }

  const current = STEPS.findIndex((s) => s.key === step);

  return (
    <div>
      <ol className="mb-6 flex items-center gap-2 text-xs" aria-label="Sign-up progress">
        {STEPS.map((s, index) => (
          <li key={s.key} className="flex flex-1 items-center gap-2" aria-current={index === current ? 'step' : undefined}>
            <span
              className={`grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${
                index < current ? 'bg-success text-white' : index === current ? 'bg-accent text-on-accent' : 'bg-surface-inset text-ink-label'
              }`}
            >
              {index + 1}
            </span>
            <span className={index === current ? 'font-medium text-ink' : 'text-ink-label'}>{s.label}</span>
            {index < STEPS.length - 1 && <span aria-hidden className="h-px flex-1 bg-line" />}
          </li>
        ))}
      </ol>

      {formError && (
        <p role="alert" className="mb-4 rounded-ny bg-danger-soft px-3 py-2 text-sm text-danger">
          {formError}
        </p>
      )}
      {notice && (
        <p role="status" className="mb-4 rounded-ny bg-success-soft px-3 py-2 text-sm text-success">
          {notice}
        </p>
      )}

      {step === 'email' && (
        <form onSubmit={sendCode} className="space-y-4" noValidate>
          <AuthField label="Email" name="email" type="email" autoComplete="email" required defaultValue={email}
            placeholder="you@example.com" hint="We’ll send you a code to confirm it’s yours." error={fields.email} />
          <button type="submit" disabled={submitting}
            className="w-full rounded-ny bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-60">
            {submitting ? 'Sending code…' : 'Send code'}
          </button>
        </form>
      )}

      {step === 'code' && (
        <form onSubmit={verify} className="space-y-4" noValidate>
          <p className="text-sm text-ink-muted">
            Enter the 6-digit code we sent to <span className="font-medium text-ink">{email}</span>. It expires in 10 minutes.
          </p>
          <CodeInput value={code} onChange={setCode} error={fields.code} />
          <button type="submit" disabled={submitting}
            className="w-full rounded-ny bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-60">
            {submitting ? 'Checking…' : 'Verify email'}
          </button>
          <div className="flex items-center justify-between">
            <ResendButton
              onResend={async () => {
                setFormError(null);
                setNotice(null);
                try {
                  await apiPost('/auth/register-customer/resend', { email });
                  setNotice('A new code is on its way.');
                } catch (error) {
                  fail(error, 'Could not send a new code.');
                }
              }}
            />
            <button type="button" onClick={() => reset('email')} className="text-sm text-ink-muted hover:text-ink">
              Change email
            </button>
          </div>
          <p className="text-xs text-ink-label">Can’t find it? Check your spam or promotions folder.</p>
        </form>
      )}

      {step === 'details' && (
        <form onSubmit={createAccount} className="space-y-4" noValidate>
          <p className="flex items-center gap-2 rounded-ny bg-success-soft px-3 py-2 text-sm text-success">
            <CircleCheck aria-hidden className="size-4 shrink-0" />
            <span>
              <span className="font-medium">{email}</span> is confirmed.
            </span>
          </p>
          <AuthField label="Full name" name="name" autoComplete="name" required autoFocus error={fields.name} />
          <AuthField label="Phone" name="phone" type="tel" autoComplete="tel" required placeholder="98XXXXXXXX"
            hint="The restaurant and rider will call this number." error={fields.phone} />
          <div className="grid gap-4 sm:grid-cols-2">
            <AuthField label="Password" name="password" type="password" autoComplete="new-password" required
              hint="At least 10 characters." error={fields.password} />
            <AuthField label="Confirm password" name="confirmPassword" type="password" autoComplete="new-password" required
              error={fields.confirmPassword} />
          </div>
          <label className="flex items-start gap-2 text-sm text-ink-muted">
            <input type="checkbox" name="acceptTerms" required className="mt-0.5 size-4 accent-[var(--ny-accent)]" />
            <span>
              I agree to the{' '}
              <Link href={'/terms' as Route} target="_blank" className="font-medium text-accent-label hover:underline">terms</Link>{' '}
              and{' '}
              <Link href={'/privacy-policy' as Route} target="_blank" className="font-medium text-accent-label hover:underline">privacy policy</Link>.
              {fields.acceptTerms && <span className="block text-xs text-danger">{fields.acceptTerms}</span>}
            </span>
          </label>
          <button type="submit" disabled={submitting}
            className="w-full rounded-ny bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-60">
            {submitting ? 'Creating your account…' : 'Create account'}
          </button>
        </form>
      )}
    </div>
  );
}
