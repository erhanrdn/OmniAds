# DB Risk Register

Scope: baseline audit plus request-path migration isolation and GET/read-path side-effect cleanup status. This document reflects the Phase 2 guardrail pass; runtime contracts remain unchanged.

Priority scale:
- `P0`: remove from request path before any DB cutover/refactor.
- `P1`: isolate during next refactor phase.
- `P2`: clean up after runtime behavior is stabilized behind guardrails.

Status scale:
- `Resolved`: no longer reachable from request/access read paths or passive `GET` traffic; route/helper now uses read-only readiness or stale/empty degrade.
- `Partially resolved`: removed from `GET`/read graphs, but the mutating helper still exists for explicit non-`GET`, worker, sync, or admin lanes.
- `Open`: still present and must move to explicit request-external bootstrap, worker/materializer ownership, or later mutation-lane cleanup.

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
| `app/api/migrate/route.ts` | `POST()` | Legacy API route previously bootstrapped schema via HTTP. | Retire HTTP entrypoint; return explicit operator guidance to `npm run db:migrate`. | P1 | Resolved |
| `app/api/sync/refresh/route.ts` | `POST()` | Manual sync trigger previously bootstrapped schema in-band. | Require readiness up front and fail fast with `schema_not_ready`. | P1 | Resolved |
| `app/api/businesses/[businessId]/route.ts` | `DELETE()` | Workspace delete previously bootstrapped schema before mutation. | Require readiness for destructive tables and fail closed when missing. | P1 | Resolved |
| `app/api/google-ads/repair-recent-gap/route.ts` | `POST()` | Repair endpoint previously bootstrapped schema via HTTP request. | Require readiness up front and keep repair in explicit ops lane only. | P1 | Resolved |
| `app/api/webhooks/shopify/sync/route.ts` | `POST()` | Webhook request previously bootstrapped schema before durable processing. | Fail closed with retry-friendly non-2xx until schema is ready. | P1 | Resolved |
| `app/api/webhooks/shopify/customer-events/route.ts` | `POST()` | Same in-band migration pattern in webhook path. | Same as above; no success ack before durable schema is ready. | P1 | Resolved |
| `app/businesses/[businessId]/meta/assign-accounts/route.ts` | `POST()` | UI mutation route retried writes by migrating the assignment table on demand. | Gate on assignment-table readiness and surface explicit `schema_not_ready` instead of retrying migrations. | P1 | Resolved |
| `app/businesses/[businessId]/google/assign-accounts/route.ts` | `POST()` | Same migrate-on-request fallback as Meta account assignment. | Same as above. | P1 | Resolved |
| `app/api/google-ads/advisor-memory/route.ts` | `POST()` via `lib/google-ads/advisor-memory.ts` | HTTP mutation route depended transitively on helper-level migrations for advisor memory and execution logs. | Route-adjacent helper now relies on readiness/fallback only; keep explicit bootstrap request-external. | P1 | Resolved |
| `app/api/meta/recommendations/route.ts` | `GET()` via `lib/meta/creative-score-service.ts` | Recommendations route depended transitively on creative-score snapshot migrations. | Snapshot helper now degrades when schema is absent instead of bootstrapping. | P1 | Resolved |
| `lib/reporting-cache.ts` | `clearCachedReports()` transitively reachable from HTTP route graph | Shared cache module still imported migrations even though route reads only needed non-mutating helpers. | Replace helper-level migration with readiness assertion so route graph is migration-free. | P1 | Resolved |

## GET sırasında write

| File | Function | Impact | Recommended fix | Priority | Status |
| --- | --- | --- | --- | --- | --- |
| `lib/shopify/read-adapter.ts` | `getShopifyOverviewReadCandidate()` | Overview `GET` used to persist `shopify_serving_state` and `shopify_reconciliation_runs`; repeated reads mutated serving state. | Move assessment persistence to webhook/worker/admin reconciliation job; keep request path read-only. | P0 | Resolved |
| `lib/google-ads/serving.ts` | `getGoogleCanonicalOverviewTrends()` | Historical trend `GET` used to fire `hydrateOverviewSummaryRangeFromGoogle()` and write `platform_overview_*` projection rows/manifests. | Hydrate projections asynchronously in worker/backfill lane, not in request thread. | P0 | Resolved |
| `lib/overview-service.ts` | `getGa4EcommerceFallback()` | Overview `GET` used to write GA4 fallback cache rows into `provider_reporting_snapshots`. | Separate read cache warmer from request handler or make cache write explicitly asynchronous/off-path. | P1 | Resolved |
| `lib/shopify/overview.ts` | `getShopifyOverviewAggregate()` | Shopify live aggregate used to write `provider_reporting_snapshots` during request evaluation. | Shift cache hydration to worker/cron or make it a non-blocking background task guarded outside core response path. | P1 | Resolved |
| `lib/reporting-cache.ts` | `setCachedReport()` usage from request-time callers | Shared cache utility made overview, Shopify, analytics, and GAQL read paths write through the same serving table. | Restrict request paths to `getCachedReport()` and move persistence to `lib/reporting-cache-writer.ts`. | P1 | Resolved |
| `app/api/analytics/*/route.ts` | route-local cached report read flows | Analytics `GET` routes performed durable cache write-through via `setCachedRouteReport()`. | Serve cached rows read-only and return live/degraded payloads without persistence. | P1 | Resolved |
| `app/api/seo/overview/route.ts`, `app/api/seo/findings/route.ts` | route-local SEO cache fills | SEO `GET` routes persisted cache rows on misses. | Keep cache reads only; move persistence to explicit warmers or generation actions. | P1 | Resolved |
| `lib/provider-account-discovery.ts` | `listAccessibleProviderAccounts()` | GET-driven provider-account discovery could request or force snapshot refresh side effects. | Use stale snapshot or assignment fallback only; no refresh trigger from passive reads. | P1 | Resolved |
| `lib/business-context.ts` | `getBusinessContextFromRequest()` | Business context resolution updated active-business session state during `GET`. | Keep GET access resolution read-only; leave active-business mutation to explicit user action. | P1 | Resolved |
| `lib/meta/serving.ts` | warehouse read repair helpers | Meta read helpers could repair missing warehouse campaign/adset rows during `GET`. | Keep warehouse reads pure and move repair/backfill to sync/admin lanes. | P1 | Resolved |
| `lib/creative-share-store.ts` | `getCreativeShareSnapshot()` | Share snapshot GET deleted expired snapshots during reads. | Return null for expired shares and leave cleanup to explicit jobs/admin maintenance. | P2 | Resolved |
| `lib/account-store.ts` | `listInvitesByBusiness()` | Invite listing could expire stale rows during reads. | Keep GET/admin read surfaces pure; let invite expiry happen in explicit mutation/maintenance flows. | P2 | Resolved |

## request sırasında lazy projection hydration

| File | Function | Impact | Recommended fix | Priority | Status |
| --- | --- | --- | --- | --- | --- |
| `lib/google-ads/serving.ts` | `getGoogleCanonicalOverviewTrends()` | Projection hydration was fire-and-forget, so request success was decoupled from projection correctness and retries. | Introduce explicit projection job table/worker or hydrate during sync completion hooks only. | P0 | Resolved |
| `lib/overview-summary-materializer.ts` | `materializeOverviewSummaryRangeFromGoogle()` / `materializeOverviewSummaryRange()` | Projection writes now have explicit ownership, but arbitrary range hydration is not yet wired to an automated backfill/materializer trigger. | Keep range hydration in explicit materializer lane and add a dedicated backfill/manual trigger later. | P1 | Partially resolved |
| `lib/overview-summary-materializer.ts` | `clearOverviewSummaryRangeManifests()` | Range invalidation ownership is now explicit, but callers still derive affected windows ad hoc from warehouse upserts. | Centralize invalidation in sync completion hooks and schema-aware materializer service. | P1 | Partially resolved |

## explicit serving/cache write ownership

| File | Function | Impact | Recommended fix | Priority | Status |
| --- | --- | --- | --- | --- | --- |
| `lib/overview-summary-store.ts` | projection upsert/hydrate helpers | Projection writes used to live in a shared read/store module, so ownership was blurred. | Keep shared reads in `lib/overview-summary-store.ts` and route all projection persistence through `lib/overview-summary-materializer.ts`. | P0 | Resolved |
| `lib/reporting-cache.ts` / `lib/route-report-cache.ts` | durable cache persistence helpers | User-facing cache writes used to share a file with read helpers, obscuring which callers were allowed to persist snapshots. | Keep reads in shared helpers and route persistence through `lib/reporting-cache-writer.ts`. | P0 | Resolved |
| `lib/seo/results-cache.ts` | `setSeoResultsCache()` | SEO cache persistence lived next to passive cache reads. | Keep reads in `lib/seo/results-cache.ts` and write only through `lib/seo/results-cache-writer.ts`. | P1 | Resolved |
| `lib/shopify/warehouse.ts` | `upsertShopifyServingState()` / `insertShopifyReconciliationRun()` | User-facing Shopify serving-state writes were buried in a broad warehouse repository. | Keep reads in `lib/shopify/warehouse.ts` and route serving-state/reconciliation persistence through `lib/shopify/overview-materializer.ts`. | P0 | Resolved |
| `lib/reporting-cache-writer.ts` | `writeCachedReportSnapshot()` | Explicit writer exists, but several user-facing cache keys no longer have automated non-`GET` warmers. | Add dedicated non-GET warmers for analytics overview/detail, GA4 ecommerce fallback, and Shopify overview cache or keep them documented as deliberate gaps. | P1 | Partially resolved |
| `lib/seo/results-cache-writer.ts` | `writeSeoResultsCacheEntry()` | Explicit writer exists, but only SEO overview warming is wired today. | Add a dedicated non-GET findings cache warmer or leave findings cache read-through only. | P1 | Partially resolved |
| `lib/shopify/overview-materializer.ts` | `recordShopifyOverviewReconciliationRun()` | Explicit reconciliation writer exists, but no current non-`GET` owner invokes it. | Wire an explicit sync/admin reconciliation owner or keep the gap documented until that lane exists. | P1 | Partially resolved |

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

1. `lib/google-ads/serving.ts` still mixes live, warehouse, and projection lanes in one module.
2. `lib/google-ads/warehouse.ts` is still an oversized mixed-responsibility file with sync, control, and read concerns co-located.
3. `lib/meta/serving.ts` remains a large mixed-concern module even after repair-on-read removal.
4. Status routes are coupled directly to sync-control schema, making later table moves high risk.
5. `provider_reporting_snapshots` now has an explicit writer lane, but analytics detail caches, GA4 ecommerce fallback, and Shopify overview cache still lack automated non-`GET` owners.
6. `seo_results_cache` findings warming still has no explicit non-`GET` trigger.
7. `lib/shopify/read-adapter.ts` still encodes serving trust decisions across many tables, even though persistence now lives in an explicit materializer.
8. `shopify_reconciliation_runs` has an explicit writer module, but no active owner is wired to use it.
9. OAuth/install callback `GET` handlers remain intentional mutation lanes and are excluded from passive-read guardrails.
10. `lib/migrations.ts` remains a large runtime migration bundle, and broader non-`GET` mutation/admin/webhook cleanup is still ahead.
