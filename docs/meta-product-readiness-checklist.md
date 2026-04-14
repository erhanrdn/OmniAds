# Meta Product Readiness Checklist

Use this checklist as the canonical backend exit gate for Meta. Product-ready is
declared only after a real business passes both `T0` and `T0 + 24h` validation
across a real account-timezone rollover.

Recorded production rollout outcome:

- `docs/meta-rollout-record-2026-04-07.md`

Current operating posture:

- one global Meta behavior contract applies across all businesses
- the DB server changed and the warehouse is rebuilding from provider APIs
- cold bootstrap, backfill, quota pressure, and partial upstream coverage are first-class operator truth
- product readiness must stay honest during rebuild and must not overclaim health from sparse warehouse state

## CI Gate

1. Confirm GitHub Actions `CI` passed on the PR branch.
2. Confirm the workflow ran:
   - install
   - build
   - typecheck
   - tests
3. Do not rely on deploy success as a substitute for CI success.

Go/no-go:

- `GO` only if CI is green on the exact release commit.
- `NO-GO` if build, typecheck, or tests fail.

## Production Rollout Gate

1. Deploy first in shadow mode with:
   - `META_AUTHORITATIVE_FINALIZATION_V2=0`
   - representative real business and account identified in advance for validation
2. Confirm post-deploy signals:
   - web health check passes
   - worker health check passes
   - fresh Meta worker heartbeat is visible
   - cron still reaches `/api/sync/cron`
3. Move to global enablement only after shadow mode is clean:
   - `META_AUTHORITATIVE_FINALIZATION_V2=1`
4. During `T0` and `T0 + 24h`, confirm `/api/meta/status.operatorTruth.rebuild` stays honest:
   - `cold_bootstrap` for a fresh provider rebuild
   - `backfill_in_progress` while history is still catching up
   - `quota_limited` when upstream pressure is active
   - `blocked` / `repair_required` only when verification evidence supports that wording

Go/no-go:

- `GO` only if rollout moves through shadow mode and then one global enablement with honest `T0` and `T0 + 24h` verification.
- `NO-GO` if status overclaims readiness during rebuild, or if v2 is treated as business-by-business rollout semantics.

## Required Validation Commands

Use a real Meta business and at least one real assigned Meta ad account.

1. `npm run meta:state-check -- <businessId>`
2. `npm run meta:soak-snapshot -- <businessId> <sinceIso>`
3. `npm run meta:progress-diff -- <businessId> <sinceIso>`
4. `npm run meta:verify-day -- <businessId> <providerAccountId> <day>`
5. `npm run meta:verify-publish -- <businessId> <providerAccountId> <day>`
6. `npm run meta:refresh-state -- <businessId>`
7. `npm run meta:reschedule -- <businessId>`
8. `npm run meta:cleanup -- <businessId>`
9. `npm run meta:retention-canary -- <businessId>`
10. If needed: `npm run meta:replay-dead-letter -- <businessId> [scope]`

## Global Rebuild Truth Review Gate

Before calling Meta more trustworthy on the rebuilt warehouse, confirm the repo now says so through the shared operator workflow:

1. Open `/admin/sync-health`.
2. Inspect `globalRebuildReview.meta`.
3. Confirm the reported state is not:
   - `cold_bootstrap`
   - `backfill_in_progress`
   - `quota_limited`
   - `partial_upstream_coverage`
   - `blocked`
   - `repair_required`
4. For a business-level proof check, open `/api/meta/status?businessId=<businessId>`.
5. Inspect `protectedPublishedTruth`.
6. Interpret it honestly:
   - `present` means rebuilt data shows non-zero protected published daily rows
   - `rebuild_incomplete` means current absence is still explained by rebuild posture
   - `publication_missing` means finalized-like work still does not have visible publication truth
   - `none_visible` means no non-zero protected published daily rows are currently visible for that business

Go/no-go:

- `GO` only if the global rebuild review is honest and the business-level protected truth review says what is actually visible.
- `NO-GO` if operators still need manual SQL to answer whether protected published truth is present or if the rebuild review still reports incomplete posture.

## Phase 8 Detector Posture

Use these interpretations during rollout and release approval:

1. `blocked`
   - finalize-like work completed, but required publication is missing
   - planner/publication truth disagrees
   - operator must diagnose with `meta:state-check`, `meta:verify-day`, and `meta:verify-publish` before retrying
2. `repair_required`
   - a fresh authoritative retry is the correct next action
   - current published truth must remain active until replacement publication succeeds
3. Retryable non-terminal
   - `queued`, `running`, and evidence-backed `pending` states remain non-terminal
   - stale leases are not hard-failed until cleanup/reconciliation proves no progress
4. Retention posture
   - `META_RETENTION_EXECUTION_ENABLED` remains disabled by default
   - retention rollout is not part of Phase 8 completion

## Phase 9 Retention Dry-Run Gate

1. Open `/api/meta/status?businessId=<businessId>` and inspect the `retention` block.
2. Confirm:
   - `defaultExecutionDisabled=true`
   - `policy.coreDailyAuthoritativeDays=761`
   - `policy.breakdownDailyAuthoritativeDays=394`
   - latest dry-run rows show both deletable residue and protected published truth
   - active published pointers, slice versions, manifests, and day-state rows inside the locked horizon are counted as protected
   - breakdown artifacts beyond `394` days appear only as deletable residue, not as required truth
3. Confirm no operator needs manual SQL to answer:
   - what would be deleted
   - what would remain
   - which currently-published artifacts are protected
   - how much old non-authoritative residue still exists

Go/no-go:

- `GO` only if Meta retention dry-run is operator-meaningful and proves published-truth safety without enabling deletes.
- `NO-GO` if retention posture still requires raw table inspection or if protected-vs-deletable truth is ambiguous.

## Phase 10 Legacy Cleanup Gate

1. Open `/api/meta/status?businessId=<businessId>` for a non-today in-horizon range.
2. Confirm:
   - historical readiness does not become `ready` from warehouse coverage alone when published verification is unavailable
   - `blocked`, `repair_required`, and retryable non-terminal states remain explicit in status/operator output
   - D-1 success is backed by published pointers, not planner `published` state or finalize-like completion alone
   - `/api/meta/status.dataContract` reports `live_only`, `published_verified_truth`, `live_fallback`, and `unsupported_degraded`
3. Confirm both retention executors remain default-disabled:
   - `META_RETENTION_EXECUTION_ENABLED=false` by default
   - `GOOGLE_ADS_RETENTION_EXECUTION_ENABLED=false` by default

Go/no-go:

- `GO` only if published verification is now the only supported historical truth contract in the touched Meta read/status paths.
- `NO-GO` if raw row presence, broad coverage, or planner-only success can still make historical Meta look authoritative.

## Phase 11 Retention Scoped Proof Gate

1. Open `/api/meta/status?businessId=<businessId>` and inspect both `retention` and `retention.scopedExecution`.
2. Confirm default posture:
   - `META_RETENTION_EXECUTION_ENABLED=false` by default
   - `retention.defaultExecutionDisabled=true`
   - `retention.scopedExecution.command="npm run meta:retention-canary -- <businessId>"`
   - `retention.scopedExecution.executeCommand="npm run meta:retention-canary -- <businessId> --execute"`
   - `retention.scopedExecution.globalExecutionEnabled=false`
   - `retention.scopedExecution.executeAllowed=false` until global execution is explicitly enabled
3. Run the non-destructive proof first:
   - `npm run meta:retention-canary -- <businessId>`
4. To allow the scoped execute proof, set:
   - `META_RETENTION_EXECUTION_ENABLED=true`
5. Run the dedicated scoped execute proof:
   - `npm run meta:retention-canary -- <businessId> --execute`
6. Confirm the resulting evidence:
   - `retention.scopedExecution.latestRun.executionDisposition=scoped_execute`
   - `retention.scopedExecution.latestRun.totalDeletedRows` reflects only the scoped run
   - `retention.scopedExecution.summary.protectedRows` remains non-zero when active published truth exists
   - `retention.scopedExecution.tables[].deleteScope` is limited to `horizon_outside_residue` or `orphaned_stale_artifact`
   - `retention.scopedExecution.tables[].deletedRows` never imply active in-horizon published truth deletion
7. Confirm protected truth remains explicit:
   - active publication pointers
   - active published slice versions referenced by those pointers
   - active source manifests referenced by published slices
   - published day-state rows tied to active publication pointers
   - currently-required core truth inside `761` days
   - currently-required breakdown truth inside `394` days

Go/no-go:

- `GO` only if the scoped proof shows deletes are limited to safe residue and the status surface makes the outcome operator-visible without manual SQL.
- `NO-GO` if protected published truth is ambiguous, if rebuild/quota truth is hidden, or if status cannot distinguish dry-run from gated or executed scoped posture.

Observed follow-up on April 14, 2026:

1. One production Meta business was reviewed as a scoped proof sample under the global contract.
   - Repo docs intentionally anonymize the business; the reviewed live business id ends with `d34c84`.
2. Dry-run evidence:
   - one initial dry-run skipped because another retention lease was active
   - the completed dry-run observed `612` deletable `meta_breakdown_daily` rows outside the `394` day horizon
   - the deletable residue window was `2024-04-26` through `2024-05-04`
3. Execute evidence:
   - the first execute attempt exposed a SQL bug in orphan cleanup: `FOR UPDATE cannot be applied to the nullable side of an outer join`
   - the narrow fix locked only the base orphan target rows and the targeted retention/status tests passed afterward
   - the rerun recorded `retention.scopedExecution.latestRun.executionDisposition=scoped_execute`
   - the rerun kept `META_RETENTION_EXECUTION_ENABLED=false` globally
   - final status review showed no remaining deletable residue for the reviewed business
4. Current gate decision:
   - `NO-GO` for global Meta retention execution
   - the reviewed business currently reports `protectedRows=0` and `0` active publication pointers in `/api/meta/status.retention.scopedExecution`
   - this proves scoped operator visibility, but it does not yet prove active published-truth protection on a business where that protection is live
5. Separate deferred work remains unchanged:
   - `GOOGLE_ADS_RETENTION_EXECUTION_ENABLED` remains disabled
   - Google execute-mode retention rollout is still separate and deferred

## T0 Validation

Run this shortly before or during the account-timezone rollover window.

1. Capture:
   - `T0_sinceIso`
   - target `providerAccountId`
   - account timezone
   - expected `D-1` day
2. Run:
   - `npm run meta:state-check -- <businessId>`
   - `npm run meta:verify-day -- <businessId> <providerAccountId> <expectedD1Day>`
   - `npm run meta:verify-publish -- <businessId> <providerAccountId> <expectedD1Day>`
3. Confirm:
   - `D-1` enters authoritative work, not only queue growth
   - source manifest state is visible
   - active publication is visible
   - queued vs leased vs published progression is visible
   - `D-2` does not advance before `D-1` is fully published
   - no manual SQL was required to inspect state

Go/no-go:

- `GO` only if operator tooling exposes manifest state, publication state, and recovery recommendation for the target day.
- `NO-GO` if the target day cannot be diagnosed without manual SQL.

## Autonomous D-1 Finalization Verification

This is the critical backend gate.

1. Run:
   - `npm run meta:verify-day -- <businessId> <providerAccountId> <expectedD1Day>`
   - `npm run meta:verify-publish -- <businessId> <providerAccountId> <expectedD1Day>`
2. Confirm:
   - `verificationState=finalized_verified`
   - `sourceManifestState=completed`
   - active publication exists for every required surface for that day
   - `goNoGo.passed=true` from publish verification
   - no delete-first symptom occurred

Go/no-go:

- `GO` only if autonomous `D-1` finalization reaches `finalized_verified` without a manual reschedule.
- `NO-GO` if queue movement occurs without verified publication, if planner state becomes `blocked`, if stale leases are hard-failed without proof, or if manual intervention is required for normal rollover success.

## Manual Refresh Publish Verification

1. Trigger a historical Meta refresh for:
   - one `D-1` day
   - one recent repair range
2. Re-run:
   - `npm run meta:verify-day -- <businessId> <providerAccountId> <day>`
   - `npm run meta:verify-publish -- <businessId> <providerAccountId> <day>`
3. Confirm:
   - historical refresh success means fresh fetch + validate + publish happened for the required surfaces
   - historical refresh does not report success from enqueue alone or from worker completion alone
   - publish verification reports `goNoGo.passed=true` after a successful refresh

Go/no-go:

- `GO` only if manual historical refresh ends in verified publication or a clear `failed` / `repair_required` / `blocked` state.
- `NO-GO` if refresh reports success while publication remains stale or unverifiable.

## T0 + 24h Validation

Repeat the same checks 24 hours later.

1. Run:
   - `npm run meta:soak-snapshot -- <businessId> <T0_sinceIso>`
   - `npm run meta:progress-diff -- <businessId> <T0_sinceIso>`
   - `npm run meta:state-check -- <businessId>`
2. Confirm:
   - a new `D-1` finalization cycle occurred autonomously
   - the previous `D-1` stayed `finalized_verified`
   - `published` progression increased during the 24h window
   - `lastSuccessfulPublishAt` moved forward
   - queue drain is accompanied by publication advancement, not only retry churn
   - there was no hidden publish-less success promoted to done

Go/no-go:

- `GO` only if `T0 + 24h` proves autonomous next-day continuation and verified publication continuity.
- `NO-GO` if the stack works once but does not advance autonomously over the next 24h.

## Admin Sync Health Validation

1. Open `/admin/sync-health`.
2. Confirm Meta summary shows:
   - manifest counts
   - queued / leased / published progression
   - validation failures in the last 24 hours
   - repair backlog
   - dead letters
   - stale leases
   - last successful publish timestamp
   - `D-1` finalize SLA breaches
   - retention dry-run policy and protected-vs-deletable summary
3. Confirm business rows show:
   - latest authoritative publishes
   - recent authoritative failures
   - source manifest counts
   - last successful publish timestamp
   - latest retention dry-run evidence when available

Go/no-go:

- `GO` only if the admin screen is sufficient to triage failed or stuck finalization without manual SQL.
- `NO-GO` if an operator still needs direct SQL for routine diagnosis.

## Dead-Letter And Stale-Lease Recovery Validation

1. If stale leases exist:
   - `npm run meta:cleanup -- <businessId>`
   - `npm run meta:reschedule -- <businessId>`
2. If dead letters exist:
   - `npm run meta:replay-dead-letter -- <businessId> [scope]`
3. Re-run:
   - `npm run meta:verify-day -- <businessId> <providerAccountId> <day>`
   - `npm run meta:verify-publish -- <businessId> <providerAccountId> <day>`
4. Confirm:
   - recovery required no manual SQL
   - old published truth stayed readable until replacement was verified
   - queue resumed draining appropriately
   - publish verification eventually returns pass or a truthful `blocked` / `repair_required` / retryable non-terminal state
   - stale leases required proof before terminal treatment

Go/no-go:

- `GO` only if standard recovery is product-safe and SQL-free.
- `NO-GO` if dead-letter or stale-lease recovery requires manual data deletion or manual SQL.

## Final Exit Criteria

Meta is product-ready only when all of the following are true:

- CI is green on the release commit.
- Meta remains on the provider-specific production runtime.
- Historical reads remain warehouse-first and read-only.
- Autonomous account-timezone `D-1` finalization reaches `finalized_verified`.
- `T0` and `T0 + 24h` validations both pass on a real business.
- Manual historical refresh success reflects real source-authoritative publish verification.
- Admin sync health exposes enough authoritative truth for routine operations.
- Dead-letter and stale-lease recovery work without manual SQL.
- Rollback can disable `META_AUTHORITATIVE_FINALIZATION_V2` without deleting current published truth.
- Phase 8 detector outcomes are explicit enough that blocked publication mismatch, repair-required retry, and retryable non-terminal states are distinguishable without manual SQL.
- Phase 10 cleanup removes legacy historical truth shortcuts so raw coverage, row presence, or planner-only state can no longer imply published success in the touched Meta paths.
- `META_RETENTION_EXECUTION_ENABLED` remains disabled by default unless a later dedicated rollout changes it.
- `GOOGLE_ADS_RETENTION_EXECUTION_ENABLED` remains disabled by default unless a later dedicated rollout changes it.
- Meta retention dry-run exposes protected-vs-deletable evidence for the locked `761` / `394` policy without requiring manual SQL.
- Meta retention scoped proof is operator-verifiable through `meta:retention-canary` plus `/api/meta/status.retention.scopedExecution`, while execution posture remains globally controlled.
- Global Meta retention execution remains disabled unless a later rollout explicitly changes `META_RETENTION_EXECUTION_ENABLED`.
- Production rollout succeeded in shadow mode and one global enablement order, with `T0` and `T0 + 24h` validation interpreted through honest rebuild truth.

Any single failed criterion is a `NO-GO`.
