# Meta Product Readiness Checklist

Use this checklist as the canonical backend exit gate for Meta. Product-ready is
declared only after a real business passes both `T0` and `T0 + 24h` validation
across a real account-timezone rollover.

Recorded production rollout outcome:

- `docs/meta-rollout-record-2026-04-07.md`

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
   - canary business and account identified in advance
2. Confirm post-deploy signals:
   - web health check passes
   - worker health check passes
   - fresh Meta worker heartbeat is visible
   - cron still reaches `/api/sync/cron`
3. Move to allowlisted rollout only after shadow mode is clean:
   - `META_AUTHORITATIVE_FINALIZATION_V2=1`
   - `META_AUTHORITATIVE_FINALIZATION_CANARY_BUSINESSES=<businessId>`
4. Move to full rollout only after canary `T0` and `T0 + 24h` both pass.

Go/no-go:

- `GO` only if rollout moves through shadow mode, allowlisted canary, and full rollout in that order.
- `NO-GO` if v2 is enabled globally before canary verification is complete.

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
9. If needed: `npm run meta:replay-dead-letter -- <businessId> [scope]`

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
   - active publication exists for at least `account_daily` and `campaign_daily`
   - `goNoGo.passed=true` from publish verification
   - no delete-first symptom occurred

Go/no-go:

- `GO` only if autonomous `D-1` finalization reaches `finalized_verified` without a manual reschedule.
- `NO-GO` if queue movement occurs without verified publication, or if manual intervention is required for normal rollover success.

## Manual Refresh Publish Verification

1. Trigger a historical Meta refresh for:
   - one `D-1` day
   - one recent repair range
2. Re-run:
   - `npm run meta:verify-day -- <businessId> <providerAccountId> <day>`
   - `npm run meta:verify-publish -- <businessId> <providerAccountId> <day>`
3. Confirm:
   - historical refresh success means fresh fetch + validate + publish happened
   - historical refresh does not report success from enqueue alone
   - publish verification reports `goNoGo.passed=true` after a successful refresh

Go/no-go:

- `GO` only if manual historical refresh ends in verified publication or a clear `failed` / `repair_required` state.
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
3. Confirm business rows show:
   - latest authoritative publishes
   - recent authoritative failures
   - source manifest counts
   - last successful publish timestamp

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
   - publish verification eventually returns pass or a truthful failure state

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
- Production rollout succeeded in shadow mode, allowlisted canary, and full rollout order.

Any single failed criterion is a `NO-GO`.
