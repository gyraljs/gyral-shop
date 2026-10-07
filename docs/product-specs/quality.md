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
  and runs axe (WCAG 2.2 AA tags) in Chromium on the server-rendered markup of 41 page
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
- **Performance budgets:** `pnpm perf` (`scripts/perf.mjs`, about 45 s, so not part of
  `pnpm check`) seeds a throwaway database, builds, starts the production server and loads
  home, a category and a product page cold in Chromium with 4x CPU and 1.6 Mbps / 150 ms
  network throttling, three runs each. It fails on median LCP above 2.5 s, CLS above 0.1, or JS gzip
  above the recorded baseline + 10% (`scripts/perf-baseline.json`; refresh with
  `pnpm perf --update` after an intended change).

  Current baseline (2026-10-07, production build on Gyral 0.3.1-next.0; ADR 0001): JS gzip
  home 32.4 KiB, category 39.9 KiB, product 41.3 KiB (`scripts/perf-baseline.json`); LCP
  704–768 ms; CLS 0. Earlier baselines were measured on development bundles (until
  2026-10-07 the build ran under NODE_ENV=development; ADR 0001, "0.3.1-next.0"): the
  previous one, on Gyral 0.3.0-next.5, was home 36.5, category 44.1, product 45.8 KiB.

  First baseline (2026-10-05, Gyral 0.1, production build, after per-route code splitting and
  the Gyral fix for production-only hydration duplicates, gyral-czi.41), kept for history:

  | Page     | LCP (median) |   CLS |  JS gzip |    JS raw | CSS (inline + files) |
  | -------- | -----------: | ----: | -------: | --------: | -------------------: |
  | home     |       792 ms | 0.000 | 75.1 KiB | 220.2 KiB |             55.4 KiB |
  | category |       572 ms | 0.000 | 81.6 KiB | 237.0 KiB |             55.4 KiB |
  | product  |       524 ms | 0.000 | 82.9 KiB | 240.2 KiB |             55.4 KiB |

  Before the fix, the duplicated consent banner pushed CLS to about 0.26 and product LCP to
  about 2.3 s. Home LCP varies between runs (532–792 ms observed) on a loaded machine.

- **Production hydration:** `pnpm smoke:prod` (part of `pnpm check`, about 20 s) builds and
  serves the production bundle and checks that key pages hydrate in place (see ADR 0005,
  "Production builds" and its Gyral 0.3 addendum).
