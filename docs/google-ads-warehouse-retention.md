# Google Ads Warehouse Retention

## Current Operating Posture

- Google retention behavior is one global contract across all businesses.
- `GOOGLE_ADS_RETENTION_EXECUTION_ENABLED` remains the only destructive execution gate.
- `ready` means evidence only and does not auto-enable retention or any stronger execution posture.
- Business-scoped verification commands remain inspection tools, not rollout posture.

## Locked Retention Targets

- Core daily: `761` days
- Breakdown daily (`geo`, `device`, `audience`, `ad_group`, `asset_group`): `396` days
- Creative/ad/asset daily: `180` days
- Raw search-term hot tables (`google_ads_search_query_hot_daily`, `google_ads_search_term_daily`): `120` days
- Top queries weekly: `365` days
- Search cluster/theme aggregate: `761` days
- Decision action/outcome log: `761` days

## Locked Readiness And Serving Contract

These remain fixed:

1. Advisor readiness remains `84` days.
2. The required advisor surfaces remain:
   - `campaign_daily`
   - `search_term_daily`
   - `product_daily`
3. Search support remains additive-backed:
   - `google_ads_search_query_hot_daily`
   - `google_ads_top_query_weekly`
   - `google_ads_search_cluster_daily`
4. Raw long-history `google_ads_search_term_daily` rows are not required for canonical historical support.
5. Rebuild truth remains honest through:
   - `blocked`
   - `quota_limited`
   - `cold_bootstrap`
   - `backfill_in_progress`
   - `partial_upstream_coverage`
   - `ready`

## Global Operator Review Workflow

Use one shared workflow before considering any stronger posture:

1. Open `/admin/sync-health` or run `npm run ops:execution-readiness-review`.
2. Read Google rebuild truth in the shared global review.
3. Read the shared global execution-readiness gate.
4. Read the explicit execution posture review.

Interpretation:

- `not_ready`: stronger posture would overstate current rebuild truth
- `conditionally_ready`: hard blockers are cleared, but missing evidence still requires a manual hold
- `ready`: rebuild evidence is strong enough for explicit review, but nothing auto-enables

## Business-Scoped Drilldown

Use business drilldown only to explain the global result:

- `/api/google-ads/status?businessId=<businessId>`
  - `operatorTruth.rebuild`
  - `operatorTruth.reviewWorkflow`
  - `retention`

Interpretation rules:

- sparse rebuilt rows are not enough by themselves
- partial upstream coverage remains partial upstream coverage
- quota pressure remains quota pressure
- provider drilldown does not create a business-by-business rollout model

## Manual Controls That Remain Explicit

The repo keeps manual controls explicit:

1. `GOOGLE_ADS_RETENTION_EXECUTION_ENABLED` remains the only delete-execution gate.
2. Google execution-sensitive mutation paths keep their existing manual approval and operator boundary controls.
3. The global rebuild review, readiness gate, and posture review never change execution automatically.
4. `ready` and `eligible_for_explicit_review` are review states, not permission to execute.

## Scoped Verification Evidence

Use the scoped commands as proof paths only:

1. `npm run google:ads:product-gate -- <businessId>`
   - operator-readable readiness and retention evidence
2. `npm run google:ads:retention-canary -- <businessId>`
   - explicit scoped retention proof

These commands must continue to prove:

- raw search-term rows stay empty outside the `120` day hot window
- canonical historical search intelligence remains aggregate-backed
- recent `84` day advisor support remains additive-backed
- retention proof is visible without enabling deletes

## What Must Stay True

- Delete-safety proof stays intact.
- Raw search-term sparsity must never make Google look healthier than it is.
- Retention execution stays explicit and separate from readiness.
- Global operator posture stays global; business drilldown remains explanatory only.

## Future Optional Operational Decisions

These are optional operations, not missing architecture:

1. explicit review of stronger warehouse trust after the global posture review reports `eligible_for_explicit_review`
2. explicit review of Google retention execute mode after separate Google-specific proof
3. no posture change if the evidence does not justify it
