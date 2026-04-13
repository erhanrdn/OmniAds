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

4. Google retention dry-run/canary hardening
   - delete-safety proof was extended across Google status, product-gate, admin ops, and advisor-readiness tooling so old raw `google_ads_search_term_daily` rows can disappear without breaking canonical search intelligence support.
   - retention dry-run rows now record per-table observability for what would be deleted and what would remain, including raw-hot-table candidate counts and oldest/newest eligible values.
   - `/api/google-ads/status` now exposes a dedicated retention block with latest raw hot-table dry-run stats plus the explicit canary verification command.
   - `google:ads:product-gate` now surfaces raw hot-table dry-run stats and the explicit retention canary command.
   - `npm run google:ads:retention-canary -- <businessId>` now provides an explicit non-default verification path that proves:
     - raw search-term reads stay empty outside the 120-day hot window
     - historical search intelligence remains aggregate-backed
     - recent advisor support coverage stays additive-backed
   - `GOOGLE_ADS_RETENTION_EXECUTION_ENABLED` remains disabled by default; this PR does not enable destructive retention globally.

5. Meta read-path separation
   - current-day `summary`, `campaigns`, and `adsets` are live-only and do not fall back to warehouse truth on empty/error responses.
   - horizon-inside non-today serving no longer treats provisional/finalize-pending warehouse rows as authoritative.
   - historical warehouse read mode now means published truth only; horizon-outside live fallback contract remains unchanged.
6. Meta day-state planner
   - `meta_authoritative_day_state` listing and reconciliation helpers are now wired into scheduling.
   - scheduled maintenance now seeds timezone `D-1`, gates `D-2` on published `D-1`, gates `D-3` on published `D-2`, and only then opens older recent work.
   - `syncMetaInitial()` now seeds only timezone `D-1` instead of broad initial enqueue.
   - historical core backfill now also waits for timezone `D-1` to be fully published before advancing `D-2`.

7. Meta executor cutover
   - historical Meta executor completion now depends on published authoritative truth for the required surface set, not on broad queue movement, raw warehouse row presence, or a worker returning normally.
   - `meta_authoritative_day_state` is now the executor authority for historical day success and readiness advancement.
   - finalize-like success without a valid publication pointer now becomes explicit non-success:
     - `blocked` when manifest/finalize work completed but the required publication pointer is missing
     - `repair_required` or `failed` when verification truth says the day still needs repair or retry
     - `queued` / `running` when the worker made no authoritative progress and should be requeued instead of marked terminal
   - historical authoritative sources now always bypass the old broad-coverage short-circuit, including `historical`, `historical_recovery`, `initial_connect`, and `request_runtime`.
   - range readiness and publication verification now use the full required Meta surface set with day-age-aware breakdown exclusion beyond the `394` day breakdown horizon.

### Still Pending

8. Meta detector + auto-heal hardening
9. Meta retention enforcement
10. Legacy cleanup and hardening

## Current Repo Baseline

- Previous baseline for this continuation was `35f2d84` plus `a4854ed`.
- Current repo baseline after this commit:
  - Google Phase 4 is complete.
  - Meta Phase 5 is complete.
  - Meta Phase 6 is complete.
  - Meta Phase 7 is complete.
- `GOOGLE_ADS_RETENTION_EXECUTION_ENABLED` remains disabled.
- `META_RETENTION_EXECUTION_ENABLED` remains disabled.
- The reverted 2026-04-13 warehouse-only current-day experiment is not reintroduced.

## Verified Tests

- Targeted regression suite passed:
  - `lib/google-ads/warehouse-retention.test.ts`
  - `lib/google-ads/retention-canary.test.ts`
  - `lib/google-ads/search-serving-hot-window.test.ts`
  - `lib/google-ads/search-intelligence-storage.test.ts`
  - `lib/google-ads/advisor-aggregate-intelligence.test.ts`
  - `app/api/google-ads/status/route.test.ts`
  - `lib/google-ads/product-gate.test.ts`
  - `lib/admin-operations-health.test.ts`
- Result: `8` files, `48` tests passed.
- Additional targeted Meta Phase 7 suite passed:
  - `lib/meta/warehouse.test.ts`
  - `lib/sync/meta-sync-lease-epoch.test.ts`
  - `lib/sync/meta-sync-scheduled-work.test.ts`
  - `lib/meta/serving.test.ts`
  - `app/api/sync/refresh/route.test.ts`
- Result: `5` files, `113` tests passed.
- TypeScript verification passed: `npx tsc --noEmit --pretty false`

## Remaining Risks

- Google retention execute mode is still intentionally off; Phase 4 adds dry-run proof and an explicit canary verifier, but no execute-mode delete was run from this PR.
- The raw `/api/google-ads/search-terms` surface is intentionally still a `120` day hot/debug surface and is not a long-horizon intelligence API.
- Search-intelligence serving now reads additive storage and Phase 4 adds delete-safe observability, but a future explicit operator-approved execute canary is still deferred.
- Meta executor success is now publication-pointer-gated, but detector and auto-heal semantics are not yet upgraded to aggressively classify and heal blocked/config-mismatch cases outside the worker path.
- Meta retention execution is still intentionally disabled by default and is not the next step from this commit.
- Legacy compat helpers and row-presence assumptions may still exist outside the touched read/status paths and should not be cleaned up until the later detector and cleanup phases are complete.

## Next Recommended PR / Prompt

- Next recommended PR: Meta Phase 8 detector + auto-heal hardening.
- Required scope:
  - make missing publication and worker/planner/web contract mismatches first-class detector outcomes
  - surface explicit `blocked`, `repair_required`, and retryable non-terminal states in operator tooling and auto-heal decisions
  - keep both retention executors disabled by default
  - keep Google retention execution rollout and Meta retention enforcement out of the next PR
- Intentionally deferred after Phase 4:
  - Google execute-mode raw-hot-table retention canary
  - global enablement of `GOOGLE_ADS_RETENTION_EXECUTION_ENABLED`
  - archival/cold export strategy for raw payloads
  - broad legacy cleanup outside the touched Google search-intelligence paths
  - Meta retention execution enablement

### Next Recommended Prompt

1. Complete Meta Phase 8 detector + auto-heal hardening without changing retention posture.
2. Surface explicit `blocked`, `repair_required`, and planner/worker contract mismatch outcomes in Meta detector, admin, and verification tooling.
3. Keep both retention executors disabled by default unless a later explicit rollout says otherwise.
4. Do not mix Google execute-mode retention enablement or Meta retention rollout into the detector PR.
5. Add targeted tests around blocked-state detection, stale-lease proof requirements, and operator-facing recovery recommendations.
