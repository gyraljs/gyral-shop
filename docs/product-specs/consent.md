# Consent and analytics (mock)

- First visit shows a consent banner (accept all / reject non-essential / customize) as a
  non-modal region; choice stored in a cookie; re-openable from the footer.
- Mock analytics (a server middleware) record page views and add-to-cart events to a local table **only
  after consent**; admin dashboard reads it.

## Implementation notes (shop-gcn.4)

- Cookie `consent=v1.a1|v1.a0` (`src/domain/consent.ts`), HttpOnly, six months. Bumping
  `CONSENT_VERSION` asks everyone again.
- Banner: `<shop-consent mode="banner">`, rendered by the server for undecided visitors (never
  on `/consent`), a non-modal labelled region in the page flow between the header and the main content (an
  overlaying sticky banner covered buttons and touch targets, so it was dropped). The footer's
  "Cookie settings" link opens `/consent` (noindex), where the choice can be changed any time.
- One form for both paths: POST `/consent` through Gyral `formAction` (303 back to the page
  without JavaScript, JSON with it, the banner then closes in place). It is origin-verified
  instead of token-verified (ADR 0002 addendum).
- Analytics are recorded **on the server** by one middleware (`src/server/analytics.ts`): HTML
  page views (status 200) and successful add-to-cart posts, only with `analytics` consent,
  written through the database write lock. Server-side recording works without JavaScript, so
  there is no client analytics driver.

**Prerendered pages** (about, FAQ, terms, privacy; shop-2gz): the banner can't be decided at
build time, so those pages carry `<shop-consent deferred>`, which starts closed and, once
hydrated, opens only if `GET /api/me` reports `consentDecided: false`. Without JavaScript those
four pages show no banner; every server-rendered page still does.

## Implementation notes: prerendered pages (shop-7bj, shop-8c2)

- Static pages ask `GET /api/me` once through a shared visitor store (`src/ui/me/store.ts`);
  the header (account) and the deferred banner (decided? analytics?) both read it.
- They can't pass the server's analytics middleware, so after hydration a static page sends
  one `navigator.sendBeacon('/api/analytics/page-view', { path })`, only when `/api/me` says
  the visitor accepted analytics. The endpoint checks consent again, counts prerendered paths
  only, is origin-verified like the consent form (no session), and always answers 204.
