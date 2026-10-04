// The mock payment provider (docs/product-specs/payments.md): the shape of a real one
// (create intent → confirm → capture; refund), persisted in `payments`. Rules are pure in
// src/domain/payments.ts; this module loads, applies and saves.
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { testCardOutcome, validateCard, type CardInput, type CardIssue } from '../domain/cards.js';
import { usd, type Money } from '../domain/money.js';
import {
  afterFailedConfirm,
  capture as captureRule,
  confirm as confirmRule,
  newPayment,
  outcomeOf,
  refund as refundRule,
  type PaymentError,
  type PaymentState,
  type PaymentStatus,
} from '../domain/payments.js';
import { err, ok, type Result } from '../domain/result.js';
import type { Db } from '../db/client.js';
import { payments } from '../db/schema.js';

/** What callers see. Never contains card digits. */
export interface Payment {
  readonly ref: string;
  readonly status: PaymentStatus;
  readonly amount: Money;
  readonly refunded: Money;
  readonly brand: string;
  readonly last4: string;
  readonly expMonth: number;
  readonly expYear: number;
  readonly orderId: number | null;
}

export type ProviderError =
  | PaymentError
  | { readonly _tag: 'CardInvalid'; readonly issues: readonly CardIssue[] }
  | { readonly _tag: 'NotFound'; readonly ref: string }
  | { readonly _tag: 'IdempotencyConflict'; readonly key: string };

export interface PaymentProvider {
  readonly createIntent: (input: {
    readonly amount: Money;
    readonly card: CardInput;
    readonly orderId?: number;
  }) => Promise<Result<Payment, ProviderError>>;
  /** Authorizes. Repeating a settled confirm with the same key returns the same result. */
  readonly confirm: (
    ref: string,
    options: { readonly idempotencyKey: string },
  ) => Promise<Result<Payment, ProviderError>>;
  readonly capture: (ref: string) => Promise<Result<Payment, ProviderError>>;
  /** Refunds `amount`, or everything still refundable when omitted. */
  readonly refund: (ref: string, amount?: Money) => Promise<Result<Payment, ProviderError>>;
  readonly get: (ref: string) => Promise<Payment | undefined>;
}

export interface PaymentOptions {
  /** Artificial latency per provider call (config PAYMENT_LATENCY_MS). Default 0. */
  readonly latencyMs?: number;
  readonly now?: () => Date;
  readonly newRef?: () => string;
}

type Row = typeof payments.$inferSelect;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const toPayment = (row: Row): Payment => ({
  ref: row.providerRef,
  status: row.status,
  amount: usd(row.amountCents),
  refunded: usd(row.refundedCents),
  brand: row.brand,
  last4: row.last4,
  expMonth: row.expMonth,
  expYear: row.expYear,
  orderId: row.orderId,
});

const toState = (row: Row): PaymentState => ({
  status: row.status,
  amount: usd(row.amountCents),
  refunded: usd(row.refundedCents),
  outcome: row.outcome,
  attempts: row.attempts,
  ...(row.failureCode === 'card_declined' || row.failureCode === 'insufficient_funds'
    ? { failureCode: row.failureCode }
    : {}),
});

const stateColumns = (state: PaymentState) => ({
  status: state.status,
  refundedCents: state.refunded.cents,
  attempts: state.attempts,
  failureCode: state.failureCode ?? null,
});

/** The error a settled payment stands for, so an idempotent retry repeats it. */
const settledError = (row: Row): PaymentError | undefined =>
  row.status === 'failed' &&
  (row.failureCode === 'card_declined' || row.failureCode === 'insufficient_funds')
    ? { _tag: 'Declined', reason: row.failureCode }
    : undefined;

export function createPaymentProvider(db: Db, options: PaymentOptions = {}): PaymentProvider {
  const latency = options.latencyMs ?? 0;
  const now = options.now ?? (() => new Date());
  const newRef = options.newRef ?? (() => `pi_${randomBytes(12).toString('hex')}`);
  const pause = () =>
    latency === 0 ? Promise.resolve() : new Promise((done) => setTimeout(done, latency));

  const load = async (tx: Db | Tx, ref: string) =>
    (await tx.select().from(payments).where(eq(payments.providerRef, ref)))[0];

  /** Loads, applies a pure rule and saves, in one transaction. */
  const apply = async (
    ref: string,
    rule: (state: PaymentState) => Result<PaymentState, PaymentError>,
  ): Promise<Result<Payment, ProviderError>> => {
    await pause();
    return db.transaction(async (tx) => {
      const row = await load(tx, ref);
      if (row === undefined) return err({ _tag: 'NotFound', ref });
      const next = rule(toState(row));
      if (!next.ok) return next;
      const [saved] = await tx
        .update(payments)
        .set(stateColumns(next.value))
        .where(eq(payments.id, row.id))
        .returning();
      return saved === undefined ? err({ _tag: 'NotFound', ref }) : ok(toPayment(saved));
    });
  };

  return {
    createIntent: async ({ amount, card, orderId }) => {
      await pause();
      const valid = validateCard(card, now());
      if (!valid.ok) return err({ _tag: 'CardInvalid', issues: valid.error });
      const state = newPayment(amount, outcomeOf(testCardOutcome(valid.value.digits)));
      const [row] = await db
        .insert(payments)
        .values({
          providerRef: newRef(),
          orderId: orderId ?? null,
          amountCents: amount.cents,
          brand: valid.value.brand,
          last4: valid.value.last4,
          expMonth: valid.value.expMonth,
          expYear: valid.value.expYear,
          outcome: state.outcome,
          ...stateColumns(state),
        })
        .returning();
      if (row === undefined) throw new Error('payments insert returned no row');
      return ok(toPayment(row));
    },

    confirm: async (ref, { idempotencyKey }) => {
      await pause();
      return db.transaction(async (tx) => {
        const row = await load(tx, ref);
        if (row === undefined) return err({ _tag: 'NotFound', ref });
        const [holder] = await tx
          .select({ ref: payments.providerRef })
          .from(payments)
          .where(eq(payments.idempotencyKey, idempotencyKey));
        if (holder !== undefined && holder.ref !== ref) {
          return err({ _tag: 'IdempotencyConflict', key: idempotencyKey });
        }
        if (row.idempotencyKey === idempotencyKey) {
          // A retry of a settled confirm: answer as the first time, change nothing.
          const previous = settledError(row);
          return previous === undefined ? ok(toPayment(row)) : err(previous);
        }
        const state = toState(row);
        const result = confirmRule(state);
        const next = result.ok ? result.value : afterFailedConfirm(state, result.error);
        // Processing errors are not settled: a retry with the same key tries again.
        const settles = result.ok || result.error._tag === 'Declined';
        const [saved] = await tx
          .update(payments)
          .set({ ...stateColumns(next), ...(settles ? { idempotencyKey } : {}) })
          .where(eq(payments.id, row.id))
          .returning();
        if (!result.ok) return err(result.error);
        return saved === undefined ? err({ _tag: 'NotFound', ref }) : ok(toPayment(saved));
      });
    },

    capture: (ref) => apply(ref, captureRule),
    refund: (ref, amount) => apply(ref, (state) => refundRule(state, amount)),
    get: async (ref) => {
      const row = await load(db, ref);
      return row === undefined ? undefined : toPayment(row);
    },
  };
}
