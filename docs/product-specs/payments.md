# Payments (mock)

A provider module with the shape of a real one (create intent → confirm → capture/refund),
in-process, persisted in a `payments` table.

- Test cards: `4242 4242 4242 4242` succeeds; `4000 0000 0000 0002` declined;
  `4000 0000 0000 9995` insufficient funds; `4000 0000 0000 0119` processing error (retryable).
- Card number (Luhn), expiry (future) and CVC are validated at the boundary; only the last 4
  digits and brand are stored.
- Refunds (full or partial) from admin; order state follows (ADR 0003 state machine).
- Artificial latency (configurable) so loading states are visible.
