// The cart view model (docs/product-specs/cart.md): what the cart page, the mini-cart and the
// JSON API all render. Pure: built from repository rows with the domain price pipeline.
import type { CartLineRow, PromoRow } from '../db/repos/cart.js';
import { skuCode, type DepartmentId, type SkuCode, type TaxClass } from '../domain/catalog.js';
import { availability, maxQuantity, type Availability } from '../domain/inventory.js';
import { usd, type Money } from '../domain/money.js';
import { itemCount, priceOrder, type Breakdown, type PriceLineInput } from '../domain/pricing.js';
import { promoErrorMessage, type Promo } from '../domain/promos.js';

/** Why a line can't be bought as it stands. Checkout is blocked while any line has one. */
export type LineIssue =
  | { readonly _tag: 'Unavailable' }
  | { readonly _tag: 'OutOfStock' }
  | { readonly _tag: 'NotEnoughStock'; readonly available: number };

export interface CartLineView {
  readonly sku: string;
  readonly quantity: number;
  readonly productName: string;
  readonly href: string;
  /** Variant options such as size and color. */
  readonly options: Readonly<Record<string, string>>;
  readonly image: { readonly url: string; readonly alt: string } | undefined;
  readonly unit: Money;
  readonly listPrice: Money;
  readonly onSale: boolean;
  /** unit × the quantity that can be bought. */
  readonly lineTotal: Money;
  /** Upper bound for the quantity stepper. */
  readonly maxQuantity: number;
  readonly availability: Availability;
  readonly issue?: LineIssue;
}

export interface CartPromoView {
  readonly code: string;
  readonly applied: boolean;
  /** Why the code isn't applied right now (e.g. the subtotal fell below its minimum). */
  readonly message?: string;
}

export interface CartView {
  readonly lines: readonly CartLineView[];
  readonly itemCount: number;
  /** Itemized totals from the domain price pipeline (Standard shipping, tax pending). */
  readonly breakdown: Breakdown;
  readonly promo?: CartPromoView;
  readonly canCheckout: boolean;
}

/** Tax classes follow the department (ADR 0003 addendum). */
export const taxClassOf = (departmentSlug: string): TaxClass =>
  departmentSlug === 'grocery'
    ? 'grocery'
    : departmentSlug === 'clothing'
      ? 'clothing'
      : 'standard';

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
    ...(row.departmentSlug === null ? {} : { department: row.departmentSlug as DepartmentId }),
    ...(row.startsAt === null ? {} : { startsAt: row.startsAt }),
    ...(row.endsAt === null ? {} : { endsAt: row.endsAt }),
    ...(row.usageLimit === null ? {} : { usageLimit: row.usageLimit }),
    timesUsed: row.usedCount,
  };
}

function issueOf(row: CartLineRow): LineIssue | undefined {
  if (row.archived) return { _tag: 'Unavailable' };
  if (row.stock <= 0) return { _tag: 'OutOfStock' };
  if (row.quantity > maxQuantity(row.stock)) {
    return { _tag: 'NotEnoughStock', available: maxQuantity(row.stock) };
  }
  return undefined;
}

/** The quantity that can actually be bought now (what the totals are computed from). */
const buyable = (row: CartLineRow): number =>
  row.archived ? 0 : Math.min(row.quantity, maxQuantity(row.stock));

const priceInput = (row: CartLineRow, sku: SkuCode, qty: number): PriceLineInput => ({
  sku,
  qty,
  price: usd(row.priceCents),
  ...(row.salePriceCents === null ? {} : { salePrice: usd(row.salePriceCents) }),
  department: row.departmentSlug as DepartmentId,
  taxClass: taxClassOf(row.departmentSlug),
});

export interface BuildCartView {
  readonly rows: readonly CartLineRow[];
  readonly promoCode: string | undefined;
  readonly promo: Promo | undefined;
  readonly now: Date;
}

export function buildCartView({ rows, promoCode, promo, now }: BuildCartView): CartView {
  const priced = rows.flatMap((row) => {
    const sku = skuCode(row.sku);
    const qty = buyable(row);
    return sku.ok && qty > 0 ? [priceInput(row, sku.value, qty)] : [];
  });
  const result = priceOrder({
    lines: priced,
    ...(promoCode === undefined ? {} : { promo: { code: promoCode, found: promo } }),
    shipping: 'standard',
    now,
  });
  // Quantities are clamped to ≥ 1 above, so pricing cannot reject them.
  if (!result.ok) throw new Error(`cart pricing failed for ${result.error.sku}`);
  const breakdown = result.value;
  const bySku = new Map(breakdown.lines.map((l) => [l.sku as string, l]));

  const lines = rows.map((row): CartLineView => {
    const line = bySku.get(row.sku);
    const issue = issueOf(row);
    const unit = line?.unit ?? usd(row.salePriceCents ?? row.priceCents);
    return {
      sku: row.sku,
      quantity: row.quantity,
      productName: row.productName,
      href: `/p/${row.productSlug}`,
      options: row.options,
      image:
        row.imageUrl === null
          ? undefined
          : { url: row.imageUrl, alt: row.imageAlt ?? row.productName },
      unit,
      listPrice: usd(row.priceCents),
      onSale: unit.cents < row.priceCents,
      lineTotal: line?.lineSubtotal ?? usd(0),
      maxQuantity: maxQuantity(row.stock),
      availability: availability(row.stock),
      ...(issue === undefined ? {} : { issue }),
    };
  });

  const promoView: CartPromoView | undefined =
    promoCode === undefined
      ? undefined
      : {
          code: promoCode,
          applied: breakdown.promo !== undefined,
          ...(breakdown.promoError === undefined
            ? {}
            : { message: promoErrorMessage(breakdown.promoError) }),
        };

  return {
    lines,
    itemCount: itemCount(breakdown.lines),
    breakdown,
    ...(promoView === undefined ? {} : { promo: promoView }),
    canCheckout: lines.length > 0 && lines.every((l) => l.issue === undefined),
  };
}

/** An empty cart (visitors without a session or cart). */
export const emptyCartView = (now: Date): CartView =>
  buildCartView({ rows: [], promoCode: undefined, promo: undefined, now });

/** A one-line, human message for a line issue (cart page, flash messages). */
export function lineIssueMessage(issue: LineIssue): string {
  switch (issue._tag) {
    case 'Unavailable':
      return 'This item is no longer available.';
    case 'OutOfStock':
      return 'Out of stock.';
    case 'NotEnoughStock':
      return `Only ${String(issue.available)} available.`;
  }
}
