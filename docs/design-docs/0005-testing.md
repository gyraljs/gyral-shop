# ADR 0005 — Testing

Status: **accepted** (2026-10-04)

Three kinds of test, each with a helper in `test/support/`:

| Kind       | Where                                     | Runs in                        | Helper                                                                                                                                                                                                                                                                                                             |
| ---------- | ----------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unit       | `src/**/x.test.ts` (domain, services, db) | Node                           | plain Vitest                                                                                                                                                                                                                                                                                                       |
| Route      | `test/node/*.test.ts`                     | Node                           | `testApp()`: the real Hono app over a migrated in-memory SQLite with a small deterministic seed (2 products per category). `get()`, `html()`                                                                                                                                                                       |
| Page       | `test/browser/*.test.ts`                  | Chromium (Vitest browser mode) | `mountSsr(fixture)` from `@gyral/testing` puts real server output in the document (DSD parsed like a page load, store seed and metas restored), then `import` the client entry and `await hydrated(page)` (fails on console errors/warnings, waits for `settled()`); `a11yViolations(root)` runs axe (WCAG 2.2 AA) |
| End to end | `test/node/*.test.ts`                     | Node + Playwright              | `listen(testApp)` serves over HTTP; `openPage({ javaScript: false })` proves no-JS paths                                                                                                                                                                                                                           |

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

## Addendum: Production builds (2026-10-05)

Every other test runs Lit's **development** build. Production builds differ: Lit renames its
private fields, and Rolldown reorders module evaluation across chunks (the client entry's
top-level await let Lit run before `@gyral/ssr/hydrate`). Both caused production-only bugs that
no development test could see: the consent banner rendered twice, the header and listing
logged hydration mismatches, and the cart heading doubled (Gyral gyral-czi.38, gyral-czi.41).

`pnpm smoke:prod` (`scripts/smoke-prod.mjs`, pure checks in `scripts/lib/smoke.mjs`) runs inside
`pnpm check`. It seeds a throwaway database, builds, starts the production server and, in
Chromium, loads home, a department, a category, a product, search, the cart (empty and with a
line), sign-in, `/about` (prerendered) and checkout. For each page it requires:

- exactly one `<h1>`, and every `data-region` as often as the server sent it;
- no element left in `defer-hydration`, except lazy islands, which must hydrate once scrolled
  into view;
- no page errors or console errors;
- **the server's nodes survive hydration**: an init script tags every element when parsing
  finishes, before any module script runs, and headings, regions and each component's
  top-level view must still be those nodes afterwards. A fresh client render looks identical
  but replaces them, and counting alone cannot tell the difference: with
  `@gyral/ssr/hydrate` removed from the entry, the counts still matched but all ten page checks
  failed on replaced nodes.

It also adds to the cart from a product page (the badge updates without navigating) and ticks a
listing filter (the URL and results update in place). Content the client creates on purpose
after hydration (the deferred consent banner and the cart on prerendered pages) is allowed per
page.

**Rolldown `strictExecutionOrder`: not adopted.** It restores import-order evaluation, so Lit's
hydrate support patches LitElement (verified), but it added 8.5–28 KiB gzip per page (category
+35%), over the JS budget. Superseded by Gyral 0.3 (addendum below): hydration no longer depends
on module order at all.

## Addendum: Gyral 0.3 (2026-10-06)

Gyral 0.3 renders, server-renders and hydrates with its own view layer (Gyral ADR 0018), so the
Lit-specific parts above are history: there is no Lit development build, no
`@gyral/ssr/hydrate` import and no module-order hazard. Each component adopts the server's nodes
on its own; a mismatch throws `HydrationMismatch` in development and, in production, warns and
re-renders only that component.

- **Waiting for renders:** `await settled()` (from `@gyral/core`) replaces
  `el.updateComplete`; `hydrated(page)` waits for it too.
- **Golden fixtures:** development output carries `<!--gyral:ID-->` markers and `<!---->`
  anchors; seeds are single-quoted JSON. Gyral writes a tag's static attributes before its
  bound ones, so node tests match tags with `startTag()` (any attribute order,
  `test/support/fixtures.ts`). Since 0.3.0-next.5 attribute values and seeds escape `<` and
  `>` too, so "no injected markup" is a plain `not.toContain('<script>…')` on the whole page
  (the `outsideAttributes()` helper that stripped attribute values first is gone).
- **smoke:prod** also fails on console warnings (a production mismatch is one) and on any
  element the parser built that is no longer in the page after hydration (islands included,
  after scrolling them into view; only a shadow root's server `<style>`, replaced by its shared
  sheet, may go). Every checked page passes.
- **Development SSR** (`pnpm dev`, `ui:check`) renders development output, so `ui:check` runs
  Gyral's development hydration checks against development markup.
- **Form state is live** (Gyral view/02-bindings.md): every render writes the model's value
  into the control. Tests that type into a field and then trigger any render (a rejection, a
  pending submit) prove the model kept the input (`account.test.ts`, `admin-manage.test.ts`).
- Removed: `scripts/check-templates.mjs` (Lit couldn't hydrate an empty text part, so text
  bindings had to render `nothing` instead of `''`; Gyral 0.3 can) and `NO_RAW_LIT` (ESLint now
  bans Lit imports outright and runs `@gyral/core/eslint`'s template rules).
