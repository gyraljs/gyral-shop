# gyral-shop

A department-store web app (think Target/Walmart, much smaller) built with
[Gyral](https://github.com/mikezupper/gyral), a Model-View-Intent framework on web standards.
It exists to show a complete, realistic project, not a toy.

**Features:** department catalog with filters, search, product pages, accounts (register,
login, password reset), cart, checkout with shipping, tax and promo codes, mock payments,
order history, wishlist and reviews, content pages, SEO, a consent banner, and an admin UI.

**Stack:** TypeScript (no Effect in app code), Gyral + Lit, Hono, Drizzle ORM + SQLite,
valibot, Vitest (browser mode) + Playwright.

## Getting started

Gyral is linked from a sibling checkout:

```sh
git clone git@github.com:mikezupper/gyral.git cyclejs-web-framework   # next to this repo
(cd cyclejs-web-framework && pnpm install)
pnpm install
pnpm exec playwright install chromium
pnpm db:reset      # create data/shop.db, migrate, seed the catalog
pnpm dev           # http://localhost:5200
pnpm check         # typecheck, lint, format, invariants, tests
```

Production (Gyral ADR 0016): a Vite client build plus the static content pages prerendered at
build time, served by a Hono production server.

```sh
pnpm db:reset      # the prerender step reads departments from the database
pnpm build         # dist/client (hashed assets) + dist/static (about, FAQ, terms, privacy)
NODE_ENV=production APP_SECRET=<32+ chars> SITE_ORIGIN=https://your.host pnpm start
```

Docs: [ARCHITECTURE.md](ARCHITECTURE.md), [design docs](docs/design-docs/index.md),
[product specs](docs/product-specs/index.md). Work is tracked in beads (`bd ready`).
