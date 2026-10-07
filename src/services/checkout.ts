// Checkout use-cases (docs/product-specs/checkout.md): load the priced checkout for a cart and
// save each step. Placing the order (charge, reserve stock, create the order, email) is
// services/orders.ts; this module ends at a draft that is ready to place.
import { cartLineRows, findPromo, findSessionCart, findUserCart } from '../db/repos/cart.js';
import { addAddress, findAddress, listAddresses } from '../db/repos/addresses.js';
import { findCheckout, saveCheckout, type CheckoutRow } from '../db/repos/checkout.js';
import type { Db } from '../db/client.js';
import { validateCard, type CardBrand, type CardInput } from '../domain/cards.js';
import {
  firstIncomplete,
  normalizePostalCode,
  type Address,
  type CheckoutDraft,
  type SavedCard,
} from '../domain/checkout.js';
import { subtract } from '../domain/money.js';
import { priceOrder, type Breakdown } from '../domain/pricing.js';
import { err, ok, type Result } from '../domain/result.js';
import {
  isShippingMethod,
  shippingOptions,
  type ShippingMethod,
  type ShippingOption,
} from '../domain/shipping.js';
import { isStateCode } from '../domain/tax.js';
import type { CartOwner } from './cart.js';
import { promoFromRow } from '../db/mapping.js';
import { buildCartView, priceLines, type CartView } from './cart-view.js';
import type { PaymentProvider } from './payments.js';

/** Who is checking out. Members pay with their account email and may use saved addresses. */
export interface Shopper {
  readonly owner: CartOwner;
  readonly member?: { readonly id: number; readonly email: string };
}

export type CheckoutBlock = { readonly _tag: 'EmptyCart' } | { readonly _tag: 'CartHasIssues' };

export interface SavedAddressView extends Address {
  readonly id: number;
  readonly isDefault: boolean;
}

export interface CheckoutState {
  readonly cartId: number;
  readonly cart: CartView;
  readonly draft: CheckoutDraft;
  /** Priced with the chosen method (Standard until chosen) and the address's state tax. */
  readonly breakdown: Breakdown;
  readonly shippingOptions: readonly ShippingOption[];
  readonly savedAddresses: readonly SavedAddressView[];
  readonly memberEmail: string | undefined;
}

/** A step was rejected; issues use form field names as paths ('' for the whole form). */
export interface StepRejection {
  readonly issues: readonly { readonly path: string; readonly message: string }[];
}

const reject = (message: string, path = ''): Result<never, StepRejection> =>
  err({ issues: [{ path, message }] });

function asAddress(row: CheckoutRow['shippingAddress']): Address | undefined {
  if (row === null || !isStateCode(row.state)) return undefined;
  return { ...row, state: row.state };
}

const BRANDS: readonly CardBrand[] = ['visa', 'mastercard', 'amex', 'discover'];

function asCard(row: CheckoutRow): SavedCard | undefined {
  const { paymentRef, cardBrand, cardLast4, cardExpMonth, cardExpYear } = row;
  const brand = BRANDS.find((b) => b === cardBrand);
  if (
    paymentRef === null ||
    brand === undefined ||
    cardLast4 === null ||
    cardExpMonth === null ||
    cardExpYear === null
  ) {
    return undefined;
  }
  return { paymentRef, brand, last4: cardLast4, expMonth: cardExpMonth, expYear: cardExpYear };
}

export function draftFromRow(row: CheckoutRow | undefined, memberEmail?: string): CheckoutDraft {
  const email = row?.email ?? memberEmail;
  const address = row === undefined ? undefined : asAddress(row.shippingAddress);
  const method = row?.shippingMethod ?? undefined;
  const card = row === undefined ? undefined : asCard(row);
  return {
    ...(email === undefined ? {} : { email }),
    ...(address === undefined ? {} : { address }),
    ...(method === undefined || !isShippingMethod(method) ? {} : { shippingMethod: method }),
    ...(card === undefined ? {} : { card }),
  };
}

const cartOf = (db: Db, owner: CartOwner) =>
  owner.kind === 'member' ? findUserCart(db, owner.userId) : findSessionCart(db, owner.sessionId);

/** The priced checkout, or why the shopper must go back to the cart. */
export async function loadCheckout(
  db: Db,
  shopper: Shopper,
  now: Date,
): Promise<Result<CheckoutState, CheckoutBlock>> {
  const cart = await cartOf(db, shopper.owner);
  if (cart === undefined) return err({ _tag: 'EmptyCart' });
  const [rows, promoRow, row, saved] = await Promise.all([
    cartLineRows(db, cart.id),
    cart.promoCode === null ? undefined : findPromo(db, cart.promoCode),
    findCheckout(db, cart.id),
    shopper.member === undefined ? [] : listAddresses(db, shopper.member.id),
  ]);
  if (rows.length === 0) return err({ _tag: 'EmptyCart' });
  const promo = promoFromRow(promoRow);
  const promoCode = cart.promoCode ?? undefined;
  const cartView = buildCartView({ rows, promoCode, promo, now });
  if (!cartView.canCheckout) return err({ _tag: 'CartHasIssues' });

  const draft = draftFromRow(row, shopper.member?.email);
  const priced = priceOrder({
    lines: priceLines(rows),
    ...(promoCode === undefined ? {} : { promo: { code: promoCode, found: promo } }),
    shipping: draft.shippingMethod ?? 'standard',
    ...(draft.address === undefined ? {} : { destination: draft.address.state }),
    now,
  });
  // canCheckout guarantees every priced quantity is at least 1.
  if (!priced.ok) throw new Error(`checkout pricing failed for ${priced.error.sku}`);
  const breakdown = priced.value;
  return ok({
    cartId: cart.id,
    cart: cartView,
    draft,
    breakdown,
    // Free shipping is judged on the discounted merchandise subtotal (ADR 0003 addendum).
    shippingOptions: shippingOptions(subtract(breakdown.subtotal, breakdown.discount)),
    savedAddresses: saved.flatMap((a) => {
      const address = asAddress(a);
      return address === undefined ? [] : [{ ...address, id: a.id, isDefault: a.isDefault }];
    }),
    memberEmail: shopper.member?.email,
  });
}

export async function saveContact(
  db: Db,
  state: CheckoutState,
  email: string,
  now: Date,
): Promise<Result<undefined, StepRejection>> {
  await saveCheckout(db, state.cartId, { email }, now);
  return ok(undefined);
}

export interface AddressInput {
  /** A member's saved address, or a new address. */
  readonly choice: { readonly savedId: number } | { readonly address: Address };
  /** Members: also add a new address to their account. */
  readonly save: boolean;
}

export async function saveAddress(
  db: Db,
  state: CheckoutState,
  shopper: Shopper,
  input: AddressInput,
  now: Date,
): Promise<Result<undefined, StepRejection>> {
  let address: Address;
  if ('savedId' in input.choice) {
    const found =
      shopper.member === undefined
        ? undefined
        : asAddress((await findAddress(db, shopper.member.id, input.choice.savedId)) ?? null);
    if (found === undefined) return reject('Choose one of your saved addresses.', 'addressId');
    address = found;
  } else {
    const postalCode = normalizePostalCode(input.choice.address.postalCode);
    if (postalCode === undefined) return reject('Enter a 5-digit ZIP code.', 'postalCode');
    address = { ...input.choice.address, postalCode };
    if (input.save && shopper.member !== undefined) {
      await addAddress(db, shopper.member.id, address, false);
    }
  }
  await saveCheckout(db, state.cartId, { shippingAddress: address }, now);
  return ok(undefined);
}

export async function saveShipping(
  db: Db,
  state: CheckoutState,
  method: ShippingMethod,
  now: Date,
): Promise<Result<undefined, StepRejection>> {
  await saveCheckout(db, state.cartId, { shippingMethod: method }, now);
  return ok(undefined);
}

/**
 * Validates the card and creates a payment intent for the current total, the way a real
 * provider tokenizes a card: from here on only the reference, brand, last 4 and expiry exist.
 * Placing the order confirms that intent (updating its amount if the total changed).
 */
export async function savePayment(
  db: Db,
  state: CheckoutState,
  card: CardInput,
  payments: PaymentProvider,
  now: Date,
): Promise<Result<undefined, StepRejection>> {
  if (firstIncomplete(state.draft) === 'contact' || firstIncomplete(state.draft) === 'address') {
    return reject('Complete the earlier steps first.');
  }
  const valid = validateCard(card, now);
  if (!valid.ok) {
    return err({ issues: valid.error.map((i) => ({ path: i.field, message: i.message })) });
  }
  const intent = await payments.createIntent({ amount: state.breakdown.total, card });
  if (!intent.ok) {
    return intent.error._tag === 'CardInvalid'
      ? err({ issues: intent.error.issues.map((i) => ({ path: i.field, message: i.message })) })
      : reject('We couldn’t check this card. Please try again.');
  }
  const { ref, brand, last4, expMonth, expYear } = intent.value;
  await saveCheckout(
    db,
    state.cartId,
    {
      paymentRef: ref,
      cardBrand: brand,
      cardLast4: last4,
      cardExpMonth: expMonth,
      cardExpYear: expYear,
    },
    now,
  );
  return ok(undefined);
}
