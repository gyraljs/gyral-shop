# ADR 0007 — Deployment: the public demo at demo-shop.gyral.dev

Status: **accepted** (2026-10-13). Supersedes the "Local only" line of
[ADR 0001](0001-stack.md). Keeps [ADR 0004](0004-local-ci.md): nothing builds or deploys on push.

## Decision

The shop has one deployment: **https://demo-shop.gyral.dev**, a public demo. It runs as one Docker
container on the owner's VPS behind the Traefik that already serves `mcp.gyral.dev`, and
[`deploy/compose.yaml`](../../deploy/compose.yaml) mirrors that service's compose file. Payments
stay mocked and mail stays in the database outbox, so the demo takes no money and sends nothing.
The steps are in [deploying.md](../references/deploying.md).

## The image (`Dockerfile`)

- **Multi-stage, pinned.** `node:24.x.y-bookworm-slim`, a Node 24 patch at least two weeks old,
  pinned by the digest of its multi-arch index through the `NODE_IMAGE` build argument. pnpm comes from Node 24's corepack, at the version
  `package.json`'s `packageManager` names; installs use `--frozen-lockfile`.
- **Build stage:** `pnpm build` against a throwaway seeded database (prerendering reads the
  departments), with `SITE_ORIGIN` as a build argument because the prerendered content pages
  carry it in their canonical links and structured data. The image records it in a label and
  uses it as the default `SITE_ORIGIN`, and the runtime value must match.
- **Runtime stage:** production dependencies (`pnpm install --prod`, installed on the target
  platform, so `@libsql/client`'s `linux-x64-gnu` binary and esbuild's binary match),
  `dist/`, `src/`, `drizzle/`. It runs `node --import tsx src/server/prod.ts`, which is
  `pnpm start` without a package manager.
- **tsx at runtime, on purpose.** `pnpm start` already runs the server's TypeScript through tsx.
  Precompiling it would add a second build of the server and the components it renders, and
  could fail on its own, while tsx costs a few seconds of compilation at the first start (cached
  in `/tmp`) and about 12 MB (tsx and esbuild's binary). So `tsx` is a dependency, and so is `@faker-js/faker`, because the
  server writes the seed itself (below).
- **Hardening** (compose): read-only root filesystem with a `tmpfs` on `/tmp` (tsx's cache),
  the image's non-root `node` user, `cap_drop: ALL`, `no-new-privileges`, memory, CPU and PID
  limits, `init`, a health check on `GET /healthz`, and log rotation. The only writable path is
  the named volume on `/app/data` (the SQLite database and its WAL files).
- **Built by hand.** The owner builds and pushes `registry.livepeer.tools/gyraljs/gyral-shop`
  with tags `sha-<commit>` and `latest`. The server runs it by digest (`GYRAL_SHOP_IMAGE` in
  `deploy/.env`), so a deploy changes only when the owner changes that digest.

## Behind the proxy: `TRUST_PROXY`

Every connection comes from Traefik, so without help all visitors share Traefik's address as
their rate-limit key (ADR 0002), and one visitor's failed sign-ins would lock out everyone.
`TRUST_PROXY=1` (`src/config/env.ts`, off by default) makes production read the client
address from `X-Forwarded-For` and accept the forwarded origin (`X-Forwarded-Proto/Host`) in the
CSRF check. Set it only when the app is reachable solely through a proxy that overwrites those
headers. Traefik does this by default: unless its entrypoint lists trusted IPs, it replaces
whatever `X-Forwarded-*` a client sent. The container publishes no ports, so it can be reached
only through Traefik. If a CDN ever sits in front of Traefik, configure Traefik's
`forwardedHeaders.trustedIPs` for it, or every visitor gets the CDN's address again.

## Health: `GET /healthz`

It answers `200 {"status":"ok"}` when the database answers a read of a migrated table, and
`503 {"status":"unavailable"}` otherwise, with nothing else (no version, counts or errors). It
starts no session, is never cached, and isn't rate limited by the app; Traefik's limits cover
it from outside (`src/server/routes/health.ts`).

## Demo mode: `DEMO_RESET_AT`

A public store with a known customer password fills up with strangers' orders, reviews and
accounts. With `DEMO_RESET_AT=HH:MM` set (local time in `STORE_TIME_ZONE`), the server:

1. **At startup, before it listens:** applies pending migrations and seeds the database if it
   has no products (`prepareDemo`, `src/services/demo.ts`). A new, empty volume therefore needs
   no manual step, and an image that brings a migration applies it. A restart keeps a seeded
   database as it is.
2. **Every night at that time:** puts the database back to the freshly seeded state
   (`startDemoResetSchedule`, `src/services/demo-schedule.ts`; `resetToSeed`,
   `src/db/seed/reset.ts`) and logs each reset with its duration.

The seed is the one `pnpm db:seed` writes (`demoSeed`, shared by the script and the server). The
admin's password comes from `SEED_ADMIN_PASSWORD` at runtime and is applied again at every
reset. Production refuses to seed or reset with the public default password: `loadConfig()`
fails at startup when demo mode is on and `SEED_ADMIN_PASSWORD` is unset or the default, and
`pnpm db:seed` under `NODE_ENV=production` does the same. Customers keep the public password
`gyral-customer-2026`, which visitors are meant to use.

### Why the reset is safe

It is **one SQLite write transaction** on the server's own connection: it empties every
application table, clears the AUTOINCREMENT counters and writes the seed again.

- **Readers** never see a half-reset store. Under WAL (ADR 0001) each read works from the last
  committed snapshot: the old store until the commit, the new store after it. No read waits.
- **Writers** in the process queue behind it on the write lock (`src/db/tx.ts`), so none
  interleaves with it. A writer from another process (`pnpm db:purge`) gets `SQLITE_BUSY` and
  is retried. The seed data and password hashes are computed before the lock is taken, so the
  lock is held only while the transaction writes: about 0.2 s for the full catalog on a laptop
  (the whole reset, preparation included, logged 0.7–0.8 s in the container).
- **Failure** of any kind (full disk, crash, bug) rolls the whole transaction back and leaves
  yesterday's store intact. A failed reset is logged and tried again the next night.
- **Completeness:** the tables come from `sqlite_master`, so a table added by a later migration
  is emptied too. Foreign keys are checked at commit (`defer_foreign_keys`), so the deletion
  order doesn't matter. The FTS5 search index is emptied through its virtual table, never
  through its shadow tables, and its triggers rebuild it from the new products. Drizzle's
  migration journal is kept.
- **Sessions** are deleted, so every visitor is signed out. A request still carrying an old
  session cookie is treated as a guest, and the cookie is cleared.
- **Caches:** the header's department list is cached per app and keyed by the catalog change
  counter. The server shares that counter with the reset (`catalogChanges()`), and the reset
  bumps it.

`test/node/demo-reset.test.ts` compares every row of every table, the search index and the
counters after a day of use (sign-up, order, payment, review, wishlist, guest cart, analytics, a
reset request, admin edits) with a fresh seed. It also checks that a failed reset rolls back
completely and that a concurrent write waits for the reset and lands on the new data.
`src/services/demo-schedule.test.ts` runs the clock on fake timers: once a night, never at
startup, across both daylight-saving changes, late rather than never, no overlap.

### Rejected alternatives

- **Host cron** (`docker compose exec … pnpm db:reset`): the owner doesn't want host-level
  jobs, and a second process can't take the server's write lock or refresh its caches. It would
  also have to delete the database file under a running server.
- **Seed a new file and swap it in:** the app holds one libsql connection, captured by
  services, routes and middleware, so swapping would need an indirection everywhere. Renaming a
  SQLite file under open connections is unsafe with WAL: open connections keep the old inode,
  and the `-wal`/`-shm` sidecar files must move with the main file atomically, which a rename
  can't do. A transaction gives the same atomicity with SQLite's own guarantees.

### Not reset

- **In-memory rate-limit windows** (sign-in, registration, password reset, contact, order
  lookup) belong to the process, are keyed by address or email, and expire within an hour.
- **Visitor preferences in cookies** (theme, consent) aren't store data. Signed order-access
  cookies name random order numbers that no longer exist, so they show nothing (404).

## Consequences

- One process and one SQLite file. More replicas would need shared rate limits and a different
  write coordination (ADR 0001), so the compose file runs exactly one.
- Backups are optional: the store is rebuilt every night. `deploying.md` shows how to take one
  with `VACUUM INTO` if a day's data ever matters.
- Rollback means pointing `GYRAL_SHOP_IMAGE` at the previous digest. Migrations only go
  forward, so after an image that migrated, the older image may need a fresh volume; demo data
  makes that cheap.
