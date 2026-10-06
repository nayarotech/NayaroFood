'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Route } from 'next';
import { ApiError, apiPost } from '@/lib/api';
import { AuthField } from '@/components/auth-field';

interface LoginResponse {
  user: { role: 'SUPER_ADMIN' | 'RESTAURANT_ADMIN' };
  restaurantId: number | null;
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
        email: form.get('email'),
        password: form.get('password'),
        rememberMe: form.get('rememberMe') === 'on',
      });
      // Super Admins run the platform; everyone else lands on their own tenant.
      const home = result.user.role === 'SUPER_ADMIN' ? '/admin' : '/dashboard';
      // Only honour `next` inside the area this role can actually use.
      const target = next && next.startsWith(home) ? next : home;
      router.push(target as Route);
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
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        placeholder="you@restaurant.com"
        error={fields.email}
      />
      <AuthField
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={fields.password}
      />

      <label className="flex items-center gap-2 text-sm text-ink-muted">
        <input type="checkbox" name="rememberMe" className="size-4 accent-[var(--ny-accent)]" />
        Keep me signed in
      </label>

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-ny bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent shadow-[var(--ny-shadow-accent)] transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        {submitting ? 'Signing in…' : 'Sign in'}
      </button>

      <p className="text-center text-sm text-ink-muted">
        No account yet?{' '}
        <Link href="/register" className="font-medium text-accent-label hover:text-accent-hover">
          List your restaurant
        </Link>
      </p>
    </form>
  );
}
