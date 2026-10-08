# vendor/: Gyral 0.3.1-next.3 tarballs

The `@gyral/*` 0.3.1-next.3 packages the shop uses, directly or through each other: `core`,
`http`, `router`, `ssr`, `time` and `testing`. They are a **prerelease** of 0.3.1, packed
(`pnpm pack`) from Gyral branch `next`, commit `3239f6b`. 0.3.1 is not released yet.

**Why they are here:** neither Gyral 0.3.0 (released on GitHub, tag `v0.3.0`) nor 0.3.1 is on
npm yet (they are published once the owner approves), and the shop should not depend on a
sibling checkout. Every `@gyral/*` dependency and `pnpm.overrides` entry in `package.json`
points at `file:./vendor/<tarball>`; the overrides are needed because the packages depend on
each other by version (`0.3.1-next.3` exactly).

**How to remove them** once 0.3.1 is on npm: switch every `@gyral/*` dependency and
`pnpm.overrides` entry to `^0.3.1` (the overrides can then go, as the packages' own ranges
resolve from npm), delete `vendor/`, run `pnpm install`, and check that `pnpm-lock.yaml` no
longer mentions `vendor/`. Then update the Gyral notes in `AGENTS.md`, `ARCHITECTURE.md`,
ADR 0001 and ADR 0004. If only 0.3.0 reaches npm first, stay on these tarballs: the shop uses
0.3.1's `@gyral/time/delay` entry, which 0.3.0 lacks.

| File                             | SHA-256 (first 16) |
| -------------------------------- | ------------------ |
| `gyral-core-0.3.1-next.3.tgz`    | `771c4e899f08f480` |
| `gyral-http-0.3.1-next.3.tgz`    | `a527252e85ca11f2` |
| `gyral-router-0.3.1-next.3.tgz`  | `6af96c19ad0080a9` |
| `gyral-ssr-0.3.1-next.3.tgz`     | `75656d93001b273a` |
| `gyral-testing-0.3.1-next.3.tgz` | `5da45d7a5c7d53e2` |
| `gyral-time-0.3.1-next.3.tgz`    | `f2d40d4d1adb5bde` |
