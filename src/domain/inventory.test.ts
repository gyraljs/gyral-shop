import { describe, expect, it } from 'vitest';
import type { SkuCode } from './catalog.js';
import {
  availability,
  clampQuantity,
  maxQuantity,
  mergeCarts,
  planReservation,
} from './inventory.js';

const A = 'SKU-A' as SkuCode;
const B = 'SKU-B' as SkuCode;

describe('inventory', () => {
  it('reports availability', () => {
    expect(availability(0)).toEqual({ _tag: 'OutOfStock' });
    expect(availability(3)).toEqual({ _tag: 'LowStock', left: 3 });
    expect(availability(50)).toEqual({ _tag: 'InStock' });
  });

  it('caps a line at min(10, stock)', () => {
    expect(maxQuantity(4)).toBe(4);
    expect(maxQuantity(40)).toBe(10);
    expect(maxQuantity(-1)).toBe(0);
    expect(clampQuantity(12, 40)).toBe(10);
    expect(clampQuantity(-3, 40)).toBe(0);
  });

  it('plans a reservation, combining lines for the same SKU', () => {
    const stock = new Map([
      [A, 5],
      [B, 1],
    ]);
    const plan = planReservation(stock, [
      { sku: A, qty: 2 },
      { sku: A, qty: 3 },
    ]);
    expect(plan.ok && plan.value.get(A)).toBe(5);
  });

  it('reports every shortage at once', () => {
    const stock = new Map([[A, 1]]);
    const plan = planReservation(stock, [
      { sku: A, qty: 2 },
      { sku: B, qty: 1 },
    ]);
    expect(plan.ok ? [] : plan.error.shortages).toEqual([
      { sku: A, requested: 2, available: 1 },
      { sku: B, requested: 1, available: 0 },
    ]);
  });

  it('merges a guest cart into a member cart, capped by stock', () => {
    const stock = new Map([
      [A, 6],
      [B, 0],
    ]);
    const merged = mergeCarts(
      [{ sku: A, qty: 4 }],
      [
        { sku: A, qty: 4 },
        { sku: B, qty: 1 },
      ],
      stock,
    );
    expect(merged.lines).toEqual([{ sku: A, qty: 6 }]);
    expect(merged.adjustments).toEqual([
      { sku: A, requested: 8, kept: 6 },
      { sku: B, requested: 1, kept: 0 },
    ]);
  });
});
