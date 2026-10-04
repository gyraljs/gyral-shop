import { describe, expect, it } from 'vitest';
import type { DepartmentId } from './catalog.js';
import { usd } from './money.js';
import { intBetween, prng } from './prng.test-util.js';
import {
  allocate,
  applyPromo,
  normalizeCode,
  promoErrorMessage,
  type Promo,
  type PromoError,
} from './promos.js';

const toys = 'toys-games' as DepartmentId;
const books = 'books' as DepartmentId;
const now = new Date('2026-10-04T12:00:00Z');
const lines = [
  { department: toys, amount: usd(3000) },
  { department: books, amount: usd(1000) },
];
const promo = (extra: Partial<Promo> = {}): Promo => ({
  code: 'SAVE10',
  value: { kind: 'percent', percent: 10 },
  timesUsed: 0,
  ...extra,
});
const error = (p: Promo | undefined, code = 'save10'): PromoError['_tag'] | undefined => {
  const r = applyPromo(code, p, lines, now);
  return r.ok ? undefined : r.error._tag;
};

describe('allocate', () => {
  it('splits exactly in proportion (property)', () => {
    const next = prng(7);
    for (let run = 0; run < 1000; run += 1) {
      const weights = Array.from({ length: intBetween(next, 1, 6) }, () =>
        intBetween(next, 0, 9999),
      );
      const total = usd(intBetween(next, 0, 5000));
      const parts = allocate(total, weights);
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      expect(parts.reduce((a, p) => a + p.cents, 0)).toBe(totalWeight === 0 ? 0 : total.cents);
      parts.forEach((p, n) => {
        expect(p.cents).toBeGreaterThanOrEqual(0);
        if (weights[n] === 0) expect(p.cents).toBe(0);
      });
    }
  });
});

describe('applyPromo', () => {
  it('applies a percentage to the whole order, case-insensitively', () => {
    const r = applyPromo('  save10 ', promo(), lines, now);
    expect(r.ok && r.value.discount.cents).toBe(400);
    expect(r.ok && r.value.perLine.map((m) => m.cents)).toEqual([300, 100]);
    expect(normalizeCode(' ab-c ')).toBe('AB-C');
  });

  it('caps a fixed amount at the eligible subtotal', () => {
    const r = applyPromo(
      'BIG',
      promo({ code: 'BIG', value: { kind: 'fixed', amount: usd(99999) } }),
      lines,
      now,
    );
    expect(r.ok && r.value.discount.cents).toBe(4000);
  });

  it('only discounts lines in its department', () => {
    const r = applyPromo('SAVE10', promo({ department: books }), lines, now);
    expect(r.ok && r.value.perLine.map((m) => m.cents)).toEqual([0, 100]);
  });

  it('rejects with a reason for every rule', () => {
    expect(error(undefined)).toBe('PromoNotFound');
    expect(error(promo(), 'OTHER')).toBe('PromoNotFound');
    expect(error(promo({ startsAt: new Date('2026-11-01') }))).toBe('PromoNotStarted');
    expect(error(promo({ endsAt: now }))).toBe('PromoExpired');
    expect(error(promo({ usageLimit: 5, timesUsed: 5 }))).toBe('PromoUsedUp');
    expect(error(promo({ minSubtotal: usd(5000) }))).toBe('PromoBelowMinimum');
    expect(error(promo({ department: 'grocery' as DepartmentId }))).toBe('PromoNoEligibleItems');
    expect(
      error(promo({ endsAt: new Date('2026-10-05'), usageLimit: 5, timesUsed: 4 })),
    ).toBeUndefined();
  });

  it('counts only eligible lines toward the minimum', () => {
    expect(error(promo({ department: books, minSubtotal: usd(2000) }))).toBe('PromoBelowMinimum');
  });

  it('has a customer message for every error', () => {
    const errors: PromoError[] = [
      { _tag: 'PromoNotFound', code: 'X' },
      { _tag: 'PromoNotStarted', code: 'X', startsAt: now },
      { _tag: 'PromoExpired', code: 'X' },
      { _tag: 'PromoUsedUp', code: 'X' },
      { _tag: 'PromoBelowMinimum', code: 'X', minimum: usd(5000) },
      { _tag: 'PromoNoEligibleItems', code: 'X', department: books },
    ];
    for (const e of errors) expect(promoErrorMessage(e)).toContain('X');
    expect(
      promoErrorMessage({ _tag: 'PromoBelowMinimum', code: 'X', minimum: usd(5000) }),
    ).toContain('$50.00');
  });
});
