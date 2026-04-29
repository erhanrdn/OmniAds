# Canonical Resolver Promotion Runbook — Single-User Direct Cutover

Date: 2026-04-29

Scope: owner-approved production promotion path for PR #84 after Round 4 review. Adsecute is currently single-user, so the owner is overriding the earlier gradual cohort path and moving directly to 100% activation on first production deploy. This runbook does not authorize merge, deploy, or activation by itself; the owner executes those steps manually.

## Step 1: Merge Without Auto-Deploy

Action:

- Merge PR #84 only after Claude and ChatGPT Pro approve the direct-cutover readiness brief.
- Verify `.github/workflows/ci.yml` path guards are present.
- Confirm merge does not start a production deploy from auto-deploy-on-merge.

Go/no-go:

- Go only if CI is green and no production deploy is automatically dispatched.
- No-go if a merge starts `dispatch-deploy` without explicit owner promotion approval.

Approvers:

- Engineering owner.
- Product/media-buyer owner.

## Step 2: Nightly Snapshot Confirmation

Action:

- Wait for the next nightly snapshot generation cycle after merge.
- Confirm canonical resolver computes alongside legacy without errors.
- Confirm `canonicalDecision` attaches to all new creative snapshots.

Go/no-go:

- Go only if fallback/re-run badge rate is `<=10%` and all new snapshots have canonical payloads.
- No-go if canonical computation errors, null payloads, or snapshot schema issues appear.

Approvers:

- Engineering owner.

## Step 3: Kill-Switch Dry-Run

Action:

- Run the kill-switch script in staging or local non-production DB.
- Confirm `on` and `off` round-trip successfully.
- Confirm the `admin_feature_flag_kill_switches` row changes for key `canonical-resolver-v1`.

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

Verification SQL:

```sql
SELECT key, active, activated_at, updated_at
FROM admin_feature_flag_kill_switches
WHERE key = 'canonical-resolver-v1';
```

Go/no-go:

- Go only if `on` and `off` both update the row and the next resolver request routes to `legacy` while the switch is on.
- No-go if the script cannot reach the non-production DB, the row does not update, or resolver routing ignores the switch.

Approvers:

- Engineering owner.

## Step 4: Manual Deploy

Action:

Run manual workflow dispatch:

```text
sha=<2ee4c6c descendant or PR #84 merge commit SHA>
require_current_main_head=true
run_migrations=true
break_glass=false
override_reason=canonical resolver direct cutover, single-user owner activation
```

Go/no-go:

- Go only if deploy gate, release gate, web image, worker image, and build-info all converge to the exact SHA.
- No-go on any failed gate, stale worker heartbeat, failed migration, or non-matching build SHA.

Approvers:

- Engineering owner.
- Product/media-buyer owner.

## Step 5: Direct 100% Activation

Actions:

1. Set direct 100% activation in admin config.

   Current SQL-only activation for the single-user deployment:

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

   If the admin UI exposes a rollout field by the time the owner executes this runbook, use the UI action instead: set `canonical-resolver-v1` rollout percent to `100`, save, then verify the same assignment rows.

2. Confirm cohort assignment behavior.

   Expected behavior when the application resolver receives `rolloutPercent=100`:

   - First assignment: `cohort = 'canonical-v1'`, `source = 'rollout_percent_assigned'`.
   - Subsequent request after persistence: `cohort = 'canonical-v1'`, `source = 'sticky_assigned'`.

   SQL verification for persisted assignments:

   ```sql
   SELECT business_id, cohort, source, assigned_at, updated_at
   FROM creative_canonical_cohort_assignments
   ORDER BY updated_at DESC;
   ```

3. Open the canonical observability endpoint for the owner's primary business.

   ```text
   GET /api/admin/canonical-observability/<businessId>
   ```

   Confirm every metric returns:

   ```json
   {
     "value": 0,
     "denominator": 0,
     "threshold": 0.01,
     "status": "insufficient_data"
   }
   ```

   Percentage stop conditions must remain `insufficient_data` until denominator is `>=30`.

Go/no-go:

- Go only if Step 4 deploy is verified with web image, worker image, and build-info all on the chosen SHA, and Step 3 kill-switch dry-run passed.
- No-go if kill-switch dry-run failed, deploy gate failed, release gate failed, or migrations did not apply cleanly.

Approvers:

- Engineering owner.
- Product/media-buyer owner.
- Owner/operator.

## Daily Owner Checks: First 7 Days

The owner must check canonical observability once daily for the first 7 days after activation and is solely responsible for triggering the kill switch if a hard stop appears.

Hard-stop conditions:

- `critical_high_conf_override_rate >1%` with denominator `>=30`.
- `overdiagnose_override_rate >25%` with denominator `>=30`.
- `fallback_rerun_badge_rate >10%` sustained with denominator `>=30`.
- Production UI consistency check fails.
- `diagnose:blocked` spikes on owner-reviewed small-business creatives.

## Rollback Order

1. Kill switch first.

   ```bash
   pnpm exec tsx scripts/canonical-resolver-kill-switch.ts on
   ```

   Confirm the next resolver request resolves to `legacy`.

2. If kill switch is insufficient, set direct rollout back to zero and clear stale sticky cohort rows.

   ```sql
   UPDATE creative_canonical_cohort_assignments
   SET cohort = 'legacy',
       source = 'blocklist',
       kill_switch_active_at = now(),
       updated_at = now();
   ```

   To remove sticky rows entirely after the app is confirmed legacy:

   ```sql
   DELETE FROM creative_canonical_cohort_assignments;
   ```

3. Last resort: redeploy previous known-good SHA through `deploy-hetzner.yml`.

Rollback is mandatory if any hard stop fires.
