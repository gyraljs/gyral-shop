// Placing an order (docs/product-specs/checkout.md, "Place order"): re-price on the server,
// reserve stock and promo usage atomically, charge the saved payment intent, then complete
// the order, clear the cart and send the confirmation. A failed charge releases everything
// reserved, so a failure never leaves a half-placed order. Idempotent per place-order key.
import { randomInt } from 'node:crypto';
import { cartLineRows } from '../db/repos/cart.js';
import { saveCheckout } from '../db/repos/checkout.js';
import {
  completeOrder,
  findOrderByKey,
  releaseOrder,
  reserveOrder,
  ReservationRejected,
  type NewOrderLine,
  type OrderRow,
  type ReserveFailure,
} from '../db/repos/orders.js';
import { lockedWrite, writeTransaction } from '../db/tx.js';
import { readyToPlace } from '../domain/checkout.js';
import { format, usd, type Money } from '../domain/money.js';
import { newOrder, transition } from '../domain/orders.js';
import { paymentErrorMessage } from '../domain/payments.js';
import { err, ok, type Result } from '../domain/result.js';
import { loadCheckout, type CheckoutBlock, type Shopper } from './checkout.js';
import type { Services } from './container.js';
import { orderConfirmationMail } from './mail.js';
import { sign } from './signing.js';

export type PlaceError =
  | { readonly _tag: 'CartBlocked'; readonly block: CheckoutBlock['_tag'] }
  | { readonly _tag: 'NotReady' }
  /** The checkout changed since the review page was rendered (new card, other cart). */
  | { readonly _tag: 'Stale' }
  | { readonly _tag: 'TotalChanged'; readonly total: Money }
  | {
      readonly _tag: 'OutOfStock';
      readonly lines: readonly { readonly name: string; readonly available: number }[];
    }
  | { readonly _tag: 'PromoExhausted'; readonly code: string }
  | { readonly _tag: 'PaymentDeclined'; readonly message: string }
  | { readonly _tag: 'PaymentRetry'; readonly message: string }
  | { readonly _tag: 'PaymentFailed'; readonly message: string };

export interface PlacedOrder {
  readonly id: number;
  readonly number: string;
}

export interface PlaceInput {
  /** The review page's place-order key (see placeKey). */
  readonly key: string;
  /** The total the customer saw on the review page, in cents. */
  readonly expectedTotalCents?: number;
  /** Absolute origin for links in the confirmation email. */
  readonly origin: string;
}

/** Opaque, unguessable key for one cart paid with one payment intent. */
export const placeKey = (secret: string, cartId: number, paymentRef: string): string =>
  `pk_${sign(secret, `place:${String(cartId)}:${paymentRef}`)}`;

// Unambiguous characters for order numbers (no 0/O, 1/I/L).
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function newOrderNumber(now: Date): string {
  const day = now.toISOString().slice(0, 10).replaceAll('-', '');
  const suffix = Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  return `GG-${day}-${suffix}`;
}

const GENERIC = 'We couldn’t complete the payment. Please try again.';

/** A concurrent submit of the same key: wait for the first request to settle. */
async function settled(services: Services, key: string): Promise<OrderRow | undefined> {
  for (let i = 0; i < 100; i += 1) {
    const order = await findOrderByKey(services.db, key);
    if (order === undefined || order.status !== 'pending_payment') return order;
    await new Promise((done) => setTimeout(done, 50));
  }
  return findOrderByKey(services.db, key);
}

async function fromExisting(
  services: Services,
  key: string,
): Promise<Result<PlacedOrder, PlaceError> | undefined> {
  const existing = await findOrderByKey(services.db, key);
  if (existing === undefined) return undefined;
  const order = existing.status === 'pending_payment' ? await settled(services, key) : existing;
  if (order === undefined) return err({ _tag: 'PaymentFailed', message: GENERIC });
  return order.status === 'pending_payment'
    ? err({ _tag: 'PaymentRetry', message: 'Your order is still being placed. Try again.' })
    : ok({ id: order.id, number: order.number });
}

const labelOf = (options: Readonly<Record<string, string>>): string =>
  Object.values(options).join(' / ');

export async function placeOrder(
  services: Services,
  shopper: Shopper,
  input: PlaceInput,
  newNumber: (now: Date) => string = newOrderNumber,
): Promise<Result<PlacedOrder, PlaceError>> {
  const { db, mailer } = services;
  const now = services.now();
  // A repeated submit (double click, back-and-resubmit) finds its order: the cart may be gone.
  const repeat = await fromExisting(services, input.key);
  if (repeat !== undefined) return repeat;

  const loaded = await loadCheckout(db, shopper, now);
  if (!loaded.ok) return err({ _tag: 'CartBlocked', block: loaded.error._tag });
  const state = loaded.value;
  const { draft, breakdown } = state;
  const card = draft.card;
  if (!readyToPlace(draft) || card === undefined || draft.address === undefined) {
    return err({ _tag: 'NotReady' });
  }
  if (draft.email === undefined || draft.shippingMethod === undefined) {
    return err({ _tag: 'NotReady' });
  }
  const email = draft.email;
  const address = draft.address;
  const shippingMethod = draft.shippingMethod;
  if (placeKey(services.secret, state.cartId, card.paymentRef) !== input.key) {
    return err({ _tag: 'Stale' });
  }
  if (
    input.expectedTotalCents !== undefined &&
    input.expectedTotalCents !== breakdown.total.cents
  ) {
    return err({ _tag: 'TotalChanged', total: breakdown.total });
  }

  const rows = await cartLineRows(db, state.cartId);
  const bySku = new Map(rows.map((r) => [r.sku, r]));
  const lines: NewOrderLine[] = breakdown.lines.flatMap((line) => {
    const row = bySku.get(line.sku);
    return row === undefined
      ? []
      : [
          {
            variantId: row.variantId,
            productName: row.productName,
            variantLabel: labelOf(row.options),
            unitPriceCents: line.unit.cents,
            quantity: line.qty,
            lineTotalCents: line.lineSubtotal.cents,
          },
        ];
  });
  const status = transition(newOrder(breakdown.total), { _tag: 'Pay' });
  if (!status.ok) throw new Error('order state machine refused Pay from pending_payment');

  let order: OrderRow;
  try {
    const reserved = await writeTransaction(db, async (tx) => {
      // Re-checked inside the transaction: a concurrent submit may have just committed.
      const raced = await findOrderByKey(tx, input.key);
      if (raced !== undefined) return { raced };
      const created = await reserveOrder(
        tx,
        {
          number: newNumber(now),
          idempotencyKey: input.key,
          userId: shopper.member?.id ?? null,
          email,
          shippingAddress: address,
          shippingMethod,
          subtotalCents: breakdown.subtotal.cents,
          discountCents: breakdown.discount.cents,
          shippingCents: breakdown.shipping.cents,
          taxCents: breakdown.tax.cents,
          totalCents: breakdown.total.cents,
          promoCode: breakdown.promo?.code ?? null,
          lines,
        },
        now,
      );
      return { created };
    });
    if ('raced' in reserved)
      return (await fromExisting(services, input.key)) ?? err({ _tag: 'NotReady' });
    order = reserved.created;
  } catch (error) {
    if (error instanceof ReservationRejected) return err(reservationError(error.failure, rows));
    throw error;
  }

  const release = async () => {
    await writeTransaction(db, (tx) => releaseOrder(tx, order, now));
  };
  const charged = await charge(services, card.paymentRef, breakdown.total, input.key);
  if (!charged.ok) {
    await release();
    if (charged.error._tag === 'PaymentDeclined') {
      // A declined intent can't be retried: the customer enters a card again.
      await lockedWrite(db, () =>
        saveCheckout(
          db,
          state.cartId,
          {
            paymentRef: null,
            cardBrand: null,
            cardLast4: null,
            cardExpMonth: null,
            cardExpYear: null,
          },
          now,
        ),
      );
    }
    return charged;
  }

  await writeTransaction(db, (tx) =>
    completeOrder(
      tx,
      {
        orderId: order.id,
        status: status.value.state.status === 'paid' ? 'paid' : 'pending_payment',
        paymentRef: card.paymentRef,
        cartId: state.cartId,
      },
      now,
    ),
  );

  try {
    const message = orderConfirmationMail({
      to: email,
      name: address.name,
      orderNumber: order.number,
      orderUrl: `${input.origin}/order/${order.number}/confirmation`,
      lines: lines.map((l) => ({
        name: l.productName,
        ...(l.variantLabel === '' ? {} : { variant: l.variantLabel }),
        quantity: l.quantity,
        lineTotal: usd(l.lineTotalCents),
      })),
      totals: breakdown,
    });
    await lockedWrite(db, () => mailer.send(message));
  } catch (error) {
    // The order is placed and paid; a mail failure must not undo that.
    console.error(`order ${order.number}: confirmation email failed`, error);
  }
  return ok({ id: order.id, number: order.number });
}

/** Brings the intent to the order total, then confirms and captures it. */
async function charge(
  services: Services,
  ref: string,
  total: Money,
  key: string,
): Promise<Result<undefined, PlaceError>> {
  const { payments } = services;
  const intent = await payments.get(ref);
  if (intent === undefined) return err({ _tag: 'PaymentFailed', message: GENERIC });
  if (intent.status === 'requires_confirmation' && intent.amount.cents !== total.cents) {
    const updated = await payments.updateAmount(ref, total);
    if (!updated.ok) return err({ _tag: 'PaymentFailed', message: GENERIC });
  }
  const confirmed = await payments.confirm(ref, { idempotencyKey: key });
  if (!confirmed.ok) {
    const error = confirmed.error;
    switch (error._tag) {
      case 'Declined':
        return err({ _tag: 'PaymentDeclined', message: paymentErrorMessage(error) });
      case 'ProcessingError':
        return err({ _tag: 'PaymentRetry', message: paymentErrorMessage(error) });
      default:
        return err({ _tag: 'PaymentFailed', message: GENERIC });
    }
  }
  const captured = await payments.capture(ref);
  return captured.ok ? ok(undefined) : err({ _tag: 'PaymentFailed', message: GENERIC });
}

function reservationError(
  failure: ReserveFailure,
  rows: readonly { readonly variantId: number; readonly productName: string }[],
): PlaceError {
  if (failure._tag === 'PromoExhausted') return { _tag: 'PromoExhausted', code: failure.code };
  const names = new Map(rows.map((r) => [r.variantId, r.productName]));
  return {
    _tag: 'OutOfStock',
    lines: failure.shortages.map((s) => ({
      name: names.get(s.variantId) ?? 'An item',
      available: s.available,
    })),
  };
}

/** One customer-facing sentence per failure (flash messages on the PRG redirect). */
export function placeErrorMessage(error: PlaceError): string {
  switch (error._tag) {
    case 'CartBlocked':
      return 'Your cart changed. Check it before placing your order.';
    case 'NotReady':
      return 'Complete every checkout step before placing your order.';
    case 'Stale':
      return 'Your checkout changed. Review it and place your order again.';
    case 'TotalChanged':
      return `Your total changed to ${format(error.total)}. Review it and place your order again.`;
    case 'OutOfStock':
      return `Some items sold out while you were checking out: ${error.lines
        .map((l) => `${l.name} (${String(l.available)} left)`)
        .join(', ')}. Your cart has been kept.`;
    case 'PromoExhausted':
      return `Promo code ${error.code} has reached its usage limit. Review your total and place your order again.`;
    case 'PaymentDeclined':
    case 'PaymentRetry':
    case 'PaymentFailed':
      return error.message;
  }
}
