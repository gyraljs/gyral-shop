// Card checks for the mock payment provider (docs/product-specs/payments.md).
// Only brand and last 4 digits are ever stored.
import { err, ok, type Result } from './result.js';

export type CardBrand = 'visa' | 'mastercard' | 'amex' | 'discover';

export const digitsOnly = (input: string): string => input.replace(/[\s-]/g, '');

export function luhnValid(digits: string): boolean {
  if (!/^\d{12,19}$/.test(digits)) return false;
  let total = 0;
  for (let n = 0; n < digits.length; n += 1) {
    let d = Number(digits[digits.length - 1 - n]);
    if (n % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    total += d;
  }
  return total % 10 === 0;
}

const BRANDS: readonly { brand: CardBrand; pattern: RegExp; lengths: readonly number[] }[] = [
  { brand: 'amex', pattern: /^3[47]/, lengths: [15] },
  { brand: 'visa', pattern: /^4/, lengths: [13, 16, 19] },
  {
    brand: 'mastercard',
    pattern: /^(5[1-5]|2(2[2-9][1-9]|2[3-9]\d|[3-6]\d\d|7[01]\d|720))/,
    lengths: [16],
  },
  { brand: 'discover', pattern: /^(6011|65|64[4-9])/, lengths: [16, 19] },
];

export const detectBrand = (digits: string): CardBrand | undefined =>
  BRANDS.find((b) => b.pattern.test(digits) && b.lengths.includes(digits.length))?.brand;

export type CardField = 'number' | 'expiry' | 'cvc';

export interface CardIssue {
  readonly field: CardField;
  readonly message: string;
}

export interface CardInput {
  readonly number: string;
  /** "MM/YY" or "MM/YYYY". */
  readonly expiry: string;
  readonly cvc: string;
}

export interface ValidCard {
  readonly brand: CardBrand;
  readonly last4: string;
  readonly expMonth: number;
  readonly expYear: number;
  /** Full digits; the payment provider uses them and never stores them. */
  readonly digits: string;
}

/** Parses "MM/YY" or "MM/YYYY". */
export function parseExpiry(input: string): { month: number; year: number } | undefined {
  const match = /^\s*(\d{1,2})\s*\/\s*(\d{2}|\d{4})\s*$/.exec(input);
  if (match === null) return undefined;
  const month = Number(match[1]);
  const raw = Number(match[2]);
  const year = raw < 100 ? 2000 + raw : raw;
  return month >= 1 && month <= 12 ? { month, year } : undefined;
}

/** A card is valid through the last day of its expiry month (UTC). */
export const isExpired = (month: number, year: number, now: Date): boolean =>
  now.getTime() >= Date.UTC(year, month, 1);

/** Checks every field and reports all problems at once, per field. */
export function validateCard(input: CardInput, now: Date): Result<ValidCard, readonly CardIssue[]> {
  const issues: CardIssue[] = [];
  const digits = digitsOnly(input.number);
  const brand = luhnValid(digits) ? detectBrand(digits) : undefined;
  if (!luhnValid(digits)) {
    issues.push({ field: 'number', message: 'Enter a valid card number.' });
  } else if (brand === undefined) {
    issues.push({
      field: 'number',
      message: 'We accept Visa, Mastercard, American Express and Discover.',
    });
  }
  const expiry = parseExpiry(input.expiry);
  if (expiry === undefined) {
    issues.push({ field: 'expiry', message: 'Enter the expiry date as MM/YY.' });
  } else if (isExpired(expiry.month, expiry.year, now)) {
    issues.push({ field: 'expiry', message: 'This card has expired.' });
  }
  const cvcLength = brand === 'amex' ? 4 : 3;
  if (!new RegExp(`^\\d{${String(cvcLength)}}$`).test(input.cvc.trim())) {
    issues.push({ field: 'cvc', message: `Enter the ${String(cvcLength)}-digit security code.` });
  }
  if (issues.length > 0 || brand === undefined || expiry === undefined) return err(issues);
  return ok({
    brand,
    last4: digits.slice(-4),
    expMonth: expiry.month,
    expYear: expiry.year,
    digits,
  });
}

export type ChargeOutcome =
  | { readonly _tag: 'Succeeded' }
  | { readonly _tag: 'Declined'; readonly reason: 'card_declined' | 'insufficient_funds' }
  | { readonly _tag: 'ProcessingError'; readonly retryable: true };

/**
 * What the mock provider does with a card. Unlisted valid cards succeed, so any real-looking
 * test number works in demos.
 */
export function testCardOutcome(digits: string): ChargeOutcome {
  switch (digits) {
    case '4000000000000002':
      return { _tag: 'Declined', reason: 'card_declined' };
    case '4000000000009995':
      return { _tag: 'Declined', reason: 'insufficient_funds' };
    case '4000000000000119':
      return { _tag: 'ProcessingError', retryable: true };
    default:
      return { _tag: 'Succeeded' };
  }
}

export function chargeOutcomeMessage(outcome: ChargeOutcome): string {
  switch (outcome._tag) {
    case 'Succeeded':
      return 'Payment approved.';
    case 'Declined':
      return outcome.reason === 'insufficient_funds'
        ? 'Your card has insufficient funds. Try another card.'
        : 'Your card was declined. Try another card.';
    case 'ProcessingError':
      return 'We could not process the payment. Please try again.';
  }
}
