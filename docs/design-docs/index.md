# Design docs

Why gyral-shop is built the way it is. Work items live in beads. Every file here must be
listed below (`pnpm invariants` checks).

| Doc                                                    | Status   | Summary                                                                                                        |
| ------------------------------------------------------ | -------- | -------------------------------------------------------------------------------------------------------------- |
| [core-beliefs.md](core-beliefs.md)                     | accepted | Principles for humans and agents                                                                               |
| [0001-stack.md](0001-stack.md)                         | accepted | TypeScript without Effect, Gyral via link, Hono, Drizzle + SQLite, valibot                                     |
| [0002-security.md](0002-security.md)                   | accepted | Sessions, password hashing, CSRF, roles, rate limits                                                           |
| [0003-money-and-pricing.md](0003-money-and-pricing.md) | accepted | Integer cents, price pipeline, tax, promos, inventory reservation                                              |
| [0004-local-ci.md](0004-local-ci.md)                   | accepted | CI workflows that only run locally via `gh act`                                                                |
| [0005-testing.md](0005-testing.md)                     | accepted | Unit, route (in-memory DB), page (SSR fixture + hydrate + axe) and no-JS end-to-end tests                      |
| [0006-theming.md](0006-theming.md)                     | accepted | Zen Garden theme contract: semantic hooks, layers, tokens only, light-DOM pages, widget parts, theme switching |
