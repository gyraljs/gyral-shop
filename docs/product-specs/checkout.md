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
- `/checkout/place` validates the terms checkbox, then answers 501 until shop-935.3.
