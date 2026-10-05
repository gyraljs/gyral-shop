# ADR 0005 — Testing

Status: **accepted** (2026-10-04)

Three kinds of test, each with a helper in `test/support/`:

| Kind       | Where                                     | Runs in                        | Helper                                                                                                                                                                                                                                                                                                                      |
| ---------- | ----------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit       | `src/**/x.test.ts` (domain, services, db) | Node                           | plain Vitest                                                                                                                                                                                                                                                                                                                |
| Route      | `test/node/*.test.ts`                     | Node                           | `testApp()`: the real Hono app over a migrated in-memory SQLite with a small deterministic seed (2 products per category). `get()`, `html()`                                                                                                                                                                                |
| Page       | `test/browser/*.test.ts`                  | Chromium (Vitest browser mode) | `mountSsr(fixture)` from `@gyral/testing` puts real server output in the document (DSD parsed like a page load, store seed and metas restored), then `import` the client entry and `await hydrated(page)` (fails on console errors/warnings and waits for nested components); `a11yViolations(root)` runs axe (WCAG 2.2 AA) |
| End to end | `test/node/*.test.ts`                     | Node + Playwright              | `listen(testApp)` serves over HTTP; `openPage({ javaScript: false })` proves no-JS paths                                                                                                                                                                                                                                    |

## Golden fixtures connect server and browser

Browser tests cannot call the Node server, so route tests write the server's real output to
`test/fixtures/<page>.ssr.html` with `toMatchFileSnapshot`, and page tests import it with
`?raw`. A change to server markup updates the fixture (`pnpm test -u`) and the page test then
hydrates the new markup. Review fixture diffs like code.

## Rules

- Every page template gets: a route test (status, key content, noindex where required), a
  page test (hydrates in place, no console errors or warnings, no axe violations), and a no-JS
  test for its main flow.
- `mountSsr` only applies `<head>` styles: styles inside DSD templates belong to shadow
  roots. (Applying them globally once hid a real cascade bug behind a fake one.)
- Never mock the database in route tests; use `testApp()`.
- Logging in: `test/support/auth.ts`: `loginAs(test, email)` or `guest(test)` returns a
  session with `get`, `postForm` (adds the CSRF field) and `postJson` (adds `x-csrf-token`).
  Pass `testApp({ now })` to control the clock for sessions and rate limits.

## Addendum: `pnpm ui:check` (shop-v0x, 2026-10-05)

A port of Gyral's UI check for agents and humans to _see_ changes. `pnpm ui:check [page…]`
seeds a fresh file database (`.ui-check/db/shop.db`), starts the dev server on it (port 5800,
or `--port` / `UI_CHECK_PORT`; HMR on the next port), and drives each page template through
`ui-scenarios/<name>.mjs` in headless Chromium at desktop 1280 and phone 390, in light and
dark. It records full-page screenshots, console errors and warnings, horizontal overflow
(shadow roots included) and axe violations into `.ui-check/<run>/report.md`, and exits 1 on
any problem. `--baseline` saves screenshots; `--compare` pixel-diffs against them.

- Scenarios are plain data: `{ path, steps, once?, allowConsole? }` with steps `goto`,
  `click`, `fill`, `check`, `select`, `press`, `waitFor`, `wait`; targets by role, label, text
  or CSS. `{product}`, `{variantProduct}`, `{category}`, `{customer}` and `{password}` resolve
  from the seeded catalog, so scenarios survive seed changes.
- Every shot gets a fresh browser context, so member scenarios sign in each time.
- axe is evaluated through the DevTools protocol, not injected as a `<script>`: the shop's CSP
  blocks inline scripts, and bypassing CSP would hide real CSP violations.
- It is too slow for `pnpm check`; run it after UI changes and before merging them. The
  pure parts (`scripts/lib/ui-check.mjs`) are unit-tested in `scripts/test/`.
- First run found and fixed: the skip link outside any landmark (now in a "Skip links" nav),
  two search landmarks with the same name on the 404 page, and a heading-order gap on the
  wishlist page.
