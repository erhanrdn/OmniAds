# DB Normalization Product-Ready Signoff

Purpose: define the exact final acceptance gate for calling the DB normalization program product-ready.

## Closeout state

The normalization program is now product-ready. The closeout conditions are satisfied:

- Canonical core is the only runtime authority.
- Legacy compatibility tables have been removed:
  - `integrations`
  - `provider_account_assignments`
  - `provider_account_snapshots`
- Request-time provider reads do not depend on warehouse `payload_json`.
- Provider config/state reads do not depend on fact-table config columns that were scheduled for dimension/history extraction.
- Current production control-plane state is clean:
  - `controlPlanePersistence.exactRowsPresent = true`
  - `deployGate.verdict = pass`
  - `releaseGate.verdict = pass`
  - `repairPlan.recommendations.length = 0`
- Runtime posture is strict and aligned with the closeout gate:
  - `SYNC_DEPLOY_GATE_MODE=block`
  - `SYNC_RELEASE_GATE_MODE=block`

Normalization is closed.

## Required commands

Run these from the same production credential/runtime context as the deployed system:

```bash
curl -fsS https://adsecute.com/api/build-info
node --import tsx scripts/sync-control-plane-verify.ts --build-id <sha> --environment production --provider-scope meta --require-block-modes
node --import tsx scripts/meta-watch-window.ts --expected-build-id <sha> --base-url https://adsecute.com --require-block-modes
node --import tsx scripts/db-normalization-audit.ts --run-dir /tmp/db-normalization-product-ready
npm run db:architecture:baseline
```

## Evidence window

The closeout state above held for at least:

- `72 hours`
- `3` normal deploy cycles

Whichever finishes later is the minimum signoff window.

## Current status on 2026-04-19

As of build `463aa4b69cb5708c3a6d9bc3d73246a47477023c`:

- control-plane verdicts are clean
- repair plan is empty
- runtime is healthy
- ref audit is clean
- legacy compatibility tables have been removed
- DB Normalization Second Window destructive execute is not required for closeout
- the accepted second-window evidence is the current-build manual preflight bundle at `/tmp/adsecute-db-normalization-second-window-manual/463aa4b69cb5708c3a6d9bc3d73246a47477023c/preflight`
- failed historical second-window workflow runs are superseded by that manual preflight evidence
- `.github/workflows/db-normalization-second-window.yml` is historical/manual preflight only
- Google Ads short gate is closed and parity/smoke/benchmark evidence is accepted
- Shopify cleanup cutover is closed
- Shopify archive/state/dimension lanes are the accepted storage truth, and inline legacy payload/detail columns are dropped
- Meta gate/watch/smoke/parity evidence is clean on the same build
- no pending provider normalization epic remains

## Residual non-blocking caveats

- Meta short-gate benchmark still shows historical-range `p95` regression versus the `2026-04-18` baseline, and this remains a documented non-blocking caveat under the gate-led readiness policy in `docs/architecture/meta-short-gate-readiness-note.md`.
- Future work, if any, is limited to product, performance, or architecture follow-up outside the accepted normalization closeout.
