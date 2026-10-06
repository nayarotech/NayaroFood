/**
 * Money is handled as an integer count of minor units (paisa for NPR) everywhere
 * in application code, and only converted to/from the DECIMAL(10,2) string form
 * at the database boundary. Floating point never touches a total.
 */

/** An integer number of minor units, e.g. 25000 === Rs. 250.00 */
export type Minor = number;

export const MINOR_PER_MAJOR = 100;

export class MoneyError extends Error {}

/** Parse a DECIMAL(10,2) column value (mysql2 returns it as a string) into paisa. */
export function fromDecimalString(value: string | number | null | undefined): Minor {
  if (value === null || value === undefined) return 0;
  const raw = typeof value === 'number' ? value.toFixed(2) : value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(raw)) {
    throw new MoneyError(`Not a decimal money value: ${JSON.stringify(value)}`);
  }
  const negative = raw.startsWith('-');
  const [whole = '0', frac = ''] = raw.replace('-', '').split('.');
  // Pad/truncate to exactly 2 fractional digits, rounding half-up on the 3rd.
  const cents = frac.padEnd(3, '0');
  let minor = Number(whole) * MINOR_PER_MAJOR + Number(cents.slice(0, 2));
  if (Number(cents[2]) >= 5) minor += 1;
  return negative ? -minor : minor;
}

/** Render paisa back to the `DECIMAL(10,2)` string form MySQL expects. */
export function toDecimalString(minor: Minor): string {
  assertInteger(minor);
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / MINOR_PER_MAJOR);
  const frac = String(abs % MINOR_PER_MAJOR).padStart(2, '0');
  return `${negative ? '-' : ''}${whole}.${frac}`;
}

/** Multiply a unit price by a whole quantity. Exact — both operands are integers. */
export function multiply(unit: Minor, quantity: number): Minor {
  assertInteger(unit);
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new MoneyError(`Quantity must be a non-negative integer, got ${quantity}`);
  }
  return unit * quantity;
}

export function sum(values: readonly Minor[]): Minor {
  return values.reduce<Minor>((acc, v) => {
    assertInteger(v);
    return acc + v;
  }, 0);
}

/** Human-facing format, e.g. formatMoney(25000) === "Rs. 250" */
export function formatMoney(minor: Minor, currency = 'Rs.'): string {
  assertInteger(minor);
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / MINOR_PER_MAJOR);
  const frac = abs % MINOR_PER_MAJOR;
  const grouped = whole.toLocaleString('en-IN');
  const body = frac === 0 ? grouped : `${grouped}.${String(frac).padStart(2, '0')}`;
  return `${negative ? '-' : ''}${currency} ${body}`;
}

function assertInteger(minor: number): void {
  if (!Number.isInteger(minor)) {
    throw new MoneyError(`Money must be an integer count of minor units, got ${minor}`);
  }
}
