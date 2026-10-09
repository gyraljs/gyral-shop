# vendor/: Gyral 0.3.1-next.7 tarballs

The `@gyral/*` 0.3.1-next.7 packages the shop uses, directly or through each other: `core`,
`http`, `router`, `ssr`, `time` and `testing`. They are a **prerelease** of 0.3.1, packed
(`pnpm pack`) from Gyral branch `next`, commit `0b96681`. 0.3.1 is not released yet.

**Why they are here:** neither Gyral 0.3.0 (released on GitHub, tag `v0.3.0`) nor 0.3.1 is on
npm yet (they are published once the owner approves), and the shop should not depend on a
sibling checkout. Every `@gyral/*` dependency and `pnpm.overrides` entry in `package.json`
points at `file:./vendor/<tarball>`; the overrides are needed because the packages depend on
each other by version (`0.3.1-next.7` exactly).

**How to remove them** once 0.3.1 is on npm: switch every `@gyral/*` dependency and
`pnpm.overrides` entry to `^0.3.1` (the overrides can then go, as the packages' own ranges
resolve from npm), delete `vendor/`, run `pnpm install`, and check that `pnpm-lock.yaml` no
longer mentions `vendor/`. Then update the Gyral notes in `AGENTS.md`, `ARCHITECTURE.md`,
ADR 0001 and ADR 0004. If only 0.3.0 reaches npm first, stay on these tarballs: the shop uses
0.3.1's `@gyral/time/delay` entry, which 0.3.0 lacks.

| File                             | SHA-256 (first 16) |
| -------------------------------- | ------------------ |
| `gyral-core-0.3.1-next.7.tgz`    | `9b56427f2e779251` |
| `gyral-http-0.3.1-next.7.tgz`    | `be80878c4d3f4adf` |
| `gyral-router-0.3.1-next.7.tgz`  | `364c98d6cee1e45a` |
| `gyral-ssr-0.3.1-next.7.tgz`     | `589bec79e13c1a15` |
| `gyral-testing-0.3.1-next.7.tgz` | `9740c4c8ccbe28ee` |
| `gyral-time-0.3.1-next.7.tgz`    | `01746ea3dae80e72` |
