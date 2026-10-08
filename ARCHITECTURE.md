# Architecture

gyral-shop is one TypeScript package: a Hono server that renders Gyral components (SSR with
hydration), JSON/form endpoints, and a SQLite database through Drizzle ORM. No Effect in app
code (ADR 0001).

```text
browser ── HTTP ──► server (Hono) ──► services (use-cases) ──► db (Drizzle repos) ──► SQLite
   ▲                   │  renders                │ uses
   └── hydrates ◄── ui (Gyral components, stores) ◄── domain (pure types + rules) ──┘
```

## Layers (enforced by `eslint.config.js`)

| Layer    | Path           | Holds                                                                           | May import               |
| -------- | -------------- | ------------------------------------------------------------------------------- | ------------------------ |
| domain   | `src/domain`   | Types, money, pricing, tax, promos, inventory, order state machine. Pure.       | nothing in `src/`        |
| config   | `src/config`   | Env/settings parsed with valibot                                                | domain                   |
| db       | `src/db`       | Drizzle schema, migrations, seed, repositories                                  | domain, config           |
| services | `src/services` | Use-cases: catalog, search, auth, cart, checkout, payments, orders, admin, mail | domain, config, db       |
| server   | `src/server`   | Hono app, routes, middleware (session, CSRF, RBAC, rate limit), page rendering  | everything except client |
| ui       | `src/ui`       | Gyral components, pages, stores (ADR 0013 in Gyral), http drivers               | domain, `@gyral/*`       |
| client   | `src/client`   | Browser entry: hydrate support, then ui                                         | ui, domain               |

`ui/` ships to the browser, so it never imports db, services, config or server code. Data
reaches it as props (SSR) or over HTTP.

## Rendering modes per route

- **ssr:** every other storefront page: home, departments, catalog, search, product pages and
  reviews, cart, checkout, account, wishlist, orders, contact. Personalized or live data, SEO
  matters for catalog pages.
- **ssg:** content pages (about, FAQ, terms, privacy), prerendered by `pnpm build`
  (`src/server/prerender.ts`, Gyral `@gyral/ssr/static`) and served from `dist/static`. They
  carry no per-visitor data: the header fetches `/api/me` and the mini-cart loads the cart
  after hydration (`personalize` on `<shop-header>`, `static: true` page option).
  `pnpm start` serves hashed assets immutable, static pages with revalidation, and everything
  else per request, adding the security headers to files served from disk.
- **csr:** admin UI behind auth.

## Gyral

`@gyral/*` 0.3.1-next.3 (prerelease tarballs in `vendor/` until 0.3.1 is on npm; ADR 0001). Gyral renders
with its own view layer (Gyral ADR 0018): `html`, `css`, `each`, `raw`, the
`invalid`/`labelledBy` hooks and the `prop.*` builders come from `@gyral/core`; there is no
Lit. `gyralVitePreset()` adds the template compiler to `vite build` (templates precompiled and
checked against Gyral's template rules); `@gyral/core/eslint` reports the same rules in the
editor. The server renders with `@gyral/core/server` (via `@gyral/ssr`'s `renderPage`), each
component hydrates on its own in the browser (no hydration import, no module-order rules), and
production pages preload the entry's chunks, Gyral's lazily loaded hydration chunk and the
page's own route chunks: each page lists the lazily loaded modules its components need
(`chunks`, from `src/server/route-chunks.ts`, kept in step with `src/client/lazy.ts` by a test).

Form state is live, and written only when the model's value changes (Gyral view/02-bindings.md
"Live form state"): `value=`, `?checked=`, `?selected=`, `<textarea>` content and `?open` take
the model's value when it changes, even over an edit, and any other render (a pending submit, a
rejection, another field's message) leaves the control as the user left it. So models hold
records and server answers, not copies of what the user typed. To put a control back, change
the model: a form that must start empty after a success is a keyed row whose key counts its
successes (`freshAfterSave` in `ui/admin/fields.ts`: stock adjustments, new variants and taxa).
A disclosure whose `?open` follows a count the user can change under it follows its `toggle`
event instead (listing filters).
