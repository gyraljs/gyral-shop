# vendor/: Gyral 0.3.0 tarballs

The `@gyral/*` 0.3.0 packages the shop uses, directly or through each other: `core`, `http`,
`router`, `ssr`, `time` and `testing`. They were packed (`pnpm pack`) from Gyral tag `v0.3.0`,
commit `e79abd6`, the same source as the npm release.

**Why they are here:** Gyral 0.3.0 is released on GitHub but not yet on npm (it is published
once the owner approves), and the shop should not depend on a sibling checkout. Every `@gyral/*`
dependency and `pnpm.overrides` entry in `package.json` points at `file:./vendor/<tarball>`;
the overrides are needed because the packages depend on each other by version.

**How to remove them** once 0.3.0 is on npm: switch every `@gyral/*` dependency and
`pnpm.overrides` entry to `^0.3.0`, delete `vendor/`, run
`pnpm install`, and check that `pnpm-lock.yaml` no longer mentions `vendor/`. Then update the
Gyral notes in `AGENTS.md`, `ARCHITECTURE.md` and ADR 0001.

| File                      | SHA-256 (first 16) |
| ------------------------- | ------------------ |
| `gyral-core-0.3.0.tgz`    | `9a7fa71dcda07020` |
| `gyral-http-0.3.0.tgz`    | `a1af71f806ab804f` |
| `gyral-router-0.3.0.tgz`  | `d73961f8220ad471` |
| `gyral-ssr-0.3.0.tgz`     | `c44dcc2e483587d9` |
| `gyral-testing-0.3.0.tgz` | `113945d67b309a9a` |
| `gyral-time-0.3.0.tgz`    | `35050c3fe5cea533` |
