# DB Risk Register

Scope: baseline audit plus request-path migration isolation status. This document reflects the Phase 1 guardrail pass; runtime contracts remain unchanged.

Priority scale:
- `P0`: remove from request path before any DB cutover/refactor.
- `P1`: isolate during next refactor phase.
- `P2`: clean up after runtime behavior is stabilized behind guardrails.

Status scale:
- `Resolved`: request/access read path no longer runs migrations; route/helper now uses read-only schema readiness or safe degrade.
- `Open`: still present and must move to explicit request-external bootstrap or later mutation-lane cleanup.

## request path içinde migration

| File | Function | Impact | Recommended fix | Priority | Status |
| --- | --- | --- | --- | --- | --- |
| `lib/access.ts` | `findMembership()`, `listUserBusinesses()` | Every protected route could trigger `runMigrations()` before authorization resolved. | Keep auth checks read-only; return `null`/`[]` when schema is not ready. | P0 | Resolved |
| `lib/auth.ts` | `findSessionByToken()`, `getSessionFromRequest()`, `createSession()`, `destroySessionByRequest()` | Session reads and writes were bootstrap points for most API traffic. | Use `db-schema-readiness` for session lookup/write gating; never bootstrap schema from auth. | P0 | Resolved |
| `lib/overview-service.ts` | `getMetaAccessContext()` | Overview `GET` retried account-assignment reads by migrating on missing relation. | Replace missing-table fallback with readiness gate and empty-state handling. | P0 | Resolved |
| `app/api/meta/campaigns/route.ts` | `fetchAssignedAccountIds()` | Meta campaigns `GET` could run migrations during assignment lookup. | Depend on readiness; preserve `no_accounts_assigned` contract. | P0 | Resolved |
| `app/api/meta/breakdowns/route.ts` | `fetchAssignedAccountIds()` | Same migration-on-read pattern as campaigns route. | Same as above. | P0 | Resolved |
| `app/api/meta/top-creatives/route.ts` | `fetchAssignedAccountIds()` | Meta top-creatives `GET` could migrate when assignment table was missing. | Gate on assignment-table readiness and degrade to empty/account-unassigned response. | P1 | Resolved |
| `app/api/google-ads/status/route.ts` | `GET()` | Status `GET` performed unconditional request-time migration. | Read schema readiness only and surface degraded reason when status tables are absent. | P0 | Resolved |
| `lib/meta/config-snapshots.ts` | `readLatestMetaConfigSnapshots()`, `readPrevious*()` | Live-serving config readers migrated on read. | Keep repository read-only and return empty maps when snapshot table is absent. | P1 | Resolved |
| `lib/provider-account-snapshots.ts` | `getSnapshotRow()` and read helpers | Snapshot reads used in status/serving performed migrations before lookup. | Introduce read-only readiness gating. | P1 | Resolved |
| `lib/google-ads/warehouse.ts` | request-read health/coverage readers | Warehouse status/coverage reads could bootstrap schema transitively. | Guard read surfaces with `assertDbSchemaReady()` and let routes degrade without mutation. | P1 | Resolved |
| `lib/meta/warehouse.ts` | request-read health/coverage readers | Meta health/coverage reads could bootstrap schema transitively. | Same as above. | P1 | Resolved |
| `lib/business-timezone.ts` | `resolveDerivedBusinessTimezone()`, `getBusinessTimezoneSnapshot()` | Shared GET helper could bootstrap `businesses`/`integrations` from request reads. | Return null timezone snapshot when tables are not ready. | P1 | Resolved |
| `lib/google-ads-gaql.ts` | `readGaqlFromDb()`, `writeGaqlToDb()` | Request-time GAQL cache reads/writes could trigger migration from Google Ads GET routes. | Gate reporting snapshot access on readiness and no-op when absent. | P1 | Resolved |
| `lib/seo/results-cache.ts` | `getSeoResultsCache()`, `setSeoResultsCache()` | SEO overview/findings GET routes could bootstrap serving cache table. | Read-only readiness gate with null/no-op fallback. | P1 | Resolved |
| `lib/seo/monthly-ai-analysis-store.ts` | `getSeoMonthlyAiAnalysis()` | SEO analysis reads could bootstrap `seo_ai_monthly_analyses` from GET routes. | Return `null` when schema is not ready. | P1 | Resolved |
| `lib/custom-report-store.ts` | `listCustomReportsByBusiness()`, `getCustomReportById()`, `getCustomReportShareSnapshot()` | Report/list/share reads could run migrations from GET routes and share pages. | Read-only readiness gate and null/empty degrade. | P1 | Resolved |
| `lib/creative-share-store.ts` | `getCreativeShareSnapshot()` | Creative share GET route could bootstrap share tables on read. | Read-only readiness gate and null degrade. | P1 | Resolved |
| `lib/shopify/install-context.ts` | `getShopifyInstallContext()`, `getLatestShopifyInstallContextForActor()` | Shopify OAuth context/pending GET routes could migrate on read. | Gate reads on `shopify_install_contexts` readiness. | P1 | Resolved |
| `app/api/migrate/route.ts` | `POST()` | Legacy API route still runs migrations from an HTTP request. | Retire in favor of `npm run db:migrate` / `scripts/run-migrations.ts`; keep out of normal request flow. | P1 | Open |
| `app/api/sync/refresh/route.ts` | `POST()` | Manual sync trigger route still bootstraps schema in-band. | Move migration step to explicit bootstrap before invoking refresh actions. | P1 | Open |
| `app/api/businesses/[businessId]/route.ts` | `DELETE()` | Workspace delete still calls `runMigrations()` before mutation. | Replace with explicit readiness for affected tables or require pre-migrated environment. | P1 | Open |
| `app/api/google-ads/repair-recent-gap/route.ts` | `POST()` | Repair endpoint still bootstraps schema via HTTP request. | Move to ops script / worker bootstrap lane. | P1 | Open |
| `app/api/webhooks/shopify/sync/route.ts` | `POST()` | Webhook request can still trigger migrations before sync state writes. | Require bootstrap before webhook handling. | P1 | Open |
| `app/api/webhooks/shopify/customer-events/route.ts` | `POST()` | Same in-band migration pattern in webhook path. | Same as above. | P1 | Open |

## GET sırasında write

| File | Function | Impact | Recommended fix | Priority |
| --- | --- | --- | --- | --- |
| `lib/shopify/read-adapter.ts` | `getShopifyOverviewReadCandidate()` | Overview `GET` persists `shopify_serving_state` and `shopify_reconciliation_runs`; repeated reads mutate serving state. | Move assessment persistence to webhook/worker/admin reconciliation job; keep request path read-only. | P0 |
| `lib/google-ads/serving.ts` | `getGoogleCanonicalOverviewTrends()` | Historical trend `GET` fires `hydrateOverviewSummaryRangeFromGoogle()` and writes `platform_overview_*` projection rows/manifests. | Hydrate projections asynchronously in worker/backfill lane, not in request thread. | P0 |
| `lib/overview-service.ts` | `getGa4EcommerceFallback()` | Overview `GET` writes GA4 fallback cache rows into `provider_reporting_snapshots`. | Separate read cache warmer from request handler or make cache write explicitly asynchronous/off-path. | P1 |
| `lib/shopify/overview.ts` | `getShopifyOverviewAggregate()` | Shopify live aggregate writes `provider_reporting_snapshots` during request evaluation. | Shift cache hydration to worker/cron or make it a non-blocking background task guarded outside core response path. | P1 |
| `lib/reporting-cache.ts` | `setCachedReport()` usage from request-time callers | Shared cache utility means multiple read paths write through the same serving table. | Restrict request paths to `getCachedReport()` and move `setCachedReport()` behind background population APIs. | P1 |

## request sırasında lazy projection hydration

| File | Function | Impact | Recommended fix | Priority |
| --- | --- | --- | --- | --- |
| `lib/google-ads/serving.ts` | `getGoogleCanonicalOverviewTrends()` | Projection hydration is fire-and-forget, so request success is decoupled from projection correctness and retries. | Introduce explicit projection job table/worker or hydrate during sync completion hooks only. | P0 |
| `lib/overview-summary-store.ts` | `hydrateOverviewSummaryRangeFromGoogle()` / `markOverviewSummaryRangeHydrated()` | Projection validity is tightly coupled to request-time availability of Google warehouse rows. | Convert projection writes into post-sync materialization step with durable job ownership. | P1 |
| `lib/overview-summary-store.ts` | `invalidateOverviewSummaryRanges()` | Projection invalidation currently depends on write callers knowing affected date windows. | Centralize invalidation in sync completion hooks and schema-aware materializer service. | P1 |

## aynı endpoint içinde mixed live + warehouse + projection okuma

| File | Function | Impact | Recommended fix | Priority |
| --- | --- | --- | --- | --- |
| `lib/google-ads/serving.ts` | `getGoogleCanonicalOverviewSummary()` / `getGoogleCanonicalOverviewTrends()` | Same serving module mixes current-day live overlay, warehouse truth, and `platform_overview_*` projection fallback. This raises correctness and rollback risk. | Split into `live-lane`, `warehouse-lane`, and `projection-fallback` modules with explicit precedence contract. | P0 |
| `lib/meta/canonical-overview.ts` | `getMetaCanonicalOverviewSummary()` | Summary reads warehouse history and conditionally overlays live totals for current day. | Isolate live exception into dedicated adapter and keep historical path warehouse-only. | P1 |
| `lib/overview-service.ts` | `getOverviewData()` / `buildDailyTrends()` | Aggregator composes Meta, Google, Shopify, and GA4 with different freshness models in one request. | Introduce provider-specific read contracts and a thin orchestration layer that only merges normalized outputs. | P1 |
| `app/api/overview-summary/route.ts` | `GET()` | Route mixes summary aggregation, Shopify serving trust, GA4 analytics, cost model, and integration status in one handler. | Break into smaller fetch modules and keep route as response composer only. | P1 |

## büyük multi-responsibility dosyalar

| File | Function / scope | Impact | Recommended fix | Priority |
| --- | --- | --- | --- | --- |
| `lib/google-ads/warehouse.ts` | 4703-line sync/control/repository module | Control plane, warehouse writes, coverage reads, cleanup, and reset logic are co-located. High regression surface. | Split into repositories (`sync-control`, `raw-store`, `warehouse-store`, `health-readers`, `admin-tools`). | P1 |
| `lib/google-ads/serving.ts` | 2256-line serving/orchestration module | Historical serving, live overlay, advisor composition, and projection fallback sit in one file. | Split by surface: overview, campaigns, advisor, domain reports, fallback logic. | P1 |
| `lib/meta/serving.ts` | 1991-line historical serving module | Campaign/breakdown/config snapshot enrichment and warehouse freshness logic are tightly coupled. | Split by output surface and move shared warehouse queries into repositories. | P1 |
| `lib/migrations.ts` | 2341-line runtime migration bundle | Schema definition, data backfills, and runtime bootstrap behavior share one file. | Move to offline migration system plus minimal runtime schema probe. | P1 |
| `app/api/overview-summary/route.ts` | 996-line route handler | Route owns translation, metric composition, comparison windows, and multi-source orchestration. | Extract pure response builders and keep the route thin. | P2 |
| `app/(dashboard)/platforms/meta/page.tsx` | 1509-line page component | UI layout, data-fetch orchestration, comparison logic, and sync actions are mixed. | Split page shell from data hooks and surface-specific components. | P2 |

## schema/state coupling

| File | Function | Impact | Recommended fix | Priority |
| --- | --- | --- | --- | --- |
| `app/api/meta/status/route.ts` | `GET()` | UI readiness depends directly on internal queue, checkpoint, authoritative publication, and worker-heartbeat tables. | Introduce a stable status read model/materialized summary table fed by sync completion events. | P1 |
| `app/api/google-ads/status/route.ts` | `GET()` | Route reads queue internals, request-governance state, advisor readiness, and raw warehouse coverage directly. | Publish a compact provider-status serving model rather than recomputing from control tables on each request. | P1 |
| `lib/shopify/read-adapter.ts` | `getShopifyOverviewReadCandidate()` | Serving choice depends on live/warehouse/ledger divergence, override state, and pending-repair flags in multiple tables. | Move trust-state decisioning into one persisted serving projection updated off-path. | P1 |
| `lib/overview-summary-store.ts` | `evaluateOverviewSummaryProjectionValidity()` | Projection validity is encoded with magic version/value checks in code, not in a dedicated projection contract. | Introduce explicit projection schema/version contract and materializer ownership. | P1 |

## Top 10 current risks

1. `lib/shopify/read-adapter.ts#getShopifyOverviewReadCandidate()` writes serving state during overview `GET`.
2. `lib/google-ads/serving.ts#getGoogleCanonicalOverviewTrends()` hydrates projections during request handling.
3. `lib/overview-service.ts#getGa4EcommerceFallback()` writes provider cache rows inside a read path.
4. `lib/shopify/overview.ts#getShopifyOverviewAggregate()` writes provider cache rows inside a read path.
5. `lib/google-ads/serving.ts` mixes live, warehouse, and projection lanes in one module.
6. `lib/google-ads/warehouse.ts` and `lib/meta/serving.ts` are oversized mixed-responsibility files.
7. Status routes are coupled directly to sync-control schema, making later table moves high risk.
8. Legacy HTTP mutation/ops routes (`app/api/migrate`, `app/api/sync/refresh`, Shopify webhooks, repair routes) still contain request-time migrations.
9. `lib/overview-summary-store.ts` still invalidates/materializes projections from request-driven callers, even though it no longer bootstraps schema.
10. `app/api/overview-summary/route.ts` still composes multiple freshness models in one large handler.
