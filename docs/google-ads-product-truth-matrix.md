# Google Ads Product Truth Matrix

This document is the canonical source of truth for Google Ads product posture in this repo.

It separates what is implemented and usable now from what is gated, partial, docs-only, or future work.

## Shipping Posture

Current shipping target:

- operator-first
- manual-plan-first
- product-ready only where code, tests, and runtime evidence support the claim

Current non-goals:

- broad autonomous write-back
- claiming forecast precision that the repo cannot derive
- hiding partial runtime behavior behind narrative copy

## Flags And Defaults

Required default posture:

- `GOOGLE_ADS_DECISION_ENGINE_V2=true`
- `GOOGLE_ADS_WRITEBACK_ENABLED=false`
- `GOOGLE_ADS_RETENTION_EXECUTION_ENABLED=false`

Future-path flags expected to stay disabled by default:

- write-back pilot gates
- semi-autonomous action-pack gates
- controlled-autonomy gates

## Implemented And Live

- `GET /api/google-ads/status` is materially state-driven and reflects required warehouse coverage, queue health, worker state, recovery posture, and advisor readiness.
- `GET /api/google-ads/advisor` serves snapshot-backed decision payloads by default and supports `refresh=1`.
- The advisor payload exposes deterministic recommendation fields plus `metadata.actionContract` and `recommendation.operatorActionCard`.
- The current Google Ads advisor UI is action-first at the card level and clearly labels legacy snapshot compatibility.
- Recommendation memory exists and persists recommendation lifecycle, execution state, rollback availability, and outcome fields in `google_ads_advisor_memory`.
- Admin sync health surfaces queue depth, dead-letter pressure, maintenance pressure, checkpoint lag, integrity blockers, and Google Ads recovery actions.
- Recovery tooling exists for cleanup, dead-letter replay, reschedule, refresh state, targeted repair, repair cycle, integrity-window repair, and quarantine release.
- `npm run google:ads:product-gate -- <businessId>` now exists as the canonical executable checkpoint for feature posture, warehouse/sync health, advisor contract truth, recovery tooling, admin visibility, exit criteria, and deferred items.
- Search intelligence aggregate storage exists for:
  - `google_ads_search_query_hot_daily`
  - `google_ads_top_query_weekly`
  - `google_ads_search_cluster_daily`
  - `google_ads_decision_action_outcome_logs`

## Implemented But Gated Or Off

- Write-back endpoints, preflight checks, rollback scaffolding, grouped cluster execution, and shared-budget/portfolio-target mutate previews exist in code.
- Write-back is still explicitly disabled by default and not verified for production-safe use.
- Retention execution now exists in code, runs under a lease, records `google_ads_retention_runs`, and is scheduled from the durable worker loop, but destructive deletion remains explicitly gated off by default.
- Snapshot compatibility normalization exists for legacy advisor payloads, but legacy payloads remain compatibility-derived until refreshed.
- Future automation foundations now exist as explicit config posture only:
  - write-back pilot flag
  - semi-autonomous bundle flag
  - controlled-autonomy flag
  - autonomy kill switch
  - action allowlist
  - manual approval requirement

## Partial Or Incomplete

- Manual lifecycle persistence is now rendered end-to-end in the advisor UI, but outcome quality still depends on operator-entered validation and not automated attribution.
- Search intelligence aggregates are stored, but the main advisor/serving path does not yet fully consume weekly query and cluster aggregates.
- Decision action/outcome logs exist as a table, and operator workflow now appends plan/outcome rows, but the UI does not yet provide richer longitudinal outcome analytics.
- `/api/google-ads/status` now exposes advisor action-contract posture and retention runtime state, but the operator page does not yet surface every backend control-plane detail.
- Search-intelligence aggregate consumption is still partial until serving/advisor logic uses the stored weekly and cluster inputs directly.

## Docs-Only Or Not Operationalized Yet

- Long-term automation architecture is described in docs and code comments, but not release-verified.
- Verified write-back, semi-autonomous mode, and controlled autonomy remain architecture paths, not live product claims.

## Advisor Readiness Contract

Current required surfaces for advisor readiness:

- `campaign_daily`
- `search_term_daily`
- `product_daily`

Advisor truth rules:

- advisor readiness is false while any required recent surface is incomplete
- advisor snapshot availability is secondary to required recent coverage
- selected custom date ranges are contextual overlays and do not replace the canonical decision snapshot
- legacy snapshots must not silently present themselves as native action-contract payloads

Operator contract:

- the first thing shown on a recommendation card must be the exact recommended move
- deterministic structured output is the source of truth
- narrative explanation is secondary
- AI commentary is optional tertiary context only

## Current Surfaces

Operator surfaces:

- Google Ads dashboard summary panel
- Google Ads advisor panel
- opportunity queue / action lanes
- entity deep links into Google Ads

Admin and ops surfaces:

- `/admin/sync-health`
- `GET /api/google-ads/status`
- Google Ads health, state-check, advisor-readiness, cleanup, replay, reschedule, refresh-state, run-once, and repair scripts

## V1 Shipping Boundary

V1 shipping claims allowed:

- operator-first manual planning
- action-first advisor cards with explicit blockers
- state-driven status and recovery visibility
- honest snapshot compatibility handling
- no autonomous execution by default

V1 shipping claims not allowed:

- verified production-safe write-back
- autonomous campaign management
- exact uplift promises that are not derived from bounded product logic
- claiming retention is fully operationalized before runtime enforcement exists

## Long-Term Automation Boundary

Future-path work may build on the existing mutate, rollback, cluster, memory, and shared-state plumbing, but must not be described as live until all of the following are true:

- capability gates are explicit
- preflight drift checks are enforced
- rollback assumptions are tested and documented
- audit trail is durable
- blast radius is constrained
- real runtime verification exists for the claimed scope

## Retention Policy Vs Runtime Reality

Approved policy today:

- core daily: 25 months
- breakdown daily: 13 months
- creative daily: 180 days
- raw search query hot daily: 120 days
- top queries weekly: 365 days
- search cluster aggregate daily: 25 months
- decision action / outcome logs: 25 months

Runtime reality at this baseline:

- policy constants exist
- dry-run and execute paths both exist in code
- destructive execution remains disabled by default behind `GOOGLE_ADS_RETENTION_EXECUTION_ENABLED`
- runs are recorded in `google_ads_retention_runs`
- the durable worker schedules retention on a lease-protected cadence
- `/api/google-ads/status` and `google:ads:product-gate` report retention runtime posture

## Product Blockers At Baseline

- `DATABASE_URL` is not configured in the current execution environment, so live DB-backed verification is not available from this session.
- Google Ads credentials and developer token are not configured in the current execution environment, so live mutate verification is not available from this session.
- Write-back therefore remains blocked from verified promotion even though mutate code paths exist.
- Search intelligence aggregate consumption is incomplete until serving/advisor logic uses the stored weekly and cluster inputs directly.
