import { describe, expect, it } from 'vitest';
import { usd } from '../domain/money.js';
import { createTestDb } from '../db/client.js';
import { payments } from '../db/schema.js';
import { createPaymentProvider, type Payment } from './payments.js';

const NOW = new Date('2026-10-04T12:00:00Z');
const card = (number: string) => ({ number, expiry: '12/30', cvc: '123' });
const CARDS = {
  success: '4242 4242 4242 4242',
  declined: '4000 0000 0000 0002',
  insufficient: '4000 0000 0000 9995',
  processing: '4000 0000 0000 0119',
} as const;

async function setup() {
  const db = await createTestDb();
  let n = 0;
  const provider = createPaymentProvider(db, {
    now: () => NOW,
    newRef: () => `pi_test_${String((n += 1))}`,
  });
  const intent = async (number: string, cents = 2500): Promise<Payment> => {
    const created = await provider.createIntent({ amount: usd(cents), card: card(number) });
    if (!created.ok) throw new Error(`createIntent failed: ${created.error._tag}`);
    return created.value;
  };
  return { db, provider, intent };
}

const paidValue = <T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r.error)}`);
  return r.value;
};

describe('mock payment provider', () => {
  it('authorizes and captures the success card, storing only brand, last 4 and expiry', async () => {
    const { db, provider, intent } = await setup();
    const created = await intent(CARDS.success);
    expect(created).toMatchObject({
      status: 'requires_confirmation',
      brand: 'visa',
      last4: '4242',
      expMonth: 12,
      expYear: 2030,
    });
    const confirmed = paidValue(await provider.confirm(created.ref, { idempotencyKey: 'k1' }));
    expect(confirmed.status).toBe('requires_capture');
    expect(paidValue(await provider.capture(created.ref)).status).toBe('succeeded');
    const [row] = await db.select().from(payments);
    expect(JSON.stringify(row)).not.toContain('4242424242424242');
  });

  it.each([
    ['declined', CARDS.declined, 'card_declined'],
    ['insufficient funds', CARDS.insufficient, 'insufficient_funds'],
  ] as const)('fails the %s card for good', async (_label, number, reason) => {
    const { provider, intent } = await setup();
    const created = await intent(number);
    const result = await provider.confirm(created.ref, { idempotencyKey: 'k' });
    expect(result).toEqual({ ok: false, error: { _tag: 'Declined', reason } });
    expect((await provider.get(created.ref))?.status).toBe('failed');
    expect((await provider.confirm(created.ref, { idempotencyKey: 'other' })).ok).toBe(false);
  });

  it('fails the processing-error card once, then succeeds on retry with the same key', async () => {
    const { provider, intent } = await setup();
    const created = await intent(CARDS.processing);
    expect(await provider.confirm(created.ref, { idempotencyKey: 'k' })).toEqual({
      ok: false,
      error: { _tag: 'ProcessingError', retryable: true },
    });
    expect((await provider.get(created.ref))?.status).toBe('requires_confirmation');
    const retried = paidValue(await provider.confirm(created.ref, { idempotencyKey: 'k' }));
    expect(retried.status).toBe('requires_capture');
  });

  it('rejects invalid cards before creating anything', async () => {
    const { db, provider } = await setup();
    const result = await provider.createIntent({
      amount: usd(100),
      card: { number: '4242 4242 4242 4241', expiry: '01/20', cvc: '1' },
    });
    expect(result.ok).toBe(false);
    if (result.ok || result.error._tag !== 'CardInvalid') throw new Error('expected CardInvalid');
    expect(result.error.issues.map((i) => i.field)).toEqual(['number', 'expiry', 'cvc']);
    expect(await db.select().from(payments)).toEqual([]);
  });

  it('answers a repeated confirm with the same result and changes nothing', async () => {
    const { db, provider, intent } = await setup();
    const good = await intent(CARDS.success);
    const first = await provider.confirm(good.ref, { idempotencyKey: 'once' });
    const again = await provider.confirm(good.ref, { idempotencyKey: 'once' });
    expect(again).toEqual(first);

    const bad = await intent(CARDS.declined);
    const declined = await provider.confirm(bad.ref, { idempotencyKey: 'twice' });
    expect(await provider.confirm(bad.ref, { idempotencyKey: 'twice' })).toEqual(declined);
    const rows = await db.select().from(payments);
    expect(rows.map((r) => r.attempts)).toEqual([1, 1]);
  });

  it('rejects an idempotency key already used for another payment', async () => {
    const { provider, intent } = await setup();
    const a = await intent(CARDS.success);
    const b = await intent(CARDS.success);
    await provider.confirm(a.ref, { idempotencyKey: 'shared' });
    expect(await provider.confirm(b.ref, { idempotencyKey: 'shared' })).toEqual({
      ok: false,
      error: { _tag: 'IdempotencyConflict', key: 'shared' },
    });
  });

  it('refunds partially and fully, and rejects over-refunds', async () => {
    const { provider, intent } = await setup();
    const p = await intent(CARDS.success, 5000);
    await provider.confirm(p.ref, { idempotencyKey: 'r' });
    await provider.capture(p.ref);
    const partial = paidValue(await provider.refund(p.ref, usd(1200)));
    expect(partial).toMatchObject({ status: 'partially_refunded', refunded: usd(1200) });
    expect(await provider.refund(p.ref, usd(3801))).toEqual({
      ok: false,
      error: { _tag: 'ExceedsRefundable', refundable: usd(3800) },
    });
    const full = paidValue(await provider.refund(p.ref));
    expect(full).toMatchObject({ status: 'refunded', refunded: usd(5000) });
    expect((await provider.refund(p.ref, usd(1))).ok).toBe(false);
  });

  it('refuses to refund or capture out of order', async () => {
    const { provider, intent } = await setup();
    const p = await intent(CARDS.success);
    expect(await provider.refund(p.ref)).toMatchObject({
      ok: false,
      error: { _tag: 'InvalidState' },
    });
    expect(await provider.capture(p.ref)).toMatchObject({
      ok: false,
      error: { _tag: 'InvalidState' },
    });
    expect(await provider.capture('pi_missing')).toEqual({
      ok: false,
      error: { _tag: 'NotFound', ref: 'pi_missing' },
    });
  });

  it('waits the configured latency on every call', async () => {
    const db = await createTestDb();
    const slow = createPaymentProvider(db, { latencyMs: 40, now: () => NOW });
    const start = performance.now();
    const created = await slow.createIntent({ amount: usd(100), card: card(CARDS.success) });
    expect(created.ok).toBe(true);
    expect(performance.now() - start).toBeGreaterThanOrEqual(35);
  });
});
