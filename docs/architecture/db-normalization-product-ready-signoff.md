# DB Normalization Product-Ready Signoff

Purpose: define the exact final acceptance gate for calling the DB normalization program product-ready.

## Required state

All of the following must be true at the same time:

- Canonical core is the only runtime authority.
- Legacy compatibility tables are removed:
  - `integrations`
  - `provider_account_assignments`
  - `provider_account_snapshots`
- Request-time provider reads do not depend on warehouse `payload_json`.
- Provider config/state reads do not depend on fact-table config columns that are scheduled for dimension/history extraction.
- Current production control-plane state is clean:
  - `controlPlanePersistence.exactRowsPresent = true`
  - `deployGate.verdict = pass`
  - `releaseGate.verdict = pass`
  - `repairPlan.recommendations.length = 0`
- Runtime posture is strict:
  - `SYNC_DEPLOY_GATE_MODE=block`
  - `SYNC_RELEASE_GATE_MODE=block`

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

The state above must hold for at least:

- `72 hours`
- `3` normal deploy cycles

Whichever finishes later is the minimum signoff window.

## Current status on 2026-04-17

As of build `bca7a6962c0ae14fa05cc3b21abaa34f7607d6d4`:

- control-plane verdicts are clean
- repair plan is empty
- runtime is healthy
- ref audit is clean

But final signoff is still pending because:

- retained legacy compatibility tables are still present
- runtime `SYNC_RELEASE_GATE_MODE` is still `measure_only`
- provider warehouse redesign epics are not complete yet
