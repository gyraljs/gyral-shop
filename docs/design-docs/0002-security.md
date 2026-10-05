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

## Addendum: production serving (shop-2gz, 2026-10-04)

`pnpm start` serves prerendered pages and hashed assets from disk without passing through the
app, so `src/server/prod-app.ts` adds the same headers (`securityHeaderValues` in
`src/server/security/headers.ts`) to those responses. Prerendered pages contain no session,
CSRF token or account: `/api/me` (never cached, never starts a session) personalizes them after
hydration. `pnpm start` refuses to run unless `NODE_ENV=production` and `APP_SECRET` is set.
