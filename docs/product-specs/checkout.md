# Checkout

Steps on one page with progressive disclosure, or as separate pages without JS:

1. **Contact**: guest email, or the signed-in member.
2. **Shipping address**: saved addresses for members; validated form for guests.
3. **Shipping method**: Standard (free over $35), Express, Next day; prices from domain rules.
4. **Payment**: mock card form (payments.md) or saved mock card for members.
5. **Review**: itemized totals (subtotal, discount, shipping, tax by state, total), editable
   links back to each step, terms checkbox, **Place order**.

- Placing an order re-prices server-side, reserves stock atomically, charges the mock
  provider, creates the order, clears the cart, sends a confirmation email (mail.md), and
  redirects to `/order/:number/confirmation` (Post/Redirect/Get). Idempotent on double submit.
- Failures (declined card, stock changed, promo expired) return to the relevant step with a
  clear message and nothing half-done.

## Implementation notes (shop-935.2)

- `/checkout` is one page: saved steps show a summary and an Edit link, the open step shows
  its form, later steps are locked. Without JavaScript each step posts to
  `/checkout/{contact,address,shipping,payment}` and comes back with the next step open (422
  re-render on errors); with it, `<shop-checkout>` validates with the same valibot schemas and
  `submitForm` posts the same form, answered with the next view as JSON.
- The draft lives server-side in `checkouts`, one row per cart (deleted with it). Members start
  at the address step with their account email and can pick or save addresses.
- The payment step validates the card and creates a provider intent for the current total; only
  the intent reference, brand, last 4 and expiry are kept. Placing the order (shop-935.3)
  confirms that intent and must update its amount if the total changed since.
- Free shipping is judged after the promo discount; tax uses the address's state (and taxes
  shipping where the state does).

## Implementation notes (shop-935.3, place order)

- `POST /checkout/place` (no-JS form and `submitForm`, one `formAction`) is Post/Redirect/Get on
  both paths: success → `/order/:number/confirmation`; a failure → the step it concerns
  (`?edit=payment`, `?edit=review`) or `/cart`, with a flash message the page shows on that
  step. Only a missing terms checkbox is a 422 re-render.
- The review page carries a hidden **place key** (an HMAC of cart + payment intent with
  `APP_SECRET`) and the total it showed. The key makes placing idempotent (double clicks and
  concurrent submits get the same order; a repeat after the cart is gone still finds it) and
  proves the submit came from this checkout. A different total is refused with the new one.
- One transaction reserves stock with conditional decrements (never below zero), increments the
  promo's usage under its limit, and inserts the order (`pending_payment`) with line snapshots
  and inventory-log rows. Then the intent's amount is updated if needed, confirmed and captured.
  A failed charge releases everything (stock, promo usage, the pending order); a declined card
  clears the saved card so the payment step reopens; a processing error keeps it for a retry.
  Success marks the order `paid` (domain state machine), links the payment, deletes the cart
  and draft, and queues the confirmation email.
- Writes that must not fail take a process-wide write lock (`src/db/tx.ts`): libsql's native
  driver is synchronous, so a busy timeout would block the event loop the open transaction
  needs. Correctness doesn't depend on the lock but on the conditional updates: the race tests
  in test/node/place-order-race.test.ts fail when those guards are removed.
- The confirmation is visible to the member who placed it, admins, and the browser that placed
  it (a signed `orders` cookie); anyone else gets 404.
