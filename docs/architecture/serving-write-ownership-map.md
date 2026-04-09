# Serving Write Ownership Map

Purpose: make ownership of user-facing serving/projection/cache persistence explicit. Shared read helpers stay read-only; only named writer/materializer modules may persist these surfaces.

## Overview serving projections

| Surface | Owner module | Allowed entrypoints | Forbidden contexts | Freshness strategy | Current gap |
| --- | --- | --- | --- | --- | --- |
| `platform_overview_daily_summary` | `lib/overview-summary-materializer.ts` | `lib/meta/warehouse.ts`, `lib/google-ads/warehouse.ts` | Passive `GET`, `lib/overview-service.ts`, `lib/google-ads/serving.ts`, `lib/overview-summary-store.ts` | Sync/warehouse upserts refresh daily rows; GET serves durable rows or computes ephemeral fallback | None for account-daily refresh |
| `platform_overview_summary_ranges` | `lib/overview-summary-materializer.ts` | `lib/meta/warehouse.ts`, `lib/google-ads/warehouse.ts`, future explicit backfill/materialize script | Passive `GET`, shared read helpers, route handlers | Warehouse upserts invalidate manifests; explicit materializer/backfill should hydrate ranges | Arbitrary range hydration is intentionally unwired after GET write removal |

## User-facing durable reporting caches

| Surface | Owner module | Allowed entrypoints | Forbidden contexts | Freshness strategy | Current gap |
| --- | --- | --- | --- | --- | --- |
| `provider_reporting_snapshots` route/report cache rows | `lib/reporting-cache-writer.ts` | `lib/sync/ga4-sync.ts`, `lib/meta/cleanup.ts`, future explicit warmers/scripts | Passive `GET`, `lib/reporting-cache.ts`, `lib/route-report-cache.ts`, overview/shopify read helpers | Sync/admin/manual warmers write durable snapshots; GET only reads fresh/stale snapshots | `ga4_analytics_overview`, `ga4_detailed_*`, `ecommerce_fallback`, and `overview_shopify_orders_aggregate_v6` have explicit writer ownership but no automated non-GET warmer yet |
| `seo_results_cache` | `lib/seo/results-cache-writer.ts` | `lib/sync/search-console-sync.ts`, future explicit SEO generation jobs | Passive `GET`, `lib/seo/results-cache.ts`, SEO route handlers | Search Console sync warms durable rows; GET only reads cache or computes ephemeral fallback | `findings` cache warming has no automated non-GET owner yet |

## Shopify overview serving state

| Surface | Owner module | Allowed entrypoints | Forbidden contexts | Freshness strategy | Current gap |
| --- | --- | --- | --- | --- | --- |
| `shopify_serving_state` | `lib/shopify/overview-materializer.ts` | `app/api/webhooks/shopify/sync/route.ts`, future sync/admin serving refresh owners | Passive `GET`, `lib/shopify/read-adapter.ts`, `lib/shopify/overview.ts`, `lib/shopify/warehouse.ts` read helpers | Webhook-triggered repair intent persists serving trust transitions; GET only consumes latest durable state | No post-sync serving-state refresh owner yet for non-webhook trust recovery |
| `shopify_reconciliation_runs` | `lib/shopify/overview-materializer.ts` | Future explicit sync/admin reconciliation owner | Passive `GET`, `lib/shopify/read-adapter.ts`, `lib/shopify/status.ts` | Reconciliation evidence should be recorded only by explicit non-GET materialization lanes | No active owner is wired today; gap is documented rather than hidden in GET |

## Rules

- Shared read helpers must not import the writer/materializer modules above.
- `GET` routes may only read the durable state these tables/caches already hold.
- If a surface has no legitimate non-`GET` owner yet, keep the explicit writer module available but leave it unwired and documented.
- Owner exceptions are intentionally tiny. Current explicit allowlist outside the owner modules is limited to `lib/google-ads/warehouse.ts` and `scripts/reset-google-ads-stack.ts` for out-of-scope Google Ads reset/deletion flows touching `provider_reporting_snapshots`.
