# Google + Meta Historical Truth Master Plan

## Summary

- Separate provider contracts into engine hot window, authoritative dashboard history, and retention cleanup.
- Google locks:
  - advisor readiness: `84` days
  - warehouse retention remains tiered
  - `google_ads_search_term_daily` is a `120` day hot table after serving cutover
- Meta locks:
  - `meta_account_daily`, `meta_campaign_daily`, `meta_adset_daily`, `meta_ad_daily`: `761` day authoritative horizon
  - `meta_breakdown_daily`: `394` day authoritative horizon
  - ready window: `30` days
  - support window: `90` days
  - current day is live-only
  - non-today inside the horizon serves published verified truth only
  - non-today beyond the authoritative horizon falls back to live reads for `summary/campaigns/adsets/ad` and returns `unsupported/degraded` for `breakdowns`

## Locked Contracts

### Google

- Advisor/action readiness uses `84` days.
- Retention policy:
  - `google_ads_account_daily`, `google_ads_campaign_daily`, `google_ads_keyword_daily`, `google_ads_product_daily`: `761`
  - `google_ads_geo_daily`, `google_ads_device_daily`, `google_ads_audience_daily`, `google_ads_ad_group_daily`, `google_ads_asset_group_daily`: `396`
  - `google_ads_ad_daily`, `google_ads_asset_daily`: `180`
  - `google_ads_search_query_hot_daily`, `google_ads_search_term_daily`: `120`
  - `google_ads_top_query_weekly`: `365`
  - `google_ads_search_cluster_daily`: `761`
  - `google_ads_decision_action_outcome_logs`: `761`

### Meta

- Authoritative horizons:
  - `meta_account_daily`, `meta_campaign_daily`, `meta_adset_daily`, `meta_ad_daily`: `761`
  - `meta_breakdown_daily`: `394`
- Decision windows:
  - ready window: `30`
  - support window: `90`
- Historical semantics:
  - current day is not canonical warehouse truth
  - non-today inside horizon reads published verified truth only
  - non-today beyond horizon uses live read-only fallback for `summary/campaigns/adsets/ad`
  - `breakdowns` beyond `394` are `unsupported/degraded`

## Phase Ledger

### Completed Before This Commit

1. Shared truth contracts
2. Google readiness alignment

### Completed In This Commit

3. Google search-term cutover
   - raw `google_ads_search_term_daily` is no longer treated as an implicit long-history intelligence source.
   - raw search-term inspection now remains explicitly hot-window-limited to `120` days.
   - `search-intelligence` serving now reads the additive intelligence layer:
     - hot query rows from `google_ads_search_query_hot_daily`
     - weekly query fallback from `google_ads_top_query_weekly`
     - semantic cluster support from `google_ads_search_cluster_daily`
   - Google status and advisor-support coverage now read additive search-intelligence coverage instead of raw `google_ads_search_term_daily` coverage.
   - advisor historical support remains aggregate-backed and no longer carries any raw two-year search-term assumption.

5. Meta read-path separation
   - current-day `summary`, `campaigns`, and `adsets` are live-only and do not fall back to warehouse truth on empty/error responses.
   - horizon-inside non-today serving no longer treats provisional/finalize-pending warehouse rows as authoritative.
   - historical warehouse read mode now means published truth only; horizon-outside live fallback contract remains unchanged.

### Partially Completed In This Commit

6. Meta day-state planner
   - `meta_authoritative_day_state` listing and reconciliation helpers are now wired into scheduling.
   - scheduled maintenance now seeds timezone `D-1`, gates `D-2` on published `D-1`, gates `D-3` on published `D-2`, and only then opens older recent work.
   - `syncMetaInitial()` now seeds only timezone `D-1` instead of broad initial enqueue.
   - planner state is not yet the sole execution authority; worker success is still not publication-pointer-gated end to end.

### Still Pending

4. Google retention enforcement
7. Meta executor cutover
8. Meta detector + auto-heal hardening
9. Meta retention enforcement
10. Legacy cleanup and hardening

## Current Repo Baseline

- Previous baseline for this continuation was `35f2d84` plus `a4854ed`.
- Current repo baseline after this commit:
  - Google Phase 3 is complete.
  - Meta Phase 5 is complete.
  - Meta Phase 6 is partially integrated but not yet authoritative.
- `GOOGLE_ADS_RETENTION_EXECUTION_ENABLED` remains disabled.
- `META_RETENTION_EXECUTION_ENABLED` remains disabled.
- The reverted 2026-04-13 warehouse-only current-day experiment is not reintroduced.

## Verified Tests

- Targeted regression suite passed:
  - `lib/google-ads/search-serving-hot-window.test.ts`
  - `lib/google-ads/search-intelligence-storage.test.ts`
  - `lib/google-ads/advisor-aggregate-intelligence.test.ts`
  - `app/api/google-ads/status/route.test.ts`
- Result: `4` files, `18` tests passed.
- TypeScript verification passed: `npx tsc --noEmit --pretty false`

## Remaining Risks

- Google retention execute mode is still intentionally off; a dedicated Phase 4 PR must prove there is no remaining `>120d` dependency on `google_ads_search_term_daily` before any canary delete runs.
- The raw `/api/google-ads/search-terms` surface is intentionally still a `120` day hot/debug surface and is not a long-horizon intelligence API.
- Search-intelligence serving now reads additive storage, but Phase 4 still needs delete-safe observability and canary proof before retention enforcement is allowed to touch old raw rows.
- Meta planner state now influences scheduling, but executor success and completion semantics are not yet fully enforced by publication pointers.
- Meta detector and auto-heal semantics are not upgraded yet; missing publication and blocked/config-mismatch flows still need first-class detector coverage.
- Legacy compat helpers and row-presence assumptions may still exist outside the touched read/status paths and should not be cleaned up until planner authority is complete.

## Next Recommended PR / Prompt

- Next recommended PR: Google Phase 4 retention enforcement dry-run/canary rollout.
- Required scope:
  - prove there is no remaining `>120d` serving, advisor, or status dependency on `google_ads_search_term_daily`
  - keep `GOOGLE_ADS_RETENTION_EXECUTION_ENABLED` disabled by default
  - add dry-run observability and explicit canary verification for raw search-term retention deletes
  - verify `google_ads_search_query_hot_daily`, `google_ads_top_query_weekly`, and `google_ads_search_cluster_daily` remain sufficient after old raw rows are absent
  - keep Meta work out of the PR
- Intentionally deferred from Phase 3:
  - destructive retention execution
  - archival/cold export strategy for raw payloads
  - broad legacy cleanup outside the touched Google search-intelligence paths

### Next Recommended Prompt

1. Keep `GOOGLE_ADS_RETENTION_EXECUTION_ENABLED` disabled by default.
2. Prove Google search intelligence, advisor support, and status remain correct when `google_ads_search_term_daily` contains only the most recent `120` days.
3. Add dry-run retention observability and a canary verification path for raw search-term cleanup.
4. Do not change Meta behavior in the same PR.
5. Add targeted tests around delete safety, canary posture, and post-retention search-intelligence correctness.
