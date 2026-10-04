// Stock rules (docs/design-docs/0003-money-and-pricing.md, docs/product-specs/cart.md).
import type { SkuCode } from './catalog.js';
import { err, ok, type Result } from './result.js';

/** Most of one SKU a customer may have in one cart line. */
export const MAX_PER_LINE = 10;

/** At or below this many units a product shows "Only N left". */
export const LOW_STOCK = 5;

export type Availability =
  | { readonly _tag: 'InStock' }
  | { readonly _tag: 'LowStock'; readonly left: number }
  | { readonly _tag: 'OutOfStock' };

export const availability = (stock: number): Availability => {
  if (stock <= 0) return { _tag: 'OutOfStock' };
  if (stock <= LOW_STOCK) return { _tag: 'LowStock', left: stock };
  return { _tag: 'InStock' };
};

export const maxQuantity = (stock: number): number =>
  Math.max(0, Math.min(MAX_PER_LINE, Math.floor(stock)));

/** Clamps a requested quantity to what can be bought (0 means remove the line). */
export const clampQuantity = (requested: number, stock: number): number =>
  Math.max(0, Math.min(Math.floor(requested), maxQuantity(stock)));

export interface QuantityLine {
  readonly sku: SkuCode;
  readonly qty: number;
}

export interface Shortage {
  readonly sku: SkuCode;
  readonly requested: number;
  readonly available: number;
}

export type ReservationError = {
  readonly _tag: 'InsufficientStock';
  readonly shortages: readonly Shortage[];
};

/** Total quantity per SKU (lines for the same SKU are combined). */
export function totals(lines: readonly QuantityLine[]): ReadonlyMap<SkuCode, number> {
  const out = new Map<SkuCode, number>();
  for (const line of lines) out.set(line.sku, (out.get(line.sku) ?? 0) + line.qty);
  return out;
}

/**
 * The stock decrements an order needs, or every shortage. Pure: the db layer applies the plan
 * inside a transaction after re-reading stock.
 */
export function planReservation(
  stock: ReadonlyMap<SkuCode, number>,
  lines: readonly QuantityLine[],
): Result<ReadonlyMap<SkuCode, number>, ReservationError> {
  const wanted = totals(lines);
  const shortages: Shortage[] = [];
  for (const [sku, requested] of wanted) {
    const available = stock.get(sku) ?? 0;
    if (requested > available) shortages.push({ sku, requested, available });
  }
  return shortages.length > 0 ? err({ _tag: 'InsufficientStock', shortages }) : ok(wanted);
}

export interface MergeAdjustment {
  readonly sku: SkuCode;
  readonly requested: number;
  readonly kept: number;
}

/**
 * Merges a guest cart into a member cart on login: quantities add, capped per line by stock.
 * Returns the merged lines (member order first) and every line that had to be reduced.
 */
export function mergeCarts(
  member: readonly QuantityLine[],
  guest: readonly QuantityLine[],
  stock: ReadonlyMap<SkuCode, number>,
): { readonly lines: readonly QuantityLine[]; readonly adjustments: readonly MergeAdjustment[] } {
  const combined = totals([...member, ...guest]);
  const lines: QuantityLine[] = [];
  const adjustments: MergeAdjustment[] = [];
  for (const [sku, requested] of combined) {
    const kept = clampQuantity(requested, stock.get(sku) ?? 0);
    if (kept !== requested) adjustments.push({ sku, requested, kept });
    if (kept > 0) lines.push({ sku, qty: kept });
  }
  return { lines, adjustments };
}
