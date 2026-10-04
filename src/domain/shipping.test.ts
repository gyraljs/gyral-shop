import { describe, expect, it } from 'vitest';
import { usd } from './money.js';
import {
  addBusinessDays,
  estimatedDelivery,
  isShippingMethod,
  shippingOptions,
  shippingPrice,
} from './shipping.js';

const day = (iso: string) => new Date(`${iso}T12:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

describe('shipping', () => {
  it('makes standard shipping free from $35', () => {
    expect(shippingPrice('standard', usd(3499)).cents).toBe(599);
    expect(shippingPrice('standard', usd(3500)).cents).toBe(0);
    expect(shippingPrice('express', usd(100000)).cents).toBe(1299);
    expect(shippingPrice('next_day', usd(0)).cents).toBe(2499);
  });

  it('lists every method with its price for a subtotal', () => {
    expect(shippingOptions(usd(5000)).map((o) => [o.method, o.price.cents])).toEqual([
      ['standard', 0],
      ['express', 1299],
      ['next_day', 2499],
    ]);
    expect(isShippingMethod('drone')).toBe(false);
  });

  it('counts business days, skipping weekends', () => {
    expect(iso(addBusinessDays(day('2026-10-02'), 1))).toBe('2026-10-05'); // Fri → Mon
    expect(iso(addBusinessDays(day('2026-10-03'), 1))).toBe('2026-10-05'); // Sat → Mon
    expect(iso(addBusinessDays(day('2026-10-05'), 5))).toBe('2026-10-12'); // Mon → next Mon
  });

  it('estimates delivery windows per method', () => {
    const { earliest, latest } = estimatedDelivery('standard', day('2026-10-05'));
    expect([iso(earliest), iso(latest)]).toEqual(['2026-10-12', '2026-10-14']);
    expect(iso(estimatedDelivery('next_day', day('2026-10-05')).earliest)).toBe('2026-10-06');
  });
});
