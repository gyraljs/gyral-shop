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
