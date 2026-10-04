// Illustrative US sales-tax rules (statewide base rates only; not tax advice).
// docs/design-docs/0003-money-and-pricing.md
import type { TaxClass } from './catalog.js';
import { percentOf, sum, usd, type Money } from './money.js';

export const STATE_CODES = [
  'AL',
  'AK',
  'AZ',
  'AR',
  'CA',
  'CO',
  'CT',
  'DE',
  'DC',
  'FL',
  'GA',
  'HI',
  'ID',
  'IL',
  'IN',
  'IA',
  'KS',
  'KY',
  'LA',
  'ME',
  'MD',
  'MA',
  'MI',
  'MN',
  'MS',
  'MO',
  'MT',
  'NE',
  'NV',
  'NH',
  'NJ',
  'NM',
  'NY',
  'NC',
  'ND',
  'OH',
  'OK',
  'OR',
  'PA',
  'RI',
  'SC',
  'SD',
  'TN',
  'TX',
  'UT',
  'VT',
  'VA',
  'WA',
  'WV',
  'WI',
  'WY',
] as const;

export type StateCode = (typeof STATE_CODES)[number];

export const isStateCode = (value: string): value is StateCode =>
  (STATE_CODES as readonly string[]).includes(value);

/** Statewide base rate in percent. */
const RATES: Readonly<Record<StateCode, number>> = {
  AL: 4,
  AK: 0,
  AZ: 5.6,
  AR: 6.5,
  CA: 7.25,
  CO: 2.9,
  CT: 6.35,
  DE: 0,
  DC: 6,
  FL: 6,
  GA: 4,
  HI: 4,
  ID: 6,
  IL: 6.25,
  IN: 7,
  IA: 6,
  KS: 6.5,
  KY: 6,
  LA: 4.45,
  ME: 5.5,
  MD: 6,
  MA: 6.25,
  MI: 6,
  MN: 6.875,
  MS: 7,
  MO: 4.225,
  MT: 0,
  NE: 5.5,
  NV: 6.85,
  NH: 0,
  NJ: 6.625,
  NM: 4.875,
  NY: 4,
  NC: 4.75,
  ND: 5,
  OH: 5.75,
  OK: 4.5,
  OR: 0,
  PA: 6,
  RI: 7,
  SC: 6,
  SD: 4.2,
  TN: 7,
  TX: 6.25,
  UT: 6.1,
  VT: 6,
  VA: 5.3,
  WA: 6.5,
  WV: 6,
  WI: 5,
  WY: 4,
};

/** States that tax groceries at the full rate (everywhere else exempts them). */
const GROCERY_TAXED: ReadonlySet<StateCode> = new Set(['AL', 'HI', 'ID', 'MS', 'SD']);

/** States that exempt clothing. */
const CLOTHING_EXEMPT: ReadonlySet<StateCode> = new Set(['MN', 'NJ', 'PA', 'VT']);

/** States that tax separately stated shipping charges. */
const SHIPPING_TAXED: ReadonlySet<StateCode> = new Set([
  'AR',
  'CT',
  'GA',
  'HI',
  'IN',
  'KS',
  'KY',
  'MI',
  'MN',
  'MS',
  'NE',
  'NJ',
  'NM',
  'NY',
  'NC',
  'ND',
  'OH',
  'PA',
  'RI',
  'SC',
  'SD',
  'TN',
  'TX',
  'VT',
  'WA',
  'WV',
  'WI',
]);

export interface TaxRule {
  readonly state: StateCode;
  readonly rate: number;
  readonly taxesShipping: boolean;
}

export const taxRule = (state: StateCode): TaxRule => ({
  state,
  rate: RATES[state],
  taxesShipping: SHIPPING_TAXED.has(state),
});

export const isTaxable = (state: StateCode, taxClass: TaxClass): boolean => {
  if (RATES[state] === 0) return false;
  if (taxClass === 'grocery') return GROCERY_TAXED.has(state);
  if (taxClass === 'clothing') return !CLOTHING_EXEMPT.has(state);
  return true;
};

export interface TaxableAmount {
  readonly taxClass: TaxClass;
  /** Amount after discounts. */
  readonly amount: Money;
}

export interface TaxResult {
  readonly rate: number;
  readonly taxable: Money;
  readonly tax: Money;
}

/**
 * Tax on the taxable items and (where taxed) shipping. Rounded once on the total taxable
 * amount, so per-line rounding never drifts.
 */
export function computeTax(
  state: StateCode,
  items: readonly TaxableAmount[],
  shipping: Money,
): TaxResult {
  const rule = taxRule(state);
  const goods = items.filter((i) => isTaxable(state, i.taxClass)).map((i) => i.amount);
  const taxable = sum(rule.taxesShipping && rule.rate > 0 ? [...goods, shipping] : goods);
  const tax = taxable.cents <= 0 ? usd(0) : percentOf(taxable, rule.rate);
  return { rate: rule.rate, taxable, tax };
}
