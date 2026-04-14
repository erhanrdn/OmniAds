# Google + Meta Operator Model Closure

## Status

Closed. The Google + Meta architecture covered by this plan is complete. The repo now operates under one global operator contract, and any future posture change is an explicit operational decision rather than missing core architecture.

## Locked Contracts

### Google

- Advisor readiness remains `84` days.
- Retention remains tiered:
  - `761` days: `google_ads_account_daily`, `google_ads_campaign_daily`, `google_ads_keyword_daily`, `google_ads_product_daily`, `google_ads_search_cluster_daily`, `google_ads_decision_action_outcome_logs`
  - `396` days: `google_ads_geo_daily`, `google_ads_device_daily`, `google_ads_audience_daily`, `google_ads_ad_group_daily`, `google_ads_asset_group_daily`
  - `180` days: `google_ads_ad_daily`, `google_ads_asset_daily`
  - `120` days: `google_ads_search_query_hot_daily`, `google_ads_search_term_daily`
  - `365` days: `google_ads_top_query_weekly`
- Raw search-term history remains a hot/debug surface only. Canonical search support stays additive-backed through hot query rows, weekly top queries, and cluster aggregates.
- Rebuild truth must remain honest through:
  - `blocked`
  - `quota_limited`
  - `cold_bootstrap`
  - `backfill_in_progress`
  - `partial_upstream_coverage`
  - `ready`

### Meta

- `today` remains live-only.
- Non-today inside the authoritative horizon remains published verified truth only.
- Non-today beyond the authoritative horizon keeps live fallback for `summary`, `campaigns`, `adsets`, and `ad`.
- `breakdowns` beyond `394` days remain `unsupported/degraded`.
- Authoritative horizons remain locked:
  - `761` days: `meta_account_daily`, `meta_campaign_daily`, `meta_adset_daily`, `meta_ad_daily`
  - `394` days: `meta_breakdown_daily`
- Decision windows remain locked:
  - ready window: `30` days
  - support window: `90` days
- Rebuild truth must remain honest through:
  - `blocked`
  - `repair_required`
  - `quota_limited`
  - `cold_bootstrap`
  - `backfill_in_progress`
  - `partial_upstream_coverage`
  - `ready`
- Protected published truth visibility remains first-class operator evidence:
  - `present`
  - `publication_missing`
  - `rebuild_incomplete`
  - `none_visible`
  - `unavailable`

## Completed Architectural Work

The repo work covered by the Google + Meta phase train is complete:

1. Shared provider truth contracts are locked.
2. Google search-intelligence serving no longer depends on long-history raw search-term rows.
3. Google retention proof and delete-safety evidence are operator-visible without enabling deletes.
4. Meta historical serving now enforces published verified truth inside horizon and locked fallback semantics outside horizon.
5. Meta authoritative finalization v2, detector truth, and repair semantics are wired into the live runtime.
6. Meta retention dry-run and scoped proof paths protect published truth explicitly.
7. `/admin/sync-health` exposes one global rebuild truth review across Google and Meta.
8. The repo exposes one conservative global execution-readiness gate:
   - `not_ready`
   - `conditionally_ready`
   - `ready`
9. The repo exposes one explicit global execution posture review:
   - `no_go`
   - `hold_manual`
   - `eligible_for_explicit_review`
10. `npm run ops:execution-readiness-review` is the supported operator command-line review artifact for the same model.
11. Status/admin/docs now treat this as one global behavior contract, not a per-business rollout ladder.
12. `npm run ops:sync-effectiveness-review` and the sync-effectiveness section in `/admin/sync-health` are the supported operator workflow for judging whether rebuilt Google and Meta sync are actually catching up right now.
13. `npm run ops:google-error-budget-audit` is the supported operator workflow for identifying which Google provider/path is wasting requests, how those failures classify, and whether cooldown suppression is absorbing repeats.

## Current Steady-State Global Operator Model

Use one operator decision flow for all businesses:

1. Read the global rebuild truth first.
   - Use `/admin/sync-health` or `npm run ops:execution-readiness-review`.
   - This answers the current global rebuild state for Google and Meta.
   - Sparse rebuilt rows are never enough by themselves.

2. Read the sync effectiveness review second.
   - Use `/admin/sync-health` or `npm run ops:sync-effectiveness-review`.
   - This answers whether Google and Meta are improving, stable but incomplete, stalled by quota, blocked, or still sparse because of rebuild.
   - Use `Trusted day`, `Warehouse through`, `Lag`, quota counts, and truth-health output before concluding that recent sync changes are helping.

3. Read the Google error-budget audit when Google request pressure is part of the question.
   - Use `npm run ops:google-error-budget-audit`.
   - This answers which Google provider and request path are spending requests, which failures are `quota` vs `auth` vs `permission` vs `generic`, and whether cooldown/circuit-breaker suppression is actually preventing repeat waste.
   - Treat high `cooldown_hits` with low new `errorCount` as evidence that suppression is protecting quota, not evidence that sync is healthy.

4. Read the global execution-readiness gate next.
   - `not_ready`: stronger posture would overstate rebuild truth.
   - `conditionally_ready`: hard blockers cleared, but missing evidence still requires a conservative hold.
   - `ready`: rebuild truth no longer reports global blockers and Meta protected published truth is visible.

5. Read the explicit execution posture review next.
   - `no_go`: do not move beyond the current manual posture.
   - `hold_manual`: keep the current manual posture; use drilldown only to explain evidence gaps.
   - `eligible_for_explicit_review`: operators may consider a stronger posture next, but nothing auto-enables.

6. Use provider status drilldown only to explain the global answer.
   - Google: `/api/google-ads/status?businessId=<businessId>`
   - Meta: `/api/meta/status?businessId=<businessId>`
   - Provider drilldown is explanatory only because the data is provider/account scoped.
   - Provider drilldown does not create business-by-business rollout posture.

Ready means evidence only. It does not mean automatic execution, automatic stronger warehouse trust, or automatic rollout.

## Manual Controls That Remain Explicit

The repo ends this plan with explicit manual controls, not auto-enable logic:

- `META_AUTHORITATIVE_FINALIZATION_V2` remains the explicit global control for Meta authoritative finalization posture.
- `META_RETENTION_EXECUTION_ENABLED` remains the explicit global control for Meta retention deletes.
- `GOOGLE_ADS_RETENTION_EXECUTION_ENABLED` remains the explicit global control for Google retention deletes.
- Google execution-sensitive mutation paths keep their existing manual approval and operator boundary controls.
- The global rebuild review, readiness gate, and posture review never flip runtime behavior automatically.

## Evidence Operators Must Inspect Before Changing Posture

Use the same evidence set every time:

1. `/admin/sync-health`
   - `globalRebuildReview.googleAds.rebuild`
   - `globalRebuildReview.meta.rebuild`
   - `globalRebuildReview.meta.protectedPublishedTruth`
   - `syncEffectivenessReview.googleAds`
   - `syncEffectivenessReview.meta`
   - `globalRebuildReview.executionReadiness`
   - `globalRebuildReview.executionPostureReview`

2. Google provider drilldown
   - `/api/google-ads/status?businessId=<businessId>`
   - `operatorTruth.rebuild`
   - `retention`
   - `npm run google:ads:product-gate -- <businessId>`
   - `npm run google:ads:retention-canary -- <businessId>`

3. Meta provider drilldown
   - `/api/meta/status?businessId=<businessId>`
   - `operatorTruth.rebuild`
   - `protectedPublishedTruth`
   - `retention`
   - `npm run meta:state-check -- <businessId>`
   - `npm run meta:verify-publish -- <businessId> <providerAccountId> <day>`
   - `npm run meta:retention-canary -- <businessId>`

4. Rebuild honesty checks
   - cold bootstrap is still cold bootstrap
   - quota pressure remains quota pressure
   - partial upstream coverage remains partial upstream coverage
   - Meta publication gaps remain `blocked` or `repair_required` when evidence supports them
   - `sync effectiveness` may report `improving` only when recent movement is visible in the current snapshot
   - `sync effectiveness` must report `stalled_by_quota` or `stable_but_incomplete` when truth or hot-window support is still missing

## What This Plan Now Means

- The Google + Meta phase train is effectively closed.
- The steady-state operating model is global across all businesses.
- Future posture changes are operational decisions made on top of the existing model.
- Optional future work should be framed as:
  - current evidence review
  - explicit posture choice
  - scoped operational proof
  - reversible runtime change

It should not be framed as another architecture phase chain.

## Future Optional Operational Decisions

These are optional operational choices, not missing architecture:

1. Review whether stronger warehouse trust should be adopted after the posture review reports `eligible_for_explicit_review`.
2. Review whether Meta retention execute mode should ever be enabled globally after:
   - rebuild truth is globally ready
   - protected published truth is visible on real rebuilt data
   - dry-run and scoped proof still show safe delete scope only
3. Review whether Google retention execute mode should ever be enabled globally after separate Google-specific proof.

None of those decisions are required to consider this architecture complete.
