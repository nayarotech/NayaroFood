/** Additional charges are per unit, in minor currency units (paisa). */
export interface MenuOption { id: string; name: string; priceMinor: number; isAvailable: boolean }
export interface MenuOptionGroup { id: string; name: string; minSelections: number; maxSelections: number; options: MenuOption[] }
export interface SelectedMenuOption { groupId: string; groupName: string; optionId: string; optionName: string; priceMinor: number }
export type OptionResolution = { ok: true; extraMinor: number; selections: SelectedMenuOption[] } | { ok: false; message: string };

/** Resolve ids against this dish's current configuration, never client prices. */
export function resolveMenuOptions(groups: MenuOptionGroup[], optionIds: string[] = []): OptionResolution {
  const selected = new Set(optionIds);
  if (selected.size !== optionIds.length) return { ok: false, message: 'Choose each option only once.' };
  const known = new Set(groups.flatMap((group) => group.options.map((option) => option.id)));
  if (optionIds.some((id) => !known.has(id))) return { ok: false, message: 'An option has changed or is no longer offered. Please choose again.' };
  const selections: SelectedMenuOption[] = [];
  for (const group of groups) {
    const options = group.options.filter((option) => selected.has(option.id));
    if (options.length < group.minSelections || options.length > group.maxSelections) {
      return { ok: false, message: `${group.name}: choose ${group.minSelections === group.maxSelections ? group.minSelections : `${group.minSelections}–${group.maxSelections}`} option(s).` };
    }
    for (const option of options) {
      if (!option.isAvailable) return { ok: false, message: `${option.name} is currently unavailable. Please choose again.` };
      selections.push({ groupId: group.id, groupName: group.name, optionId: option.id, optionName: option.name, priceMinor: option.priceMinor });
    }
  }
  return { ok: true, extraMinor: selections.reduce((total, option) => total + option.priceMinor, 0), selections };
}

/** Stable identity: the same combination merges regardless of click order. */
export function cartLineKey(itemId: number, optionIds: string[] = []): string {
  return `${itemId}:${[...optionIds].sort().join(',')}`;
}

export function optionSummary(selections: SelectedMenuOption[] | null | undefined): string {
  return (selections ?? []).map((selection) => `${selection.groupName}: ${selection.optionName}`).join(', ');
}

export function menuItemLabel(name: string, selections: SelectedMenuOption[] | null | undefined): string {
  const summary = optionSummary(selections);
  return summary ? `${name} (${summary})` : name;
}

/** Minimum mandatory additions for the menu's "from" price; null means sold out. */
export function minimumOptionsExtra(groups: MenuOptionGroup[]): number | null {
  let extra = 0;
  for (const group of groups) {
    const available = group.options.filter((option) => option.isAvailable).map((option) => option.priceMinor).sort((a, b) => a - b);
    if (available.length < group.minSelections) return null;
    extra += available.slice(0, group.minSelections).reduce((total, price) => total + price, 0);
  }
  return extra;
}
