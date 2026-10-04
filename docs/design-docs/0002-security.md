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
