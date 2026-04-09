# Serving Operational Freshness Matrix

Purpose: record which in-scope user-facing serving/projection/cache surfaces are proactively refreshed by existing non-`GET` owners, and which remaining freshness boundaries are intentionally operator-driven.

Phase 10 outcome on branch `arch/wire-serving-owner-triggers`:

- No new scheduler, public route, or lane redesign was introduced.
- No additional safe automation candidate was found beyond the existing GA4, Search Console, and Shopify sync owners already wired in earlier phases.
- The remaining operator-dependent boundaries are intentional and stay explicit manual/CLI because the repo does not already contain an exact bounded non-`GET` lane that safely owns them.
- Phase 11 adds a read-only operator status CLI: `node --import tsx scripts/report-serving-freshness-status.ts <businessId> [...]`.

## Matrix

| Surface / boundary | Owner module | Trigger lane | Automated vs manual | Freshness scope | Why this policy | Operator fallback |
| --- | --- | --- | --- | --- | --- | --- |
| `platform_overview_summary_ranges` exact selected ranges | `lib/overview-summary-range-owner.ts` via `lib/overview-summary-materializer.ts` | `npm run overview:summary:materialize -- --business-id ... --provider meta\|google --start-date ... --end-date ... [--provider-account-ids ...]` | Manual / CLI | Exact historical selected ranges, backfills, custom ranges | Google projection fallback only consumes exact historical windows, while the current materializer writes `truth_state='finalized'` manifests. There is no exact existing worker/cron/admin lane for the selected historical windows that can be hydrated safely without speculative current-window materialization. | `npm run overview:summary:materialize -- --business-id <business_id> --provider google --start-date <yyyy-mm-dd> --end-date <yyyy-mm-dd>` |
| `provider_reporting_snapshots.ga4_analytics_overview` | `lib/reporting-cache-writer.ts` via `lib/user-facing-report-cache-owners.ts` | `lib/sync/ga4-sync.ts` from the existing sync cron lane | Automated | Default bounded windows `30d`, `7d` | Existing sync owner already warms the current product-default overview windows. | `npm run reporting:cache:warm -- --business-id <business_id> --report-type ga4_analytics_overview --start-date <yyyy-mm-dd> --end-date <yyyy-mm-dd>` for non-default windows |
| `provider_reporting_snapshots.ecommerce_fallback` | `lib/reporting-cache-writer.ts` via `lib/user-facing-report-cache-owners.ts` | `lib/sync/ga4-sync.ts` from the existing sync cron lane | Automated | Default bounded windows `30d`, `7d` | Existing sync owner already warms the GA4 ecommerce fallback used by overview reads. | `npm run reporting:cache:warm -- --business-id <business_id> --report-type ecommerce_fallback --start-date <yyyy-mm-dd> --end-date <yyyy-mm-dd>` for non-default windows |
| `provider_reporting_snapshots.ga4_detailed_audience`, `ga4_detailed_cohorts`, `ga4_landing_page_performance_v1`, `ga4_detailed_landing_pages`, `ga4_detailed_products` | `lib/reporting-cache-writer.ts` via `lib/user-facing-report-cache-owners.ts` | `lib/sync/ga4-sync.ts` from the existing sync cron lane | Automated | Default bounded windows `30d`, `7d` | Shared GA4 auto-warm boundaries in `lib/sync/report-warmer-boundaries.ts` already cover the bounded product-default detail surfaces. | `npm run reporting:cache:warm -- --business-id <business_id> --report-type <ga4_type> --start-date <yyyy-mm-dd> --end-date <yyyy-mm-dd>` for non-default windows |
| `provider_reporting_snapshots.ga4_detailed_demographics` with `dimension=country` | `lib/reporting-cache-writer.ts` via `lib/user-facing-report-cache-owners.ts` | `lib/sync/ga4-sync.ts` from the existing sync cron lane | Automated | Default bounded windows `30d`, `7d`; `dimension=country` only | Shared GA4 auto-warm boundaries intentionally automate only the user-facing default demographics dimension. | `npm run reporting:cache:warm -- --business-id <business_id> --report-type ga4_detailed_demographics --start-date <yyyy-mm-dd> --end-date <yyyy-mm-dd> --dimension country` for non-default windows |
| Non-default GA4 windows across `ga4_analytics_overview`, `ecommerce_fallback`, and the GA4 detail snapshots | `lib/reporting-cache-writer.ts` via `lib/user-facing-report-cache-owners.ts` | `npm run reporting:cache:warm` | Manual / CLI | Targeted, backfill, custom windows | Expanding the sync owner to arbitrary or wider windows would turn a bounded default warmer into speculative unbounded work. No exact existing scheduler/admin lane in the repo owns those custom windows today. | `npm run reporting:cache:warm -- --business-id <business_id> --report-type <ga4_type> --start-date <yyyy-mm-dd> --end-date <yyyy-mm-dd>` |
| `ga4_detailed_demographics` with `dimension!=country` | `lib/reporting-cache-writer.ts` via `lib/user-facing-report-cache-owners.ts` | `npm run reporting:cache:warm` | Manual / CLI | Alternate dimensions, targeted analysis | Shared GA4 auto-warm boundaries intentionally exclude non-`country` dimensions to avoid speculative fan-out across dimensions that are not part of the bounded automated set. | `npm run reporting:cache:warm -- --business-id <business_id> --report-type ga4_detailed_demographics --start-date <yyyy-mm-dd> --end-date <yyyy-mm-dd> --dimension <dimension>` |
| `provider_reporting_snapshots.overview_shopify_orders_aggregate_v6` recent automated window | `lib/reporting-cache-writer.ts` via `lib/user-facing-report-cache-owners.ts` | `lib/sync/shopify-sync.ts` from the existing sync cron lane and existing admin/internal sync entrypoints when `materializeOverviewState` stays enabled | Automated | Existing bounded recent sync window, currently `7d` | Phase 9 runtime validation proved that the existing Shopify sync owner advances the recent snapshot when the call path already enables overview materialization. | `npm run reporting:cache:warm -- --business-id <business_id> --report-type overview_shopify_orders_aggregate_v6 --start-date <yyyy-mm-dd> --end-date <yyyy-mm-dd>` for non-recent windows |
| `provider_reporting_snapshots.overview_shopify_orders_aggregate_v6` outside the recent automated window | `lib/reporting-cache-writer.ts` via `lib/user-facing-report-cache-owners.ts` | `npm run reporting:cache:warm` | Manual / CLI | Targeted, backfill, custom windows | The existing Shopify sync owner only owns the recent bounded sync window. Broader date windows remain explicit operator selection; there is no exact existing bounded cron/worker/admin lane for arbitrary snapshot windows. | `npm run reporting:cache:warm -- --business-id <business_id> --report-type overview_shopify_orders_aggregate_v6 --start-date <yyyy-mm-dd> --end-date <yyyy-mm-dd>` |
| `seo_results_cache.overview` and `seo_results_cache.findings` | `lib/seo/results-cache-writer.ts` | `lib/sync/search-console-sync.ts` from the existing sync cron lane | Automated | Default bounded windows `30d`, `7d` | Existing Search Console sync owner already covers the current user-facing SEO cache shapes. | None needed for current in-scope product surfaces |
| `shopify_serving_state` | `lib/shopify/overview-materializer.ts` | `lib/sync/shopify-sync.ts` from the existing sync cron lane; webhook path only marks pending repair | Automated | Existing bounded recent sync windows | Phase 9 runtime validation proved owner-only advancement for the recent serving canary rows. Webhook writes stay limited to pending-repair marks and do not replace the sync owner. | Existing admin Shopify health actions can rerun the same owner lane when operator intervention is needed |
| `shopify_reconciliation_runs` | `lib/shopify/overview-materializer.ts` | `lib/sync/shopify-sync.ts` from the existing sync cron lane | Automated | Existing bounded recent sync windows | Phase 9 runtime validation proved owner-only advancement for reconciliation evidence on the recent window. | Existing admin Shopify health actions can rerun the same owner lane when operator intervention is needed |

## Exact Remaining Manual In-Scope Boundaries

- `platform_overview_summary_ranges` exact selected ranges remain CLI-owned.
- Non-default GA4 windows remain CLI-owned across `ga4_analytics_overview`, `ecommerce_fallback`, and the GA4 detail snapshots.
- Non-`country` `ga4_detailed_demographics` dimensions remain CLI-owned.
- `overview_shopify_orders_aggregate_v6` windows outside the automated recent sync window remain CLI-owned.

## Classification Summary

- Automate now via an existing lane: none newly added in Phase 10.
- Keep intentionally manual / CLI: all four boundaries above.
- Out of scope: none of the currently in-scope user-facing serving/projection/cache surfaces required an additional classification beyond automated or intentional manual.

## References

- Runtime proof: `docs/architecture/serving-runtime-validation-evidence.md`
- Ownership map: `docs/architecture/serving-write-ownership-map.md`
- Shared GA4 / Shopify scheduling boundaries: `lib/sync/report-warmer-boundaries.ts`
- Read-only observability runbook: `docs/architecture/serving-freshness-observability-runbook.md`
