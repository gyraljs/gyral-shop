// The cart view model (docs/product-specs/cart.md): what the cart page, the mini-cart and the
// JSON API all render. Pure: built from repository rows with the domain price pipeline.
import { priceLineOf, skuCodeOf } from '../db/mapping.js';
import type { CartLineRow } from '../db/repos/cart.js';
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

export interface BuildCartView {
  readonly rows: readonly CartLineRow[];
  readonly promoCode: string | undefined;
  readonly promo: Promo | undefined;
  readonly now: Date;
}

/**
 * The lines the price pipeline sees: what can actually be bought now. Shared with checkout, so
 * the cart and checkout always price the same lines.
 */
export const priceLines = (rows: readonly CartLineRow[]): PriceLineInput[] =>
  rows.flatMap((row) => {
    const sku = skuCodeOf(row.sku);
    const qty = buyable(row);
    return sku !== undefined && qty > 0 ? [priceLineOf(row, sku, qty)] : [];
  });

export function buildCartView({ rows, promoCode, promo, now }: BuildCartView): CartView {
  const priced = priceLines(rows);
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
