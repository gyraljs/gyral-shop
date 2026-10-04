// Order state machine (docs/design-docs/0003-money-and-pricing.md, product-specs/orders.md).
import { add, format, subtract, usd, type Money } from './money.js';
import { err, ok, type Result } from './result.js';

export type OrderStatus =
  | 'pending_payment'
  | 'paid'
  | 'fulfilled'
  | 'delivered'
  | 'cancelled'
  | 'partially_refunded'
  | 'refunded';

export interface OrderState {
  readonly status: OrderStatus;
  readonly total: Money;
  readonly refunded: Money;
}

export type OrderEvent =
  | { readonly _tag: 'Pay' }
  | { readonly _tag: 'Fulfil' }
  | { readonly _tag: 'Deliver' }
  | { readonly _tag: 'Cancel' }
  | { readonly _tag: 'Refund'; readonly amount: Money };

/** Side effects a transition requires; the services layer performs them. */
export type OrderEffect = 'release_stock' | 'refund_payment';

export interface Transition {
  readonly state: OrderState;
  readonly effects: readonly OrderEffect[];
}

export type TransitionError =
  | {
      readonly _tag: 'InvalidTransition';
      readonly from: OrderStatus;
      readonly event: OrderEvent['_tag'];
    }
  | { readonly _tag: 'InvalidRefundAmount'; readonly amount: Money; readonly refundable: Money };

const REFUNDABLE: ReadonlySet<OrderStatus> = new Set([
  'paid',
  'fulfilled',
  'delivered',
  'partially_refunded',
]);

export const newOrder = (total: Money): OrderState => ({
  status: 'pending_payment',
  total,
  refunded: usd(0),
});

export const refundable = (order: OrderState): Money =>
  REFUNDABLE.has(order.status) ? subtract(order.total, order.refunded) : usd(0);

const invalid = (order: OrderState, event: OrderEvent): Result<never, TransitionError> =>
  err({ _tag: 'InvalidTransition', from: order.status, event: event._tag });

const to = (order: OrderState, status: OrderStatus, effects: readonly OrderEffect[] = []) =>
  ok({ state: { ...order, status }, effects });

export function transition(
  order: OrderState,
  event: OrderEvent,
): Result<Transition, TransitionError> {
  switch (event._tag) {
    case 'Pay':
      return order.status === 'pending_payment' ? to(order, 'paid') : invalid(order, event);
    case 'Fulfil':
      return order.status === 'paid' ? to(order, 'fulfilled') : invalid(order, event);
    case 'Deliver':
      return order.status === 'fulfilled' ? to(order, 'delivered') : invalid(order, event);
    case 'Cancel':
      if (order.status === 'pending_payment') return to(order, 'cancelled', ['release_stock']);
      if (order.status === 'paid') {
        return ok({
          state: { ...order, status: 'cancelled', refunded: order.total },
          effects: ['release_stock', 'refund_payment'],
        });
      }
      return invalid(order, event);
    case 'Refund': {
      if (!REFUNDABLE.has(order.status)) return invalid(order, event);
      const left = refundable(order);
      if (event.amount.cents <= 0 || event.amount.cents > left.cents) {
        return err({ _tag: 'InvalidRefundAmount', amount: event.amount, refundable: left });
      }
      const refunded = add(order.refunded, event.amount);
      const status = refunded.cents === order.total.cents ? 'refunded' : 'partially_refunded';
      return ok({ state: { ...order, status, refunded }, effects: ['refund_payment'] });
    }
  }
}

/** Events valid from a status (drives admin buttons). Refund also needs an amount check. */
export function allowedEvents(status: OrderStatus): readonly OrderEvent['_tag'][] {
  const probe: OrderState = { status, total: usd(100), refunded: usd(0) };
  const events: OrderEvent[] = [
    { _tag: 'Pay' },
    { _tag: 'Fulfil' },
    { _tag: 'Deliver' },
    { _tag: 'Cancel' },
    { _tag: 'Refund', amount: usd(1) },
  ];
  return events.filter((e) => transition(probe, e).ok).map((e) => e._tag);
}

/** Customers may cancel until the order ships. */
export const customerCanCancel = (status: OrderStatus): boolean =>
  status === 'pending_payment' || status === 'paid';

export function transitionErrorMessage(error: TransitionError): string {
  switch (error._tag) {
    case 'InvalidTransition':
      return `An order that is ${error.from.replaceAll('_', ' ')} can't take "${error.event}".`;
    case 'InvalidRefundAmount':
      return `Refund must be between $0.01 and ${format(error.refundable)}.`;
  }
}
