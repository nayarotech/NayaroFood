'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, apiDelete, apiPatch, apiPost } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { ImageUpload } from '@/components/image-upload';
import { ActionDialog } from '@/components/action-dialog';

export interface MenuCategory {
  id: number;
  name: string;
  sortOrder: number;
  isActive: boolean;
  itemCount: number;
}

export interface MenuItem {
  id: number;
  categoryId: number;
  categoryName: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  priceMinor: number;
  discountPriceMinor: number | null;
  prepTimeMinutes: number | null;
  isAvailable: boolean;
}

type Editing = { mode: 'create'; categoryId: number } | { mode: 'edit'; item: MenuItem } | null;
type Confirm =
  | { kind: 'item'; item: MenuItem }
  | { kind: 'category'; category: MenuCategory }
  | null;

/**
 * The restaurant's menu: categories in the order customers see them, each
 * with its dishes. Every dish opens a full editor; quick switches (in stock,
 * shown) save on click.
 */
export function MenuManager({ categories, items }: { categories: MenuCategory[]; items: MenuItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [renaming, setRenaming] = useState<number | null>(null);

  async function run(action: () => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await action();
      router.refresh();
      return true;
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  function move(index: number, direction: -1 | 1) {
    const order = categories.map((c) => c.id);
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target]!, order[index]!];
    void run(() => apiPost('/restaurant/menu/categories/reorder', { order }));
  }

  const totalItems = items.length;
  const withPhotos = items.filter((item) => item.imageUrl).length;

  return (
    <div className="space-y-5">
      {error && !confirm && (
        <p role="alert" className="rounded-ny bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {totalItems > 0 && withPhotos < totalItems && (
        <p className="rounded-ny-card border border-accent-border bg-accent-soft px-4 py-3 text-sm text-accent-label">
          📸 {withPhotos} of {totalItems} dishes have a photo. Dishes with photos get noticed far more — and half
          your menu having photos counts toward your ranking.
        </p>
      )}

      <AddCategory
        disabled={busy}
        first={categories.length === 0}
        onAdd={(name) => run(() => apiPost('/restaurant/menu/categories', { name, sortOrder: categories.length }))}
      />

      {categories.length === 0 ? (
        <p className="rounded-ny-card border border-dashed border-line-strong bg-surface px-6 py-12 text-center text-sm text-ink-muted">
          Start with a category such as &ldquo;Momo&rdquo; or &ldquo;Drinks&rdquo;, then add dishes to it.
        </p>
      ) : (
        categories.map((category, index) => {
          const categoryItems = items.filter((item) => item.categoryId === category.id);
          return (
            <section key={category.id} className="rounded-ny-card border border-line bg-surface">
              <header className="flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-3">
                {renaming === category.id ? (
                  <RenameForm
                    initial={category.name}
                    disabled={busy}
                    onCancel={() => setRenaming(null)}
                    onSave={async (name) => {
                      if (await run(() => apiPatch(`/restaurant/menu/categories/${category.id}`, { name }))) {
                        setRenaming(null);
                      }
                    }}
                  />
                ) : (
                  <>
                    <h3 className="font-display text-base font-semibold tracking-tight">{category.name}</h3>
                    <span className="text-xs text-ink-label">{categoryItems.length} dishes</span>
                    {!category.isActive && (
                      <span className="rounded-ny-pill bg-surface-inset px-2 py-0.5 text-[11px] font-semibold text-ink-muted">
                        Hidden from customers
                      </span>
                    )}
                  </>
                )}

                {renaming !== category.id && (
                  <div className="ml-auto flex flex-wrap items-center gap-1">
                    <IconButton label="Move up" disabled={busy || index === 0} onClick={() => move(index, -1)}>↑</IconButton>
                    <IconButton label="Move down" disabled={busy || index === categories.length - 1} onClick={() => move(index, 1)}>↓</IconButton>
                    <SmallButton disabled={busy} onClick={() => setRenaming(category.id)}>Rename</SmallButton>
                    <SmallButton
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          apiPatch(`/restaurant/menu/categories/${category.id}`, { isActive: !category.isActive }),
                        )
                      }
                    >
                      {category.isActive ? 'Hide' : 'Show'}
                    </SmallButton>
                    <SmallButton danger disabled={busy} onClick={() => setConfirm({ kind: 'category', category })}>
                      Delete
                    </SmallButton>
                  </div>
                )}
              </header>

              <ul className="divide-y divide-line-soft">
                {categoryItems.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setEditing({ mode: 'edit', item })}
                      className="size-14 shrink-0 overflow-hidden rounded-ny border border-line bg-surface-muted"
                      aria-label={`Edit ${item.name}`}
                    >
                      {item.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.imageUrl} alt="" className="size-full object-cover" />
                      ) : (
                        <span className="grid size-full place-items-center text-[10px] text-ink-label">+ Photo</span>
                      )}
                    </button>

                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-sm font-medium ${item.isAvailable ? '' : 'text-ink-label line-through'}`}>
                        {item.name}
                      </p>
                      {item.description && <p className="truncate text-xs text-ink-subtle">{item.description}</p>}
                      <p className="mt-0.5 text-xs text-ink-muted tabular-nums">
                        {item.discountPriceMinor !== null ? (
                          <>
                            <span className="font-semibold text-success">{formatMoney(item.discountPriceMinor)}</span>{' '}
                            <span className="line-through">{formatMoney(item.priceMinor)}</span>
                          </>
                        ) : (
                          <span className="font-semibold text-ink">{formatMoney(item.priceMinor)}</span>
                        )}
                        {item.prepTimeMinutes ? ` · ${item.prepTimeMinutes} min` : ''}
                      </p>
                    </div>

                    <label className="hidden items-center gap-1.5 text-xs text-ink-muted sm:flex">
                      <input
                        type="checkbox"
                        checked={item.isAvailable}
                        disabled={busy}
                        onChange={(event) =>
                          void run(() =>
                            apiPatch(`/restaurant/menu/items/${item.id}`, { isAvailable: event.target.checked }),
                          )
                        }
                        className="size-4 accent-[var(--ny-accent)]"
                      />
                      In stock
                    </label>
                    <SmallButton disabled={busy} onClick={() => setEditing({ mode: 'edit', item })}>Edit</SmallButton>
                    <SmallButton danger disabled={busy} onClick={() => setConfirm({ kind: 'item', item })}>
                      Delete
                    </SmallButton>
                  </li>
                ))}
              </ul>

              <div className="px-4 py-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setEditing({ mode: 'create', categoryId: category.id })}
                  className="rounded-ny border border-dashed border-line-strong px-3.5 py-2 text-sm font-medium text-ink-muted transition-colors hover:border-accent-border hover:text-accent-label"
                >
                  + Add a dish to {category.name}
                </button>
              </div>
            </section>
          );
        })
      )}

      <ItemDialog
        editing={editing}
        categories={categories}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          router.refresh();
        }}
      />

      <ActionDialog
        open={confirm !== null}
        title={
          confirm?.kind === 'item'
            ? `Delete ${confirm.item.name}?`
            : confirm?.kind === 'category'
              ? `Delete the ${confirm.category.name} category?`
              : ''
        }
        description={
          confirm?.kind === 'item'
            ? 'It disappears from your menu. Past orders keep their record of it. To hide it for a day, untick “In stock” instead.'
            : 'Only empty categories can be deleted — move or delete its dishes first.'
        }
        confirmLabel="Delete"
        tone="danger"
        busy={busy}
        error={confirm ? error : null}
        onConfirm={async () => {
          if (!confirm) return;
          const path =
            confirm.kind === 'item'
              ? `/restaurant/menu/items/${confirm.item.id}`
              : `/restaurant/menu/categories/${confirm.category.id}`;
          if (await run(() => apiDelete(path))) setConfirm(null);
        }}
        onClose={() => {
          if (!busy) {
            setConfirm(null);
            setError(null);
          }
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Create or edit one dish. Prices are typed in rupees; the API converts to
 * paisa. The photo uploads first and only its URL is saved with the dish.
 */
function ItemDialog({
  editing,
  categories,
  onClose,
  onSaved,
}: {
  editing: Editing;
  categories: MenuCategory[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const item = editing?.mode === 'edit' ? editing.item : null;
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const open = editing !== null;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setImageUrl(item?.imageUrl ?? null);
      setError(null);
      setFields({});
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open, item]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? '').trim();
    const price = Number(text('price'));
    const sale = text('discountPrice');
    const prep = text('prepTimeMinutes');

    const errors: Record<string, string> = {};
    if (!text('name')) errors.name = 'Give the dish a name.';
    if (!Number.isFinite(price) || price <= 0) errors.price = 'Enter a price above 0.';
    if (sale && !(Number(sale) > 0 && Number(sale) < price)) errors.discountPrice = 'The sale price must be lower than the price.';
    if (Object.keys(errors).length > 0) {
      setFields(errors);
      return;
    }

    const payload = {
      name: text('name'),
      description: text('description') || (editing.mode === 'edit' ? null : undefined),
      categoryId: Number(text('categoryId')),
      price,
      discountPrice: sale ? Number(sale) : editing.mode === 'edit' ? null : undefined,
      prepTimeMinutes: prep ? Number(prep) : editing.mode === 'edit' ? null : undefined,
      isAvailable: form.get('isAvailable') === 'on',
      imageUrl: imageUrl ?? (editing.mode === 'edit' ? null : undefined),
    };

    setBusy(true);
    setError(null);
    setFields({});
    try {
      if (editing.mode === 'edit') await apiPatch(`/restaurant/menu/items/${editing.item.id}`, payload);
      else await apiPost('/restaurant/menu/items', payload);
      onSaved();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setFields(caught.fields ?? {});
        setError(caught.message);
      } else {
        setError('Could not save the dish.');
      }
    }
    setBusy(false);
  }

  const defaultCategory = editing?.mode === 'create' ? editing.categoryId : item?.categoryId;

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(event) => {
        if (busy) event.preventDefault();
      }}
      className="m-auto max-h-[calc(100dvh-32px)] w-[min(560px,calc(100vw-32px))] overflow-y-auto rounded-ny-card border border-line bg-surface p-0 text-ink shadow-[var(--ny-shadow-card-hover)] backdrop:bg-[rgba(10,17,36,0.45)]"
    >
      {open && (
        <form key={item?.id ?? `new-${defaultCategory}`} onSubmit={submit} noValidate className="p-5">
          <h2 className="font-display text-lg font-bold tracking-tight">{item ? `Edit ${item.name}` : 'Add a dish'}</h2>

          <div className="mt-4 space-y-4">
            <ImageUpload
              kind="item"
              label="Photo (optional)"
              hint="A clear, well-lit photo of the dish itself."
              value={imageUrl}
              onChange={setImageUrl}
              disabled={busy}
            />

            <Field label="Name" name="name" defaultValue={item?.name} required error={fields.name} placeholder="e.g. Chicken Momo" />

            <div>
              <label htmlFor="item-description" className="mb-1 block text-sm font-medium text-ink-hi">
                Description <span className="font-normal text-ink-label">(optional)</span>
              </label>
              <textarea
                id="item-description"
                name="description"
                rows={2}
                maxLength={1000}
                defaultValue={item?.description ?? ''}
                placeholder="What's in it, how many pieces, how spicy…"
                className="w-full rounded-ny border border-line bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Price (Rs.)" name="price" type="number" min={0} step="0.01" inputMode="decimal"
                defaultValue={item ? item.priceMinor / 100 : ''} required error={fields.price} />
              <Field label="Sale price (Rs.)" name="discountPrice" type="number" min={0} step="0.01" inputMode="decimal"
                defaultValue={item?.discountPriceMinor != null ? item.discountPriceMinor / 100 : ''} error={fields.discountPrice}
                hint="Optional" />
              <Field label="Prep time (min)" name="prepTimeMinutes" type="number" min={0} max={360}
                defaultValue={item?.prepTimeMinutes ?? ''} error={fields.prepTimeMinutes} hint="Optional" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="item-category" className="mb-1 block text-sm font-medium text-ink-hi">Category</label>
                <select
                  id="item-category"
                  name="categoryId"
                  defaultValue={defaultCategory}
                  className="w-full rounded-ny border border-line bg-surface px-3 py-2.5 text-sm focus:border-accent focus:outline-none"
                >
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 self-end pb-2.5 text-sm font-medium text-ink-hi">
                <input type="checkbox" name="isAvailable" defaultChecked={item?.isAvailable ?? true} className="size-4 accent-[var(--ny-accent)]" />
                In stock — customers can order it
              </label>
            </div>
          </div>

          {error && (
            <p role="alert" className="mt-4 rounded-ny bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={busy}
              className="rounded-ny border border-line px-4 py-2 text-sm font-medium text-ink-muted hover:text-ink disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={busy}
              className="rounded-ny bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50">
              {busy ? 'Saving…' : item ? 'Save changes' : 'Add dish'}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}

/* ------------------------------------------------------------------ */

function AddCategory({ disabled, first, onAdd }: { disabled: boolean; first: boolean; onAdd: (name: string) => Promise<boolean> }) {
  const [name, setName] = useState('');
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (name.trim() && (await onAdd(name.trim()))) setName('');
      }}
      className="flex gap-2"
    >
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder={first ? 'First category, e.g. Momo' : 'New category name'}
        aria-label="New category name"
        maxLength={80}
        className="min-w-0 flex-1 rounded-ny border border-line bg-surface px-3.5 py-2.5 text-sm focus:border-accent focus:outline-none sm:max-w-xs"
      />
      <button type="submit" disabled={disabled || !name.trim()}
        className="rounded-ny bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50">
        Add category
      </button>
    </form>
  );
}

function RenameForm({ initial, disabled, onSave, onCancel }: {
  initial: string; disabled: boolean; onSave: (name: string) => void; onCancel: () => void;
}) {
  const [name, setName] = useState(initial);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim()) onSave(name.trim());
      }}
      className="flex flex-1 flex-wrap gap-2"
    >
      <input value={name} onChange={(event) => setName(event.target.value)} autoFocus maxLength={80} aria-label="Category name"
        onKeyDown={(event) => event.key === 'Escape' && onCancel()}
        className="min-w-0 flex-1 rounded-ny border border-accent bg-surface px-3 py-1.5 text-sm focus:outline-none sm:max-w-xs" />
      <SmallButton type="submit" disabled={disabled || !name.trim()}>Save</SmallButton>
      <SmallButton disabled={disabled} onClick={onCancel}>Cancel</SmallButton>
    </form>
  );
}

function SmallButton({ children, danger = false, type = 'button', ...rest }: {
  children: React.ReactNode; danger?: boolean; type?: 'button' | 'submit';
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type'>) {
  return (
    <button
      type={type}
      className={`rounded-ny border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-40 ${
        danger ? 'border-danger/30 text-danger hover:bg-danger-soft' : 'border-line text-ink-muted hover:border-accent-border hover:text-accent-label'
      }`}
      {...rest}
    >
      {children}
    </button>
  );
}

function IconButton({ label, children, ...rest }: { label: string; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" aria-label={label} title={label}
      className="grid size-7 place-items-center rounded-ny border border-line text-xs text-ink-muted transition-colors hover:border-accent-border hover:text-accent-label disabled:opacity-30"
      {...rest}>
      {children}
    </button>
  );
}

function Field({ label, name, error, hint, ...rest }: { label: string; name: string; error?: string; hint?: string } & Omit<
  React.InputHTMLAttributes<HTMLInputElement>, 'name'
>) {
  const id = `item-${name}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink-hi">{label}</label>
      <input id={id} name={name} aria-invalid={error ? true : undefined}
        className={`w-full rounded-ny border bg-surface px-3 py-2.5 text-sm focus:border-accent focus:outline-none ${error ? 'border-danger' : 'border-line'}`}
        {...rest} />
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : hint && <p className="mt-1 text-xs text-ink-label">{hint}</p>}
    </div>
  );
}
