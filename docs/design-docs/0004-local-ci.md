# ADR 0004 — CI runs locally

Status: **accepted** (2026-10-04). Same policy as Gyral's ADR 0004.

Workflows in `.github/workflows/` trigger on `workflow_dispatch` only (checked by
`scripts/check-workflows.mjs`) and run locally with `pnpm ci:local` (`gh act` in Docker).
Because Gyral is linked, the workflow checks out `mikezupper/gyral` next to this repo; the
local run passes your `gh auth token` as `GITHUB_TOKEN` to read the private repo.
