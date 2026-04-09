# DB Dependency Map

Scope: current repository state on `arch/db-baseline-map`.

Legend:
- `Request path` means the table is touched by UI-triggered API requests, including protected `GET` routes.
- `Indirect GET` means the table is reached through helper modules used by `GET` routes, even when the route itself does not issue SQL directly.
- `No (worker/admin)` means the table is primarily touched by background sync, webhook, admin, or repair flows.

## core

| Table | Primary purpose | Writers | Readers | Critical keys / indexes | Request path |
| --- | --- | --- | --- | --- | --- |
| `users` | Auth principals and profile state. | `lib/account-store`, `app/api/auth/*`, admin user routes | `lib/auth`, `lib/access`, `lib/account-store` | PK `id`; unique `email`; partial uniques on `google_id` and `facebook_id` | Yes (auth/session) |
| `businesses` | Workspace metadata, currency, timezone, owner. | `lib/account-store`, `app/api/businesses/[businessId]/route.ts`, migrations backfill | `lib/access`, `lib/account-store`, overview/meta/google status flows | PK `id`; `owner_id` FK; created-at ordering | Yes |
| `memberships` | User-to-business authorization. | `lib/account-store`, invite acceptance/team routes | `lib/access`, auth routing, admin/team pages | Unique `(user_id, business_id)` | Yes (all protected business routes) |
| `sessions` | Session tokens and active business state. | `lib/auth`, auth routes, session admin routes | `lib/auth`, `lib/access` | Unique `token_hash`; index on `user_id` | Yes |
| `invites` | Pending workspace invites and acceptance state. | `lib/account-store`, team invite routes | `lib/account-store`, invite/token routes | Unique `token`; business/email indexes | Yes |
| `integrations` | Provider connection state and encrypted tokens. | `lib/integrations`, OAuth callbacks, Search Console/GA4 selection flows | `lib/overview-service`, `lib/meta/*`, `lib/google-ads/*`, `lib/shopify/*`, integrations UI | Unique `(business_id, provider)` | Yes |
| `provider_account_assignments` | Selected provider accounts per business. | account-assignment routes, reset/cleanup helpers | overview/meta/google routes, serving layers, sync | Unique `(business_id, provider)` | Yes |
| `provider_account_snapshots` | Discovered provider accounts plus refresh metadata. | `lib/provider-account-snapshots`, bootstrap and sync helpers | provider status routes, warehouse context, integrations UI | Unique `(business_id, provider)`; `next_refresh_after` index | Yes |
| `business_cost_models` | Manual COGS/shipping/fee/fixed-cost inputs. | `lib/business-cost-model`, overview cost-model sheet | `app/api/overview-summary/route.ts`, Google serving helpers | Unique `(business_id)` | Yes |
| `shopify_subscriptions` | Shopify billing/subscription linkage. | `lib/shopify/billing/*` | billing routes, admin health, pricing checks | Unique `shop_id`; business/user indexes | Yes |
| `shopify_install_contexts` | Temporary Shopify install/OAuth context. | `lib/shopify/install-context`, Shopify OAuth routes | same modules during finalize/callback | Unique `token`; expiry index | Yes (OAuth/install) |
| `discount_codes` | Promo code catalog. | `lib/discount-codes`, admin discount routes | billing/admin routes | Unique `code`; lower(code) lookup index | Yes (admin/billing) |
| `discount_redemptions` | Promo code usage ledger. | `lib/discount-codes` | billing/admin routes | FK indexes on `code_id`, `user_id` | Yes (billing/admin) |
| `custom_reports` | Saved custom report definitions. | `lib/custom-report-store`, report routes | report rendering/export/share flows | PK `id`; business/update index | Yes |

## control

| Table | Primary purpose | Writers | Readers | Critical keys / indexes | Request path |
| --- | --- | --- | --- | --- | --- |
| `provider_account_rollover_state` | Per-account day-rollover and D+1 finalization tracking. | `lib/sync/provider-day-rollover` | provider-date helpers, sync orchestration | PK `(provider, business_id, provider_account_id)`; business/target indexes | Indirect GET |
| `provider_cooldown_state` | Circuit breaker and cooldown windows for provider calls. | `lib/provider-request-governance` | provider request governance, Google status | Unique `(business_id, provider, request_type)` | Indirect GET |
| `provider_quota_usage` | Per-day provider quota accounting. | `lib/provider-request-governance`, `lib/google-analytics-reporting`, `lib/google-ads-gaql` | request governance, status routes | Unique `(business_id, provider, quota_date)` | Indirect GET |
| `provider_sync_jobs` | Generic provider sync queue / trigger ledger. | sync refresh/governance helpers, repair/reset scripts | admin health, sync routes, `lib/serving-freshness-status`, `scripts/report-serving-freshness-status.ts` | Unique `(business_id, provider, report_type, date_range_key)`; status/lock indexes | No (sync/admin) |
| `meta_sync_jobs` | Meta job-level queue state. | `lib/meta/warehouse`, `lib/sync/meta-sync`, cleanup scripts | `app/api/meta/status/route.ts`, admin health | running-job unique index; status/business/account indexes | Indirect GET |
| `meta_sync_partitions` | Meta partition queue and lease state. | `lib/meta/warehouse`, `lib/sync/meta-sync`, repair flows | Meta status, admin health, repair flows | queue/lease indexes; lease epoch | Indirect GET |
| `meta_sync_runs` | Meta run attempts per partition. | `lib/meta/warehouse`, `lib/sync/meta-sync`, cleanup scripts | Meta status, admin health | partition/business indexes; one-running-per-partition unique | Indirect GET |
| `meta_sync_checkpoints` | Meta checkpoint progress by scope/page/phase. | `lib/meta/warehouse`, `lib/sync/meta-sync`, cleanup scripts | Meta status, admin health, repair helpers | partition/scope/epoch/run indexes | Indirect GET |
| `meta_sync_state` | Meta business/account readiness snapshot. | `lib/meta/warehouse`, `lib/sync/meta-sync` | Meta status and readiness logic | business/provider index | Indirect GET |
| `google_ads_sync_jobs` | Google Ads job-level queue state. | `lib/google-ads/warehouse`, `lib/sync/google-ads-sync` | `app/api/google-ads/status/route.ts`, admin health | running-job unique index; status/business/account indexes | Indirect GET |
| `google_ads_sync_partitions` | Google Ads partition queue and leases. | `lib/google-ads/warehouse`, `lib/sync/google-ads-sync` | Google status, serving freshness, repair flows | queue/lease indexes; lease epoch | Indirect GET |
| `google_ads_sync_runs` | Google Ads run attempts per partition. | `lib/google-ads/warehouse`, `lib/sync/google-ads-sync` | Google status, admin health | partition/business indexes | Indirect GET |
| `google_ads_sync_checkpoints` | Google Ads checkpoint progress and poison state. | `lib/google-ads/warehouse`, `lib/sync/google-ads-sync` | Google status, serving freshness, repair flows | partition/scope/epoch indexes | Indirect GET |
| `google_ads_sync_state` | Google Ads business/account readiness snapshot. | `lib/google-ads/warehouse`, `lib/sync/google-ads-sync` | Google status and serving freshness | business/provider index | Indirect GET |
| `google_ads_runner_leases` | Google Ads worker/runner lease ownership. | `lib/google-ads/warehouse` | Google status, admin health, sync workers | expiry index | No (worker/admin) |
| `sync_runner_leases` | Shared worker runner lease ledger. | `lib/sync/worker-runtime` | admin health, worker runtime | expiry index | No (worker/admin) |
| `sync_worker_heartbeats` | Sync worker liveness snapshot. | `lib/sync/worker-runtime`, worker health helpers | admin health, Meta/Google status | status/heartbeat index | Indirect GET |
| `shopify_sync_state` | Shopify sync cursors, readiness, and checkpoint dates. | `lib/shopify/sync-state`, webhooks, `lib/sync/shopify-sync` | `lib/shopify/status`, `lib/shopify/read-adapter` | business/provider index | Indirect GET |
| `shopify_repair_intents` | Shopify repair work backlog. | `lib/shopify/warehouse`, webhook/sync handlers | status, read-adapter, admin health | business/updated index | Indirect GET |
| `shopify_serving_overrides` | Manual serving-mode override lane. | `app/api/admin/integrations/health/shopify/route.ts`, `lib/shopify/warehouse` | `lib/shopify/read-adapter`, admin health | PK `(business_id, provider_account_id, override_key)`; business/range index | Indirect GET |

## raw

| Table | Primary purpose | Writers | Readers | Critical keys / indexes | Request path |
| --- | --- | --- | --- | --- | --- |
| `meta_raw_snapshots` | Raw Meta API payload archive by endpoint/window/page. | `lib/meta/warehouse`, `lib/sync/meta-sync` | Meta warehouse verification, admin health, repair/cleanup scripts | business/account/window/endpoint indexes; partition/run linkage | No (worker/admin) |
| `google_ads_raw_snapshots` | Raw Google Ads API payload archive by endpoint/window/page. | `lib/google-ads/warehouse`, `lib/sync/google-ads-sync` | Google warehouse verification, search-intelligence storage, repair tools | business/account/window/endpoint indexes; partition/checkpoint linkage | No (worker/admin) |
| `shopify_raw_snapshots` | Raw Shopify Admin/Webhook payload archive. | `lib/shopify/warehouse`, webhooks, `lib/sync/shopify-sync` | Shopify warehouse reconciliation and repair | business/account/endpoint indexes | No (worker/webhook) |

## warehouse

### Meta warehouse

| Table | Primary purpose | Writers | Readers | Critical keys / indexes | Request path |
| --- | --- | --- | --- | --- | --- |
| `meta_config_snapshots` | Historical campaign/ad set config truth used for live-serving enrichment and diffs. | `lib/meta/config-snapshots`, Meta config backfill/repair helpers | `lib/meta/live`, `lib/meta/serving`, campaign UI flows | lookup index `(business_id, entity_level, entity_id, captured_at desc)` | Indirect GET |
| `meta_account_daily` | Meta account-day fact table. | `lib/meta/warehouse`, `lib/sync/meta-sync` | `lib/meta/serving`, `lib/meta/canonical-overview`, overview/meta status flows | Unique `(business_id, provider_account_id, date)`; business/account/date indexes | Yes |
| `meta_campaign_daily` | Meta campaign-day fact table plus config columns. | `lib/meta/warehouse`, `lib/sync/meta-sync` | `lib/meta/serving`, Meta campaigns/recommendations UI | Unique `(business_id, provider_account_id, date, campaign_id)`; campaign/date indexes | Yes |
| `meta_adset_daily` | Meta ad set-day fact table plus config columns. | `lib/meta/warehouse`, `lib/sync/meta-sync` | `lib/meta/serving`, Meta breakdowns/campaign detail | Unique `(business_id, provider_account_id, date, adset_id)`; adset/date indexes | Yes |
| `meta_breakdown_daily` | Pre-aggregated Meta age/location/placement breakdowns. | `lib/meta/warehouse`, `lib/sync/meta-sync` | `app/api/meta/breakdowns/route.ts`, Meta UI | Unique `(business_id, provider_account_id, date, breakdown_type, breakdown_key)` | Yes |
| `meta_ad_daily` | Meta ad-level fact table. | `lib/meta/warehouse`, `lib/sync/meta-sync` | top-creatives, creative intelligence, serving helpers | Unique `(business_id, provider_account_id, date, ad_id)`; ad/date indexes | Yes (creative surfaces) |
| `meta_creative_daily` | Meta creative-day fact table. | `lib/meta/warehouse`, `lib/sync/meta-sync` | creative UI, recommendation helpers, preview/score services | Unique `(business_id, provider_account_id, date, creative_id)`; creative/date indexes | Yes (creative surfaces) |
| `meta_authoritative_source_manifests` | Authoritative input manifest per day/surface/run. | `lib/meta/warehouse` authoritative publish path | `lib/meta/warehouse`, Meta status/admin health | lookup/run indexes by business/account/day/surface | Indirect GET |
| `meta_authoritative_slice_versions` | Candidate/published slice versions for authoritative Meta truth. | `lib/meta/warehouse` | `lib/meta/warehouse`, Meta status/admin health | lookup/manifest indexes; candidate version progression | Indirect GET |
| `meta_authoritative_publication_pointers` | Active authoritative slice pointer per day/surface. | `lib/meta/warehouse` | `lib/meta/serving`, Meta status, warehouse reconciliation | Unique `(business_id, provider_account_id, day, surface)` via PK; slice index | Indirect GET |

### Google Ads warehouse

| Table | Primary purpose | Writers | Readers | Critical keys / indexes | Request path |
| --- | --- | --- | --- | --- | --- |
| `google_ads_account_daily` | Google Ads account-day fact table. | `lib/google-ads/warehouse`, `lib/sync/google-ads-sync` | `lib/google-ads/serving`, overview, status | Unique `(business_id, provider_account_id, date, entity_key)`; business/date/account indexes | Yes |
| `google_ads_campaign_daily` | Google Ads campaign-day fact table. | `lib/google-ads/warehouse`, `lib/sync/google-ads-sync` | Google overview/campaigns/advisor | Same unique pattern; campaign/date index | Yes |
| `google_ads_ad_group_daily` | Google Ads ad-group-day fact table. | `lib/google-ads/warehouse`, `lib/sync/google-ads-sync` | campaign detail, serving helpers | Same unique pattern; campaign/date index | Yes |
| `google_ads_ad_daily` | Google Ads ad-day fact table. | `lib/google-ads/warehouse`, `lib/sync/google-ads-sync` | ads/creatives surfaces | Same unique pattern; campaign/date index | Yes |
| `google_ads_keyword_daily` | Keyword-day fact table. | `lib/google-ads/warehouse`, `lib/sync/google-ads-sync` | search terms and keyword analysis | Same unique pattern; business/date/entity indexes | Yes |
| `google_ads_search_term_daily` | Search-term-day fact table plus query normalization fields. | `lib/google-ads/warehouse`, `lib/google-ads/search-intelligence-storage` | search intelligence, opportunities, advisor | Same unique pattern; query-hash index | Yes |
| `google_ads_asset_group_daily` | Asset-group-day fact table. | `lib/google-ads/warehouse`, `lib/sync/google-ads-sync` | asset-group and PMax surfaces | Same unique pattern | Yes |
| `google_ads_asset_daily` | Asset-day fact table. | `lib/google-ads/warehouse`, `lib/sync/google-ads-sync` | assets surface, advisor | Same unique pattern | Yes |
| `google_ads_audience_daily` | Audience-day fact table. | `lib/google-ads/warehouse`, `lib/sync/google-ads-sync` | audiences surface | Same unique pattern | Yes |
| `google_ads_geo_daily` | Geo-day fact table. | `lib/google-ads/warehouse`, `lib/sync/google-ads-sync` | geo surface | Same unique pattern | Yes |
| `google_ads_device_daily` | Device-day fact table. | `lib/google-ads/warehouse`, `lib/sync/google-ads-sync` | devices surface | Same unique pattern | Yes |
| `google_ads_product_daily` | Product-day fact table. | `lib/google-ads/warehouse`, `lib/sync/google-ads-sync` | products surface, commerce signals | Same unique pattern | Yes |
| `google_ads_query_dictionary` | Normalized query dictionary for search intelligence. | `lib/google-ads/search-intelligence-storage` | search intelligence storage/serving | Unique normalized-query index | Indirect GET |
| `google_ads_search_query_hot_daily` | Hot-query daily aggregate. | `lib/google-ads/search-intelligence-storage` | search intelligence UI, opportunities | business/date and query indexes | Yes |
| `google_ads_top_query_weekly` | Weekly top-query summary. | `lib/google-ads/search-intelligence-storage` | search intelligence UI | business/week index | Yes |
| `google_ads_search_cluster_daily` | Query-cluster daily aggregate. | `lib/google-ads/search-intelligence-storage` | search intelligence UI, advisor | business/date/cluster index | Yes |

### Shopify warehouse

| Table | Primary purpose | Writers | Readers | Critical keys / indexes | Request path |
| --- | --- | --- | --- | --- | --- |
| `shopify_orders` | Normalized order facts. | `lib/shopify/warehouse`, webhooks, `lib/sync/shopify-sync` | `lib/shopify/warehouse-overview`, divergence, read-adapter | Unique `(business_id, provider_account_id, shop_id, order_id)`; local/fallback date indexes | Yes |
| `shopify_order_lines` | Order line-item facts. | `lib/shopify/warehouse`, webhooks, `lib/sync/shopify-sync` | product/commerce analytics | Unique `(business_id, provider_account_id, shop_id, order_id, line_item_id)` | Indirect GET |
| `shopify_order_transactions` | Payment transaction facts. | `lib/shopify/warehouse`, webhooks, `lib/sync/shopify-sync` | divergence/revenue-ledger support | Unique `(business_id, provider_account_id, shop_id, transaction_id)` | Indirect GET |
| `shopify_refunds` | Normalized refund facts. | `lib/shopify/warehouse`, webhooks, `lib/sync/shopify-sync` | `lib/shopify/warehouse-overview`, divergence, read-adapter | Unique `(business_id, provider_account_id, shop_id, refund_id)`; local/fallback date indexes | Yes |
| `shopify_returns` | Return-event facts. | `lib/shopify/warehouse`, webhooks, `lib/sync/shopify-sync` | `lib/shopify/warehouse-overview`, read-adapter, status | Unique `(business_id, provider_account_id, shop_id, return_id)`; local/fallback date indexes | Yes |
| `shopify_customer_events` | Storefront/customer event stream. | webhook routes, `lib/shopify/warehouse` | customer-event analytics, status | Unique `(business_id, provider_account_id, shop_id, event_id)`; session index | Indirect GET |
| `shopify_sales_events` | Ledger-style sales event stream used for warehouse serving/divergence. | `lib/shopify/warehouse`, webhooks, reconciliation flows | revenue-ledger, warehouse overview, divergence | Unique `(business_id, provider_account_id, shop_id, event_id)`; business/date index | Yes |

## serving

| Table | Primary purpose | Writers | Readers | Critical keys / indexes | Request path |
| --- | --- | --- | --- | --- | --- |
| `creative_share_snapshots` | Shared creative payload snapshots by token. | `lib/creative-share-store`, share routes | share token route/page | Unique `token` index | Yes |
| `custom_report_share_snapshots` | Shared report payload snapshots by token. | `lib/custom-report-store`, report share/export routes | report share page/route | Unique `token` index | Yes |
| `creative_media_cache` | Cached creative media download state and storage key. | `lib/media-cache/cache-repository`, thumbnail worker | creative previews/share/media routes | Unique `(creative_id, business_id, provider)`; status/storage/expires indexes | Yes |
| `meta_creatives_snapshots` | Materialized Meta creatives payload cache. | `lib/meta-creatives-snapshot`, creatives service helpers | Meta creatives UI, preview helpers | Unique `snapshot_key`; business/refresh indexes | Yes |
| `meta_creative_score_snapshots` | Saved creative score payloads for selected windows. | `lib/meta/creative-score-service` | creative scoring UI/services | lookup and creative/as-of indexes | Yes |
| `platform_overview_daily_summary` | Cross-provider daily projection backing overview fallbacks. | `lib/overview-summary-materializer`, `lib/meta/warehouse`, `lib/google-ads/warehouse` | `lib/overview-summary-store`, Google projection fallback | Unique `(business_id, provider, provider_account_id, date)`; business/provider/date index | Indirect GET read-only |
| `platform_overview_summary_ranges` | Projection manifest and validity watermark per exact selected range. | `lib/overview-summary-materializer` via warehouse invalidation and `lib/overview-summary-range-owner` / `npm run overview:summary:materialize` for exact manual hydration | Google projection fallback validity checks, `lib/serving-freshness-status`, `scripts/report-serving-freshness-status.ts` | Unique `(business_id, provider, provider_account_ids_hash, start_date, end_date)` | Indirect GET read-only |
| `provider_reporting_snapshots` | Generic provider/cache table for GA4, Shopify, GAQL, internal route caches. | `lib/reporting-cache-writer`, `lib/sync/ga4-sync` for bounded default GA4 windows, `lib/sync/shopify-sync` for the bounded recent Shopify overview window, `npm run reporting:cache:warm` for targeted/non-default warmers, `lib/meta/cleanup`, out-of-scope Google Ads reset lanes | `lib/reporting-cache`, `lib/route-report-cache`, `lib/overview-service`, `lib/shopify/overview`, analytics routes, `lib/serving-freshness-status`, `scripts/report-serving-freshness-status.ts` | Unique `(business_id, provider, report_type, date_range_key)` | Yes, but GET reads are now read-only and writes are owner-gated |
| `google_ads_advisor_memory` | Advisor recommendation memory and execution state. | `lib/google-ads/advisor-memory`, advisor mutate flows | advisor UX, serving, execution calibration | Unique `(business_id, account_id, recommendation_fingerprint)`; scope/status/outcome indexes | Yes |
| `google_ads_advisor_snapshots` | Materialized advisor payload snapshots. | `lib/google-ads/advisor-snapshots` | advisor/status routes | unique business/account/as-of/version; scope/status indexes | Yes |
| `ai_daily_insights` | Daily AI brief cache. | `lib/ai/run-daily-insights`, `app/api/ai/insights/generate` | overview AI brief route/UI | Unique `(business_id, insight_date, locale)` | Yes |
| `ai_creative_decisions_cache` | Cached creative decision output. | `lib/ai/generate-creative-decisions`, creative AI routes | creative commentary/decision routes | Unique `(business_id, analysis_key, locale)` | Yes |
| `seo_ai_monthly_analyses` | Cached monthly SEO AI analysis. | `lib/seo/run-monthly-ai-analysis`, SEO routes | SEO intelligence UI/routes | Unique `(business_id, analysis_month)` | Yes |
| `seo_results_cache` | Cached SEO findings/overview windows. | `lib/seo/results-cache-writer`, `lib/sync/search-console-sync` | `lib/seo/results-cache`, SEO overview/findings routes, `lib/serving-freshness-status`, `scripts/report-serving-freshness-status.ts` | Unique `(business_id, cache_type, start_date, end_date)` | Yes, but GET reads are now read-only and writes are owner-gated |
| `shopify_serving_state` | Current Shopify read-trust decision and divergence state. | `lib/shopify/overview-materializer`, `lib/sync/shopify-sync`, webhook pending-repair mark path | `lib/shopify/read-adapter`, `lib/shopify/status`, overview route, `lib/serving-freshness-status`, `scripts/report-serving-freshness-status.ts` | PK `(business_id, provider_account_id, canary_key)` via table design; business/range indexes | Yes, but GET reads are now read-only and writes are owner-gated |
| `shopify_serving_state_history` | Historical Shopify trust assessments. | `lib/shopify/overview-materializer`, `lib/sync/shopify-sync`, webhook pending-repair mark path | admin health, historical diagnostics | business/assessed/range indexes | Indirect GET |
| `shopify_reconciliation_runs` | Persisted reconciliation snapshots between live/warehouse/ledger. | `lib/shopify/overview-materializer`, `lib/sync/shopify-sync` | status/read-adapter/admin health, `lib/serving-freshness-status`, `scripts/report-serving-freshness-status.ts` | business/recorded index | Yes, but GET reads are now read-only and writes are owner-gated |

## audit

| Table | Primary purpose | Writers | Readers | Critical keys / indexes | Request path |
| --- | --- | --- | --- | --- | --- |
| `admin_audit_logs` | Admin action audit trail. | admin routes/helpers | admin activity UI | admin/created indexes | Yes (admin) |
| `google_ads_advisor_execution_logs` | Per-action advisor execution audit log. | `lib/google-ads/advisor-memory`, mutate flows | admin/debug/advisor tooling | scope index `(business_id, account_id, created_at desc)` | Indirect GET |
| `google_ads_decision_action_outcome_logs` | Recommendation outcome/rollback evidence log. | `lib/google-ads/search-intelligence-storage` | advisor/outcome analysis | business and recommendation indexes | Indirect GET |
| `meta_authoritative_reconciliation_events` | Meta authoritative truth drift/reconciliation events. | `lib/meta/warehouse` | Meta status/admin health/reconciliation views | lookup index `(business_id, provider_account_id, day, surface)` | Indirect GET |
| `shopify_webhook_deliveries` | Raw webhook receipt and processing audit trail. | Shopify webhook routes | admin health, repair/debug flows | unique `(shop_domain, topic, payload_hash)`; business index | No (webhook/admin) |
| `sync_reclaim_events` | Lease reclaim/repair audit log across providers. | `lib/sync/worker-health`, orchestration helpers | admin sync health | provider/status index | Indirect GET |

## Notes

- Request-time read/access surfaces in this phase depend on `lib/db-schema-readiness.ts` instead of `runMigrations()`. Missing tables now degrade to empty/null/status responses without mutating schema state.
- Mutation, admin, and webhook routes are also expected to use readiness gating only; HTTP handlers must defer all schema bootstrap to `npm run db:migrate` / `scripts/run-migrations.ts`.
- Passive `GET` routes no longer persist to `platform_overview_*`, `provider_reporting_snapshots`, `seo_results_cache`, `shopify_serving_state`, or `shopify_reconciliation_runs`; those writes must happen in sync, worker, admin, or explicit generation lanes.
- Shared read helpers (`lib/overview-summary-store.ts`, `lib/reporting-cache.ts`, `lib/route-report-cache.ts`, `lib/seo/results-cache.ts`, `lib/shopify/read-adapter.ts`, `lib/shopify/overview.ts`) are intentionally write-free for these surfaces; ownership is recorded in `docs/architecture/serving-write-ownership-map.md`.
- The hottest request-path pivots are `memberships`, `integrations`, `provider_account_assignments`, `provider_account_snapshots`, `meta_account_daily`, `google_ads_account_daily`, `shopify_orders`, `shopify_refunds`, `shopify_returns`, `platform_overview_*`, and `shopify_serving_state`.
- `provider_reporting_snapshots`, `platform_overview_*`, and `shopify_*serving*` are serving/projection tables, not source-of-truth tables.
- `meta_*_daily` and `google_ads_*_daily` are the historical warehouse truth tables currently mixed with live exceptions in request-time orchestration.
