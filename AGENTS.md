# AGENTS.md — gyral-shop

A department-store web app built with Gyral. This file is a **map**; the linked docs are the
system of record.

## Start every session

1. `bd prime`, then `bd ready`. Beads is the only task tracker. Claim before coding
   (`bd update <id> --claim`), file discovered work with `--deps discovered-from:<id>`,
   close with `--reason`. Never run two `bd` commands at once (Dolt lock contention).
2. Read the product spec for the feature and the design doc for the area you touch.

## Commands

| Command                     | What it does                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm install`              | Install (Gyral is linked from `../cyclejs-web-framework`)                                                                                  |
| `pnpm check`                | **The gate**: typecheck, lint, format, invariants, tests                                                                                   |
| `pnpm dev`                  | Dev server with SSR + HMR: http://localhost:5200                                                                                           |
| `pnpm build`                | Production client build + prerender static pages (needs a seeded DB)                                                                       |
| `pnpm start`                | Production server (`APP_SECRET` required; `SITE_ORIGIN` for static pages)                                                                  |
| `pnpm db:reset`             | Recreate `data/shop.db`, migrate, seed                                                                                                     |
| `pnpm db:purge`             | Delete expired sessions and orphaned guest carts (servers also do it hourly)                                                               |
| `pnpm db:generate`          | Generate a migration after editing `src/db/schema.ts`                                                                                      |
| `pnpm ui:check [page…]`     | Screenshots + console/overflow/axe per page template, light/dark × desktop/phone (`ui-scenarios/`); `--baseline`/`--compare`               |
| `pnpm themes:check [page…]` | `ui:check` under every theme × light/dark × desktop/phone; matrix in `.ui-check/themes/`. Run before merging theme or shared-style changes |
| `pnpm smoke:prod`           | Production build hydrates in place (part of `pnpm check`, ~20 s)                                                                           |
| `pnpm perf`                 | Production-build performance budgets (LCP, CLS, JS size), ~45 s                                                                            |
| `pnpm ci:local`             | Run CI locally in Docker via `gh act`                                                                                                      |

## Where things are

| Path                                               | Contents                                        |
| -------------------------------------------------- | ----------------------------------------------- |
| [ARCHITECTURE.md](ARCHITECTURE.md)                 | Layers, allowed imports, render modes           |
| [docs/product-specs/](docs/product-specs/index.md) | What each feature must do (acceptance criteria) |
| [docs/design-docs/](docs/design-docs/index.md)     | Decisions (ADRs)                                |
| `src/domain` … `src/client`                        | The layers, in dependency order                 |
| `test/node`, `test/browser`                        | Cross-layer tests (route + DB, full pages)      |

## Read before changing…

| Area                                   | Read                                                                         |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| Anything                               | [core-beliefs.md](docs/design-docs/core-beliefs.md)                          |
| Dependencies, Gyral link, no Effect    | [0001-stack.md](docs/design-docs/0001-stack.md)                              |
| Auth, sessions, CSRF, roles, passwords | [0002-security.md](docs/design-docs/0002-security.md)                        |
| Money, prices, tax, promos, inventory  | [0003-money-and-pricing.md](docs/design-docs/0003-money-and-pricing.md)      |
| CI                                     | [0004-local-ci.md](docs/design-docs/0004-local-ci.md)                        |
| **Any markup or CSS**                  | [0006-theming.md](docs/design-docs/0006-theming.md) (binding theme contract) |
| Writing tests, fixtures                | [0005-testing.md](docs/design-docs/0005-testing.md)                          |

## Skills to load

- `lit-web-apps` (SSR, routing, testing), `modern-css` (all styles), `semantic-html` (all
  markup), `google-seo-fundamentals` (catalog/product/content pages), `beads`.
- Do **not** load `effect-fp-skill`: app code has no Effect.
- For framework behaviour, read Gyral's docs in `../cyclejs-web-framework/docs/design-docs/`.

## Hard rules (enforced by `pnpm check`)

- Layer imports per ARCHITECTURE.md; no `effect` anywhere; Gyral via public entry points.
- **Theme contract (ADR 0006), for every UI change:** semantic markup with `data-region` /
  `data-component` hooks, styles in `@layer reset, tokens, base, components, theme`, every
  colour, font, radius and shadow from a token (no literals, no literal `var()` fallbacks;
  `scripts/check-styles.mjs`), widgets expose `::part()`s, and the ADR's hook and part tables
  are updated when you add hooks or parts.
- Text bindings never render `''` for "no content": use `nothing` (Lit can't hydrate empty text
  parts; `scripts/check-templates.mjs`).
- Money is integer cents (`domain/money.ts`), never floats.
- Every external input is parsed with valibot at the boundary (forms, JSON, env, DB seeds).
- Workflows trigger on `workflow_dispatch` only. Files ≤ 300 lines. No `any`, no `!`.
- Every design doc and product spec is listed in its folder's index.

## When stuck

Treat it as a missing capability: add the doc, lint, test or fixture that would have
prevented it, or file a bead. If Gyral itself is missing something, file it in the Gyral repo
(`bd` there) and link it from here.
