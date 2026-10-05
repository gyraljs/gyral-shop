import { describe, expect, it } from 'vitest';
import { testCardOutcome } from './cards.js';
import { usd } from './money.js';
import {
  afterFailedConfirm,
  capture,
  confirm,
  newPayment,
  outcomeOf,
  refund,
  refundableAmount,
  updateAmount,
  type PaymentState,
} from './payments.js';

const paid = (cents = 1000): PaymentState => ({
  ...newPayment(usd(cents), 'succeed'),
  status: 'succeeded',
});

const value = <T>(r: { ok: true; value: T } | { ok: false }): T => {
  if (!r.ok) throw new Error('expected ok');
  return r.value;
};

describe('payment state machine', () => {
  it('maps every documented test card to an outcome', () => {
    expect(outcomeOf(testCardOutcome('4242424242424242'))).toBe('succeed');
    expect(outcomeOf(testCardOutcome('4000000000000002'))).toBe('card_declined');
    expect(outcomeOf(testCardOutcome('4000000000009995'))).toBe('insufficient_funds');
    expect(outcomeOf(testCardOutcome('4000000000000119'))).toBe('processing_error');
  });

  it('confirms then captures a good card', () => {
    const confirmed = value(confirm(newPayment(usd(500), 'succeed')));
    expect(confirmed.status).toBe('requires_capture');
    expect(value(capture(confirmed)).status).toBe('succeeded');
  });

  it('declines with a final failed state', () => {
    for (const reason of ['card_declined', 'insufficient_funds'] as const) {
      const start = newPayment(usd(500), reason);
      const result = confirm(start);
      expect(result).toEqual({ ok: false, error: { _tag: 'Declined', reason } });
      if (result.ok) continue;
      const failed = afterFailedConfirm(start, result.error);
      expect(failed).toMatchObject({ status: 'failed', failureCode: reason, attempts: 1 });
      expect(confirm(failed).ok).toBe(false);
    }
  });

  it('treats a processing error as transient: the retry succeeds', () => {
    const start = newPayment(usd(500), 'processing_error');
    const first = confirm(start);
    expect(first).toEqual({ ok: false, error: { _tag: 'ProcessingError', retryable: true } });
    if (first.ok) return;
    const retry = afterFailedConfirm(start, first.error);
    expect(retry.status).toBe('requires_confirmation');
    expect(value(confirm(retry)).status).toBe('requires_capture');
  });

  it('only captures an authorized payment', () => {
    expect(capture(newPayment(usd(1), 'succeed'))).toMatchObject({
      ok: false,
      error: { _tag: 'InvalidState', action: 'capture' },
    });
  });

  it('refunds partially, then fully, and never more than was paid', () => {
    const partial = value(refund(paid(1000), usd(300)));
    expect(partial).toMatchObject({ status: 'partially_refunded', refunded: usd(300) });
    expect(refundableAmount(partial)).toEqual(usd(700));
    expect(refund(partial, usd(701))).toEqual({
      ok: false,
      error: { _tag: 'ExceedsRefundable', refundable: usd(700) },
    });
    const full = value(refund(partial));
    expect(full).toMatchObject({ status: 'refunded', refunded: usd(1000) });
    expect(refund(full).ok).toBe(false);
    expect(refund(paid(), usd(0))).toEqual({ ok: false, error: { _tag: 'InvalidAmount' } });
  });

  it('never refunds an unpaid payment', () => {
    expect(refund(newPayment(usd(1000), 'succeed'))).toMatchObject({
      ok: false,
      error: { _tag: 'InvalidState', action: 'refund' },
    });
    expect(refundableAmount(newPayment(usd(1000), 'succeed'))).toEqual(usd(0));
  });

  it('keeps refunded ≤ amount for any sequence of refunds', () => {
    for (let total = 1; total <= 60; total += 7) {
      let state = paid(total);
      for (let step = 1; step <= 10; step += 1) {
        const next = refund(state, usd(step));
        if (next.ok) state = next.value;
        expect(state.refunded.cents).toBeLessThanOrEqual(total);
      }
    }
  });

  it('changes the amount only before confirmation, and only to a positive amount', () => {
    const fresh = newPayment(usd(1000), 'succeed');
    expect(value(updateAmount(fresh, usd(1250))).amount).toEqual(usd(1250));
    expect(updateAmount(fresh, usd(0))).toEqual({ ok: false, error: { _tag: 'InvalidAmount' } });
    const authorized = value(confirm(fresh));
    expect(updateAmount(authorized, usd(1250))).toEqual({
      ok: false,
      error: { _tag: 'InvalidState', action: 'update', status: 'requires_capture' },
    });
  });
});
