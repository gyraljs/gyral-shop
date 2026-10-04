// The price pipeline (docs/design-docs/0003-money-and-pricing.md). Cart, checkout and order
// history all render the same breakdown from this one function.
import { unitPrice, type DepartmentId, type SkuCode, type TaxClass } from './catalog.js';
import { add, subtract, sum, times, zero, type Money } from './money.js';
import { applyPromo, type Promo, type PromoError } from './promos.js';
import { err, ok, type Result } from './result.js';
import { shippingPrice, type ShippingMethod } from './shipping.js';
import { computeTax, type StateCode } from './tax.js';

export interface PriceLineInput {
  readonly sku: SkuCode;
  readonly qty: number;
  readonly price: Money;
  readonly salePrice?: Money;
  readonly department: DepartmentId;
  readonly taxClass: TaxClass;
}

export interface PricingInput {
  readonly lines: readonly PriceLineInput[];
  /** The code the customer entered, and the promo found for it (if any). */
  readonly promo?: { readonly code: string; readonly found: Promo | undefined };
  readonly shipping: ShippingMethod;
  /** Unknown until checkout has an address: tax is then zero and `taxPending` is true. */
  readonly destination?: StateCode;
  readonly now: Date;
}

export interface PricedLine {
  readonly sku: SkuCode;
  readonly qty: number;
  /** What one unit costs (sale price when on sale). */
  readonly unit: Money;
  /** unit × qty. */
  readonly lineSubtotal: Money;
  /** Savings from the sale price: (list − unit) × qty. */
  readonly itemDiscount: Money;
  /** Share of the order-level promo discount. */
  readonly promoDiscount: Money;
}

export interface Breakdown {
  readonly lines: readonly PricedLine[];
  /** Sum of line subtotals (after sale prices, before the promo). */
  readonly subtotal: Money;
  /** Total sale-price savings, for display. */
  readonly savings: Money;
  readonly promo?: { readonly code: string; readonly discount: Money };
  /** Why an entered code wasn't applied; the rest of the breakdown is still valid. */
  readonly promoError?: PromoError;
  readonly discount: Money;
  readonly shipping: Money;
  readonly tax: Money;
  readonly taxRate: number;
  readonly taxPending: boolean;
  readonly total: Money;
}

export type PricingError = {
  readonly _tag: 'InvalidQuantity';
  readonly sku: SkuCode;
  readonly qty: number;
};

export function priceOrder(input: PricingInput): Result<Breakdown, PricingError> {
  const bad = input.lines.find((l) => !Number.isSafeInteger(l.qty) || l.qty < 1);
  if (bad !== undefined) return err({ _tag: 'InvalidQuantity', sku: bad.sku, qty: bad.qty });

  const units = input.lines.map((l) => unitPrice(l));
  const subtotals = input.lines.map((l, n) => times(units[n] ?? l.price, l.qty));
  const subtotal = sum(subtotals);
  const savings = sum(
    input.lines.map((l, n) => times(subtract(l.price, units[n] ?? l.price), l.qty)),
  );

  const promoLines = input.lines.map((l, n) => ({
    department: l.department,
    amount: subtotals[n] ?? zero,
  }));
  const applied =
    input.promo === undefined
      ? undefined
      : applyPromo(input.promo.code, input.promo.found, promoLines, input.now);
  const perLine = applied?.ok === true ? applied.value.perLine : input.lines.map(() => zero);
  const discount = applied?.ok === true ? applied.value.discount : zero;

  const merchandise = subtract(subtotal, discount);
  const shipping = input.lines.length === 0 ? zero : shippingPrice(input.shipping, merchandise);
  const taxed =
    input.destination === undefined
      ? { rate: 0, tax: zero }
      : computeTax(
          input.destination,
          input.lines.map((l, n) => ({
            taxClass: l.taxClass,
            amount: subtract(subtotals[n] ?? zero, perLine[n] ?? zero),
          })),
          shipping,
        );

  const lines = input.lines.map((l, n) => ({
    sku: l.sku,
    qty: l.qty,
    unit: units[n] ?? l.price,
    lineSubtotal: subtotals[n] ?? zero,
    itemDiscount: times(subtract(l.price, units[n] ?? l.price), l.qty),
    promoDiscount: perLine[n] ?? zero,
  }));

  return ok({
    lines,
    subtotal,
    savings,
    ...(applied?.ok === true
      ? { promo: { code: applied.value.code, discount: applied.value.discount } }
      : {}),
    ...(applied?.ok === false ? { promoError: applied.error } : {}),
    discount,
    shipping,
    tax: taxed.tax,
    taxRate: taxed.rate,
    taxPending: input.destination === undefined,
    total: add(add(merchandise, shipping), taxed.tax),
  });
}

/** Total item count, for the mini-cart badge. */
export const itemCount = (lines: readonly { readonly qty: number }[]): number =>
  lines.reduce((n, l) => n + l.qty, 0);
