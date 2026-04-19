# DB Normalization Final State

Date: `2026-04-19`

Authoritative environment: Hetzner production DB on `87.99.149.56 / adsecute_prod`

Current production build:
- `463aa4b69cb5708c3a6d9bc3d73246a47477023c`

## Implemented state

- Canonical core authority is live in production:
  - `provider_accounts`
  - `provider_connections`
  - `integration_credentials`
  - `business_provider_accounts`
  - `provider_account_snapshot_runs`
  - `provider_account_snapshot_items`
- Request/runtime code reads the canonical core backbone instead of legacy `integrations`, `provider_account_assignments`, and `provider_account_snapshots`.
- Production observation scripts default to read-only behavior. They do not execute `runMigrations()` unless `ENABLE_RUNTIME_MIGRATIONS=1` is set explicitly.
- Ref coverage is complete for the current production state.
  - Ref tables scanned: `161`
  - Tables with ref gaps: `0`
- Current production control-plane verdicts for build `463aa4b69cb5708c3a6d9bc3d73246a47477023c` are healthy.
  - `exactRowsPresent = true`
  - `deployGate.verdict = pass`
  - `releaseGate.verdict = pass`
  - `repairPlan.recommendations = []`
  - web runtime `healthy`
  - worker runtime `healthy`
- Strict product-ready closeout is complete.
  - Runtime config now satisfies the strict closeout posture.
  - Legacy-core compatibility tables are removed from the live schema.
  - Google Ads short-gate closeout is complete, including accepted parity, smoke, and benchmark evidence.
  - Shopify cleanup cutover closeout is complete.
  - Shopify archive/state/dimension lanes are the accepted storage truth, and inline legacy payload/detail columns are dropped.
  - Meta closeout is gate-clean with a residual benchmark caveat recorded below.
  - DB Normalization Second Window destructive execute is not required for closeout.

## Removed compatibility surface

These legacy tables have been removed from the live database:
- `integrations`
- `provider_account_assignments`
- `provider_account_snapshots`

Historical export/backup dependencies for that removal were deleted from the live deploy and normalization workflows. The remaining workflow path is historical/manual preflight only.

## Operator controls

- Normalization audit gate:
  - `node --import tsx scripts/db-normalization-audit.ts --run-dir <tmp>`
- Before/after evidence tools:
  - `scripts/db-normalization-capture.ts`
  - `scripts/db-normalization-compare.ts`
  - `scripts/db-write-benchmark.ts`

## Closeout notes

- Normalization is closed.
- Strict control-plane closeout is satisfied.
- No active repair recommendations remain on the accepted build.
- The accepted second-window evidence is the current-build manual preflight bundle at `/tmp/adsecute-db-normalization-second-window-manual/463aa4b69cb5708c3a6d9bc3d73246a47477023c/preflight`.
- Historical failed second-window workflow runs are superseded by that accepted manual preflight evidence.
- `.github/workflows/db-normalization-second-window.yml` is now historical/manual preflight only and is retained for CI hygiene and historical traceability, not for destructive closeout execution.
- No pending provider normalization epic remains in the accepted product state.
- Same-build Meta evidence on `463aa4b69cb5708c3a6d9bc3d73246a47477023c` is clean for gate truth, watch-window acceptance, smoke, and parity.
- Fresh Meta short-gate benchmark evidence on the same build still shows historical-range `p95` regressions for campaigns, adsets, and breakdowns versus the `2026-04-18` baseline.
- The gate-led readiness policy in `docs/architecture/meta-short-gate-readiness-note.md` treats Meta closure as gate/smoke/parity-led, so the current benchmark regression remains a documented non-blocking caveat rather than a release-gate blocker.
- The in-repo serving/state docs and operator runbooks remain the source of historical traceability for this work.
