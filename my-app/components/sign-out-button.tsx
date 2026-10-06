'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiPost } from '@/lib/api';

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        // Revokes the refresh token server-side, not just the local cookie.
        await apiPost('/auth/logout', {}).catch(() => undefined);
        router.push('/');
        router.refresh();
      }}
      className="rounded-ny px-3 py-1.5 text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink disabled:opacity-60"
    >
      {busy ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
