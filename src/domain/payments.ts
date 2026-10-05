// The mock payment provider's state machine (docs/product-specs/payments.md). Pure: the
// service in src/services/payments.ts loads a payment, applies one of these, and saves it.
import { subtract, usd, type Money } from './money.js';
import { err, ok, type Result } from './result.js';
import type { ChargeOutcome } from './cards.js';

export type PaymentStatus =
  | 'requires_confirmation'
  | 'requires_capture'
  | 'succeeded'
  | 'failed'
  | 'refunded'
  | 'partially_refunded';

/** What confirm will do, decided from the card number when the intent is created. */
export type PaymentOutcome =
  'succeed' | 'card_declined' | 'insufficient_funds' | 'processing_error';

export const outcomeOf = (charge: ChargeOutcome): PaymentOutcome => {
  switch (charge._tag) {
    case 'Succeeded':
      return 'succeed';
    case 'Declined':
      return charge.reason;
    case 'ProcessingError':
      return 'processing_error';
  }
};

export interface PaymentState {
  readonly status: PaymentStatus;
  readonly amount: Money;
  readonly refunded: Money;
  readonly outcome: PaymentOutcome;
  readonly attempts: number;
  readonly failureCode?: 'card_declined' | 'insufficient_funds';
}

export type PaymentError =
  | { readonly _tag: 'Declined'; readonly reason: 'card_declined' | 'insufficient_funds' }
  | { readonly _tag: 'ProcessingError'; readonly retryable: true }
  | { readonly _tag: 'InvalidState'; readonly action: string; readonly status: PaymentStatus }
  | { readonly _tag: 'InvalidAmount' }
  | { readonly _tag: 'ExceedsRefundable'; readonly refundable: Money };

export const newPayment = (amount: Money, outcome: PaymentOutcome): PaymentState => ({
  status: 'requires_confirmation',
  amount,
  refunded: usd(0),
  outcome,
  attempts: 0,
});

/** Confirm authorizes the card. A processing error is transient: the next attempt succeeds. */
export function confirm(state: PaymentState): Result<PaymentState, PaymentError> {
  if (state.status !== 'requires_confirmation') {
    return err({ _tag: 'InvalidState', action: 'confirm', status: state.status });
  }
  const attempts = state.attempts + 1;
  switch (state.outcome) {
    case 'succeed':
      return ok({ ...state, attempts, status: 'requires_capture' });
    case 'processing_error':
      return attempts === 1
        ? err({ _tag: 'ProcessingError', retryable: true })
        : ok({ ...state, attempts, status: 'requires_capture' });
    case 'card_declined':
    case 'insufficient_funds':
      return err({ _tag: 'Declined', reason: state.outcome });
  }
}

/** The state a failed confirm leaves behind (declines are final; processing errors are not). */
export function afterFailedConfirm(state: PaymentState, error: PaymentError): PaymentState {
  if (error._tag === 'Declined') {
    return { ...state, attempts: state.attempts + 1, status: 'failed', failureCode: error.reason };
  }
  return error._tag === 'ProcessingError' ? { ...state, attempts: state.attempts + 1 } : state;
}

/**
 * Changes the amount before confirmation (the order total moved after the card was entered:
 * a new address changed the tax, or a promo stopped applying). Like a real provider, only an
 * unconfirmed intent can change.
 */
export function updateAmount(
  state: PaymentState,
  amount: Money,
): Result<PaymentState, PaymentError> {
  if (state.status !== 'requires_confirmation') {
    return err({ _tag: 'InvalidState', action: 'update', status: state.status });
  }
  return amount.cents > 0 ? ok({ ...state, amount }) : err({ _tag: 'InvalidAmount' });
}

export function capture(state: PaymentState): Result<PaymentState, PaymentError> {
  return state.status === 'requires_capture'
    ? ok({ ...state, status: 'succeeded' })
    : err({ _tag: 'InvalidState', action: 'capture', status: state.status });
}

export const refundableAmount = (state: PaymentState): Money =>
  state.status === 'succeeded' || state.status === 'partially_refunded'
    ? subtract(state.amount, state.refunded)
    : usd(0);

/** Refunds `amount`, or everything still refundable when omitted. */
export function refund(state: PaymentState, amount?: Money): Result<PaymentState, PaymentError> {
  if (state.status !== 'succeeded' && state.status !== 'partially_refunded') {
    return err({ _tag: 'InvalidState', action: 'refund', status: state.status });
  }
  const refundable = refundableAmount(state);
  const requested = amount ?? refundable;
  if (requested.cents <= 0) return err({ _tag: 'InvalidAmount' });
  if (requested.cents > refundable.cents) return err({ _tag: 'ExceedsRefundable', refundable });
  const refunded = usd(state.refunded.cents + requested.cents);
  const status = refunded.cents === state.amount.cents ? 'refunded' : 'partially_refunded';
  return ok({ ...state, refunded, status });
}

export function paymentErrorMessage(error: PaymentError): string {
  switch (error._tag) {
    case 'Declined':
      return error.reason === 'insufficient_funds'
        ? 'Your card has insufficient funds. Try another card.'
        : 'Your card was declined. Try another card.';
    case 'ProcessingError':
      return 'We could not process the payment. Please try again.';
    case 'InvalidState':
      return `This payment can't be ${error.action}ed now (it is ${error.status.replace(/_/g, ' ')}).`;
    case 'InvalidAmount':
      return 'Enter an amount greater than zero.';
    case 'ExceedsRefundable':
      return 'That is more than the amount left to refund.';
  }
}
