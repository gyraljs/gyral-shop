// Checkout steps (docs/product-specs/checkout.md). Pure: which steps are done, which one is
// open, and what each saved value is. The services layer loads and saves a draft; the UI renders
// the steps from the result, identically with and without JavaScript.
import type { CardBrand } from './cards.js';
import type { ShippingMethod } from './shipping.js';
import type { StateCode } from './tax.js';

export const CHECKOUT_STEPS = ['contact', 'address', 'shipping', 'payment', 'review'] as const;

export type CheckoutStep = (typeof CHECKOUT_STEPS)[number];

export const isCheckoutStep = (value: string): value is CheckoutStep =>
  (CHECKOUT_STEPS as readonly string[]).includes(value);

export interface Address {
  readonly name: string;
  readonly line1: string;
  readonly line2: string;
  readonly city: string;
  readonly state: StateCode;
  /** Five digits, or ZIP+4 as `12345-6789`. */
  readonly postalCode: string;
  readonly phone: string;
}

/** What the payment step kept: never the card number or security code (payments spec). */
export interface SavedCard {
  readonly paymentRef: string;
  readonly brand: CardBrand;
  readonly last4: string;
  readonly expMonth: number;
  readonly expYear: number;
}

/** Everything the steps have saved so far. */
export interface CheckoutDraft {
  readonly email?: string;
  readonly address?: Address;
  readonly shippingMethod?: ShippingMethod;
  readonly card?: SavedCard;
}

export type StepStatus = 'done' | 'open' | 'locked';

/** The first step still missing its data; `review` once everything is saved. */
export function firstIncomplete(draft: CheckoutDraft): CheckoutStep {
  if (draft.email === undefined) return 'contact';
  if (draft.address === undefined) return 'address';
  if (draft.shippingMethod === undefined) return 'shipping';
  if (draft.card === undefined) return 'payment';
  return 'review';
}

const indexOf = (step: CheckoutStep): number => CHECKOUT_STEPS.indexOf(step);

/**
 * The step to show open. A requested edit is honoured for any step up to the first incomplete
 * one (you can't jump ahead past missing data); otherwise the first incomplete step opens.
 */
export function openStep(draft: CheckoutDraft, edit?: CheckoutStep): CheckoutStep {
  const first = firstIncomplete(draft);
  return edit !== undefined && indexOf(edit) <= indexOf(first) ? edit : first;
}

/** Status of every step, in order. Steps after the open one are done only if saved. */
export function stepStatuses(
  draft: CheckoutDraft,
  edit?: CheckoutStep,
): readonly { readonly step: CheckoutStep; readonly status: StepStatus }[] {
  const open = openStep(draft, edit);
  const first = firstIncomplete(draft);
  return CHECKOUT_STEPS.map((step) => ({
    step,
    status:
      step === open
        ? 'open'
        : indexOf(step) < indexOf(first) && step !== 'review'
          ? 'done'
          : 'locked',
  }));
}

/** True when every step before review is saved, so the order can be placed. */
export const readyToPlace = (draft: CheckoutDraft): boolean => firstIncomplete(draft) === 'review';

/** Normalizes a US postal code (`12345` or `12345-6789`), or undefined when invalid. */
export function normalizePostalCode(input: string): string | undefined {
  const digits = input.replace(/[\s-]/g, '');
  if (/^\d{5}$/.test(digits)) return digits;
  if (/^\d{9}$/.test(digits)) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return undefined;
}

/** One line per address part, for summaries (empty parts skipped). */
export const addressLines = (
  a: Omit<Address, 'state'> & { readonly state: string },
): readonly string[] =>
  [a.name, a.line1, a.line2, `${a.city}, ${a.state} ${a.postalCode}`, a.phone].filter(
    (line) => line.trim() !== '',
  );

const BRAND_NAMES: Readonly<Record<CardBrand, string>> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  discover: 'Discover',
};

export const cardLabel = (card: Pick<SavedCard, 'brand' | 'last4' | 'expMonth' | 'expYear'>) =>
  `${BRAND_NAMES[card.brand]} ending ${card.last4}, expires ${String(card.expMonth).padStart(2, '0')}/${String(card.expYear % 100).padStart(2, '0')}`;
