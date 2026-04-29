# PR #84 Merge Readiness

Date: 2026-04-29

## 1. CI status

Status target: latest pushed commit on `codex/canonical-decision-refactor`.

Run URLs:

- PR checks: https://github.com/erhanrdn/OmniAds/pull/84/checks
- CI workflow filtered to branch: https://github.com/erhanrdn/OmniAds/actions/workflows/ci.yml?query=branch%3Acodex%2Fcanonical-decision-refactor

Required checks:

- Typecheck: must be green.
- Test: must be green.
- Creative Decision OS v2 safety: must be green.
- Lint: no separate lint job exists in `.github/workflows/ci.yml`; current CI coverage is typecheck, test, creative:v2:safety, and PR build.

Local pre-push verification on this workspace:

```bash
npx tsc --noEmit
npm test
npm run creative:v2:safety
```

Result: passed after merging `origin/main` into `codex/canonical-decision-refactor`.

- `npm test`: 318 files passed, 2364 tests passed.
- `npm run creative:v2:safety`: 9 files passed, 52 tests passed, severe/high mismatches `0`.

## 2. Branch state

`origin/main` was merged into `codex/canonical-decision-refactor` before this readiness brief. The merge kept the canonical resolver primary-action contract and accepted the main-branch CI auto-deploy guard.

Expected branch check after this commit is pushed:

```bash
git fetch origin
git rev-list --left-right --count origin/main...codex/canonical-decision-refactor
```

Required result: left count `0`, meaning the PR branch is not behind `main`.

## 3. Auto-deploy guard verification

`.github/workflows/ci.yml` contains this push guard:

```yaml
on:
  push:
    branches:
      - main
    paths-ignore:
      - 'docs/team-comms/**'
      - '.github/workflows/ci.yml'
```

This excludes `docs/team-comms/**` and `.github/workflows/ci.yml` from main-push CI dispatch, so docs-only sequence updates and CI guard edits do not trigger the production deploy chain. Mixed runtime plus docs commits can still run CI; production promotion for PR #84 is manual only through `deploy-hetzner.yml` with an explicit SHA.

## 4. Migration list

The first `run_migrations=true` deploy for PR #84 adds these tables:

- `creative_canonical_resolver_flags`
- `creative_canonical_cohort_assignments`
- `admin_feature_flag_kill_switches`
- `creative_canonical_decision_events`
- `creative_canonical_resolver_admin_controls`

Idempotency: all five tables are created with `CREATE TABLE IF NOT EXISTS` in `lib/migrations.ts`. Supporting indexes use `CREATE INDEX IF NOT EXISTS`.

## 5. Direct 100% activation values

Owner-approved single-user cutover uses direct 100% activation after the manual deploy is verified.

SQL-only activation command:

```sql
INSERT INTO creative_canonical_cohort_assignments (
  business_id,
  cohort,
  source,
  assigned_at,
  kill_switch_active_at,
  updated_at
)
SELECT
  id::text,
  'canonical-v1',
  'rollout_percent_assigned',
  now(),
  NULL,
  now()
FROM businesses
ON CONFLICT (business_id)
DO UPDATE SET
  cohort = EXCLUDED.cohort,
  source = EXCLUDED.source,
  kill_switch_active_at = NULL,
  updated_at = now();
```

Verification:

```sql
SELECT business_id, cohort, source, assigned_at, updated_at
FROM creative_canonical_cohort_assignments
ORDER BY updated_at DESC;
```

Expected:

- Existing businesses have `cohort = 'canonical-v1'`.
- Activation rows are written with `source = 'rollout_percent_assigned'`.
- Resolver requests after persistence may report `sticky_assigned`, which is expected and proves sticky assignment is stable after the direct cutover.

## 6. Kill switch dry-run script

Commands:

```bash
pnpm exec tsx scripts/canonical-resolver-kill-switch.ts on
pnpm exec tsx scripts/canonical-resolver-kill-switch.ts off
```

Expected JSON output shape:

```json
{
  "key": "canonical-resolver-v1",
  "previous": {
    "active": false,
    "activated_at": null,
    "updated_at": "2026-04-29T00:00:00.000Z"
  },
  "active": true,
  "flippedAt": "2026-04-29T00:00:00.000Z"
}
```

Non-production dry-run status in this workspace: blocked. `corepack pnpm --version` works, but the configured local non-production Postgres helper cannot start because `/Volumes/adsecuteDB` is not mounted. Production DB was not modified. The owner must run the two commands against staging or a mounted local DB before Step 4 manual deploy.

## 7. Post-deploy verification checklist

Within 1 hour of activation, the owner runs these dashboard checks:

1. Creative detail drawer shows a canonical action, readiness, confidence, and reason chips for newly generated snapshots.
2. Action distribution is sane for the owner's primary business: no class collapse into `diagnose`, `cut`, or `test_more`.
3. No spike in `diagnose:blocked`; missing commercial truth must surface as review context, not blanket blocked diagnose.
4. `GET /api/admin/canonical-observability/<businessId>` returns HTTP 200 and each metric has `{ value, denominator, threshold, status }`.
5. Production kill switch round-trip confirms `<60s` legacy revert: turn switch `on`, confirm next request resolves to legacy, then turn switch `off` after the rollback drill is complete.
