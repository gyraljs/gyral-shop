# ADR 0004 — CI runs locally

Status: **accepted** (2026-10-04). Same policy as Gyral's ADR 0004.

Workflows in `.github/workflows/` trigger on `workflow_dispatch` only (checked by
`scripts/check-workflows.mjs`) and run locally with `pnpm ci:local` (`gh act` in Docker).
The workflow needs nothing outside this repo (Gyral comes from npm or, until 0.3.0 is
published there, from `vendor/`); the local run passes your `gh auth token` as `GITHUB_TOKEN`
so act can fetch the actions it uses. (Until 2026-10-05 Gyral was linked and the workflow also
checked out `gyraljs/gyral` beside this repo.)

## Addendum: wrapper and results (2026-10-05)

`pnpm ci:local` runs `scripts/ci-local.mjs` (ported from Gyral): it passes `gh auth token` as
the `GITHUB_TOKEN` secret (act masks it), tees act's output, and exits by the jobs' own
results (`scripts/lib/act.mjs`), not act's exit code, which can be non-zero after a green job
when container cleanup times out. Run from a git _worktree_, act copies a `.git` file that
points at a host path, so `scripts/check-fixtures.mjs` skips (with a warning) inside the
container; from the main checkout it runs.
