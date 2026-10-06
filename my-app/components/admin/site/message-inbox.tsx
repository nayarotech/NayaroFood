'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiDelete, apiPatch } from '@/lib/api';
import { formatDateTime, timeAgo } from '@/lib/format';

export interface ContactMessage {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  topic: string;
  message: string;
  readAt: string | null;
  createdAt: string;
}

const TOPIC: Record<string, string> = {
  general: 'General',
  order: 'Order',
  restaurant: 'Restaurant listing',
  partnership: 'Partnership',
  other: 'Other',
};

/** Messages from the public Contact page. Opening one marks it read. */
export function MessageInbox({ messages }: { messages: ContactMessage[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  async function act(id: number, action: () => Promise<unknown>) {
    setBusy(id);
    try {
      await action();
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <ul className="divide-y divide-line-soft overflow-hidden rounded-ny-card border border-line bg-surface shadow-[var(--ny-shadow-card)]">
      {messages.map((message) => {
        const expanded = open === message.id;
        const unread = !message.readAt;
        return (
          <li key={message.id} className={unread ? 'bg-accent-soft/60' : ''}>
            <button
              type="button"
              onClick={() => {
                setOpen(expanded ? null : message.id);
                if (unread && !expanded) void act(message.id, () => apiPatch(`/admin/site/messages/${message.id}`, { read: true }));
              }}
              aria-expanded={expanded}
              className="flex w-full items-start gap-3 px-5 py-3.5 text-left transition-colors hover:bg-surface-muted"
            >
              <span aria-hidden className={`mt-1.5 size-2 shrink-0 rounded-full ${unread ? 'bg-accent' : 'bg-transparent'}`} />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className={`text-sm ${unread ? 'font-semibold' : 'font-medium'}`}>{message.name}</span>
                  <span className="rounded-ny-pill bg-surface-inset px-2 py-0.5 text-[11px] text-ink-muted">{TOPIC[message.topic] ?? message.topic}</span>
                </span>
                <span className={`mt-0.5 block text-sm text-ink-muted ${expanded ? '' : 'truncate'}`}>{expanded ? null : message.message}</span>
              </span>
              <span className="shrink-0 text-xs text-ink-label" title={formatDateTime(message.createdAt)}>{timeAgo(message.createdAt)}</span>
            </button>

            {expanded && (
              <div className="px-5 pb-4 pl-10">
                <p className="text-sm whitespace-pre-wrap text-ink-hi">{message.message}</p>
                <p className="mt-3 text-xs text-ink-label">
                  {formatDateTime(message.createdAt)}
                  {message.email && <> · {message.email}</>}
                  {message.phone && <> · {message.phone}</>}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {message.email && (
                    <a href={`mailto:${message.email}?subject=${encodeURIComponent('Re: your message to Nayaro Food')}`}
                      className="rounded-ny bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent hover:bg-accent-hover">
                      Reply by email
                    </a>
                  )}
                  {message.phone && (
                    <a href={`tel:${message.phone.replace(/\s/g, '')}`}
                      className="rounded-ny border border-line px-3 py-1.5 text-xs font-medium text-ink-muted hover:border-accent-border">
                      Call
                    </a>
                  )}
                  <button type="button" disabled={busy === message.id}
                    onClick={() => act(message.id, () => apiPatch(`/admin/site/messages/${message.id}`, { read: false }))}
                    className="rounded-ny border border-line px-3 py-1.5 text-xs font-medium text-ink-muted hover:border-accent-border disabled:opacity-50">
                    Mark unread
                  </button>
                  <button type="button" disabled={busy === message.id}
                    onClick={() => {
                      if (window.confirm('Delete this message?')) void act(message.id, () => apiDelete(`/admin/site/messages/${message.id}`));
                    }}
                    className="rounded-ny border border-danger/30 px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger-soft disabled:opacity-50">
                    Delete
                  </button>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
