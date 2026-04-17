# DB Normalization Second Window Runbook

Purpose: remove the retired legacy core tables after stabilization closes cleanly.

Tables to remove:
- `integrations`
- `provider_account_assignments`
- `provider_account_snapshots`

## Preconditions

- Stabilization window is clean for at least `72 hours` and `3` normal deploy cycles.
- `scripts/db-normalization-audit.ts` reports:
  - `tablesWithRefGaps = 0`
- Current build-info reports:
  - `exactRowsPresent = true`
  - `deployGate = pass`
  - `releaseGate = pass`
- Grep/test pass confirms runtime no longer depends on the retired tables.

## Window steps

1. Before capture

```bash
node --import tsx scripts/db-normalization-capture.ts --phase before --run-dir /tmp/db-normalization-second-window
node --import tsx scripts/db-normalization-audit.ts --run-dir /tmp/db-normalization-second-window
```

2. Backup

Use the existing production backup flow and record the backup location in the operator ticket.

3. Export retained compatibility tables

```bash
pg_dump "$DATABASE_URL" --data-only --table=integrations --file /tmp/db-normalization-second-window/integrations.sql
pg_dump "$DATABASE_URL" --data-only --table=provider_account_assignments --file /tmp/db-normalization-second-window/provider_account_assignments.sql
pg_dump "$DATABASE_URL" --data-only --table=provider_account_snapshots --file /tmp/db-normalization-second-window/provider_account_snapshots.sql
```

4. Stop web and worker

Do not run the destructive phase while request traffic is still active.

5. Apply legacy-core cleanup migration

```bash
export ENABLE_RUNTIME_MIGRATIONS=1
export DB_DROP_LEGACY_CORE_TABLES=1
npm run db:migrate
```

6. Restart web and worker

7. Post-window smoke

```bash
curl -fsS https://adsecute.com/api/build-info
node --import tsx scripts/sync-control-plane-verify.ts --build-id <new-build-sha> --environment production --provider-scope meta
node --import tsx scripts/db-normalization-audit.ts --run-dir /tmp/db-normalization-second-window
npm run db:architecture:baseline
```

Note:
- `sync-control-plane-verify.ts` must run in the same production DB credential context as the deployment being verified.

8. After capture and compare

```bash
node --import tsx scripts/db-normalization-capture.ts --phase after --run-dir /tmp/db-normalization-second-window
node --import tsx scripts/db-normalization-compare.ts --run-dir /tmp/db-normalization-second-window
```

## Acceptance

- `integrations`, `provider_account_assignments`, and `provider_account_snapshots` no longer exist.
- `db-normalization-audit` still reports `tablesWithRefGaps = 0`.
- `build-info` still reports clean control-plane state.
- Targeted overview, Meta, Google Ads, and Shopify read smoke responses preserve their existing contracts.

## Rollback

- Restore from the production backup taken at the start of the window.
- Re-deploy the last known good build if the restart build differs from the pre-window build.
