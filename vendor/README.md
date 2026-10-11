# Historical Gyral prerelease artifacts

The shop now installs exact npm 0.3.1 packages without overrides. These unchanged next.9 archives and their provenance are retained for historical review; no dependency or deployment installs them.

# vendor/: Gyral 0.3.1-next.9 tarballs

The `@gyral/*` 0.3.1-next.9 packages the shop uses, directly or through each other: `core`,
`http`, `router`, `ssr`, `time` and `testing`. They are a **prerelease** of 0.3.1, packed
(`pnpm pack`) from Gyral branch `next`, commit `78052c4`. 0.3.1 is not released yet.

**Why they are here:** neither Gyral 0.3.0 (released on GitHub, tag `v0.3.0`) nor 0.3.1 is on
npm yet (they are published once the owner approves), and the shop should not depend on a
sibling checkout. Every `@gyral/*` dependency and `pnpm.overrides` entry in `package.json`
points at `file:./vendor/<tarball>`; the overrides are needed because the packages depend on
each other by version (`0.3.1-next.9` exactly).

**How to remove them** once 0.3.1 is on npm: switch every `@gyral/*` dependency and
`pnpm.overrides` entry to `^0.3.1` (the overrides can then go, as the packages' own ranges
resolve from npm), delete `vendor/`, run `pnpm install`, and check that `pnpm-lock.yaml` no
longer mentions `vendor/`. Then update the Gyral notes in `AGENTS.md`, `ARCHITECTURE.md`,
ADR 0001 and ADR 0004. If only 0.3.0 reaches npm first, stay on these tarballs: the shop uses
0.3.1 APIs (`keyed`, `every`, driver tokens, automatic components) that 0.3.0 lacks.

| File                             | SHA-256 (first 16) |
| -------------------------------- | ------------------ |
| `gyral-core-0.3.1-next.9.tgz`    | `b44e5eb6807e1e8f` |
| `gyral-http-0.3.1-next.9.tgz`    | `c956ee7160b8e260` |
| `gyral-router-0.3.1-next.9.tgz`  | `a67cb6578b7595b7` |
| `gyral-ssr-0.3.1-next.9.tgz`     | `0a90919704012aea` |
| `gyral-testing-0.3.1-next.9.tgz` | `71b68152257c9f88` |
| `gyral-time-0.3.1-next.9.tgz`    | `7886124659e9fab2` |
