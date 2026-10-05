# ADR 0002 — Security model

Status: **accepted** (2026-10-04)

- **Passwords:** `node:crypto` `scrypt` with a per-user random salt and constant-time compare.
  No native dependencies. Minimum length 10; checked against a small common-password list.
- **Sessions:** opaque random ids (32 bytes) in a `sessions` table; cookie `sid` is
  `HttpOnly; Secure (when HTTPS); SameSite=Lax; Path=/`. Rotate the id on login and on
  privilege change; expire after 30 days, sliding.
- **CSRF:** every state-changing form and request carries a per-session token (hidden field
  or `x-csrf-token` header) checked by middleware; `SameSite=Lax` is defence in depth.
- **Roles:** `customer`, `admin`. Admin routes and APIs require `admin`; checks live in
  middleware and in services (never only in the UI).
- **Rate limits:** login, register and password reset are limited per IP and per account
  (in-memory sliding window; fine for local).
- **Password reset:** single-use, hashed tokens with a 30-minute expiry, delivered through
  the mock mail outbox. Responses never reveal whether an email exists.
- **Output:** Lit escapes by default; JSON in pages uses script-safe serialization; strict CSP
  header (no inline scripts except hashed hydration seeds if needed).

## Implementation (shop-1k5.2, 2026-10-04)

`installSecurity(app, …)` in `createApp` registers, for every route: security headers, the
session middleware, then the CSRF check. Code lives in `src/server/security/` (HTTP) and
`src/services/{sessions,auth,authz}.ts` (transport-agnostic).

| Need                         | Use                                                                                                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Members-only page or API     | `app.get(path, requireUser(), …)`: guests get 303 to `/account/login?next=…` (pages) or 401 JSON (`/api/*`, JSON callers)                                                                  |
| Admin only                   | `requireAdmin()`: as above, plus 403 for signed-in customers                                                                                                                               |
| A form that POSTs            | `const token = await csrfTokenFor(c)`; render `csrfField(token)` (`src/ui/forms/csrf.ts`) inside the form                                                                                  |
| fetch / Gyral http driver    | pass `csrfToken` to `shell()` so the page gets `<meta name="csrf-token">`; send it as `x-csrf-token` (`csrfFromMeta('csrf-token')` from `@gyral/http`, or `submitForm`'s `csrf` option)    |
| Login                        | rate-limit first (`limit(c, limiter, [`ip:${ip(c)}`, `acct:${email}`])` with `LIMITS`), then `authenticate()`, then `startMemberSession(c, user)` (rotates the id; the guest cart follows) |
| Logout                       | `endSession(c)` (POST, so it is CSRF-checked)                                                                                                                                              |
| Guest cart                   | `ensureSession(c)` starts an anonymous session on demand                                                                                                                                   |
| Services                     | check again with `requireMember` / `requireRole` / `requireOwnerOrAdmin` (`services/authz.ts`)                                                                                             |
| JSON inside a script element | `scriptSafeJson()`                                                                                                                                                                         |

Details worth knowing:

- Sessions are created only on demand (forms, cart), never for plain browsing, images or the
  favicon, so bots don't fill the table.
- The CSRF check reads a **clone** of form bodies, so handlers and Gyral `formAction()` can
  still read the request. Requests with a cross-site `Origin` are refused even with a token.
- Rotation and destroy keep the `carts.session_id` foreign key valid: rotation moves the
  guest cart to the new id; destroy detaches it (`session_id = null`).
- Sliding expiry is written at most every 5 minutes (`TOUCH_AFTER_MS`); the cookie is re-sent
  then.
- CSP: `script-src 'self'` with no inline scripts (Gyral's seeds are JSON data blocks, which
  CSP does not execute). `style-src` needs `'unsafe-inline'` for `<style>` inside Declarative
  Shadow DOM templates and the shell's global styles. Development adds `connect-src ws:` for
  Vite HMR. HSTS only over HTTPS.
- Rate limiting is per process and in memory (`SlidingWindowLimiter`); `ip(c)` trusts
  `x-forwarded-for` only with `trustProxy`.

## Addendum: session cookies on rendered pages (shop-t3l.3, 2026-10-04)

Hono's `setCookie(c, …)` only reaches responses built through `c` (`c.html`, `c.redirect`).
Pages return their own `Response` from `renderPage()`, so a page that started or rotated a
session (for example a product page calling `csrfTokenFor(c)`) sent a CSRF token without the
session cookie behind it, and every form post from that page would fail the CSRF check. The
session middleware now queues session cookies and appends them to whatever response the
route produced (`flushCookies` in `src/server/security/sessions.ts`). Covered by the product
page route test (`Set-Cookie: sid=…`) and the no-JS add-to-cart test.

## Addendum: origin-verified consent form (shop-gcn.4, 2026-10-04)

The cookie-consent banner is shown to every first-time visitor. A CSRF token would require a
session for each of them, breaking "browsing alone creates no session". So `POST /consent`
(and only the paths in `ORIGIN_VERIFIED_PATHS`, `src/server/security/csrf.ts`) skips the token
and instead **requires proof of same origin**: an `Origin` header equal to this site's, or
`Sec-Fetch-Site: same-origin` when `Origin` is absent. A request with neither is refused (403),
as is a cross-site one. This is OWASP's standard-header verification. The worst a forged
request could do is change a consent choice, and browsers send these headers on every POST.
Tested in `test/node/consent.test.ts`.

## Addendum: production serving (shop-2gz, 2026-10-04)

`pnpm start` serves prerendered pages and hashed assets from disk without passing through the
app, so `src/server/prod-app.ts` adds the same headers (`securityHeaderValues` in
`src/server/security/headers.ts`) to those responses. Prerendered pages contain no session,
CSRF token or account: `/api/me` (never cached, never starts a session) personalizes them after
hydration. `pnpm start` refuses to run unless `NODE_ENV=production` and `APP_SECRET` is set.

## Checklist: each item and the test that proves it (shop-dok.4, 2026-10-05)

Keep this table current: a new security rule lands with a test and a row here.

| Item                                                            | Test (file › name)                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Passwords: scrypt, per-user salt                                | `src/services/passwords.test.ts` › "salts every hash", "verifies the right password and rejects others"                                                                                                                                                                                                             |
| Password policy (length, common list)                           | `src/domain/accounts.test.ts` › passwordProblem; `test/node/account.test.ts` › "rejects common passwords"                                                                                                                                                                                                           |
| Same error for wrong password and unknown email                 | `src/services/auth.test.ts` › "gives the same error for a wrong password and an unknown email"                                                                                                                                                                                                                      |
| Session ids: opaque 32 bytes                                    | `src/services/sessions.test.ts` › "creates opaque 32-byte ids and CSRF tokens"                                                                                                                                                                                                                                      |
| Cookie flags (HttpOnly, SameSite=Lax, Secure on HTTPS)          | `test/node/security.test.ts` › "creates an anonymous session on demand with a hardened cookie"                                                                                                                                                                                                                      |
| No session just for browsing                                    | `test/node/security.test.ts` › "does not create a session just for browsing"                                                                                                                                                                                                                                        |
| Sliding 30-day expiry; expired cookies cleared                  | `src/services/sessions.test.ts` › "slides the expiry…", "destroys expired sessions on sight"; `security.test.ts` › "clears an unknown or expired cookie"                                                                                                                                                            |
| Rotation on login and privilege change; logout destroys         | `security.test.ts` › "rotates the id on login (session fixation) and destroys it on logout"; `account-settings.test.ts` › "changes the email only with the current password, rotating the session"                                                                                                                  |
| Other sessions end on password change/reset                     | `account-settings.test.ts` › "changes it, signs out other devices…"; `password-reset.test.ts` › "resets once through the emailed link, ending other sessions…"                                                                                                                                                      |
| Session cookies survive handlers that return their own Response | `account.test.ts` › "sets the session cookie on the page that embeds its CSRF token, so the post succeeds"                                                                                                                                                                                                          |
| CSRF token (field and header)                                   | `security.test.ts` › "accepts the token from the form field…", "…from the x-csrf-token header"                                                                                                                                                                                                                      |
| CSRF rejection (missing, wrong, no session)                     | `security.test.ts` › "rejects a missing or wrong token…", "rejects state changes without a session at all"                                                                                                                                                                                                          |
| Cross-site Origin rejected                                      | `security.test.ts` › "rejects a cross-site Origin even with the right token"; `consent.test.ts` › "refuses cross-site posts and posts that cannot prove their origin"                                                                                                                                               |
| Roles on pages (members, admin)                                 | `security.test.ts` › "sends guests to login with ?next=…", "lets members in and keeps customers out of admin pages"                                                                                                                                                                                                 |
| Roles on APIs, including admin                                  | `security.test.ts` › "…and 401 for APIs"; `security-checklist.test.ts` › "answer guests 401 and customers 403 as JSON, and admins normally"; `test/node/admin.test.ts` › "sends guests to sign in, and answers API calls with 401"; `admin-products.test.ts` (customers get 403 on `/api/admin/*`)                  |
| Services re-check roles                                         | `src/services/authz.test.ts` › "service guards"                                                                                                                                                                                                                                                                     |
| Ownership (no cross-member access)                              | `account-settings.test.ts` › "never lets one member see or change another's address"; `orders.test.ts` › "refuses fulfilled orders, other members' orders and posts without CSRF"                                                                                                                                   |
| Rate limits: login, register, reset, current password, lookup   | `account-limits.test.ts` (all); `password-reset.test.ts` › "rate-limits requests per account"; `account-settings.test.ts` › "limits current-password guesses"; `orders.test.ts` › "answers the same for a wrong email and an unknown number, and rate-limits"; `security.test.ts` › "answers 429 with Retry-After…" |
| Reset tokens: hashed, single use, 30 minutes, no enumeration    | `password-reset.test.ts` › "answers the same for known and unknown emails…", "resets once…", "expires links after 30 minutes and replaces older ones"                                                                                                                                                               |
| Guest order access needs a signed cookie or lookup              | `place-order.test.ts` › "the placing browser, the member and admins; others are sent to the lookup form" (includes a forged cookie); `orders.test.ts` › guest lookup                                                                                                                                                |
| Card data: only brand, last 4, expiry stored                    | `src/services/checkout.test.ts` › "saves contact, address, shipping and payment, keeping only safe card data"                                                                                                                                                                                                       |
| Output escaping of user content (HTML and JSON-LD)              | `security-checklist.test.ts` › "is escaped in HTML and cannot break out of JSON-LD"                                                                                                                                                                                                                                 |
| Script-safe JSON                                                | `src/server/security/json.test.ts` › scriptSafeJson                                                                                                                                                                                                                                                                 |
| Safe `next` targets                                             | `json.test.ts` › safeNext; `account.test.ts` › "ignores an off-site next target"                                                                                                                                                                                                                                    |
| CSP, HSTS, security headers                                     | `security.test.ts` › "sends a strict CSP…", "…HSTS only over HTTPS"; `prod.test.ts` (production responses)                                                                                                                                                                                                          |
| Static pages never personalized                                 | `test/node/static-pages.test.ts`                                                                                                                                                                                                                                                                                    |
| Production secrets required                                     | `src/config/env.test.ts`; `prod.test.ts`                                                                                                                                                                                                                                                                            |
| Path traversal refused (production files)                       | `prod.test.ts`                                                                                                                                                                                                                                                                                                      |
| Concurrent writes safe (write lock)                             | `test/node/write-lock.test.ts`                                                                                                                                                                                                                                                                                      |
