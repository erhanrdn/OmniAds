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

- advisor AI structured assist gate
- advisor AI structured assist business allowlist rollout
- write-back pilot gates
- semi-autonomous action-pack gates
- controlled-autonomy gates

## Implemented And Live

- `GET /api/google-ads/status` is materially state-driven and reflects required warehouse coverage, queue health, worker state, recovery posture, and advisor readiness.
- `GET /api/google-ads/advisor` serves snapshot-backed decision payloads by default and supports `refresh=1`.
- The advisor payload exposes deterministic recommendation fields plus `metadata.actionContract` and `recommendation.operatorActionCard`.
- Snapshot generation can optionally apply a schema-validated AI structured assist to eligible fallback recommendations, but the deterministic operator card contract remains the source of truth.
- The live recommendation families for brand capture control, brand leakage, search / shopping overlap, geo / device adjustment, and diagnostic guardrails now render as deterministic operator cards instead of relying on AI fallback.
- AI structured assist rollout is now explicitly scoped by `GOOGLE_ADS_ADVISOR_AI_STRUCTURED_ASSIST_BUSINESS_ALLOWLIST`, and both `/api/google-ads/status` and `google:ads:product-gate` expose that posture.
- The current Google Ads advisor UI is action-first at the card level and clearly labels legacy snapshot compatibility.
- The advisor now consumes persisted weekly top-query and daily cluster aggregates as supplemental support when those tables are available, and it exposes that posture in snapshot metadata.
- Recommendation memory exists and persists recommendation lifecycle, execution state, rollback availability, and outcome fields in `google_ads_advisor_memory`.
- The advisor UI now surfaces validation-due recommendations and recent operator-entered outcomes as a separate manual workflow view.
- The advisor UI now renders manual action packs from bundled action clusters and labels them as human-approval-only plans.
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
  - business allowlist
  - account allowlist
  - operator override flag
  - bundle cooldown hours
  - manual approval requirement

## Partial Or Incomplete

- Manual lifecycle persistence is now rendered end-to-end in the advisor UI, but outcome quality still depends on operator-entered validation and not automated attribution.
- AI structured assist now records prompt version, eligibility counts, business-scoped rollout posture, and validation failure categories, but it remains a bounded snapshot-time assist and not a live request-time planner.
- Residual AI scope is now narrow by design; current runtime primarily reserves it for generic `operating_model_gap`-style fallback cards rather than core live recommendation families.
- Search intelligence aggregates are now consumed as supplemental support for recurring query and cluster evidence, but they do not yet replace the core recent-surface readiness contract or every recommendation heuristic.
- Decision action/outcome logs exist as a table, and operator workflow now appends plan/outcome rows, but the UI does not yet provide richer longitudinal outcome analytics.
- `/api/google-ads/status` now exposes advisor action-contract posture, aggregate-intelligence posture, retention runtime state, and automation boundary state, but the operator page does not yet surface every backend control-plane detail.
- Manual action packs are visible to operators, but they remain planning bundles only. There is still no verified scheduled or autonomous execution path.

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

- Direct shell env in this session does not expose `DATABASE_URL` by default, but script-backed commands load repo env and can inspect real DB state from this checkout when `.env.local` is configured.
- Google Ads credentials and developer token are still not verified from this execution context, so live mutate verification is not available from this session.
- Write-back therefore remains blocked from verified promotion even though mutate code paths exist.
- Search intelligence aggregate consumption is still partial beyond the current supplemental advisor support path.
