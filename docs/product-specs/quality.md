# Quality acceptance

- **Accessibility:** WCAG 2.2 AA. axe has no violations on every page template in tests;
  keyboard-only flows for search, add to cart, checkout and admin tables; visible focus;
  reduced-motion respected.
- **Performance:** product listing and product pages: LCP < 2.5 s and CLS < 0.1 on a
  throttled run; JS per page budget tracked (record now, enforce later).
- **Security:** ADR 0002 checklist has a test per item (CSRF rejection, role checks,
  session rotation, rate limit, reset token single use).
- **No-JS:** catalog, search, product page, cart, checkout, account forms pass with
  JavaScript disabled (Playwright tests with `javaScriptEnabled: false`).

## Implementation notes

- **Accessibility, every template:** `test/node/a11y-templates.test.ts` serves the real app
  and runs axe (WCAG 2.2 AA tags) in Chromium on the server-rendered markup of 40 page
  templates, as a guest, a member with a placed order, and guests at each checkout step. A
  control page with a missing `alt` proves the run reports violations. Not covered there:
  `/admin` (client-rendered; its own suite) and `/dev/mail` (development tool). Hydrated
  states are covered by the browser tests, which also run axe, and by `pnpm ui:check`.
- **No-JS end to end:** one journey suite with JavaScript disabled, split in two files for
  size. `test/node/nojs-shopping.test.ts` (seeded catalog): browse, search with refine and no
  results, filter and sort a listing, choose a variant, edit the cart; register, sign out,
  sign in with a wrong then right password, save and move a wishlist item, edit profile and
  addresses; password reset through the outbox; contact form; consent reject then opt in.
  `test/node/nojs-orders.test.ts` (exact cart fixture): product to cart through every
  checkout step (with a rejected step) to confirmation and the confirmation email, guest
  lookup in another browser; a member cancels from history; a buyer reviews, another
  member votes helpful, reviews sort by link. These replace the earlier per-feature
  `*-nojs.test.ts` files.
