'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError, apiPost } from '@/lib/api';
import { AuthField } from '@/components/auth-field';

export function RegisterForm() {
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
    const password = String(form.get('password') ?? '');

    try {
      await apiPost('/auth/register', {
        restaurantName: form.get('restaurantName'),
        ownerName: form.get('ownerName'),
        email: form.get('email'),
        password,
        confirmPassword: String(form.get('confirmPassword') ?? ''),
        phone: form.get('phone'),
        address: form.get('address'),
        acceptTerms: form.get('acceptTerms') === 'on',
      });
      router.push('/dashboard');
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
        label="Restaurant name"
        name="restaurantName"
        required
        placeholder="Hotel Everest Momo"
        error={fields.restaurantName}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <AuthField label="Your name" name="ownerName" required error={fields.ownerName} />
        <AuthField
          label="Phone"
          name="phone"
          required
          placeholder="9801234567"
          hint="Local numbers are fine."
          error={fields.phone}
        />
      </div>
      <AuthField
        label="Restaurant address"
        name="address"
        required
        placeholder="Thamel Marg, Kathmandu"
        error={fields.address}
      />
      <AuthField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        error={fields.email}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <AuthField
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          hint="At least 10 characters."
          error={fields.password}
        />
        <AuthField
          label="Confirm password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          error={fields.confirmPassword}
        />
      </div>

      <label className="flex items-start gap-2 text-sm text-ink-muted">
        <input
          type="checkbox"
          name="acceptTerms"
          required
          className="mt-0.5 size-4 accent-[var(--ny-accent)]"
        />
        <span>
          I agree to the Nayaro Tech platform terms.
          {fields.acceptTerms && <span className="block text-xs text-danger">{fields.acceptTerms}</span>}
        </span>
      </label>

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-ny bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent shadow-[var(--ny-shadow-accent)] transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        {submitting ? 'Creating your account…' : 'Create restaurant account'}
      </button>

      <p className="text-center text-sm text-ink-muted">
        Already listed?{' '}
        <Link href="/login" className="font-medium text-accent-label hover:text-accent-hover">
          Sign in
        </Link>
      </p>
    </form>
  );
}
