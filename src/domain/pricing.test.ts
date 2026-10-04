import { describe, expect, it } from 'vitest';
import type { DepartmentId, SkuCode, TaxClass } from './catalog.js';
import { usd } from './money.js';
import { priceOrder, itemCount, type PriceLineInput, type PricingInput } from './pricing.js';
import { intBetween, prng } from './prng.test-util.js';
import type { Promo } from './promos.js';
import { STATE_CODES } from './tax.js';

const now = new Date('2026-10-04T12:00:00Z');
const line = (
  sku: string,
  qty: number,
  price: number,
  extra: { sale?: number; department?: string; taxClass?: TaxClass } = {},
): PriceLineInput => ({
  sku: sku as SkuCode,
  qty,
  price: usd(price),
  ...(extra.sale === undefined ? {} : { salePrice: usd(extra.sale) }),
  department: (extra.department ?? 'electronics') as DepartmentId,
  taxClass: extra.taxClass ?? 'standard',
});
const price = (input: Partial<PricingInput>) => {
  const r = priceOrder({ lines: [], shipping: 'standard', now, ...input });
  if (!r.ok) throw new Error(r.error._tag);
  return r.value;
};
const save10: Promo = { code: 'SAVE10', value: { kind: 'percent', percent: 10 }, timesUsed: 0 };

describe('priceOrder', () => {
  it('prices an empty cart at zero with no shipping', () => {
    const b = price({});
    expect([b.subtotal.cents, b.shipping.cents, b.tax.cents, b.total.cents]).toEqual([0, 0, 0, 0]);
  });

  it('uses sale prices and reports the savings', () => {
    const b = price({ lines: [line('TV-1', 2, 50000, { sale: 45000 })] });
    expect(b.lines[0]?.unit.cents).toBe(45000);
    expect(b.lines[0]?.itemDiscount.cents).toBe(10000);
    expect(b.savings.cents).toBe(10000);
    expect(b.subtotal.cents).toBe(90000);
  });

  it('applies a promo, allocates it to lines, and keeps going when a code fails', () => {
    const lines = [line('A', 1, 3000), line('B', 1, 1000)];
    const good = price({ lines, promo: { code: 'save10', found: save10 } });
    expect(good.promo).toEqual({ code: 'SAVE10', discount: usd(400) });
    expect(good.lines.map((l) => l.promoDiscount.cents)).toEqual([300, 100]);
    const bad = price({ lines, promo: { code: 'NOPE', found: undefined } });
    expect(bad.promoError?._tag).toBe('PromoNotFound');
    expect(bad.discount.cents).toBe(0);
    expect(bad.total.cents).toBe(4000);
  });

  it('decides free shipping on the discounted subtotal', () => {
    const lines = [line('A', 1, 3600)];
    expect(price({ lines }).shipping.cents).toBe(0);
    expect(price({ lines, promo: { code: 'SAVE10', found: save10 } }).shipping.cents).toBe(599);
  });

  it('leaves tax pending until there is a destination', () => {
    const lines = [line('A', 1, 10000)];
    expect(price({ lines }).taxPending).toBe(true);
    const ca = price({ lines, destination: 'CA' });
    expect([ca.taxPending, ca.tax.cents, ca.total.cents]).toEqual([false, 725, 10725]);
  });

  it('taxes discounted amounts and skips exempt classes', () => {
    const lines = [
      line('A', 1, 10000),
      line('MILK', 1, 10000, { department: 'grocery', taxClass: 'grocery' }),
    ];
    const b = price({ lines, destination: 'CA', promo: { code: 'SAVE10', found: save10 } });
    expect(b.tax.cents).toBe(653); // 7.25% of $90.00 (grocery exempt, $10 promo share removed)
  });

  it('rejects invalid quantities', () => {
    const r = priceOrder({ lines: [line('A', 0, 100)], shipping: 'standard', now });
    expect(r.ok ? undefined : r.error).toEqual({ _tag: 'InvalidQuantity', sku: 'A', qty: 0 });
    expect(priceOrder({ lines: [line('A', 1.5, 100)], shipping: 'standard', now }).ok).toBe(false);
  });

  it('always adds up (property)', () => {
    const next = prng(2026);
    for (let run = 0; run < 500; run += 1) {
      const lines = Array.from({ length: intBetween(next, 0, 6) }, (_v, n) => {
        const list = intBetween(next, 1, 60000);
        return line(`S${String(n)}`, intBetween(next, 1, 10), list, {
          ...(next() < 0.3 ? { sale: intBetween(next, 1, list) } : {}),
          taxClass:
            (['standard', 'grocery', 'clothing'] as const)[intBetween(next, 0, 2)] ?? 'standard',
        });
      });
      const b = price({
        lines,
        shipping:
          (['standard', 'express', 'next_day'] as const)[intBetween(next, 0, 2)] ?? 'standard',
        destination: STATE_CODES[intBetween(next, 0, STATE_CODES.length - 1)] ?? 'CA',
        ...(next() < 0.5 ? { promo: { code: 'SAVE10', found: save10 } } : {}),
      });
      const promoTotal = b.lines.reduce((a, l) => a + l.promoDiscount.cents, 0);
      expect(promoTotal).toBe(b.discount.cents);
      expect(b.total.cents).toBe(
        b.subtotal.cents - b.discount.cents + b.shipping.cents + b.tax.cents,
      );
      expect(b.total.cents).toBeGreaterThanOrEqual(0);
      expect(itemCount(b.lines)).toBe(lines.reduce((a, l) => a + l.qty, 0));
    }
  });
});
