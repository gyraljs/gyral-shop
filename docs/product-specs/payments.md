# Payments (mock)

A provider module with the shape of a real one (create intent → confirm → capture/refund),
in-process, persisted in a `payments` table.

- Test cards: `4242 4242 4242 4242` succeeds; `4000 0000 0000 0002` declined;
  `4000 0000 0000 9995` insufficient funds; `4000 0000 0000 0119` processing error (retryable).
- Card number (Luhn), expiry (future) and CVC are validated at the boundary; only the brand, last 4
  digits and expiry are stored.
- Refunds (full or partial) from admin; order state follows (ADR 0003 state machine).
- Artificial latency (configurable) so loading states are visible.

## Implementation notes (shop-935.1)

- API: `createPaymentProvider(db, { latencyMs, now, newRef })` in `src/services/payments.ts`
  with `createIntent({ amount, card, orderId? })`, `confirm(ref, { idempotencyKey })`,
  `capture(ref)`, `refund(ref, amount?)`, `updateAmount(ref, amount)` (unconfirmed intents
  only), `get(ref)`. Results are tagged unions, never throws
  for expected failures. Rules are pure in `src/domain/payments.ts`.
- The test-card outcome is decided at `createIntent` (when the digits are known) and stored as
  `outcome`; the digits are never stored.
- `…0119` is **transient**: the first confirm fails with a retryable processing error, the next
  attempt succeeds, so retry paths can be exercised.
- Idempotency: a confirm that settles (authorized or declined) records its key; repeating it
  returns the same result without re-processing. Processing errors don't record the key, so a
  retry with the same key tries again. A key already used by another payment is rejected.
- Latency: `PAYMENT_LATENCY_MS` (default 0, max 10 000), e.g. `PAYMENT_LATENCY_MS=600 pnpm dev`.
