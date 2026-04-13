# Google Ads Data Retention Final

This document is the canonical final retention model and current runtime posture for Google Ads data retention in this repo.

## Retention Tiers

- Core daily tables: 25 months
- Breakdown daily tables: 13 months
- Creative daily tables: 180 days
- Raw search query hot daily: 120 days (`google_ads_search_query_hot_daily`, `google_ads_search_term_daily`)
- Top queries weekly: 365 days
- Search cluster aggregate daily: 25 months
- Decision action and outcome logs: 25 months

## Runtime Posture

Current implemented posture:

- dry run is always available through `buildGoogleAdsRetentionDryRun` and the product gate
- runtime execution is implemented in `executeGoogleAdsRetentionPolicy`
- destructive execution stays gated by `GOOGLE_ADS_RETENTION_EXECUTION_ENABLED`
- retention runs are recorded in `google_ads_retention_runs`
- retention work executes under the shared `sync_runner_leases` lease system using provider scope `google_ads_retention`
- the durable worker schedules retention automatically on a background cadence
- `/api/google-ads/status` and `npm run google:ads:product-gate -- <businessId>` expose retention runtime posture plus latest raw-hot-table dry-run observability
- `npm run google:ads:retention-canary -- <businessId>` is the explicit non-default verification path for raw search-term cleanup safety

## What Gets Deleted

- `google_ads_account_daily`
- `google_ads_campaign_daily`
- `google_ads_keyword_daily`
- `google_ads_product_daily`
- `google_ads_geo_daily`
- `google_ads_device_daily`
- `google_ads_audience_daily`
- `google_ads_ad_group_daily`
- `google_ads_asset_group_daily`
- `google_ads_ad_daily`
- `google_ads_asset_daily`
- `google_ads_search_query_hot_daily`
- `google_ads_search_term_daily`
- `google_ads_top_query_weekly`
- `google_ads_search_cluster_daily`
- `google_ads_decision_action_outcome_logs`

Deletion is batched by `id` and keyed by the retention cutoff column for that table:

- daily tables use `date`
- weekly tables use `week_start`
- action/outcome logs use `occurred_at`

## Hot / Warm / Cold Summary

- Hot:
  - `google_ads_search_query_hot_daily`
  - `google_ads_search_term_daily`
  - `google_ads_ad_daily`
  - `google_ads_asset_daily`
- Warm:
  - core daily warehouse tables
  - breakdown daily warehouse tables
  - `google_ads_top_query_weekly`
  - `google_ads_search_cluster_daily`
  - `google_ads_decision_action_outcome_logs`
- Cold:
  - no archive/export runtime is implemented yet; cold posture remains an explicit future step

## Observability

- `google_ads_retention_runs` records run mode, deleted row totals, errors, timestamps, and per-table summary JSON
- per-table summary JSON now includes:
  - `eligibleRows`
  - `oldestEligibleValue`
  - `newestEligibleValue`
  - `retainedRows`
  - `latestRetainedValue`
  - `observed`
- the worker logs retention results under `[durable-worker] google_ads_retention`
- the product gate reports runtime availability, current mode, latest recorded run, raw-hot-table dry-run stats, and the canary command
- `/api/google-ads/status` exposes retention runtime state under both `operations` and a dedicated `retention` block

## Delete-Safety Proof

Phase 4 completed the delete-safety proof path for raw search-term retention:

- canonical search intelligence outside the raw `120` day hot window reads additive weekly query and cluster support
- status/search support coverage reads additive search-intelligence coverage
- product-gate and admin sync-health recent search readiness now read additive search coverage instead of raw row presence
- the advisor-readiness helper now checks additive search-intelligence coverage for the `search_term_daily` requirement

This means the repo now treats raw `google_ads_search_term_daily` as hot/debug-only storage, not as a hidden long-history dependency.

## Canary Verification

Run:

- `npm run google:ads:retention-canary -- <businessId>`

The canary verifier is explicit and non-destructive. It does not enable retention execution. It proves:

- raw search terms stay empty outside the `120` day hot window
- historical search intelligence still returns aggregate-backed support
- recent `84` day advisor search support remains additive-backed
- the latest raw-hot-table dry-run stats are visible for operator review

## Current Session Constraint

The direct shell environment in this session does not expose `DATABASE_URL` by default.

Script-backed commands such as `npm run google:ads:product-gate -- <businessId>` load repo env through Next's env loader and can verify DB-backed runtime state when `.env.local` provides the connection string.

Live retention execution is still not verified from this task because:

- destructive execution remains disabled by default
- no execute-mode retention run was intentionally performed here

The honest current posture is:

- DB-backed retention state can be inspected
- dry-run candidate stats and canary verification can be inspected without enabling deletion
- execute-mode deletion is still gated and not verified

## Intentionally Deferred After Phase 4

- execute-mode Google retention canary
- global enablement of `GOOGLE_ADS_RETENTION_EXECUTION_ENABLED`
- archival/cold export for long-tail raw search detail
- broader legacy cleanup outside the touched Google search-intelligence and operational reporting paths
- overall next master-plan step: Meta Phase 7 executor cutover
