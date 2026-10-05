// Database rows → domain types, in one place (shop-teg). Ids go through the domain's smart
// constructors instead of casts, so a malformed slug or SKU in the database is caught here.
import {
  departmentId,
  skuCode,
  type DepartmentId,
  type SkuCode,
  type TaxClass,
} from '../domain/catalog.js';
import { usd } from '../domain/money.js';
import type { PriceLineInput } from '../domain/pricing.js';
import type { Promo } from '../domain/promos.js';
import type { CartLineRow, PromoRow } from './repos/cart.js';

/** Tax classes follow the department (ADR 0003 addendum). */
export const taxClassOf = (departmentSlug: string): TaxClass =>
  departmentSlug === 'grocery'
    ? 'grocery'
    : departmentSlug === 'clothing'
      ? 'clothing'
      : 'standard';

/** A department slug from the database; a bad one is a data bug, not a user error. */
export function departmentIdOf(slug: string): DepartmentId {
  const id = departmentId(slug);
  if (!id.ok) throw new Error(`invalid department slug in database: ${slug}`);
  return id.value;
}

/** A SKU from the database, or undefined when malformed (callers skip such lines). */
export function skuCodeOf(sku: string): SkuCode | undefined {
  const code = skuCode(sku);
  return code.ok ? code.value : undefined;
}

/** A promo_codes row as the domain sees it; inactive codes don't exist for customers. */
export function promoFromRow(row: PromoRow | undefined): Promo | undefined {
  if (row === undefined || !row.active) return undefined;
  return {
    code: row.code,
    value:
      row.kind === 'percent'
        ? { kind: 'percent', percent: row.amount / 100 }
        : { kind: 'fixed', amount: usd(row.amount) },
    ...(row.minSubtotalCents > 0 ? { minSubtotal: usd(row.minSubtotalCents) } : {}),
    ...(row.departmentSlug === null ? {} : { department: departmentIdOf(row.departmentSlug) }),
    ...(row.startsAt === null ? {} : { startsAt: row.startsAt }),
    ...(row.endsAt === null ? {} : { endsAt: row.endsAt }),
    ...(row.usageLimit === null ? {} : { usageLimit: row.usageLimit }),
    timesUsed: row.usedCount,
  };
}

/** One cart line as the price pipeline sees it, for `qty` units. */
export const priceLineOf = (row: CartLineRow, sku: SkuCode, qty: number): PriceLineInput => ({
  sku,
  qty,
  price: usd(row.priceCents),
  ...(row.salePriceCents === null ? {} : { salePrice: usd(row.salePriceCents) }),
  department: departmentIdOf(row.departmentSlug),
  taxClass: taxClassOf(row.departmentSlug),
});
