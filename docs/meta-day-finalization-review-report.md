# Meta Day Finalization Hardening Review Report

## Scope
- Harden `today/live` vs historical warehouse truth boundaries for Meta.
- Add authoritative day finalization semantics for `D-1` and recent repair windows.
- Make Meta refresh endpoint actually start date-aware repair/finalization work.

## Implemented Changes

### 1. Truth lifecycle on daily warehouse tables
- Added warehouse truth columns to:
  - `meta_account_daily`
  - `meta_campaign_daily`
  - `meta_adset_daily`
- New fields:
  - `truth_state`
  - `truth_version`
  - `finalized_at`
  - `validation_status`
  - `source_run_id`
- Default state is `finalized/passed` for existing rows.

Files:
- `lib/migrations.ts`
- `lib/meta/warehouse-types.ts`
- `lib/meta/warehouse.ts`

### 2. Historical rows now default to finalized-only reads
- `getMetaAccountDailyRange`
- `getMetaCampaignDailyRange`
- `getMetaAdSetDailyRange`

These now exclude provisional rows unless `includeProvisional: true` is explicitly passed.

This enforces:
- `today` can be live/provisional
- non-today read surfaces use finalized warehouse truth by default

### 3. Fresh authoritative finalization path
- `syncMetaAccountCoreWarehouseDay(...)` now accepts:
  - `freshStart`
  - `truthState`
  - `sourceRunId`
- For authoritative historical sources, the run:
  - clears stale `meta_raw_snapshots`
  - clears stale `meta_sync_checkpoints`
  - rebuilds daily rows from a fresh source pull

Files:
- `lib/api/meta.ts`

### 4. Hard spend validation before finalized success
- Finalized runs now fetch direct account-level source spend from Meta Insights.
- The run compares:
  - direct source spend
  - rebuilt `meta_account_daily` spend
  - aggregated `meta_campaign_daily` spend
- Tolerance:
  - `abs_diff <= max(0.01, source_spend * 0.001)`
- If validation fails, the run throws and does not complete as success.

File:
- `lib/api/meta.ts`

### 5. Account truth rebuilt from campaign truth
- `meta_account_daily` is now rebuilt from finalized campaign rows during sync and repair flows.
- This closes the drift where campaign truth was correct but account summary remained stale or tiny.

Files:
- `lib/api/meta.ts`
- `lib/meta/serving.ts`

### 6. New sync source semantics
- Added new source/type values:
  - `today_observe`
  - `finalize_day`
  - `finalize_range`
  - `repair_recent_day`
- Updated source priority and queue precedence so these sources are treated as higher-authority than generic recent replay.

Files:
- `lib/meta/warehouse-types.ts`
- `lib/meta/warehouse.ts`
- `lib/sync/meta-sync.ts`

### 7. Recent dirty-day detection
- Added `getMetaDirtyRecentDates(...)`.
- It scans recent dates for:
  - non-finalized account rows
  - failed account validation state
  - non-finalized campaign/adset rows
  - account spend vs campaign spend drift
  - zero campaign/adset coverage
- Dirty dates are re-enqueued as `repair_recent_day`.

Files:
- `lib/meta/warehouse.ts`
- `lib/sync/meta-sync.ts`

### 8. Meta refresh endpoint contract fixed
- `/api/sync/refresh` now supports Meta-specific date-aware requests:
  - `mode: "today" | "repair" | "finalize_range"`
  - `startDate`
  - `endDate`
- Meta date-range refreshes no longer fail with a 400 due to old contract rejection.
- Explicit Meta range refreshes bypass the old “already running” short-circuit.

Files:
- `app/api/sync/refresh/route.ts`
- `app/api/sync/refresh/route.test.ts`

### 9. Serving repair path persists finalized truth
- `repairMetaWarehouseTruthRange(...)` now rebuilds account rows from repaired campaign rows and writes them back as finalized/passed truth.
- Campaign/adset repair writes also stamp finalized validation state.

File:
- `lib/meta/serving.ts`

## Validation Run
- `npx vitest run app/api/sync/refresh/route.test.ts lib/api/meta.test.ts lib/meta/serving.test.ts lib/meta/warehouse.test.ts lib/sync/meta-sync-scheduled-work.test.ts`
- `npm run build`

Both passed on local.

## What This Should Prevent
- Connection-day or rollover-day tiny stale spend values persisting in warehouse.
- Historical UI reads accidentally consuming provisional rows.
- Old checkpoint/raw state poisoning a fresh authoritative rerun.
- Refresh button no-op behavior for Meta range fixes.

## Remaining Review Questions
1. Should `truth_version` increment only on truth-state/validation changes, or also on any metric overwrite from a validated rerun?
2. Do we want a dedicated `repair_failed` transition on validation failure, or is throwing and retrying enough for the first iteration?
3. Should `today_observe` rows ever be written into daily tables, or should `today` remain live-only with no provisional write at all?
4. Should recent diff scan compare only account spend vs campaign spend, or also adset aggregate spend before enqueueing repair?
5. Do we want an explicit nightly `D-1..D-7` sweeper entrypoint in addition to the scheduled maintenance path?

## Suggested Review Focus
- Correctness of the finalized-only historical read boundary.
- Safety of deleting stale checkpoint/raw state on `freshStart`.
- Whether spend-only hard validation is sufficient for first rollout.
- Queue precedence around `finalize_day` vs `repair_recent_day` vs historical backfill.
