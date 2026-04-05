# Meta Account-First Architecture

## Core Rules
- Source of truth is the ad account, not the workspace.
- `Today` is served with a live-biased overlay.
- `Yesterday` and older ranges are served from warehouse snapshots.
- Non-today Meta UI fields must be warehouse-backed. Snapshot tables are not a historical serving source.
- Time slicing follows the ad account timezone.
- Currency is stored in the native account currency first.
- Workspace totals are derived from account-level truth.

## States
- `not_connected`
- `connected_no_assignment`
- `syncing`
- `partial`
- `stale`
- `ready`
- `action_required`

## Initial Warehouse Tables
- `meta_sync_jobs`
- `meta_raw_snapshots`
- `meta_account_daily`
- `meta_campaign_daily`
- `meta_adset_daily`
- `meta_ad_daily`
- `meta_creative_daily`

## Initial Metric Contract
- `spend`
- `impressions`
- `clicks`
- `reach`
- `frequency`
- `conversions`
- `revenue`
- `roas`
- `cpa`
- `ctr`
- `cpc`

## Delivery Order
1. Schema and shared types
2. Raw snapshot ingestion
3. Transformer pipeline
4. Sync orchestration
5. Serving APIs
6. Meta dashboard cutover
7. Overview cutover
8. Today live overlay

## Implemented In This Rollout
- Warehouse schema and shared Meta warehouse types
- Raw snapshot persistence for campaign/adset/breakdown fetches
- Runtime sync job writes for request-time Meta fetches
- Single-day normalized writes for:
  - `meta_account_daily`
  - `meta_campaign_daily`
  - `meta_adset_daily`
- Warehouse-backed serving modules:
  - summary
  - trends
  - campaigns
- Meta platform KPI summary now prefers warehouse summary with safe fallback
- Overview Meta aggregation now prefers warehouse summary with safe fallback
- `Today` live overlay support inside warehouse serving
- Meta sync skeleton:
  - recent sync
  - today sync
- Operational support:
  - `/api/meta/status`
  - `/api/sync/refresh` provider=`meta`
  - `scripts/meta-warehouse-smoke.ts`
