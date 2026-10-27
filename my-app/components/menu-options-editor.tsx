'use client';

import type { MenuOptionGroup } from '@nayaro/shared';

const input = 'w-full rounded-ny border border-line bg-surface px-2 py-2 text-sm';
export function MenuOptionsEditor({ groups, onChange, disabled }: { groups: MenuOptionGroup[]; onChange: (groups: MenuOptionGroup[]) => void; disabled: boolean }) {
  const update = (index: number, patch: Partial<MenuOptionGroup>) => onChange(groups.map((group, i) => i === index ? { ...group, ...patch } : group));
  return <fieldset disabled={disabled} className="space-y-3 border-t border-line pt-4">
    <legend className="font-display text-base font-semibold">Options and add-ons</legend>
    <p className="text-xs text-ink-muted">Prices are added to the dish price for each item. For sizes or protein, set minimum and maximum to 1. For optional extras, set minimum to 0.</p>
    {groups.map((group, index) => <section key={group.id} className="space-y-3 rounded-ny border border-line p-3">
      <div className="flex gap-2">
        <label className="min-w-0 flex-1 text-xs">Group name<input aria-label={`Group ${index + 1} name`} maxLength={80} value={group.name} onChange={(e) => update(index, { name: e.target.value })} placeholder="e.g. Size or Extras" className={input} /></label>
        <button type="button" onClick={() => onChange(groups.filter((_, i) => i !== index))} className="self-end py-2 text-xs text-danger">Remove group</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs">Minimum choices<input type="number" min={0} max={20} value={group.minSelections} onChange={(e) => update(index, { minSelections: Number(e.target.value) })} className={input} /></label>
        <label className="text-xs">Maximum choices<input type="number" min={1} max={20} value={group.maxSelections} onChange={(e) => update(index, { maxSelections: Number(e.target.value) })} className={input} /></label>
      </div>
      {group.options.map((option, optionIndex) => <div key={option.id} className="space-y-2 rounded-ny bg-surface-muted p-2">
        <div className="grid grid-cols-[1fr_100px] gap-2">
          <label className="text-xs">Option name<input maxLength={80} value={option.name} onChange={(e) => update(index, { options: group.options.map((o, i) => i === optionIndex ? { ...o, name: e.target.value } : o) })} placeholder="e.g. Large" className={input} /></label>
          <label className="text-xs">Extra (Rs.)<input type="number" min={0} max={999999} step="0.01" value={option.priceMinor / 100} onChange={(e) => update(index, { options: group.options.map((o, i) => i === optionIndex ? { ...o, priceMinor: Math.round(Number(e.target.value) * 100) } : o) })} className={input} /></label>
        </div>
        <div className="flex items-center justify-between gap-2 text-xs">
          <label className="flex items-center gap-2"><input type="checkbox" checked={option.isAvailable} onChange={(e) => update(index, { options: group.options.map((o, i) => i === optionIndex ? { ...o, isAvailable: e.target.checked } : o) })} />Available</label>
          <button type="button" onClick={() => update(index, { options: group.options.filter((_, i) => i !== optionIndex) })} className="text-danger">Remove option</button>
        </div>
      </div>)}
      <button type="button" disabled={group.options.length >= 20} onClick={() => update(index, { options: [...group.options, { id: crypto.randomUUID(), name: '', priceMinor: 0, isAvailable: true }] })} className="text-xs text-accent-label disabled:opacity-40">+ Add option</button>
    </section>)}
    <button type="button" disabled={groups.length >= 10} onClick={() => onChange([...groups, { id: crypto.randomUUID(), name: '', minSelections: 0, maxSelections: 1, options: [{ id: crypto.randomUUID(), name: '', priceMinor: 0, isAvailable: true }] }])} className="rounded-ny border border-line px-3 py-2 text-sm text-accent-label disabled:opacity-40">+ Add option group</button>
  </fieldset>;
}
