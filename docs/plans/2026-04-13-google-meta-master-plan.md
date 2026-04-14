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

4. Google retention dry-run/scoped verification hardening
   - delete-safety proof was extended across Google status, product-gate, admin ops, and advisor-readiness tooling so old raw `google_ads_search_term_daily` rows can disappear without breaking canonical search intelligence support.
   - retention dry-run rows now record per-table observability for what would be deleted and what would remain, including raw-hot-table candidate counts and oldest/newest eligible values.
   - `/api/google-ads/status` now exposes a dedicated retention block with latest raw hot-table dry-run stats plus the explicit verification command.
   - `google:ads:product-gate` now surfaces raw hot-table dry-run stats and the explicit retention verification command.
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

8. Meta detector + auto-heal hardening
   - missing publication after finalize-like work is now first-class detector truth rather than an implicit worker-side failure.
   - planner/worker/publication disagreement now surfaces as explicit detector reasons, including:
     - `publication_pointer_missing_after_finalize`
     - `planner_publication_mismatch`
     - `published_slice_pointer_missing`
     - `stale_lease_pending_proof`
   - detector, verification, and status surfaces now explicitly distinguish:
     - `blocked` for publication-pointer absence or planner/publication contract mismatch after finalize-like completion
     - `repair_required` when a fresh authoritative retry is the correct next step
     - retryable non-terminal `queued` / `running` / `pending` states when authoritative progress is still justified by evidence
   - stale leases are no longer hard-failed without proof of no progress; they stay non-terminal until cleanup/reconciliation has evidence.
   - operator/admin/status tooling now exposes explicit recovery guidance and detector reason codes instead of optimistic queue-only wording.
   - published-truth serving semantics remain unchanged:
     - `today` is still live-only
     - non-today inside the horizon still serves published verified truth only
     - horizon-outside fallback semantics are unchanged
   - `META_RETENTION_EXECUTION_ENABLED` remains disabled by default; this phase does not start retention rollout.

9. Meta retention enforcement preparation
   - Meta retention dry-run rows now record per-table operator proof for what would be deleted, what would remain, and which currently-published artifacts are protected.
   - latest dry-run evidence now covers:
     - `meta_account_daily`
     - `meta_campaign_daily`
     - `meta_adset_daily`
     - `meta_ad_daily`
     - `meta_breakdown_daily`
     - `meta_authoritative_publication_pointers`
     - `meta_authoritative_slice_versions`
     - `meta_authoritative_source_manifests`
     - `meta_authoritative_reconciliation_events`
     - `meta_authoritative_day_state`
   - retention inspection now exposes deletable horizon-outside residue alongside protected published truth counts, including oldest/newest deletable values and retained/protected row counts.
   - protection semantics now stay locked to the published-truth contract:
     - core authoritative truth remains protected inside the `761` day horizon
     - breakdown authoritative truth remains protected only inside the `394` day horizon
     - breakdown artifacts older than `394` days are surfaced as non-authoritative residue, not as required historical truth
   - `/api/meta/status` now exposes a dedicated Meta retention block with:
     - runtime gate and default-disabled posture
     - locked `761` / `394` policy summary
     - latest dry-run summary totals
     - per-table protected-vs-deletable evidence
   - `META_RETENTION_EXECUTION_ENABLED` remains disabled by default; this PR does not enable destructive retention globally.

10. Meta legacy cleanup and hardening
   - selected-range historical truth readiness no longer falls back to raw coverage or dirty-row heuristics when published verification is unavailable.
   - inside the authoritative horizon, Meta status/readiness surfaces now require published verification before marking historical summary or campaign truth as ready; ad set drilldown no longer becomes ready from coverage alone.
   - current-day Meta remains live-only, horizon-outside core fallback remains live fallback, and breakdowns outside `394` days remain unsupported/degraded.
   - D-1 authoritative ops/SLA reporting no longer treats planner `published` state as historical success without a publication pointer, and `repair_required` is no longer collapsed into `blocked`.
   - duplicated historical verification wording now resolves through the shared published-truth helper so status/read-path messaging stays aligned with `blocked`, `repair_required`, and published verification truth.
   - both `META_RETENTION_EXECUTION_ENABLED` and `GOOGLE_ADS_RETENTION_EXECUTION_ENABLED` remain disabled by default.

11. Meta retention scoped proof and global execution truth
   - `npm run meta:retention-canary -- <businessId>` remains the explicit Meta proof command, but it is now treated as a scoped verification path rather than a rollout canary.
   - delete execution remains separate from global enablement:
     - `META_RETENTION_EXECUTION_ENABLED` is the only execution gate
     - `--execute` is required for any delete attempt
     - business-specific allowlists are no longer part of the preferred operating model
   - scoped delete proof is locked to safe residue only:
     - core daily residue older than `761` days
     - breakdown residue older than `394` days
     - horizon-outside publication pointers, reconciliation rows, and published day-state rows older than the applicable horizon
     - orphaned unpublished slice versions and orphaned source manifests older than the applicable horizon
   - active published truth remains explicitly protected:
     - active publication pointers inside the locked horizon
     - active published slice versions referenced by those pointers
     - active source manifests referenced by published slices
     - published day-state rows tied to active publication pointers
     - currently-required core truth inside `761` days
     - currently-required breakdown truth inside `394` days
   - `/api/meta/status` now exposes the global retention gate plus a scoped-execution proof block, latest scoped run disposition, and per-table protected-vs-deleted proof alongside the existing dry-run block.
   - scoped run metadata now records whether the run was dry-run only, gated, skipped, or executed under the global posture.

12. Global execution truth and rebuild-aware honesty
   - the repo no longer treats per-business canary expansion as the primary model for Meta finalization, Meta retention execution, or Google extended historical rebuild posture.
   - Meta authoritative finalization v2 now follows the global `META_AUTHORITATIVE_FINALIZATION_V2` posture for every business instead of an allowlisted business subset.
   - Google extended historical rebuild posture now reports only global modes:
     - `safe_mode`
     - `global_backfill`
     - `global_reopen`
   - Meta retention scoped execution now obeys only the global `META_RETENTION_EXECUTION_ENABLED` gate.
   - `/api/meta/status` and `/api/google-ads/status` now expose operator truth for:
     - global execution posture
     - cold bootstrap / rebuild in progress
     - quota-limited pressure
     - partial upstream coverage
     - true blocked / repair-required publication states
   - the DB server change and provider rebuild context are now first-class operator truth:
   - sparse warehouse coverage during rebuild is not treated as healthy historical truth
   - quota or rate-limit pressure is surfaced explicitly instead of being collapsed into generic success wording
   - rebuild lag is separated from true `blocked` / `repair_required` publication problems

13. Global rebuild truth review workflow
   - `/admin/sync-health` now exposes one additive global rebuild truth review for Google and Meta instead of pushing operators back into business-by-business rollout language.
   - the global review reports, in one place:
     - execution posture
     - dominant rebuild state
     - cold bootstrap / backfill / quota / partial-coverage counts
     - blocked vs repair-required evidence where relevant
     - Meta protected published truth visibility
   - Meta now exposes explicit live protected-published-truth review on `/api/meta/status`:
     - whether non-zero protected published daily rows are visible
     - which protected truth classes are currently present
     - whether absence is best explained by rebuild still being incomplete, by publication still being missing, or by no visible protected truth yet
   - Google remains equally visible through the same global review plus the existing `/api/google-ads/status.operatorTruth.rebuild` contract.
   - repo wording now treats this as one global operator review workflow, not another rollout phase and not a "pick the next business" operating model.

### Still Pending

- destructive retention remains intentionally disabled by default under the global posture until operators explicitly decide to enable it after rebuild truth, quota stability, and protected-truth evidence are satisfactory.
- stronger warehouse trust is still deferred until:
  - Google global review stops reporting cold bootstrap / backfill / quota / partial-coverage pressure
  - Meta global review stops reporting rebuild-incomplete or publication-missing posture
  - Meta protected published truth review shows the expected non-zero rebuilt truth on real data where that truth should exist

## Operator Follow-up Record

- Historical April 14, 2026 operator review:
  - one production Meta business was sampled; repo docs intentionally anonymize it and only record that the live business id ends with `d34c84`
  - this remains historical evidence only and is no longer the preferred rollout posture
- Dry-run proof outcome:
  - one initial dry-run was skipped because another Meta retention lease was active
  - the completed dry-run observed `612` deletable `meta_breakdown_daily` rows outside the `394` day breakdown horizon
  - the deletable residue window was limited to `2024-04-26` through `2024-05-04`
  - no active publication-pointer-backed protected rows were present for the reviewed business
- Scoped execute outcome:
  - the first execute attempt surfaced a real SQL bug: `FOR UPDATE cannot be applied to the nullable side of an outer join`
  - the fix was kept narrow: orphan cleanup now locks only the base delete target rows
  - targeted tests passed after the fix
  - the rerun recorded a scoped execute disposition without enabling broad delete execution
  - the rerun left `META_RETENTION_EXECUTION_ENABLED=false` globally
  - the final reviewed scoped run reported `totalDeletedRows=0` and `deleteScope` remained limited to `horizon_outside_residue` or `orphaned_stale_artifact`
  - the final status review showed no remaining deletable residue for the reviewed business
- Current interpretation:
  - keep `META_RETENTION_EXECUTION_ENABLED=false` unless operators intentionally choose a global execute posture
  - use scoped verification as inspection evidence, not as a business-by-business rollout ladder
  - the reviewed business currently exposes `0` protected published rows and `0` active publication pointers in status, so this record proves safe residue posture but not active protected-truth deletion safety under live protected rows

## Current Repo Baseline

- Previous baseline for this continuation was `35f2d84` plus `a4854ed`.
- Current repo baseline after this commit:
  - Google Phase 4 is complete.
  - Meta Phase 5 is complete.
  - Meta Phase 6 is complete.
  - Meta Phase 7 is complete.
  - Meta Phase 8 is complete.
  - Meta Phase 9 is complete.
  - Meta Phase 10 is complete.
  - Meta Phase 11 is complete.
- `GOOGLE_ADS_RETENTION_EXECUTION_ENABLED` remains disabled.
- `META_RETENTION_EXECUTION_ENABLED` remains disabled.
- The reverted 2026-04-13 warehouse-only current-day experiment is not reintroduced.

## Verified Tests

- Targeted Meta retention scoped-proof suite passed:
  - `app/api/meta/status/route.test.ts`
  - `lib/meta/retention-canary.test.ts`
  - `lib/meta/warehouse.test.ts`
  - `lib/meta/serving.test.ts`
  - `lib/meta/warehouse-retention.test.ts`
- Result: `5` files, `100` tests passed.
- TypeScript verification passed: `npx tsc --noEmit --pretty false`
- Follow-up regression after the April 14, 2026 scoped execute bug fix passed:
  - `app/api/meta/status/route.test.ts`
  - `lib/meta/retention-canary.test.ts`
  - `lib/meta/warehouse-retention.test.ts`
- Result: `3` files, `30` tests passed.

## Remaining Risks

- Google retention execute mode is still intentionally off; Phase 4 adds dry-run proof and an explicit scoped verifier, but no execute-mode delete was run from this PR.
- The raw `/api/google-ads/search-terms` surface is intentionally still a `120` day hot/debug surface and is not a long-horizon intelligence API.
- Search-intelligence serving now reads additive storage and Phase 4 adds delete-safe observability, but a future explicit operator-approved execute review is still deferred.
- Meta retention global execution is still intentionally disabled by default; scoped verification does not replace a deliberate global execution decision.
- The historical sampled-business record currently has no active published-truth protection rows, so it is not evidence for global destructive execution under live protected rows.
- The first execute attempt showed that a partial-safe delete can happen before a later per-table error is recorded; the follow-up fix removed the specific outer-join lock bug that surfaced during orphan cleanup.
- Google execute-mode retention rollout is still intentionally deferred and must remain isolated from Meta retention decisions.

## Next Recommended PR / Prompt

- Next recommended PR: global destructive-retention readiness review once rebuild truth is no longer cold/partial/quota-limited.
- Required scope:
  - keep the published-truth historical contract unchanged
  - keep `META_RETENTION_EXECUTION_ENABLED` off until operators explicitly choose a global execute posture
  - review `/api/meta/status.retention.scopedExecution` on businesses that expose non-zero protected published rows
  - keep Google retention execute-mode rollout out of the Meta follow-up
- Intentionally deferred after Phase 12:
  - Google execute-mode raw-hot-table retention verification under a global decision
  - global enablement of `GOOGLE_ADS_RETENTION_EXECUTION_ENABLED`
  - archival/cold export strategy for raw payloads
  - global enablement of `META_RETENTION_EXECUTION_ENABLED`

### Next Recommended Prompt

1. Keep `META_RETENTION_EXECUTION_ENABLED=false` globally and leave Google execute-mode retention untouched.
2. Wait until `/api/meta/status.operatorTruth.rebuild.state` is no longer `cold_bootstrap`, `backfill_in_progress`, or `quota_limited` on the businesses being reviewed.
3. Review scoped verification on businesses that expose non-zero protected published rows in `/api/meta/status.retention.scopedExecution`.
4. Only after that global review should operators decide whether `META_RETENTION_EXECUTION_ENABLED` can move from `dry_run` to explicit global execute mode.
