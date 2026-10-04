# ADR 0005 — Testing

Status: **accepted** (2026-10-04)

Three kinds of test, each with a helper in `test/support/`:

| Kind       | Where                                     | Runs in                        | Helper                                                                                                                                                                                            |
| ---------- | ----------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit       | `src/**/x.test.ts` (domain, services, db) | Node                           | plain Vitest                                                                                                                                                                                      |
| Route      | `test/node/*.test.ts`                     | Node                           | `testApp()`: the real Hono app over a migrated in-memory SQLite with a small deterministic seed (2 products per category). `get()`, `html()`                                                      |
| Page       | `test/browser/*.test.ts`                  | Chromium (Vitest browser mode) | `mountSsrPage(fixture)` puts real server output in the document (DSD parsed like a page load), then `import` the client entry and `hydrated(root)`; `a11yViolations(root)` runs axe (WCAG 2.2 AA) |
| End to end | `test/node/*.test.ts`                     | Node + Playwright              | `listen(testApp)` serves over HTTP; `openPage({ javaScript: false })` proves no-JS paths                                                                                                          |

## Golden fixtures connect server and browser

Browser tests cannot call the Node server, so route tests write the server's real output to
`test/fixtures/<page>.ssr.html` with `toMatchFileSnapshot`, and page tests import it with
`?raw`. A change to server markup updates the fixture (`pnpm test -u`) and the page test then
hydrates the new markup. Review fixture diffs like code.

## Rules

- Every page template gets: a route test (status, key content, noindex where required), a
  page test (hydrates in place, no console errors or warnings, no axe violations), and a no-JS
  test for its main flow.
- `mountSsrPage` only applies `<head>` styles: styles inside DSD templates belong to shadow
  roots. (Applying them globally once hid a real cascade bug behind a fake one.)
- Never mock the database in route tests; use `testApp()`.
- Logging in: `test/support/auth.ts`: `loginAs(test, email)` or `guest(test)` returns a
  session with `get`, `postForm` (adds the CSRF field) and `postJson` (adds `x-csrf-token`).
  Pass `testApp({ now })` to control the clock for sessions and rate limits.
