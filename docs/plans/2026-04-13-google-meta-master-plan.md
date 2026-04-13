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
   - `search-intelligence` and `search terms` serving now read canonical hot support rows from `google_ads_search_query_hot_daily`.
   - advisor historical support no longer depends on long-history `google_ads_search_term_daily` reads.
   - Google status/reporting surfaces now report `search_term_daily` posture as a `120` day hot window instead of implied long-history coverage.

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
  - `lib/meta/adsets-source.test.ts`
  - `lib/google-ads/search-intelligence-storage.test.ts`
  - `app/api/google-ads/status/route.test.ts`
  - `lib/meta/canonical-overview.test.ts`
  - `app/api/meta/summary/route.test.ts`
  - `app/api/meta/campaigns/route.test.ts`
  - `app/api/meta/status/route.test.ts`
  - `lib/meta/serving.test.ts`
  - `lib/sync/meta-sync-scheduled-work.test.ts`
  - `lib/overview-service.test.ts`
- Result: `11` files, `69` tests passed.
- TypeScript verification passed: `npx tsc --noEmit --pretty false`

## Remaining Risks

- Google retention execute mode is still intentionally off; a dedicated Phase 4 PR must prove there is no remaining `>120d` dependency on `google_ads_search_term_daily` before any canary delete runs.
- Meta planner state now influences scheduling, but executor success and completion semantics are not yet fully enforced by publication pointers.
- Meta detector and auto-heal semantics are not upgraded yet; missing publication and blocked/config-mismatch flows still need first-class detector coverage.
- Legacy compat helpers and row-presence assumptions may still exist outside the touched read/status paths and should not be cleaned up until planner authority is complete.

## Next Recommended PR / Prompt

- Next recommended PR: Meta Phase 6 and 7 cutover, limited to planner authority and executor completion semantics.
- Required scope:
  - make `meta_authoritative_day_state` the canonical source for enqueue decisions
  - require publication-pointer-backed completion before a day can be considered published/successful
  - turn publication-less finalize outcomes into `repair_required` or `blocked`
  - keep current-day live-only and horizon contracts unchanged
  - keep both retention workers in dry-run mode
- Do not include detector/auto-heal rollout or retention execution in that PR.

### Next Recommended Prompt

1. Promote `meta_authoritative_day_state` from scheduling hint to scheduler authority.
2. Replace remaining published-verification scan decisions with planner-state-based enqueue decisions.
3. Enforce `D-1 -> D-2 -> D-3` publish gating end to end, including worker success/finalize paths.
4. Treat finalize success without a publication pointer as `repair_required` or `blocked`, never complete.
5. Keep current-day Meta reads live-only and keep horizon fallback behavior unchanged.
6. Do not enable `META_RETENTION_EXECUTION_ENABLED`.
7. Do not start Meta detector/auto-heal rollout in the same change.
8. Add targeted tests for planner authority, publication-gated success, and broken finalize outcomes.
