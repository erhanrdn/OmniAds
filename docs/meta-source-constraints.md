# Meta Source Constraints

This document defines the product guardrails for Meta ingestion and serving.

## Historical Windows

- Standard Meta insights history target in Adsecute remains the warehouse history window.
- Meta breakdown-driven reporting should only be treated as fully supported for the latest `394` days.
- Historical sync progress must track the warehouse backfill target for core reporting (`account_daily` / `adset_daily`).
- Breakdown readiness is a separate serving constraint and must not make the overall historical sync look complete too early.

## Timezone Semantics

- `today` always means the primary Meta ad account's timezone day.
- UI and read routes must use `currentDateInTimezone` as the current-day truth.
- A local user date that is ahead of the account timezone must not be treated as a missing-data failure.

## Severity Rules

- `dead_letter`, invalid token, permission loss, assignment/config issues => `action_required`
- retryable `failed`, stale leases, delayed workers => operational states (`stale` / `paused`)

## Read-Path Contract

- Meta read routes do not start sync work.
- They return current warehouse truth only.
- When `META_AUTHORITATIVE_FINALIZATION_V2` is enabled, non-today historical routes must read only from published verified truth.
- Provisional or staged historical truth must never appear as finalized.
- `isPartial` is a compatibility field and must mirror canonical selected-range truth rather than row presence alone.
- `notReadyReason` must explain whether the cause is:
  - current-day still preparing
  - selected range still preparing
  - authoritative verification failed
  - repair is required before finalization
  - Meta breakdown history limit
  - missing connection or assignment

## Refresh Contract

- Historical Meta refresh success means fresh source-authoritative fetch, validation, and publish completed for the requested range.
- Historical refresh/status responses must not report success from enqueue or job existence alone.
- Historical refresh/status semantics use `processing`, `finalized_verified`, `failed`, and `repair_required`.
