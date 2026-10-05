import { describe, expect, it } from 'vitest';
import { usd } from '../domain/money.js';
import { departmentIdOf, priceLineOf, promoFromRow, skuCodeOf, taxClassOf } from './mapping.js';
import type { CartLineRow, PromoRow } from './repos/cart.js';

const promoRow = (extra: Partial<PromoRow> = {}): PromoRow => ({
  code: 'SAVE10',
  kind: 'percent',
  amount: 1000,
  minSubtotalCents: 0,
  departmentSlug: null,
  startsAt: null,
  endsAt: null,
  usageLimit: null,
  usedCount: 0,
  active: true,
  ...extra,
});

const lineRow: CartLineRow = {
  variantId: 1,
  sku: 'TV-55-BLK',
  quantity: 2,
  options: {},
  stock: 4,
  productId: 1,
  productSlug: 'tv',
  productName: 'TV',
  archived: false,
  priceCents: 49_999,
  salePriceCents: 44_999,
  departmentSlug: 'grocery',
  imageUrl: null,
  imageAlt: null,
};

describe('db → domain mapping', () => {
  it('maps departments to tax classes', () => {
    expect(taxClassOf('grocery')).toBe('grocery');
    expect(taxClassOf('clothing')).toBe('clothing');
    expect(taxClassOf('electronics')).toBe('standard');
  });

  it('brands ids through the domain constructors and rejects bad data', () => {
    expect(departmentIdOf('home-kitchen')).toBe('home-kitchen');
    expect(() => departmentIdOf('Not A Slug')).toThrow(/department slug/);
    expect(skuCodeOf('TV-55-BLK')).toBe('TV-55-BLK');
    expect(skuCodeOf('bad sku!')).toBeUndefined();
  });

  it('maps promo rows: percent in basis points, fixed in cents, inactive hidden', () => {
    expect(promoFromRow(promoRow())?.value).toEqual({ kind: 'percent', percent: 10 });
    expect(promoFromRow(promoRow({ kind: 'fixed', amount: 500 }))?.value).toEqual({
      kind: 'fixed',
      amount: usd(500),
    });
    expect(promoFromRow(promoRow({ active: false }))).toBeUndefined();
    expect(promoFromRow(undefined)).toBeUndefined();
    const limited = promoFromRow(
      promoRow({ departmentSlug: 'books', usageLimit: 3, usedCount: 2, minSubtotalCents: 2500 }),
    );
    expect(limited).toMatchObject({
      department: 'books',
      usageLimit: 3,
      timesUsed: 2,
      minSubtotal: usd(2500),
    });
  });

  it('builds price-pipeline lines with sale price and tax class', () => {
    const sku = skuCodeOf(lineRow.sku);
    if (sku === undefined) throw new Error('sku');
    expect(priceLineOf(lineRow, sku, 2)).toEqual({
      sku,
      qty: 2,
      price: usd(49_999),
      salePrice: usd(44_999),
      department: 'grocery',
      taxClass: 'grocery',
    });
  });
});
