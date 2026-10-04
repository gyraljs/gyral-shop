// Shipping methods and prices (docs/product-specs/checkout.md).
import { usd, type Money } from './money.js';

export type ShippingMethod = 'standard' | 'express' | 'next_day';

export const SHIPPING_METHODS: readonly ShippingMethod[] = ['standard', 'express', 'next_day'];

export const isShippingMethod = (value: string): value is ShippingMethod =>
  (SHIPPING_METHODS as readonly string[]).includes(value);

/** Standard shipping is free when the discounted merchandise subtotal reaches this. */
export const FREE_SHIPPING_THRESHOLD = usd(3500);

interface MethodInfo {
  readonly label: string;
  readonly price: Money;
  /** Delivery window in business days after the order is placed. */
  readonly days: { readonly min: number; readonly max: number };
}

const METHODS: Readonly<Record<ShippingMethod, MethodInfo>> = {
  standard: { label: 'Standard', price: usd(599), days: { min: 5, max: 7 } },
  express: { label: 'Express', price: usd(1299), days: { min: 2, max: 3 } },
  next_day: { label: 'Next day', price: usd(2499), days: { min: 1, max: 1 } },
};

export const shippingPrice = (method: ShippingMethod, subtotal: Money): Money =>
  method === 'standard' && subtotal.cents >= FREE_SHIPPING_THRESHOLD.cents
    ? usd(0)
    : METHODS[method].price;

export interface ShippingOption {
  readonly method: ShippingMethod;
  readonly label: string;
  readonly price: Money;
  readonly days: { readonly min: number; readonly max: number };
}

export const shippingOptions = (subtotal: Money): readonly ShippingOption[] =>
  SHIPPING_METHODS.map((method) => ({
    method,
    label: METHODS[method].label,
    price: shippingPrice(method, subtotal),
    days: METHODS[method].days,
  }));

const DAY = 24 * 60 * 60 * 1000;

/** Adds business days (Mon–Fri) in UTC. Weekend start dates count from the next Monday. */
export function addBusinessDays(from: Date, days: number): Date {
  let date = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  let left = days;
  while (left > 0) {
    date = new Date(date.getTime() + DAY);
    const weekday = date.getUTCDay();
    if (weekday !== 0 && weekday !== 6) left -= 1;
  }
  return date;
}

export const estimatedDelivery = (
  method: ShippingMethod,
  placedAt: Date,
): { readonly earliest: Date; readonly latest: Date } => ({
  earliest: addBusinessDays(placedAt, METHODS[method].days.min),
  latest: addBusinessDays(placedAt, METHODS[method].days.max),
});
