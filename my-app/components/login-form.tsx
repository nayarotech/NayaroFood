'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Route } from 'next';
import { ApiError, apiPost } from '@/lib/api';
import { homeFor } from '@/lib/roles';
import { AuthField } from '@/components/auth-field';

interface LoginResponse {
  user: { role: string };
}

/** Staff areas a `next` link may only lead into for the matching role. */
const PROTECTED: { prefix: string; role: string }[] = [
  { prefix: '/admin', role: 'SUPER_ADMIN' },
  { prefix: '/dashboard', role: 'RESTAURANT_ADMIN' },
  { prefix: '/rider', role: 'RIDER' },
];

function destination(role: string, next: string | undefined): string {
  if (!next) return role === 'CUSTOMER' ? '/' : homeFor(role);
  const area = PROTECTED.find((p) => next.startsWith(p.prefix));
  // A customer sent to /admin, say, goes home instead of to a 403.
  if (area && area.role !== role) return homeFor(role);
  return next;
}

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setFields({});

    const form = new FormData(event.currentTarget);
    try {
      const result = await apiPost<LoginResponse>('/auth/login', {
        identifier: String(form.get('identifier') ?? '').trim(),
        password: form.get('password'),
        rememberMe: form.get('rememberMe') === 'on',
      });
      router.push(destination(result.user.role, next) as Route);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError) {
        setFields(error.fields ?? {});
        if (!error.fields) setFormError(error.message);
      } else {
        setFormError('Something went wrong. Please try again.');
      }
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {formError && (
        <p role="alert" className="rounded-ny bg-danger-soft px-3 py-2 text-sm text-danger">
          {formError}
        </p>
      )}

      <AuthField
        label="Email or phone"
        name="identifier"
        autoComplete="username"
        required
        placeholder="you@example.com or 98XXXXXXXX"
        error={fields.identifier}
      />
      <AuthField
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={fields.password}
      />

      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input type="checkbox" name="rememberMe" className="size-4 accent-[var(--ny-accent)]" />
          Keep me signed in
        </label>
        <Link href={'/forgot-password' as Route} className="text-sm font-medium text-accent-label hover:underline">
          Forgot password?
        </Link>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-ny bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        {submitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
