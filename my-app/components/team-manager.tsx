'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bike, KeyRound, Plus, ShieldCheck, UserRound } from 'lucide-react';
import { ApiError, apiPatch, apiPost } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import type { StaffPermission } from '@/lib/roles';

export interface TeamMember {
  userId: number;
  name: string;
  phone: string | null;
  email: string | null;
  role: 'OWNER' | 'MANAGER' | 'STAFF' | 'RIDER';
  permissions: StaffPermission[];
  isActive: boolean;
  lastLoginAt: string | null;
  active?: number;
  delivered?: number;
}

const PERMISSIONS: { value: StaffPermission; label: string; detail: string }[] = [
  { value: 'ORDERS', label: 'Orders', detail: 'See, accept and update orders' },
  { value: 'RIDERS', label: 'Riders', detail: 'Add riders and assign deliveries' },
  { value: 'MENU', label: 'Menu', detail: 'Edit dishes, prices and photos' },
  { value: 'CUSTOMERS', label: 'Customers', detail: 'See customers and report problems' },
  { value: 'REVIEWS', label: 'Reviews', detail: 'Read ratings and comments' },
  { value: 'SETTINGS', label: 'Settings', detail: 'Opening status, zones, profile' },
];

type Editing = { mode: 'add'; role: 'MANAGER' | 'RIDER' } | { mode: 'edit'; member: TeamMember } | null;

export function TeamManager({ members, isOwner, currentUserId }: { members: TeamMember[]; isOwner: boolean; currentUserId: number }) {
  const [editing, setEditing] = useState<Editing>(null);
  const managers = members.filter((m) => m.role !== 'RIDER');
  const riders = members.filter((m) => m.role === 'RIDER');

  return (
    <div className="space-y-6">
      {isOwner && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-hi">Owner & managers</h2>
            <button type="button" onClick={() => setEditing({ mode: 'add', role: 'MANAGER' })}
              className="inline-flex items-center gap-1.5 rounded-ny border border-line bg-surface px-3 py-1.5 text-sm font-medium hover:border-line-strong">
              <Plus aria-hidden className="size-4" /> Add manager
            </button>
          </div>
          <MemberList members={managers} currentUserId={currentUserId} onEdit={(member) => setEditing({ mode: 'edit', member })} />
        </section>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink-hi">Riders</h2>
          <button type="button" onClick={() => setEditing({ mode: 'add', role: 'RIDER' })}
            className="inline-flex items-center gap-1.5 rounded-ny bg-accent px-3 py-1.5 text-sm font-semibold text-on-accent hover:bg-accent-hover">
            <Plus aria-hidden className="size-4" /> Add rider
          </button>
        </div>
        {riders.length === 0 ? (
          <p className="rounded-ny-card border border-line bg-surface px-5 py-8 text-center text-sm text-ink-muted">
            No riders yet. Add one, then assign orders to them from the Orders page.
          </p>
        ) : (
          <MemberList members={riders} currentUserId={currentUserId} onEdit={(member) => setEditing({ mode: 'edit', member })} />
        )}
      </section>

      {editing && <MemberDialog editing={editing} isOwner={isOwner} onClose={() => setEditing(null)} />}
    </div>
  );
}

function MemberList({ members, currentUserId, onEdit }: { members: TeamMember[]; currentUserId: number; onEdit: (m: TeamMember) => void }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-ny-card border border-line bg-surface">
      {members.map((member) => {
        const Icon = member.role === 'RIDER' ? Bike : member.role === 'OWNER' ? ShieldCheck : UserRound;
        return (
          <li key={member.userId} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${member.isActive ? '' : 'bg-surface-muted'}`}>
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-inset text-ink-muted">
              <Icon aria-hidden className="size-4" strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1 basis-48">
              <p className="text-sm font-medium">
                {member.name}
                {member.userId === currentUserId && <span className="ml-1.5 text-xs font-normal text-ink-label">(you)</span>}
                {!member.isActive && <span className="ml-2 rounded-ny-pill bg-surface-inset px-2 py-0.5 text-[11px] font-medium text-ink-muted">Switched off</span>}
              </p>
              <p className="truncate text-xs text-ink-muted">
                {[member.phone, member.email].filter(Boolean).join(' · ')}
                {' · '}last sign-in {member.lastLoginAt ? timeAgo(member.lastLoginAt) : 'never'}
              </p>
              {member.role === 'MANAGER' || member.role === 'STAFF' ? (
                <p className="mt-1 flex flex-wrap gap-1">
                  {member.permissions.length === 0 ? (
                    <span className="text-xs text-ink-label">No permissions</span>
                  ) : (
                    member.permissions.map((p) => (
                      <span key={p} className="rounded-ny-pill bg-surface-inset px-2 py-0.5 text-[11px] text-ink-muted">
                        {PERMISSIONS.find((x) => x.value === p)?.label ?? p}
                      </span>
                    ))
                  )}
                </p>
              ) : null}
            </div>
            {member.role === 'RIDER' && (
              <p className="text-right text-xs text-ink-muted tabular-nums">
                <span className="block font-medium text-ink">{member.active ?? 0} active</span>
                {member.delivered ?? 0} delivered
              </p>
            )}
            {member.role !== 'OWNER' && (
              <button type="button" onClick={() => onEdit(member)}
                className="rounded-ny border border-line px-3 py-1.5 text-xs font-medium text-ink-hi hover:border-line-strong">
                Edit
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function MemberDialog({ editing, isOwner, onClose }: { editing: NonNullable<Editing>; isOwner: boolean; onClose: () => void }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const member = editing.mode === 'edit' ? editing.member : null;
  const role = editing.mode === 'add' ? editing.role : member!.role === 'RIDER' ? 'RIDER' : 'MANAGER';
  const [permissions, setPermissions] = useState<StaffPermission[]>(member?.permissions ?? ['ORDERS']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? '').trim();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      if (member) {
        await apiPatch(`/restaurant/team/${member.userId}`, {
          name: value('name'),
          ...(value('password') ? { password: value('password') } : {}),
          ...(role === 'MANAGER' && isOwner ? { permissions } : {}),
        });
      } else {
        await apiPost('/restaurant/team', {
          role,
          name: value('name'),
          phone: value('phone'),
          email: value('email'),
          password: value('password'),
          permissions: role === 'MANAGER' ? permissions : [],
        });
      }
      ref.current?.close();
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setFields(caught.fields ?? {});
        setError(caught.message);
      } else setError('Could not save.');
      setBusy(false);
    }
  }

  async function toggleActive() {
    if (!member) return;
    if (member.isActive && !window.confirm(`Switch off ${member.name}? They’ll be signed out everywhere and can’t sign in until you switch them back on.`)) return;
    setBusy(true);
    try {
      await apiPatch(`/restaurant/team/${member.userId}`, { isActive: !member.isActive });
      ref.current?.close();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not update.');
      setBusy(false);
    }
  }

  const input = 'w-full rounded-ny border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none';
  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="member-title"
      className="m-auto max-h-[calc(100dvh-32px)] w-[min(480px,calc(100vw-32px))] overflow-y-auto rounded-ny-card border border-line bg-surface p-0 text-ink shadow-[var(--ny-shadow-card-hover)] backdrop:bg-black/40">
      <form onSubmit={submit} noValidate className="p-5">
        <h2 id="member-title" className="font-display text-lg font-bold">
          {member ? `Edit ${member.name}` : role === 'RIDER' ? 'Add a rider' : 'Add a manager'}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          {role === 'RIDER'
            ? 'Riders sign in with their phone and see only the orders you assign to them.'
            : 'Managers can only do what you allow below.'}
        </p>

        <div className="mt-4 space-y-3">
          <Field label="Full name" error={fields.name}>
            <input name="name" defaultValue={member?.name} required className={`${input} ${fields.name ? 'border-danger' : 'border-line'}`} />
          </Field>
          {!member && (
            <>
              <Field label="Phone" error={fields.phone} hint="They sign in with this number.">
                <input name="phone" type="tel" required placeholder="98XXXXXXXX" className={`${input} ${fields.phone ? 'border-danger' : 'border-line'}`} />
              </Field>
              <Field label={role === 'RIDER' ? 'Email (optional)' : 'Email'} error={fields.email}>
                <input name="email" type="email" className={`${input} ${fields.email ? 'border-danger' : 'border-line'}`} />
              </Field>
            </>
          )}
          <Field label={member ? 'New password (leave empty to keep)' : 'Password'} error={fields.password}
            hint="At least 10 characters. Share it with them privately.">
            <div className="relative">
              <KeyRound aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-label" />
              <input name="password" type="text" autoComplete="off" required={!member}
                className={`${input} pl-9 font-mono ${fields.password ? 'border-danger' : 'border-line'}`} />
            </div>
          </Field>

          {role === 'MANAGER' && isOwner && (
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-ink-hi">What can they do?</legend>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {PERMISSIONS.map((p) => (
                  <label key={p.value}
                    className={`flex cursor-pointer gap-2 rounded-ny border px-3 py-2 ${permissions.includes(p.value) ? 'border-accent bg-accent-soft' : 'border-line'}`}>
                    <input type="checkbox" checked={permissions.includes(p.value)}
                      onChange={(e) => setPermissions((cur) => (e.target.checked ? [...cur, p.value] : cur.filter((x) => x !== p.value)))}
                      className="mt-0.5 accent-[var(--ny-accent)]" />
                    <span>
                      <span className="block text-sm font-medium">{p.label}</span>
                      <span className="block text-xs text-ink-muted">{p.detail}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </div>

        {error && <p role="alert" className="mt-4 rounded-ny bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          {member ? (
            <button type="button" onClick={toggleActive} disabled={busy}
              className={`text-sm font-medium ${member.isActive ? 'text-danger' : 'text-success'} hover:underline disabled:opacity-50`}>
              {member.isActive ? 'Switch off access' : 'Switch access back on'}
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" onClick={() => ref.current?.close()} disabled={busy}
              className="rounded-ny border border-line px-4 py-2 text-sm font-medium text-ink-muted hover:text-ink">Cancel</button>
            <button type="submit" disabled={busy}
              className="rounded-ny bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50">
              {busy ? 'Saving…' : member ? 'Save' : role === 'RIDER' ? 'Add rider' : 'Add manager'}
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
}

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink-hi">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-danger">{error}</span> : hint && <span className="mt-1 block text-xs text-ink-label">{hint}</span>}
    </label>
  );
}
