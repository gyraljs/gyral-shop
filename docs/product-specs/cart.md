# Cart

- Guests get a cart tied to an anonymous session; members' carts persist in the DB.
- On login, the guest cart **merges** into the member cart (quantities add, capped by stock).
- Cart page (`/cart`): lines with image, name, variant, unit price, quantity stepper, line
  total, remove; promo code entry; itemized totals from the domain price pipeline; "continue
  shopping" and "checkout".
- Header **mini-cart** badge with item count, shared state across the page (Gyral stores,
  ADR 0013); opens a popover summary.
- Every action works as a POST form without JS; with JS, optimistic updates reconcile with the
  server response; stock errors are shown per line.
