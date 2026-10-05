import { describe, expect, it } from 'vitest';
import { usd } from '../domain/money.js';
import { newOrder, transition, type OrderState } from '../domain/orders.js';
import { ORDER_STATUSES } from './schema/commerce.js';

describe('orders.status column', () => {
  it('accepts every status the domain state machine reaches', () => {
    const reached = new Set<string>();
    const walk = (state: OrderState, depth: number): void => {
      reached.add(state.status);
      if (depth === 0) return;
      for (const event of [
        { _tag: 'Pay' },
        { _tag: 'Fulfil' },
        { _tag: 'Deliver' },
        { _tag: 'Cancel' },
        { _tag: 'Refund', amount: usd(100) },
        { _tag: 'Refund', amount: state.total },
      ] as const) {
        const next = transition(state, event);
        if (next.ok) walk(next.value.state, depth - 1);
      }
    };
    walk(newOrder(usd(1000)), 5);
    expect(reached).toContain('partially_refunded');
    for (const status of reached) expect(ORDER_STATUSES).toContain(status);
  });
});
