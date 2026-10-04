import { describe, expect, it } from 'vitest';
import { usd } from './money.js';
import {
  allowedEvents,
  customerCanCancel,
  newOrder,
  refundable,
  transition,
  transitionErrorMessage,
  type OrderEvent,
  type OrderState,
  type OrderStatus,
} from './orders.js';

const STATUSES: readonly OrderStatus[] = [
  'pending_payment',
  'paid',
  'fulfilled',
  'delivered',
  'cancelled',
  'partially_refunded',
  'refunded',
];

const run = (state: OrderState, ...events: OrderEvent[]): OrderState =>
  events.reduce((s, e) => {
    const r = transition(s, e);
    if (!r.ok) throw new Error(`${e._tag} from ${s.status}: ${r.error._tag}`);
    return r.value.state;
  }, state);

describe('order state machine', () => {
  it('follows the happy path', () => {
    const s = run(newOrder(usd(5000)), { _tag: 'Pay' }, { _tag: 'Fulfil' }, { _tag: 'Deliver' });
    expect(s.status).toBe('delivered');
  });

  it('allows exactly these transitions (exhaustive table)', () => {
    expect(Object.fromEntries(STATUSES.map((s) => [s, allowedEvents(s)]))).toEqual({
      pending_payment: ['Pay', 'Cancel'],
      paid: ['Fulfil', 'Cancel', 'Refund'],
      fulfilled: ['Deliver', 'Refund'],
      delivered: ['Refund'],
      cancelled: [],
      partially_refunded: ['Refund'],
      refunded: [],
    });
  });

  it('describes the side effects of cancelling', () => {
    const unpaid = transition(newOrder(usd(5000)), { _tag: 'Cancel' });
    expect(unpaid.ok && unpaid.value.effects).toEqual(['release_stock']);
    const paid = transition(run(newOrder(usd(5000)), { _tag: 'Pay' }), { _tag: 'Cancel' });
    expect(paid.ok && paid.value.effects).toEqual(['release_stock', 'refund_payment']);
    expect(paid.ok && paid.value.state.refunded.cents).toBe(5000);
  });

  it('refunds partially, then fully, and never more than was paid', () => {
    const paid = run(newOrder(usd(5000)), { _tag: 'Pay' }, { _tag: 'Fulfil' });
    const partial = run(paid, { _tag: 'Refund', amount: usd(2000) });
    expect([partial.status, refundable(partial).cents]).toEqual(['partially_refunded', 3000]);
    const over = transition(partial, { _tag: 'Refund', amount: usd(3001) });
    expect(over.ok ? undefined : over.error._tag).toBe('InvalidRefundAmount');
    expect(transition(partial, { _tag: 'Refund', amount: usd(0) }).ok).toBe(false);
    const full = run(partial, { _tag: 'Refund', amount: usd(3000) });
    expect([full.status, refundable(full).cents]).toEqual(['refunded', 0]);
  });

  it('rejects invalid moves with a readable message', () => {
    const r = transition(newOrder(usd(1)), { _tag: 'Deliver' });
    expect(r.ok ? undefined : transitionErrorMessage(r.error)).toBe(
      'An order that is pending payment can\'t take "Deliver".',
    );
  });

  it('lets customers cancel only before fulfilment', () => {
    expect(STATUSES.filter(customerCanCancel)).toEqual(['pending_payment', 'paid']);
  });
});
