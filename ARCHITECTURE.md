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

## Rendering modes per route (lit-web-apps skill)

- **ssr:** catalog, search, product pages, cart, checkout, account, orders. Personalized or
  live data, SEO matters for catalog pages.
- **ssg:** content pages (about, FAQ, terms, privacy), prerendered by `pnpm build`
  (`src/server/prerender.ts`, Gyral `@gyral/ssr/static`) and served from `dist/static`. They
  carry no per-visitor data: the header fetches `/api/me` and the mini-cart loads the cart
  after hydration (`personalize` on `<shop-header>`, `static: true` page option).
  `pnpm start` serves hashed assets immutable, static pages with revalidation, and everything
  else per request, adding the security headers to files served from disk.
- **csr:** admin UI behind auth.

## Gyral

`@gyral/*` ^0.1.0 from npm (published with provenance). Lit is a peer dependency, so exactly
one copy runs; `gyralVitePreset()` dedupes it in Vite as a guard.
