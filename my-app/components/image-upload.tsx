'use client';

import { useId, useRef, useState } from 'react';
import { ApiError, apiUpload } from '@/lib/api';

const MAX_BYTES = 3 * 1024 * 1024;
const ACCEPT = 'image/jpeg,image/png,image/webp';

/**
 * Pick, preview and upload one image. The file goes to the API first; only
 * the resulting URL is handed to `onChange`, so the caller saves a link, not
 * a file. Size and type are checked here for instant feedback and again on
 * the server, which is the one that counts.
 */
export function ImageUpload({
  value,
  onChange,
  kind,
  label,
  hint,
  shape = 'square',
  disabled = false,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  kind: 'logo' | 'cover' | 'item' | 'site';
  label: string;
  hint?: string;
  shape?: 'square' | 'wide' | 'round';
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function handle(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!ACCEPT.split(',').includes(file.type)) {
      setError('Use a JPG, PNG or WebP image.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('That image is over 3 MB. Try a smaller one.');
      return;
    }
    setBusy(true);
    try {
      const { url } = await apiUpload(file, kind);
      onChange(url);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Upload failed. Please try again.');
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = '';
  }

  const frame =
    shape === 'wide' ? 'aspect-[3/1] w-full' : shape === 'round' ? 'size-24 rounded-full' : 'size-24';

  return (
    <div>
      <p id={`${id}-label`} className="mb-1 text-sm font-medium text-ink-hi">
        {label}
      </p>
      <div className={`flex gap-3 ${shape === 'wide' ? 'flex-col' : 'items-center'}`}>
        <button
          type="button"
          aria-labelledby={`${id}-label`}
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void handle(event.dataTransfer.files[0]);
          }}
          className={`group relative shrink-0 overflow-hidden border-2 border-dashed bg-surface-muted transition-colors ${frame} ${
            shape === 'round' ? '' : 'rounded-ny-card'
          } ${dragging ? 'border-accent bg-accent-soft' : 'border-line-strong hover:border-accent-border'}`}
        >
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="size-full object-cover" />
          ) : (
            <span className="grid size-full place-items-center p-2 text-center text-xs text-ink-label">
              <span>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-1 size-5" aria-hidden>
                  <rect x="2.5" y="4" width="15" height="12" rx="2" />
                  <circle cx="7.5" cy="8.5" r="1.5" />
                  <path d="m3 14 4-3.5 3 2.5 3-3 4 3.5" />
                </svg>
                {shape === 'wide' ? 'Click or drop a wide photo' : 'Add photo'}
              </span>
            </span>
          )}
          {busy && (
            <span className="absolute inset-0 grid place-items-center bg-surface/80 text-xs font-medium text-ink-muted">
              Uploading…
            </span>
          )}
          {value && !busy && (
            <span className="absolute inset-0 grid place-items-center bg-black/40 text-xs font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
              Change
            </span>
          )}
        </button>

        <div className="min-w-0 text-xs text-ink-label">
          {hint && <p>{hint}</p>}
          <p>JPG, PNG or WebP, up to 3 MB.</p>
          {value && (
            <button
              type="button"
              disabled={disabled || busy}
              onClick={() => onChange(null)}
              className="mt-1 font-medium text-danger hover:underline disabled:opacity-50"
            >
              Remove photo
            </button>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      )}
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => void handle(event.target.files?.[0])}
      />
    </div>
  );
}
