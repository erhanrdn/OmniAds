# Meta Authoritative Finalization v2

## Status
Proposed

## Purpose

This document defines the next production-hardening step for Meta day finalization
without rewriting the existing runtime.

The problem to solve is narrow and explicit:

- the production Meta runtime is already provider-specific
- historical reads are already warehouse-first
- the remaining bug class sits at the account-timezone `D-1` rollover boundary
- current truth markers are not yet sufficient to guarantee that non-today data
  was freshly re-fetched, validated, and safely published as source-authoritative

This v2 contract closes that gap by introducing explicit source-authoritative
finalization semantics for `D-1` and recent repair windows while keeping the
current Meta worker path authoritative.

## Why The Provider-Specific Runtime Remains Authoritative

Meta must remain on the provider-specific runtime in this work for four reasons:

1. The accepted control-plane ADR already defines Meta production authority as
   the provider-specific runtime.
2. Current repair, enqueue, lease, and completion behavior for Meta already
   lives in the provider-specific consumer path and real operator tooling points
   to that path.
3. The bug to fix is a finalization-boundary correctness issue, not an
   orchestration-abstraction issue.
4. Migrating Meta to generic orchestration during this fix would expand blast
   radius across queue ownership, checkpoint progression, recovery, and admin
   semantics without helping the specific `D-1` guarantee.

Therefore:

- `lib/sync/meta-sync.ts` remains the authoritative Meta runtime
- `scripts/sync-worker.ts` continues to execute the current durable worker
- `lib/sync/provider-worker-adapters.ts` remains an adapter layer, not the
  source of Meta production authority

## Scope

In scope:

- authoritative finalization for account-timezone `D-1`
- authoritative repair for recent historical days
- truthful manual refresh completion semantics
- additive data-model extensions for versioned publish safety
- rollout-safe compatibility with existing historical page contracts

Out of scope:

- generic orchestration cutover for Meta
- replacing current queue/state tables
- read-path rewrites for historical serving
- broad schema replacement or destructive migration strategy

## Current Baseline

The current system already enforces several important invariants:

- historical read paths are warehouse-first and read-only
- non-today rows should be read as finalized truth by default
- Meta refresh can enqueue targeted repair/finalization work
- some authoritative historical sources already force fresh rebuild behavior

The remaining gap is that "finalized" is not yet modeled as an explicit
published artifact with a durable source manifest and candidate/publication
boundary. That leaves room for rollover-era stale truth to appear more
authoritative than it really is.

## Target State Machine

The v2 target lifecycle for a single Meta account-day slice is:

`live -> pending_finalization -> finalizing -> finalized_verified`

Terminal and side states:

- `failed`
- `repair_required`
- `superseded`

### State meanings

- `live`
  - current account day
  - may use live-biased overlay behavior
  - not historical-finalized truth
- `pending_finalization`
  - selected because the day crossed out of `today` in the account timezone, or
    because repair logic identified the day as suspicious
  - historical reads must not assume new source-authoritative closure yet
- `finalizing`
  - a worker is actively performing fresh fetch -> validate -> stage work for a
    candidate slice version
- `finalized_verified`
  - the candidate slice passed validation and the publication pointer now points
    to it
  - this is the only v2 state that grants authoritative historical finalization
- `failed`
  - finalization attempt failed before verified publication
- `repair_required`
  - validation or reconciliation detected a mismatch that requires another
    source-authoritative attempt
- `superseded`
  - an older candidate was replaced by a newer candidate before publication, or
    a newer verified slice displaced it

### Transition rules

- `live -> pending_finalization`
  - when the account timezone rolls to a new day
  - or when a recent dirty-day scan flags a non-today date
- `pending_finalization -> finalizing`
  - only through provider-specific worker enqueue/lease execution
- `finalizing -> finalized_verified`
  - only after fresh source fetch, validation, stage completion, and publication
- `finalizing -> failed`
  - on fetch/stage/validation failure
- `failed -> repair_required`
  - when retry policy or operator action marks the slice for a fresh retry
- `repair_required -> finalizing`
  - on retried authoritative repair
- any non-terminal candidate state -> `superseded`
  - when a newer candidate version takes precedence

## Target Data Model

V2 introduces four logical objects. They may be backed by new tables, additive
columns, or a mix of both, but the contract must remain stable.

### 1. Source manifest

Represents the source-authoritative input evidence for one account-day
finalization attempt.

Required fields:

- `manifest_id`
- `business_id`
- `provider_account_id`
- `day`
- `account_timezone`
- `source_kind`
- `source_window_kind`
- `started_at`
- `completed_at`
- `run_id`
- `fresh_start_applied`
- `raw_snapshot_watermark`
- `checkpoint_reset_applied`
- `source_spend`
- `validation_basis_version`
- `fetch_status`

Purpose:

- prove that a finalization attempt used a fresh source fetch
- tie publication back to a real source run
- support truthful operator diagnostics

### 2. Candidate slice version

Represents a staged warehouse candidate for one account-day.

Required fields:

- `slice_version_id`
- `business_id`
- `provider_account_id`
- `day`
- `scope_family`
- `candidate_version`
- `manifest_id`
- `truth_state`
- `validation_status`
- `stage_started_at`
- `stage_completed_at`
- `staged_row_counts`
- `aggregated_spend`
- `validation_summary`
- `superseded_at`

Purpose:

- separate staged candidate truth from currently published truth
- allow safe retries without delete-first semantics
- provide precise repair/reconciliation history

### 3. Active publication pointer

Represents which verified slice is currently authoritative for historical reads.

Required fields:

- `business_id`
- `provider_account_id`
- `day`
- `scope_family`
- `active_slice_version_id`
- `published_at`
- `published_by_run_id`
- `publication_reason`

Purpose:

- make publication atomic from the reader's perspective
- preserve warehouse-first read semantics
- avoid exposing half-written candidate state

### 4. Reconciliation event

Represents the validation and audit result around a candidate or publication.

Required fields:

- `event_id`
- `business_id`
- `provider_account_id`
- `day`
- `slice_version_id`
- `manifest_id`
- `event_kind`
- `severity`
- `source_spend`
- `warehouse_account_spend`
- `warehouse_campaign_spend`
- `tolerance_applied`
- `result`
- `details_json`
- `created_at`

Purpose:

- record why a candidate passed, failed, or was marked repair-required
- support admin/debug surfaces without inferring truth from raw logs

## Replace Semantics

V2 keeps the non-negotiable contract:

`fetch -> validate -> stage -> publish`

Rules:

- never delete the active published slice first
- never mark non-today data as final solely because a worker completed
- never report manual refresh success until a source-authoritative publish
  succeeded, or a clear failure is returned
- staged candidates may be discarded or superseded, but published truth remains
  readable until a verified replacement is ready

## Authoritative D-1 Boundary Contract

For a Meta account with timezone `T`:

- when account day changes from `D` to `D+1`, day `D` enters
  `pending_finalization`
- historical reads for `D` remain warehouse-first, but the system must not claim
  fresh finality unless v2 finalization reaches `finalized_verified`
- authoritative finalization for `D` must use a fresh source fetch scoped to the
  account timezone day boundary
- completion must be tied to the published candidate version, not only queue or
  run completion

This is the direct fix for the rollover bug class.

## Manual Refresh Contract

Manual refresh for Meta must map to real source-authoritative work.

For non-today date ranges:

- success means a fresh authoritative fetch happened
- validation completed
- a candidate slice was staged
- the active publication pointer now references the verified candidate

If any step fails:

- the refresh result must surface failure truthfully
- the previous published slice remains active
- the day may transition to `repair_required`

For `today`:

- manual refresh may still run today-observe/live-biased work
- it must not claim historical finalization semantics for the current day

## Compatibility Strategy

Compatibility with the current tables and page contracts is mandatory.

### Existing warehouse tables

Current daily tables remain the historical serving base:

- `meta_account_daily`
- `meta_campaign_daily`
- `meta_adset_daily`
- related snapshot/checkpoint/state tables

V2 should prefer additive changes such as:

- publication/version columns
- manifest references
- stage/publication metadata
- reconciliation metadata

No destructive cutover is allowed in this phase.

### Existing page contracts

Current page behavior remains valid:

- historical reads remain warehouse-first
- selected-range readiness stays page-contract driven
- `today` remains a separate live/readiness contract

Compatibility rule:

- existing page routes may continue reading from current daily tables, but
  historical-finalized semantics must eventually resolve through the active
  publication pointer or equivalent additive gating

### Existing truth columns

Current columns such as `truth_state`, `truth_version`, `finalized_at`,
`validation_status`, and `source_run_id` remain useful compatibility fields.

Under v2 they become compatibility projections of the stronger publication model
rather than the only proof of authoritative finalization.

## Exact File Touchpoints For Implementation

Primary implementation touchpoints for upcoming phases:

- `lib/sync/meta-sync.ts`
  - enqueue state transitions
  - `D-1` pending/finalizing/finalized behavior
  - recent repair enqueue policy
- `app/api/sync/refresh/route.ts`
  - truthful manual refresh request contract
  - response semantics tied to real authoritative work
- `lib/sync/provider-worker-adapters.ts`
  - keep adapter compatibility, but do not shift production authority here
- `scripts/sync-worker.ts`
  - no architecture change expected; worker remains current runtime entrypoint
- `lib/api/meta.ts`
  - fresh fetch, validation, stage/publish flow for account-day finalization
- `lib/meta/warehouse.ts`
  - additive storage helpers for manifest/version/publication/reconciliation
- `lib/meta/warehouse-types.ts`
  - additive types and status enums for v2 lifecycle and metadata
- `lib/meta/serving.ts`
  - historical read gating through active published truth
- `app/api/meta/status/route.ts`
  - surface finalization/repair truth without conflating it with provider
    readiness
- `lib/meta/page-readiness.ts`
  - ensure selected-range readiness messaging remains truthful
- `lib/migrations.ts`
  - additive rollout-safe schema changes
- `scripts/meta-state-check.ts`
  - operator visibility for publication/finalization truth
- `scripts/meta-refresh-state.ts`
  - refresh diagnostics must reflect the new publication model

## Rollout Plan

### Phase 1

- land this contract and skeleton operator docs
- add feature-flag/config scaffolding only
- no risky runtime rewiring

### Phase 2

- add additive schema for manifest/version/publication/reconciliation support
- backfill compatibility defaults where needed

### Phase 3

- update Meta provider-specific runtime to produce staged candidates and verified
  publication
- wire `D-1` state transitions

### Phase 4

- update manual refresh/status/admin tooling to report truthful finalization
  outcomes
- add targeted tests and rollout diagnostics

### Phase 5

- controlled production rollout with canary businesses
- verify `T0` and `T0 + 24h` behavior at account-timezone rollover

## Rollback Plan

Rollback must preserve historical serving.

Rollback strategy:

1. disable the v2 finalization path behind flags
2. keep current published warehouse truth active
3. stop promoting new candidate/publication behavior
4. preserve additive schema objects for forensic/debug use
5. continue using existing provider-specific repair/recovery workflows

Rollback must never require deleting current daily truth to recover service.

## Operational Success Criteria

V2 is successful only when all are true:

- `D-1` in the Meta account timezone reliably enters and exits the finalization
  lifecycle
- non-today data is never treated as freshly finalized without verified
  publication
- manual refresh success corresponds to real source-authoritative publication
- repair-required days remain visible to operators
- current page contracts remain compatible
- no generic orchestration cutover was required to achieve the fix

## Open Questions For Implementation

1. Whether publication pointers should be explicit tables or additive columns on
   existing daily truth rows.
2. Whether candidate versioning should be one version per scope family or one
   version per whole account-day bundle.
3. Whether reconciliation should validate only spend in the first rollout or a
   wider metric set.
4. How much status detail should be exposed on `/api/meta/status` without
   polluting the page-scoped readiness contract.
