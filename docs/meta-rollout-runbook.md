# Meta Authoritative Finalization v2 Rollout Runbook

This runbook defines the standard operator procedures for Meta authoritative
finalization v2 rollout, verification, recovery, and rollback on the existing
Hetzner deployment shape.

Production rollout record:

- `docs/meta-rollout-record-2026-04-07.md`

## Deployment Surface

Keep the production architecture stable during this rollout:

1. `web`
   - serves the Next.js application
   - must pass `/api/build-info` health checks before the deploy is considered up
2. `worker`
   - runs `npm run worker:start`
   - must emit a fresh post-deploy `meta` worker heartbeat before the deploy is considered healthy
3. `cron`
   - remains host-level cron calling `/api/sync/cron`
   - is responsible for autonomous queue advancement into `D-1` finalization
4. `nginx`
   - remains the public reverse proxy in front of `web`
   - must keep forwarding `/api/*` and dashboard traffic without special canary routing

## Rollout Flags

Use only these rollout controls:

1. `META_AUTHORITATIVE_FINALIZATION_V2`
   - `0`: old Meta finalization path remains authoritative
   - `1`: v2 may serve and finalize for eligible businesses
2. `META_AUTHORITATIVE_FINALIZATION_CANARY_BUSINESSES`
   - comma-separated business ids
   - when empty and v2 is enabled, rollout is global
   - when populated, only allowlisted businesses use v2

## Phase 7 Executor Success Contract

Historical Meta executor success now has a strict meaning:

1. `meta_authoritative_day_state` is the runtime authority for whether a non-today account-day is actually done.
2. A historical partition only succeeds when every required surface for that day has a published authoritative pointer.
3. `fetch completed`, `partition completed`, or a normal worker return are not success by themselves.
4. If a worker returns without authoritative publication progress, the runtime prefers non-terminal cancel-and-requeue semantics over false success.
5. If finalize-like work completed but required publication is still missing, treat the day as explicit non-success:
   - `blocked` for publication-pointer or contract-mismatch style states
   - `repair_required` when verification says another authoritative attempt is needed
   - `failed` when the authoritative attempt itself failed
6. Near the rollover boundary, `D-2` historical advancement must wait for a fully published `D-1`.
7. Breakdown publication is only required inside the `394` day breakdown horizon.

## Phase 8 Detector And Auto-Heal Contract

The detector and reconciliation path now treat publication mismatches as
first-class operator states.

1. `blocked`
   - finalize-like completion exists, but required publication is missing
   - planner says `published` while the publication pointer is absent
   - worker/planner/web/publication truth disagrees in a way that makes retry unsafe without diagnosis
2. `repair_required`
   - a fresh authoritative retry is the correct next step after validation or reconciliation evidence
   - current published truth remains active until the replacement is verified and published
3. Retryable non-terminal states
   - `queued`, `running`, or `pending` remain non-terminal when authoritative progress is still justified by queue, lease, or manifest evidence
   - stale leases remain non-terminal until cleanup/reconciliation proves no progress
4. First operator checks for any suspected mismatch
   - `npm run meta:state-check -- <businessId>`
   - `npm run meta:verify-day -- <businessId> <providerAccountId> <day>`
   - `npm run meta:verify-publish -- <businessId> <providerAccountId> <day>`
5. Retention posture remains unchanged
   - `META_RETENTION_EXECUTION_ENABLED` is still disabled by default
   - this runbook does not authorize retention rollout

## Phase 9 Retention Preparation Contract

Meta retention is now prepared for operator-visible dry-run verification without
enabling destructive execution by default.

1. Locked horizons
   - `meta_account_daily`, `meta_campaign_daily`, `meta_adset_daily`, `meta_ad_daily`: `761` days
   - `meta_breakdown_daily`: `394` days
2. Published-truth protection
   - active publication pointers required inside the locked horizon remain protected
   - active published slice versions and source manifests required by those pointers remain protected
   - published day-state rows tied to active publication remain protected
   - published warehouse rows on currently-authoritative account-days remain protected
3. Horizon-outside residue
   - core artifacts older than `761` days are treated as deletable residue
   - breakdown artifacts older than `394` days are treated as deletable residue
   - breakdown artifacts beyond `394` days are not authoritative requirements for serving or verification
4. Operator visibility
   - `/api/meta/status` now exposes a `retention` block with runtime gate, locked policy summary, latest dry-run totals, and per-table protected-vs-deletable evidence
5. Execution posture
   - `META_RETENTION_EXECUTION_ENABLED` remains disabled by default
   - this runbook still does not authorize global delete execution

## Phase 10 Legacy Cleanup Contract

Meta historical truth now has one supported interpretation inside the
authoritative horizon.

1. Published verification only
   - non-today inside the authoritative horizon is ready only when published verification succeeds for the required surfaces
   - raw warehouse row presence, broad coverage, or dirty-date heuristics are not historical truth
2. No finalize-pending compatibility success
   - finalize-like completion without a required publication pointer remains `blocked`, `repair_required`, `failed`, or retryable non-terminal work
   - planner `published` state without a pointer is not historical success
3. Read-path posture
   - `today` remains live-only
   - non-today inside the horizon remains published verified truth only
   - horizon-outside core reads keep the existing live fallback behavior
   - breakdowns outside `394` days remain unsupported/degraded
4. Operator visibility
   - `/api/meta/status` now reports the historical contract explicitly as `live_only`, `published_verified_truth`, `live_fallback`, and `unsupported_degraded`
   - retention dry-run evidence remains intact and both retention executors stay disabled by default

## Phase 11 Retention Execute Canary Contract

Meta retention execution now has one supported non-global rollout path.

1. Global posture remains locked
   - `META_RETENTION_EXECUTION_ENABLED` stays disabled by default
   - this runbook still does not authorize global Meta retention execution
2. Dedicated canary path
   - `npm run meta:retention-canary -- <businessId>` is the explicit operator proof path
   - `npm run meta:retention-canary -- <businessId> --execute` is the only supported delete canary command
3. Canary execute enablement
   - `META_RETENTION_EXECUTE_CANARY_ENABLED=true`
   - `META_RETENTION_EXECUTE_CANARY_BUSINESSES=<businessId>`
   - both gate values plus the explicit `--execute` flag are required before deletes occur
4. Protected truth
   - active publication pointers inside the locked horizon
   - active published slice versions referenced by those pointers
   - active source manifests referenced by published slices
   - published day-state rows tied to active publication pointers
   - currently-required core truth inside `761` days
   - currently-required breakdown truth inside `394` days
5. Allowed delete scope
   - core daily residue older than `761` days
   - breakdown residue older than `394` days
   - horizon-outside publication pointers, reconciliation rows, and published day-state rows older than the applicable horizon
   - orphaned unpublished slice versions older than the applicable horizon
   - orphaned source manifests older than the applicable horizon
6. Operator evidence
   - `/api/meta/status?businessId=<businessId>` now exposes `retention.canary`
   - the latest canary run records whether the canary was dry-run only, gated, skipped, or executed
   - per-table proof reports what was protected, what was deletable, and what was actually deleted

## Preflight

1. Confirm migrations are additive and rollout-safe
2. Confirm Meta remains on the provider-specific worker runtime
3. Confirm historical read routes remain read-only
4. Confirm rollback flags are documented before enabling any rollout flag
5. Confirm Hetzner components are healthy before changing flags:
   - `docker compose ps`
   - `docker inspect --format '{{json .State.Health}}' "$(docker compose ps -q web)"`
   - `docker inspect --format '{{json .State.Health}}' "$(docker compose ps -q worker)"`
   - `npm run sync:worker-health -- --provider-scope meta --online-window-minutes 5`
   - `curl -fsS http://127.0.0.1:3000/api/build-info`
6. Capture a pre-change snapshot:
   - `npm run meta:state-check -- <businessId>`
   - `npm run meta:verify-day -- <businessId> <providerAccountId> <day>`
   - `npm run meta:verify-publish -- <businessId> <providerAccountId> <day>`

## Canary Plan

### Shadow Mode

Deploy the code and keep `META_AUTHORITATIVE_FINALIZATION_V2=0`.

1. Verify:
   - web health is green
   - worker emits fresh heartbeats
   - cron still reaches `/api/sync/cron`
   - nginx still serves external traffic normally
2. Run post-deploy verification commands for the target canary business:
   - `npm run meta:state-check -- <businessId>`
   - `npm run meta:verify-day -- <businessId> <providerAccountId> <day>`
   - `npm run meta:verify-publish -- <businessId> <providerAccountId> <day>`
3. Do not enable v2 until shadow mode shows no baseline regression.

### Allowlisted Business Rollout

1. Select one internal or low-risk Meta business
2. Record:
   - business id
   - primary Meta account id
   - account timezone
   - current account day
3. Set:
   - `META_AUTHORITATIVE_FINALIZATION_V2=1`
   - `META_AUTHORITATIVE_FINALIZATION_CANARY_BUSINESSES=<businessId>`
4. Redeploy web and worker
5. Observe:
   - `live -> pending_finalization -> finalizing -> finalized_verified`
   - publication timing
   - validation outcomes
   - queue/backlog side effects
6. Do not expand allowlist until the canary business passes `T0` and `T0 + 24h`.

### Full Rollout

1. Expand `META_AUTHORITATIVE_FINALIZATION_CANARY_BUSINESSES` gradually until all intended businesses are covered
2. When the allowlist is no longer needed, keep `META_AUTHORITATIVE_FINALIZATION_V2=1` and clear `META_AUTHORITATIVE_FINALIZATION_CANARY_BUSINESSES`
3. Redeploy web and worker
4. Re-run the post-deploy verification block on at least one previously canaried business and one non-canary business

## Validation Window

1. Capture `T0` state before account-timezone rollover
2. Capture state during `D-1` finalization
3. Capture state after verified publication
4. Repeat at `T0 + 24h`
5. Record:
   - source manifest evidence
   - candidate/publication version changes
   - reconciliation pass/fail events
   - manual refresh behavior for historical ranges

## Post-Deploy Verification Commands

Run these from the Hetzner host after each rollout.

### Web

1. `curl -fsS http://127.0.0.1:3000/api/build-info`
2. `curl -fsSI http://127.0.0.1:3000/about`
3. `curl -fsSI https://adsecute.com/about`

### Worker

1. `docker compose ps`
2. `docker inspect --format '{{json .State.Health}}' "$(docker compose ps -q worker)"`
3. `npm run sync:worker-health -- --provider-scope meta --online-window-minutes 5`

### Cron

1. `crontab -l`
2. `tail -n 50 /tmp/adsecute-sync-cron.log`
3. `curl -fsS -X POST http://127.0.0.1:3000/api/sync/cron -H "Authorization: Bearer ${CRON_SECRET}"`

### Nginx

1. `sudo nginx -t`
2. `sudo systemctl status nginx --no-pager`
3. `curl -fsSI https://adsecute.com/about`

### Queue Health

1. `npm run meta:state-check -- <businessId>`

### Authoritative Publish Health

1. `npm run meta:verify-publish -- <businessId> <providerAccountId> <day>`

### D-1 Finalize Health

1. `npm run meta:verify-day -- <businessId> <providerAccountId> <d1Day>`

### Retention Dry-Run Health

1. Inspect the latest Meta retention proof:

```bash
curl -fsS "http://127.0.0.1:3000/api/meta/status?businessId=<businessId>" | jq '.retention'
```

2. Confirm:
   - `defaultExecutionDisabled=true`
   - `policy.coreDailyAuthoritativeDays=761`
   - `policy.breakdownDailyAuthoritativeDays=394`
   - `summary.protectedRows` is non-zero for businesses with active published history
   - deletable rows appear only as horizon-outside residue, not as required currently-published truth

### Retention Execute Canary

1. Inspect canary posture before any delete attempt:

```bash
curl -fsS "http://127.0.0.1:3000/api/meta/status?businessId=<businessId>" | jq '.retention.canary'
```

2. Confirm:
   - `globalDefaultExecutionDisabled=true`
   - `executeAllowed=false` until the explicit canary gate is configured
   - `command="npm run meta:retention-canary -- <businessId>"`
   - `executeCommand="npm run meta:retention-canary -- <businessId> --execute"`
3. Run the proof command first without deletes:

```bash
npm run meta:retention-canary -- <businessId>
```

4. To run the execute canary, set:
   - `META_RETENTION_EXECUTE_CANARY_ENABLED=true`
   - `META_RETENTION_EXECUTE_CANARY_BUSINESSES=<businessId>`

5. Then run:

```bash
npm run meta:retention-canary -- <businessId> --execute
```

6. After the run, inspect:
   - `/api/meta/status?businessId=<businessId>` and confirm `retention.canary.latestRun.executionDisposition=canary_execute`
   - `retention.canary.latestRun.totalDeletedRows`
   - `retention.canary.summary.protectedRows`
   - `retention.canary.tables[].deleteScope`
   - `retention.canary.tables[].deletedRows`
7. Do not widen the allowlist or touch `META_RETENTION_EXECUTION_ENABLED` until the canary evidence shows only safe residue deletes and no ambiguity around protected published truth.

### Refresh Behavior

1. Trigger historical refresh:

```bash
curl -fsS -X POST http://127.0.0.1:3000/api/sync/refresh \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{"businessId":"<businessId>","provider":"meta","mode":"finalize_range","startDate":"<day>","endDate":"<day>"}'
```

2. Verify refresh produced authoritative publish semantics:
   - `npm run meta:verify-day -- <businessId> <providerAccountId> <day>`
   - `npm run meta:verify-publish -- <businessId> <providerAccountId> <day>`
3. Treat refresh as successful only if publish verification passes for the required surfaces.
4. If the worker returned but publication is still missing, treat the outcome as `blocked` or `repair_required`, not success.

## Standard Operator Commands

Use these commands before considering manual database work:

1. Business-wide state snapshot
   - `npm run meta:state-check -- <businessId>`
2. Verify one business/account/day end-to-end
   - `npm run meta:verify-day -- <businessId> <providerAccountId> <day>`
3. Verify required publication pointers
   - `npm run meta:verify-publish -- <businessId> <providerAccountId> <day>`
4. Force sync-state refresh without deleting data
   - `npm run meta:refresh-state -- <businessId>`
5. Reschedule Meta work safely
   - `npm run meta:reschedule -- <businessId>`
6. Cleanup stale leases / orchestration state
   - `npm run meta:cleanup -- <businessId>`
7. Replay dead-letter work and immediately re-plan
   - `npm run meta:replay-dead-letter -- <businessId> [scope]`
8. Inspect retention dry-run posture without enabling deletes
   - `curl -fsS "http://127.0.0.1:3000/api/meta/status?businessId=<businessId>" | jq '.retention'`
9. Run the dedicated retention canary proof
   - `npm run meta:retention-canary -- <businessId>`

## Verify-Day Procedure

Run `meta:verify-day` when a specific account/day looks wrong or stuck.

The command reports:

- business/account/day
- source manifest state
- validation state
- active publication
- latest failure reason
- queued / leased / dead-letter / stale-lease / repair backlog counts
- refresh recommendation

Interpretation:

1. `verificationState=finalized_verified`
   - published verified truth is active for the required surfaces for that day
   - no operator action is required unless user-visible data is still inconsistent
2. `verificationState=processing`
   - check queue vs leased counts
   - if leased is positive, wait for worker or inspect worker heartbeat
   - if queued is positive and leased is zero, run `meta:refresh-state` then `meta:reschedule`
   - if detector output says `queued`, `running`, or `stale_lease_pending_proof`, treat this as non-terminal and prefer requeue/reschedule/cleanup semantics over dead-letter assumptions
3. planner or verify output indicates `blocked`
   - treat this as an explicit publication or contract mismatch, not a soft success
   - inspect manifest completion vs publication absence
   - confirm worker/planner/publication alignment before replaying work
   - use `meta:verify-publish` before attempting a fresh authoritative retry
4. `verificationState=failed` or `repair_required`
   - keep current published truth active
   - inspect `lastFailure`
   - follow the recommended recovery action from the command output
   - prefer a fresh authoritative retry only after the detector recommends `repair_required`
5. `deadLetters > 0`
   - run `meta:replay-dead-letter`
6. `staleLeases > 0`
   - run `meta:cleanup`
   - then `meta:verify-day`
   - only reschedule after there is proof the stale lease is no longer making progress

## Recovery Procedure

Recovery must remain product-safe:

- never use delete-first recovery
- never invalidate current published truth before a replacement is validated and published
- never require manual SQL for standard recovery

Preferred order:

1. `meta:state-check`
2. `meta:verify-day`
3. `meta:verify-publish`
4. `meta:cleanup` if stale leases exist and proof of no progress is needed
5. `meta:refresh-state`
6. `meta:reschedule`
7. `meta:replay-dead-letter` if dead letters exist
8. Re-run `meta:verify-day`
9. Do not treat a normal worker completion without publish verification as recovery success

## Failure Handling

If rollout produces incorrect behavior:

1. Disable v2 flags
2. Stop promoting new candidates
3. Keep current published truth active
4. Confirm web and worker remain healthy after the flag change:
   - `curl -fsS http://127.0.0.1:3000/api/build-info`
   - `npm run sync:worker-health -- --provider-scope meta --online-window-minutes 5`
5. Use existing Meta recovery tooling:
   - `meta:cleanup`
   - `meta:replay-dead-letter`
   - `meta:refresh-state`
   - `meta:reschedule`
   - `meta:verify-day`
6. Record the failed manifest/candidate/reconciliation evidence for follow-up
7. If manifest completion exists without publication, classify the incident as `blocked` until the contract mismatch is resolved

## Rollback

Rollback must preserve historical serving continuity.

1. Disable v2 finalization flags
2. Verify old published truth is still readable
3. Verify manual refresh no longer reports v2 publication semantics
4. Keep additive schema objects in place unless a later migration explicitly
   retires them

Detailed rollback steps:

1. Set `META_AUTHORITATIVE_FINALIZATION_V2=0`
2. Keep `META_AUTHORITATIVE_FINALIZATION_CANARY_BUSINESSES` unchanged or clear it; it has no effect once v2 is disabled
3. Redeploy web and worker
4. Confirm both containers return healthy status
5. Confirm `/api/meta/status` still reports the explicit historical contract truthfully for the rolled-back runtime state
6. Confirm `meta:state-check` and `meta:verify-day` still distinguish published truth from blocked / repair-required / retryable non-terminal states
7. Confirm historical refresh no longer claims `finalized_verified` unless published verification actually exists for the rolled-back path
8. Do not delete authoritative v2 tables during rollback
9. Preserve manifest/publication/reconciliation evidence for forensic follow-up

## Sign-off

Do not mark rollout complete until:

- shadow mode completed without baseline regressions
- canary rollover passes
- `T0 + 24h` validation passes
- admin signals remain understandable
- no destructive recovery step was required
- verify-day output is sufficient for day-level triage without manual SQL
