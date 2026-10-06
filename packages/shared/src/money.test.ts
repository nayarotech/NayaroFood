import { describe, expect, it } from 'vitest';
import { MoneyError, formatMoney, fromDecimalString, multiply, sum, toDecimalString } from './money.js';

describe('fromDecimalString', () => {
  it('parses the DECIMAL(10,2) strings mysql2 returns', () => {
    expect(fromDecimalString('250.00')).toBe(25_000);
    expect(fromDecimalString('0.00')).toBe(0);
    expect(fromDecimalString('90.50')).toBe(9_050);
    expect(fromDecimalString('1234567.89')).toBe(123_456_789);
  });

  it('treats null and undefined as zero', () => {
    expect(fromDecimalString(null)).toBe(0);
    expect(fromDecimalString(undefined)).toBe(0);
  });

  it('accepts values with fewer than two decimal places', () => {
    expect(fromDecimalString('250')).toBe(25_000);
    expect(fromDecimalString('250.5')).toBe(25_050);
  });

  it('rounds a third decimal place half up', () => {
    expect(fromDecimalString('10.005')).toBe(1_001);
    expect(fromDecimalString('10.004')).toBe(1_000);
  });

  it('rejects anything that is not a decimal number', () => {
    expect(() => fromDecimalString('abc')).toThrow(MoneyError);
    expect(() => fromDecimalString('12.3.4')).toThrow(MoneyError);
  });
});

describe('toDecimalString', () => {
  it('round-trips through the database format', () => {
    for (const value of ['0.00', '10.00', '250.50', '99999.99']) {
      expect(toDecimalString(fromDecimalString(value))).toBe(value);
    }
  });

  it('always emits exactly two decimal places', () => {
    expect(toDecimalString(5)).toBe('0.05');
    expect(toDecimalString(50)).toBe('0.50');
    expect(toDecimalString(25_000)).toBe('250.00');
  });

  it('refuses fractional minor units', () => {
    expect(() => toDecimalString(10.5)).toThrow(MoneyError);
  });
});

describe('arithmetic', () => {
  it('multiplies a unit price by a quantity exactly', () => {
    // 0.1 + 0.2 style drift is impossible here: both operands are integers.
    expect(multiply(9_000, 2)).toBe(18_000);
    expect(toDecimalString(multiply(fromDecimalString('0.10'), 3))).toBe('0.30');
  });

  it('rejects a negative or fractional quantity', () => {
    expect(() => multiply(100, -1)).toThrow(MoneyError);
    expect(() => multiply(100, 1.5)).toThrow(MoneyError);
  });

  it('builds the order total from the brief without drift', () => {
    // 2 x Chicken Momo @ 90 = 180, 1 x Coke @ 60, delivery 10 => 250
    const subtotal = sum([multiply(9_000, 2), multiply(6_000, 1)]);
    expect(toDecimalString(subtotal)).toBe('240.00');
    expect(toDecimalString(subtotal + 1_000)).toBe('250.00');
  });
});

describe('formatMoney', () => {
  it('hides the decimals on whole amounts', () => {
    expect(formatMoney(25_000)).toBe('Rs. 250');
    expect(formatMoney(0)).toBe('Rs. 0');
  });

  it('shows decimals only when there are any', () => {
    expect(formatMoney(25_050)).toBe('Rs. 250.50');
  });
});
