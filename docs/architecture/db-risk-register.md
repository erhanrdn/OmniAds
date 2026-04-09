# DB Risk Register

Scope: current-state audit only. No remediation is applied in this phase.

Priority scale:
- `P0`: remove from request path before any DB cutover/refactor.
- `P1`: isolate during next refactor phase.
- `P2`: clean up after runtime behavior is stabilized behind guardrails.

## request path içinde migration

| File | Function | Impact | Recommended fix | Priority |
| --- | --- | --- | --- | --- |
| `lib/access.ts` | `findMembership()`, `listUserBusinesses()` | Every protected route can trigger `runMigrations()` before authorization is resolved. This turns auth checks into schema bootstrap points. | Move runtime migrations out of request auth. Fail fast on missing schema and run migrations only in deploy/startup/admin tooling. | P0 |
| `lib/overview-service.ts` | `getMetaAccessContext()` | Overview `GET` path retries account-assignment reads by running migrations on missing relation. | Replace lazy migrate-on-missing-table fallback with explicit dependency health check and empty-state handling. | P0 |
| `app/api/meta/campaigns/route.ts` | `fetchAssignedAccountIds()` | Meta campaigns `GET` can run migrations during assignment lookup. | Depend on bootstrap/startup migration completion; return `no_accounts_assigned` or degraded response without mutating schema state. | P0 |
| `app/api/meta/breakdowns/route.ts` | `fetchAssignedAccountIds()` | Same migration-on-read pattern as campaigns route. | Same as above; centralize safe assignment-read behavior in one helper. | P0 |
| `app/api/google-ads/status/route.ts` | `GET()` | Status `GET` performs an unconditional `runMigrations()`, coupling observability with schema bootstrap. | Move migrations to startup/admin lane and let status route read-only operate against existing schema. | P0 |
| `lib/meta/config-snapshots.ts` | `readLatestMetaConfigSnapshots()`, `readPrevious*()` | Read helpers invoked from live serving and campaign UI run migrations before reads. | Split schema bootstrap from read repository; keep repositories read-only. | P1 |
| `lib/provider-account-snapshots.ts` | `getSnapshotRow()` and read helpers | Snapshot reads used in status/serving perform migrations before lookup. | Introduce read-only repository and preflight bootstrap outside request path. | P1 |

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

1. `lib/access.ts` runs migrations inside authorization checks.
2. `lib/shopify/read-adapter.ts#getShopifyOverviewReadCandidate()` writes serving state during overview `GET`.
3. `lib/google-ads/serving.ts#getGoogleCanonicalOverviewTrends()` hydrates projections during request handling.
4. `app/api/google-ads/status/route.ts#GET` performs unconditional request-time migration.
5. `app/api/meta/campaigns/route.ts` and `app/api/meta/breakdowns/route.ts` retry missing-table reads by migrating.
6. `lib/overview-service.ts#getGa4EcommerceFallback()` writes provider cache rows inside a read path.
7. `lib/shopify/overview.ts#getShopifyOverviewAggregate()` writes provider cache rows inside a read path.
8. `lib/google-ads/serving.ts` mixes live, warehouse, and projection lanes in one module.
9. `lib/google-ads/warehouse.ts` and `lib/meta/serving.ts` are oversized mixed-responsibility files.
10. Status routes are coupled directly to sync-control schema, making later table moves high risk.
