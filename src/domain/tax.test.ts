import { describe, expect, it } from 'vitest';
import { usd } from './money.js';
import { intBetween, prng } from './prng.test-util.js';
import { STATE_CODES, computeTax, isStateCode, isTaxable, taxRule } from './tax.js';

describe('tax rules', () => {
  it('covers 50 states and DC with plausible rates', () => {
    expect(STATE_CODES).toHaveLength(51);
    for (const state of STATE_CODES) {
      const { rate } = taxRule(state);
      expect(rate).toBeGreaterThanOrEqual(0);
      expect(rate).toBeLessThan(10);
    }
    expect(isStateCode('CA')).toBe(true);
    expect(isStateCode('ZZ')).toBe(false);
  });

  it('never taxes anything in zero-rate states', () => {
    for (const state of ['AK', 'DE', 'MT', 'NH', 'OR'] as const) {
      expect(isTaxable(state, 'standard')).toBe(false);
      expect(
        computeTax(state, [{ taxClass: 'standard', amount: usd(10000) }], usd(599)).tax.cents,
      ).toBe(0);
    }
  });

  it('exempts groceries except in states that tax them, and clothing in some states', () => {
    expect(isTaxable('CA', 'grocery')).toBe(false);
    expect(isTaxable('AL', 'grocery')).toBe(true);
    expect(isTaxable('PA', 'clothing')).toBe(false);
    expect(isTaxable('CA', 'clothing')).toBe(true);
  });

  it('taxes shipping only where the state does', () => {
    const items = [{ taxClass: 'standard' as const, amount: usd(10000) }];
    expect(computeTax('CA', items, usd(599)).tax.cents).toBe(725); // 7.25% of $100
    expect(computeTax('NY', items, usd(599)).tax.cents).toBe(424); // 4% of $105.99, rounded once
  });

  it('rounds once on the taxable total, not per line', () => {
    const items = Array.from({ length: 3 }, () => ({
      taxClass: 'standard' as const,
      amount: usd(5),
    }));
    // 6.25% of 15 cents = 0.9375 → 1 cent (per-line rounding would give 0).
    expect(computeTax('TX', items, usd(0)).tax.cents).toBe(1);
  });

  it('is never negative and never exceeds rate × taxable (property)', () => {
    const next = prng(42);
    for (let run = 0; run < 500; run += 1) {
      const state = STATE_CODES[intBetween(next, 0, STATE_CODES.length - 1)] ?? 'CA';
      const items = Array.from({ length: intBetween(next, 0, 5) }, () => ({
        taxClass:
          (['standard', 'grocery', 'clothing'] as const)[intBetween(next, 0, 2)] ?? 'standard',
        amount: usd(intBetween(next, 0, 50000)),
      }));
      const { tax, taxable, rate } = computeTax(state, items, usd(intBetween(next, 0, 2499)));
      expect(tax.cents).toBeGreaterThanOrEqual(0);
      expect(tax.cents).toBeLessThanOrEqual(Math.ceil((taxable.cents * rate) / 100));
    }
  });
});
