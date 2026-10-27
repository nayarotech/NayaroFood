import { describe, expect, it } from 'vitest';
import { cartLineKey, menuItemLabel, minimumOptionsExtra, resolveMenuOptions, type MenuOptionGroup } from './menu-options.js';
import { menuOptionGroupsSchema } from './schemas/menu.js';
import { placeOrderItemSchema } from './schemas/order.js';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const groups: MenuOptionGroup[] = [
  { id: id(1), name: 'Size', minSelections: 1, maxSelections: 1, options: [
    { id: id(2), name: 'Regular', priceMinor: 0, isAvailable: true },
    { id: id(3), name: 'Large', priceMinor: 5000, isAvailable: true },
  ] },
  { id: id(4), name: 'Extras', minSelections: 0, maxSelections: 2, options: [
    { id: id(5), name: 'Cheese', priceMinor: 2000, isAvailable: true },
    { id: id(6), name: 'Sauce', priceMinor: 1000, isAvailable: true },
    { id: id(7), name: 'Egg', priceMinor: 3000, isAvailable: false },
  ] },
];

describe('menu options', () => {
  it('keeps dishes without options backwards compatible', () => {
    expect(resolveMenuOptions([])).toEqual({ ok: true, extraMinor: 0, selections: [] });
    expect(menuItemLabel('Momo', null)).toBe('Momo');
    expect(placeOrderItemSchema.safeParse({ foodItemId: 1, quantity: 1 }).success).toBe(true);
  });
  it('requires each required group, but allows optional groups to be omitted', () => {
    expect(resolveMenuOptions(groups, []).ok).toBe(false);
    expect(resolveMenuOptions(groups, [id(2)])).toMatchObject({ ok: true, extraMinor: 0 });
  });
  it('charges the sum of selected options per unit and snapshots names and prices', () => {
    const result = resolveMenuOptions(groups, [id(5), id(3)]);
    expect(result).toMatchObject({ ok: true, extraMinor: 7000 });
    if (!result.ok) throw new Error('Expected valid selections');
    expect(result.selections).toEqual([
      { groupId: id(1), groupName: 'Size', optionId: id(3), optionName: 'Large', priceMinor: 5000 },
      { groupId: id(4), groupName: 'Extras', optionId: id(5), optionName: 'Cheese', priceMinor: 2000 },
    ]);
    expect(menuItemLabel('Pizza', result.selections)).toBe('Pizza (Size: Large, Extras: Cheese)');
  });
  it('rejects too many choices, duplicate ids, unknown ids, and unavailable options', () => {
    for (const ids of [[id(2), id(3)], [id(2), id(2)], [id(2), id(99)], [id(2), id(7)], [id(2), id(5), id(6), id(7)]]) {
      expect(resolveMenuOptions(groups, ids).ok).toBe(false);
    }
    expect(placeOrderItemSchema.safeParse({ foodItemId: 1, quantity: 1, optionIds: [id(2), id(2)] }).success).toBe(false);
  });
  it('rejects impossible selection limits and duplicate configuration ids', () => {
    expect(menuOptionGroupsSchema.safeParse(groups).success).toBe(true);
    expect(menuOptionGroupsSchema.safeParse([{ ...groups[0], minSelections: 2, maxSelections: 1 }]).success).toBe(false);
    expect(menuOptionGroupsSchema.safeParse([{ ...groups[0], maxSelections: 3 }]).success).toBe(false);
    expect(menuOptionGroupsSchema.safeParse([groups[0], groups[0]]).success).toBe(false);
    expect(menuOptionGroupsSchema.safeParse([{ ...groups[0], options: [groups[0]!.options[0], groups[0]!.options[0]] }]).success).toBe(false);
  });
  it('allows zero-price choices and temporary sold-out options but rejects invalid prices', () => {
    expect(menuOptionGroupsSchema.safeParse(groups).success).toBe(true);
    for (const priceMinor of [-1, 1.5, NaN, Infinity, 100_000_000]) {
      expect(menuOptionGroupsSchema.safeParse([{ ...groups[0], options: [{ ...groups[0]!.options[0], priceMinor }] }]).success).toBe(false);
    }
  });
  it('gives equivalent combinations the same cart identity and separates variants', () => {
    expect(cartLineKey(1, [id(3), id(5)])).toBe(cartLineKey(1, [id(5), id(3)]));
    expect(cartLineKey(1, [id(2)])).not.toBe(cartLineKey(1, [id(3)]));
    expect(cartLineKey(1, [id(2)])).not.toBe(cartLineKey(2, [id(2)]));
    expect(cartLineKey(1)).toBe(cartLineKey(1, []));
  });
  it('includes mandatory choices in from-prices and detects sold-out required groups', () => {
    expect(minimumOptionsExtra(groups)).toBe(0);
    expect(minimumOptionsExtra([{ ...groups[0]!, options: [groups[0]!.options[1]!] }])).toBe(5000);
    expect(minimumOptionsExtra([{ ...groups[0]!, options: groups[0]!.options.map((option) => ({ ...option, isAvailable: false })) }])).toBeNull();
    expect(minimumOptionsExtra([])).toBe(0);
  });

});
