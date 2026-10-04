// Promo codes (docs/design-docs/0003-money-and-pricing.md). One code per order.
import type { DepartmentId } from './catalog.js';
import { format, min, percentOf, sum, usd, type Money } from './money.js';
import { err, ok, type Result } from './result.js';

export type PromoValue =
  | { readonly kind: 'percent'; readonly percent: number }
  | { readonly kind: 'fixed'; readonly amount: Money };

export interface Promo {
  readonly code: string;
  readonly value: PromoValue;
  readonly minSubtotal?: Money;
  /** Only lines from this department are discounted (and count toward the minimum). */
  readonly department?: DepartmentId;
  readonly startsAt?: Date;
  readonly endsAt?: Date;
  readonly usageLimit?: number;
  readonly timesUsed: number;
}

export type PromoError =
  | { readonly _tag: 'PromoNotFound'; readonly code: string }
  | { readonly _tag: 'PromoNotStarted'; readonly code: string; readonly startsAt: Date }
  | { readonly _tag: 'PromoExpired'; readonly code: string }
  | { readonly _tag: 'PromoUsedUp'; readonly code: string }
  | { readonly _tag: 'PromoBelowMinimum'; readonly code: string; readonly minimum: Money }
  | {
      readonly _tag: 'PromoNoEligibleItems';
      readonly code: string;
      readonly department: DepartmentId;
    };

/** A line as promos see it: its department and its amount after sale prices. */
export interface PromoLine {
  readonly department: DepartmentId;
  readonly amount: Money;
}

export interface AppliedPromo {
  readonly code: string;
  readonly discount: Money;
  /** Discount allocated to each input line (same order), summing exactly to `discount`. */
  readonly perLine: readonly Money[];
}

/** Codes are case-insensitive and ignore surrounding whitespace. */
export const normalizeCode = (input: string): string => input.trim().toUpperCase();

const eligible = (promo: Promo, line: PromoLine): boolean =>
  promo.department === undefined || line.department === promo.department;

/**
 * Splits `total` across `weights` in proportion, exactly (largest remainder method), so
 * per-line amounts always add up to the whole.
 */
export function allocate(total: Money, weights: readonly number[]): readonly Money[] {
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weightSum <= 0 || total.cents === 0) return weights.map(() => usd(0));
  const exact = weights.map((w) => (total.cents * w) / weightSum);
  const floors = exact.map((x) => Math.floor(x));
  let remainder = total.cents - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, index) => ({ index, fraction: x - Math.floor(x) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  const result = [...floors];
  for (const { index } of order) {
    if (remainder <= 0) break;
    result[index] = (result[index] ?? 0) + 1;
    remainder -= 1;
  }
  return result.map((cents) => usd(cents));
}

/** Validates `promo` for these lines at `now` and computes its discount. */
export function applyPromo(
  code: string,
  promo: Promo | undefined,
  lines: readonly PromoLine[],
  now: Date,
): Result<AppliedPromo, PromoError> {
  const normalized = normalizeCode(code);
  if (promo === undefined || normalizeCode(promo.code) !== normalized) {
    return err({ _tag: 'PromoNotFound', code: normalized });
  }
  if (promo.startsAt !== undefined && now < promo.startsAt) {
    return err({ _tag: 'PromoNotStarted', code: normalized, startsAt: promo.startsAt });
  }
  if (promo.endsAt !== undefined && now >= promo.endsAt) {
    return err({ _tag: 'PromoExpired', code: normalized });
  }
  if (promo.usageLimit !== undefined && promo.timesUsed >= promo.usageLimit) {
    return err({ _tag: 'PromoUsedUp', code: normalized });
  }
  const weights = lines.map((line) => (eligible(promo, line) ? line.amount.cents : 0));
  const base = sum(weights.map((cents) => usd(cents)));
  if (promo.department !== undefined && base.cents === 0) {
    return err({ _tag: 'PromoNoEligibleItems', code: normalized, department: promo.department });
  }
  if (promo.minSubtotal !== undefined && base.cents < promo.minSubtotal.cents) {
    return err({ _tag: 'PromoBelowMinimum', code: normalized, minimum: promo.minSubtotal });
  }
  const discount =
    promo.value.kind === 'percent'
      ? min(percentOf(base, promo.value.percent), base)
      : min(promo.value.amount, base);
  return ok({ code: normalized, discount, perLine: allocate(discount, weights) });
}

/** A message for the customer, next to the promo code field. */
export function promoErrorMessage(error: PromoError): string {
  switch (error._tag) {
    case 'PromoNotFound':
      return `We don't recognize the code ${error.code}.`;
    case 'PromoNotStarted':
      return `${error.code} isn't active yet.`;
    case 'PromoExpired':
      return `${error.code} has expired.`;
    case 'PromoUsedUp':
      return `${error.code} is no longer available.`;
    case 'PromoBelowMinimum':
      return `${error.code} needs a subtotal of at least ${format(error.minimum)}.`;
    case 'PromoNoEligibleItems':
      return `${error.code} only applies to items in another department.`;
  }
}
