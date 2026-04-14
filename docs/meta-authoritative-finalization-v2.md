# Meta Authoritative Finalization v2

## Status

Steady-state global operating contract.

## Purpose

Meta authoritative finalization v2 is the production contract for truthful historical Meta publication. The architecture work is complete. The remaining operator question is not how to build it, but whether evidence justifies any later posture change.

## Provider Runtime Authority

Meta remains authoritative on the provider-specific runtime:

- `lib/sync/meta-sync.ts` remains the authoritative Meta runtime
- `scripts/sync-worker.ts` remains the executing worker entrypoint
- the current queue, lease, repair, and publication system remains the production authority

This is intentional. The unresolved operator problem was historical publication truth at the rollover boundary, not a need for a new orchestration system.

## Locked Historical Truth Contract

These rules remain fixed:

1. `today` is live-only.
2. Non-today inside the authoritative horizon serves published verified truth only.
3. Non-today beyond the authoritative horizon keeps live fallback for:
   - `summary`
   - `campaigns`
   - `adsets`
   - `ad`
4. `breakdowns` beyond `394` days remain `unsupported/degraded`.
5. Published verification, not raw warehouse presence, is the historical truth contract.

## Finalization Success Contract

Historical Meta success has one meaning:

- the required surfaces for that account-day have a published authoritative pointer

These do not count as success by themselves:

- queue movement
- warehouse row presence
- planner `published` state without a pointer
- a worker returning normally
- finalize-like work without publication proof

Required non-success interpretations:

- `blocked`
  - publication pointer missing
  - planner/publication mismatch
  - finalize-like completion without required publication truth
- `repair_required`
  - a fresh authoritative retry is the correct next step
- `queued`, `running`, `pending`
  - non-terminal when authoritative progress is still justified

## Protected Published Truth

Protected published truth remains the operator proof that rebuilt Meta history is real, not just plausible.

Operator-visible states:

- `present`
- `publication_missing`
- `rebuild_incomplete`
- `none_visible`
- `unavailable`

The repo now treats this as first-class evidence in:

- `/admin/sync-health`
- `npm run ops:execution-readiness-review`
- `/api/meta/status?businessId=<businessId>`

## Global Operator Model

Use one global workflow:

1. Read `/admin/sync-health` or run `npm run ops:execution-readiness-review`.
2. Inspect Meta rebuild truth.
3. Inspect the shared global execution-readiness gate.
4. Inspect the shared explicit execution posture review.
5. Use `/api/meta/status?businessId=<businessId>` only to explain the business-scoped evidence behind the global answer.

Interpretation rules:

- the decision model is global across all businesses
- provider drilldown is explanatory only
- `ready` means evidence only
- nothing auto-enables from rebuild truth, readiness, or posture review

## Manual Controls

Meta execution-sensitive controls remain explicit and separate:

- `META_AUTHORITATIVE_FINALIZATION_V2`
  - controls Meta authoritative finalization posture
- `META_RETENTION_EXECUTION_ENABLED`
  - controls Meta retention delete execution

The shared review model does not flip either flag automatically.

## Recovery Workflow

When Meta historical truth looks suspicious, use the existing recovery path:

1. `npm run meta:state-check -- <businessId>`
2. `npm run meta:verify-day -- <businessId> <providerAccountId> <day>`
3. `npm run meta:verify-publish -- <businessId> <providerAccountId> <day>`
4. `npm run meta:refresh-state -- <businessId>`
5. `npm run meta:reschedule -- <businessId>`
6. `npm run meta:cleanup -- <businessId>`

## Retention Relationship

Retention is separate from finalization correctness:

- finalization v2 defines truthful publication and historical read authority
- retention dry-run and scoped proof show whether old residue can be deleted safely
- retention execute mode remains an explicit later operational decision

The retained command name `meta:retention-canary` is historical. It is a scoped proof command, not a rollout ladder.

## What Remains Optional

Optional future operations:

1. explicit review of stronger warehouse trust after the global posture review reports `eligible_for_explicit_review`
2. explicit review of Meta retention execute mode after protected published truth is visibly exercised on real rebuilt data
3. continued steady-state operation with no flag change if evidence does not justify stronger posture

Those are operational choices. They are not unfinished core architecture.
