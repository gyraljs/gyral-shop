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
