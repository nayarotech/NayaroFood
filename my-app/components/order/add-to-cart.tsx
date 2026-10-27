'use client';

import { useId, useRef, useState } from 'react';
import type { MenuOptionGroup } from '@nayaro/shared';
import { cartLineKey, minimumOptionsExtra, resolveMenuOptions } from '@/lib/menu-options';
import { formatMoney } from '@/lib/format';
import { useCart } from '@/lib/cart';

/** "Add" until it's in the cart, then a − qty + stepper. */
export function AddToCart({
  restaurantId,
  item,
  disabled = false,
}: {
  restaurantId: number;
  item: { id: number; name: string; priceMinor: number; optionGroups?: MenuOptionGroup[] };
  disabled?: boolean;
}) {
  const cart = useCart(restaurantId);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [optionIds, setOptionIds] = useState<string[]>([]);
  const groups = item.optionGroups ?? [];
  const resolved = resolveMenuOptions(groups, optionIds);
  const extra = groups.flatMap((group) => group.options).filter((option) => optionIds.includes(option.id)).reduce((sum, option) => sum + option.priceMinor, 0);
  const choicesAvailable = minimumOptionsExtra(groups) !== null;
  const existing = cart.quantityOf(item.id, optionIds);

  if (groups.length) {
    const variants = cart.lines.filter((line) => line.id === item.id);
    return <>
      <button type="button" disabled={disabled || !choicesAvailable} onClick={() => { setOptionIds([]); dialog.current?.showModal(); }} className="rounded-ny-pill border border-accent-border bg-accent-soft px-3 py-1 text-sm font-semibold text-accent-label disabled:opacity-40">{choicesAvailable ? 'Choose options' : 'Choices unavailable'}</button>
      {variants.map((line) => <div key={cartLineKey(line.id, line.optionIds)} className="mt-2 max-w-48 text-xs text-ink-muted">
        <p>{line.optionLabels?.join(', ') || 'No extras'}</p>
        <div className="mt-1 flex items-center justify-end gap-2">
          <button type="button" aria-label={`Remove one ${item.name}, ${line.optionLabels?.join(', ')}`} onClick={() => cart.setQuantity(line, line.quantity - 1)} className="rounded border border-line px-2 py-1">−</button>
          <span aria-live="polite">{line.quantity}</span>
          <button type="button" disabled={disabled || line.quantity >= 99} aria-label={`Add one ${item.name}, ${line.optionLabels?.join(', ')}`} onClick={() => cart.setQuantity(line, line.quantity + 1)} className="rounded border border-line px-2 py-1 disabled:opacity-40">+</button>
        </div>
      </div>)}
      <dialog ref={dialog} aria-labelledby={titleId} className="m-auto max-h-[calc(100dvh-32px)] w-[min(480px,calc(100vw-32px))] overflow-y-auto rounded-ny-card border border-line bg-surface p-5 text-ink backdrop:bg-black/40">
        <form onSubmit={(event) => {
          event.preventDefault();
          if (!resolved.ok || disabled || existing >= 99) return;
          cart.setQuantity({ id: item.id, name: item.name, priceMinor: item.priceMinor + resolved.extraMinor, optionIds: [...optionIds].sort(), optionLabels: resolved.selections.map((s) => `${s.groupName}: ${s.optionName}`) }, existing + 1);
          dialog.current?.close();
        }}>
          <h2 id={titleId} className="font-display text-lg font-bold">{item.name}</h2>
          <p className="mt-1 text-sm text-ink-muted">Base price {formatMoney(item.priceMinor)}. Extras are charged per item.</p>
          {groups.map((group) => {
            const chosen = group.options.filter((option) => optionIds.includes(option.id)).length;
            return <fieldset key={group.id} className="mt-4 rounded-ny border border-line p-3">
              <legend className="px-1 text-sm font-semibold">{group.name}</legend>
              <p className="mb-2 text-xs text-ink-muted">{group.minSelections ? `Required: choose ${group.minSelections === group.maxSelections ? group.minSelections : `${group.minSelections}–${group.maxSelections}`}` : `Optional: up to ${group.maxSelections}`}</p>
              {group.options.map((option) => <label key={option.id} className={`flex items-center gap-2 py-2 text-sm ${!option.isAvailable ? 'text-ink-label' : ''}`}>
                <input type={group.maxSelections === 1 ? 'radio' : 'checkbox'} name={`${titleId}-${group.id}`} checked={optionIds.includes(option.id)} disabled={!option.isAvailable || (group.maxSelections > 1 && chosen >= group.maxSelections && !optionIds.includes(option.id))} onChange={(event) => {
                  const next = group.maxSelections === 1 ? optionIds.filter((id) => !group.options.some((o) => o.id === id)) : optionIds.filter((id) => id !== option.id);
                  setOptionIds(event.target.checked ? [...next, option.id] : next);
                }} />
                <span className="flex-1">{option.name}{!option.isAvailable && ' — unavailable'}</span>
                <span>{option.priceMinor ? `+${formatMoney(option.priceMinor)}` : 'Included'}</span>
              </label>)}
              {group.minSelections === 0 && chosen > 0 && <button type="button" onClick={() => setOptionIds(optionIds.filter((id) => !group.options.some((option) => option.id === id)))} className="mt-1 text-xs text-accent-label">Clear {group.name}</button>}
            </fieldset>;
          })}
          {existing >= 99 && <p className="mt-3 text-sm text-danger">Maximum 99 of this combination.</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => dialog.current?.close()} className="rounded-ny border border-line px-4 py-2 text-sm">Cancel</button>
            <button disabled={!resolved.ok || disabled || existing >= 99} className="rounded-ny bg-accent px-4 py-2 text-sm font-semibold text-on-accent disabled:opacity-40">Add · {formatMoney(item.priceMinor + extra)}</button>
          </div>
        </form>
      </dialog>
    </>;
  }

  const quantity = cart.quantityOf(item.id);

  if (quantity === 0) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => cart.setQuantity(item, 1)}
        aria-label={`Add ${item.name} to cart`}
        className="rounded-ny-pill border border-accent-border bg-accent-soft px-3.5 py-1 text-sm font-semibold text-accent-label transition-colors hover:bg-accent hover:text-on-accent disabled:cursor-not-allowed disabled:opacity-40"
      >
        Add
      </button>
    );
  }

  return (
    <div className="flex items-center overflow-hidden rounded-ny-pill bg-accent text-on-accent shadow-[var(--ny-shadow-accent)]">
      <button
        type="button"
        onClick={() => cart.setQuantity(item, quantity - 1)}
        aria-label={`Remove one ${item.name}`}
        className="px-2.5 py-1 text-base leading-none font-bold transition-colors hover:bg-white/15"
      >
        −
      </button>
      <span aria-live="polite" className="min-w-5 text-center text-sm font-bold tabular-nums">
        {quantity}
      </span>
      <button
        type="button"
        disabled={disabled || quantity >= 99}
        onClick={() => cart.setQuantity(item, quantity + 1)}
        aria-label={`Add one more ${item.name}`}
        className="px-2.5 py-1 text-base leading-none font-bold transition-colors hover:bg-white/15 disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}
