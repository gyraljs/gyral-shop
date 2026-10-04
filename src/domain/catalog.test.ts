import { describe, expect, it } from 'vitest';
import { DEPARTMENTS, isDepartment, isOnSale, skuCode, productId, unitPrice } from './catalog.js';
import { usd } from './money.js';

describe('catalog', () => {
  it('has eight departments with slug ids', () => {
    expect(DEPARTMENTS).toHaveLength(8);
    for (const d of DEPARTMENTS) expect(isDepartment(d.id)).toBe(true);
    expect(isDepartment('garden')).toBe(false);
  });

  it('validates ids with smart constructors', () => {
    expect(productId('usb-c-cable').ok).toBe(true);
    expect(productId('Bad Slug').ok).toBe(false);
    expect(skuCode('TV-55-BLK').ok).toBe(true);
    expect(skuCode('tv-55').ok).toBe(false);
  });

  it('uses the sale price only when it is a real discount', () => {
    expect(unitPrice({ price: usd(1000), salePrice: usd(800) }).cents).toBe(800);
    expect(unitPrice({ price: usd(1000), salePrice: usd(1000) }).cents).toBe(1000);
    expect(unitPrice({ price: usd(1000), salePrice: usd(1200) }).cents).toBe(1000);
    expect(unitPrice({ price: usd(1000) }).cents).toBe(1000);
    expect(isOnSale({ price: usd(1000), salePrice: usd(999) })).toBe(true);
  });
});
