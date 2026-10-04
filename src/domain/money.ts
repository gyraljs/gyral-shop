// Money as integer cents (docs/design-docs/0003-money-and-pricing.md). Never use floats.

export type Currency = 'USD';

export interface Money {
  readonly cents: number;
  readonly currency: Currency;
}

export const usd = (cents: number): Money => {
  if (!Number.isSafeInteger(cents))
    throw new RangeError(`cents must be an integer: ${String(cents)}`);
  return { cents, currency: 'USD' };
};

export const zero: Money = usd(0);

export const add = (a: Money, b: Money): Money => usd(a.cents + b.cents);

export const subtract = (a: Money, b: Money): Money => usd(a.cents - b.cents);

export const times = (a: Money, quantity: number): Money => usd(a.cents * quantity);

export const sum = (items: readonly Money[]): Money => items.reduce(add, zero);

/** Rounds half away from zero, as tax tables do: `percentOf(usd(999), 7.25)` → 72 cents. */
export const percentOf = (a: Money, percent: number): Money => {
  const exact = (a.cents * percent) / 100;
  return usd(Math.sign(exact) * Math.round(Math.abs(exact)));
};

export const min = (a: Money, b: Money): Money => (a.cents <= b.cents ? a : b);

const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export const format = (a: Money): string => formatter.format(a.cents / 100);
