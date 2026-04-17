# DB Normalization Final State

Date: `2026-04-17`

Authoritative environment: Hetzner production DB on `87.99.149.56 / adsecute_prod`

Current production build:
- `bca7a6962c0ae14fa05cc3b21abaa34f7607d6d4`

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
  - Audit sampled at `2026-04-17T09:29:03.378Z`
  - Ref tables scanned: `161`
  - Tables with ref gaps: `0`
- Current production control-plane verdicts for build `bca7a6962c0ae14fa05cc3b21abaa34f7607d6d4` are healthy.
  - `exactRowsPresent = true`
  - `deployGate.verdict = pass`
  - `releaseGate.verdict = pass`
  - `repairPlan.recommendations = []`
  - web runtime `healthy`
  - worker runtime `healthy`
- Strict product-ready closeout is still pending.
  - Runtime config still reports `SYNC_RELEASE_GATE_MODE=measure_only`.
  - Product-ready signoff requires block-mode gates plus the clean verdicts above.
  - The retained legacy compatibility tables still need the second maintenance window.

## Retained compatibility surface

These tables are no longer authoritative, but they are still retained for the second maintenance window:
- `integrations`
- `provider_account_assignments`
- `provider_account_snapshots`

Observed retained row counts on `2026-04-17T09:29:03.378Z`:
- `integrations = 19`
- `provider_account_assignments = 6`
- `provider_account_snapshots = 2`

## Operator controls

- Normalization audit gate:
  - `node --import tsx scripts/db-normalization-audit.ts --run-dir <tmp>`
- Before/after evidence tools:
  - `scripts/db-normalization-capture.ts`
  - `scripts/db-normalization-compare.ts`
  - `scripts/db-write-benchmark.ts`
- Second-window cleanup switch:
  - `DB_DROP_LEGACY_CORE_TABLES=1`
- Legacy compat creation switch:
  - `DB_ENABLE_LEGACY_CORE_COMPAT_TABLES=1`

## Remaining follow-up

- Second maintenance window still needs to remove the retained compatibility tables.
- Strict control-plane closeout still needs release-gate mode promotion from `measure_only` to `block`.
- Meta, Google Ads, and Shopify warehouse tables still need deeper `dimension / fact / config_history` separation.
- Serving/state docs and operator runbooks are now in-repo, but the raw production artefacts remain intentionally outside the repository.
