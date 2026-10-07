# Cart

- Guests get a cart tied to an anonymous session; members' carts persist in the DB.
- On login, the guest cart **merges** into the member cart (quantities add, capped by stock).
- Cart page (`/cart`): lines with image, name, variant, unit price, quantity stepper, line
  total, remove; promo code entry; itemized totals from the domain price pipeline; "continue
  shopping" and "checkout".
- Header **mini-cart** badge with item count, shared state across the page (Gyral stores,
  Gyral ADR 0013); opens a `<details>` summary panel (works without JS).
- Every action works as a POST form without JS; with JS, optimistic updates reconcile with the
  server response; stock errors are shown per line.

## Implementation notes (shop-igx.2)

- **Shared state:** one Gyral store, `cart` (`src/ui/cart/store.ts`), read by the header
  mini-cart, the cart page and the product buy box. `page()` in `src/server/app.ts` seeds a
  per-request instance into every page (`src/server/cart-seed.ts`); the browser restores it
  before hydrating. The seeded and the fetched cart go through one parser
  (`src/ui/cart/model.ts`), so both are the same JSON-safe client model.
- **Writes:** every control is a POST form (`/cart/*`). With JavaScript, the forms are Gyral
  intents that send the store a message; the store's commands call the JSON API through the
  `cart-api` driver (`src/ui/cart/api.ts`), with the page's `<meta name="csrf-token">`.
- **Optimistic updates:** quantity changes and removals show at once. All requests share one
  queued lane; the server's cart replaces the optimistic one only when no request is still in
  flight. An answer without a cart, or a network failure, triggers one re-read.
- **The mini-cart is a nested component:** `<shop-header>` is light DOM (ADR 0006 rule 5) and
  renders `<shop-mini-cart>` in its own view. The mini-cart keeps a shadow root with its own
  styles and parts, and hydrates on its own. (It used to be slotted in from the document shell while the header had
  a shadow root, because components nested in a server-rendered shadow root never wired their
  intents.)
- **Flash messages** are cleared through the security cookie queue (`queueCookie`): pages
  return their own `Response`, which drops cookies set through Hono's context.
