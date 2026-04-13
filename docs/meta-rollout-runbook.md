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
2. Force sync-state refresh without deleting data
   - `npm run meta:refresh-state -- <businessId>`
3. Reschedule Meta work safely
   - `npm run meta:reschedule -- <businessId>`
4. Cleanup stale leases / orchestration state
   - `npm run meta:cleanup -- <businessId>`
5. Replay dead-letter work and immediately re-plan
   - `npm run meta:replay-dead-letter -- <businessId> [scope]`
6. Verify one business/account/day end-to-end
   - `npm run meta:verify-day -- <businessId> <providerAccountId> <day>`

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
   - if `meta:state-check` still shows `pending`, `queued`, or `running` planner rows with no publication, treat this as non-terminal and prefer requeue/reschedule semantics over dead-letter assumptions
3. planner or verify output indicates `blocked`
   - treat this as an explicit publication or contract mismatch, not a soft success
   - inspect manifest completion vs publication absence
   - confirm worker/web/planner contract alignment before replaying work
4. `verificationState=failed` or `repair_required`
   - keep current published truth active
   - inspect `lastFailure`
   - follow the recommended recovery action from the command output
5. `deadLetters > 0`
   - run `meta:replay-dead-letter`
6. `staleLeases > 0`
   - run `meta:cleanup`
   - then `meta:reschedule`

## Recovery Procedure

Recovery must remain product-safe:

- never use delete-first recovery
- never invalidate current published truth before a replacement is validated and published
- never require manual SQL for standard recovery

Preferred order:

1. `meta:verify-day`
2. `meta:refresh-state`
3. `meta:reschedule`
4. `meta:cleanup` if stale leases exist
5. `meta:replay-dead-letter` if dead letters exist
6. Re-run `meta:verify-day`
7. Do not treat a normal worker completion without publish verification as recovery success

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
5. Confirm `/api/meta/status` returns compatibility behavior for historical ranges
6. Confirm `meta:state-check` still reports the old queue/coverage signals
7. Confirm historical refresh no longer claims `finalized_verified` unless the old path would have done so
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
