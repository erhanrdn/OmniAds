# DB Target Architecture

Goal: move from request-time mixed reads/writes to a layered, explicit read model without changing contracts until the dedicated cutover phase.

## Request-path rule

Request handlers, auth/access reads, server-side share/report lookups, and route-local cache readers must never call `runMigrations()` directly or transitively.

No HTTP route may execute migrations. This includes `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, webhook handlers, and non-`/api` route handlers under `app/**/route.ts`.

Passive `GET`/read routes and the helpers they call must be side-effect free.
- No DB writes
- No durable cache writes
- No projection hydration or upsert on read
- No serving-state or reconciliation-state updates on read
- No lazy repair/refresh triggers on read
- No background refresh enqueue from passive `GET`

Allowed request-path schema behavior:
- Read-only readiness checks via `lib/db-schema-readiness.ts`
- Safe degraded empty/null/status responses that preserve existing contracts
- Existing request-time DML that is already part of the contract, but only after schema readiness is confirmed

Allowed read-time fallback order for passive `GET` surfaces:
1. Serve the last durable projection/state read-only.
2. Compute an ephemeral response from warehouse/live inputs without persisting it.
3. Return the existing degraded/empty/null contract already used by that surface.

Callback-style `GET` routes such as OAuth/install handshakes are not passive read surfaces. They may remain explicit mutation entrypoints, but they still may not execute migrations.

Disallowed request-path schema behavior:
- `runMigrations()` in `GET`, auth/access checks, middleware, shared read helpers, or route-local missing-table fallback
- `runMigrations()` in any HTTP mutation, admin, ops, OAuth, or webhook route
- Migrate-on-read retries after `relation does not exist`
- HTTP-triggered schema bootstrap through legacy operator endpoints such as `/api/migrate`

## Target layer model

| Layer | Responsibility | Allowed writes | Allowed request-time reads |
| --- | --- | --- | --- |
| `core` | Users, businesses, access control, integration bindings, manual business settings. | UI/API mutations and OAuth/install flows. | Yes |
| `control` | Sync scheduling, leases, checkpoints, cooldowns, repair state, provider health internals. | Workers, cron, webhooks, admin repair tools. | Only through dedicated status read models, not raw control tables. |
| `raw` | Immutable or append-oriented provider payload capture. | Workers/webhooks only. | No direct UI/API reads. |
| `warehouse` | Normalized historical provider truth tables. | Sync workers and post-sync materializers. | Yes, but read-only and scoped to stable repository interfaces. |
| `serving` | API-facing projections, caches, summaries, advisor snapshots, share payloads. | Materializers, background cache warmers, explicit UI mutations that create shares/reports. | Yes |
| `audit` | Operational/event audit trails and reconciliation evidence. | Workers, admin actions, webhook processors, execution logs. | Read-only diagnostics/admin only. |

## Target data flow

`Provider API -> raw -> warehouse -> serving -> API -> UI`

Expected behaviors:
- Request handlers read `core`, `warehouse`, and `serving`.
- Request handlers may probe schema readiness, but they do not bootstrap schema.
- Workers/webhooks mutate `control`, `raw`, `warehouse`, `serving`, and `audit`.
- `control` tables should not be the primary UI contract; routes should read from compact serving summaries derived from control state.
- `serving` tables should be populated by sync completion hooks, workers, or explicit admin actions, not by passive `GET` traffic.
- User-facing serving/projection/cache persistence must happen only in explicit materializer/writer lanes, never in shared read helpers.
- Explicit writer modules in the current phase are `lib/overview-summary-materializer.ts`, `lib/reporting-cache-writer.ts`, `lib/seo/results-cache-writer.ts`, and `lib/shopify/overview-materializer.ts`.

## direct-live lane exceptions

The target architecture still allows narrow live exceptions, but they must be explicit and isolated.

1. Meta current-day summary/campaign lane
   - Only when the selected range is the provider current day.
   - Reads directly from Meta API plus read-only config snapshots.
   - Must never backfill or mutate warehouse/projection tables from the request thread.

2. Google Ads current-day overlay lane
   - Only for a same-day window.
   - Live output may overlay warehouse-unavailable current-day metrics.
   - Historical requests must stay on warehouse/projection only.

3. Shopify live fallback lane
   - Only when warehouse/ledger trust is not ready or an explicit override requires live mode.
   - Trust assessment persistence should happen off-path; the request should only consume the latest serving decision read-only.

4. GA4 ecommerce fallback lane
   - Non-authoritative enrichment for revenue/purchase/AOV only when Shopify truth is absent.
   - Cache warming must move off-path; request-time fallback can only compute ephemeral output.

## Safe implementation order

1. Freeze contracts and observability.
   - Keep current route response shapes unchanged.
   - Maintain the docs, route contract tests, and side-effect scan added in this phase.

2. Remove request-path migrations.
   - `runMigrations()` must leave auth, overview, status, report/share, SEO, Shopify OAuth read helpers, and provider read helpers.
   - No HTTP route may execute migrations; request handlers can only use readiness gates and explicit fail-fast behavior.
   - Request-time callers may only use `db-schema-readiness` and safe degrade paths.
   - Explicit request-external bootstrap entrypoints are `npm run db:migrate` and `node --import tsx scripts/run-migrations.ts`.
   - HTTP-triggered migration entrypoints are retired technical debt and must not be reintroduced.

3. Remove GET-path writes.
   - Move Shopify serving-state persistence, reconciliation-run inserts, overview projection hydration, report-cache writes, and refresh triggers to background or sync-completion hooks.
   - `GET` routes may only read durable projections, compute ephemeral fallbacks, or return existing degraded contracts.

4. Make serving/cache write ownership explicit.
   - Shared read modules stay read-only; user-facing serving/projection/cache persistence moves to named materializer/writer modules.
   - Non-`GET` owners should be existing sync, webhook, admin, worker, or explicit manual-refresh lanes.
   - If an owner does not exist yet, keep the writer explicit but unwired and document the gap instead of reintroducing write-on-read.

5. Isolate live lanes.
   - Split Meta live, Google live overlay, Shopify live fallback, and GA4 fallback behind narrow adapters with explicit precedence rules.

6. Introduce stable repository boundaries.
   - Separate `core`, `control`, `warehouse`, and `serving` repositories so API routes and UI services consume small, typed contracts.

7. Publish serving read models for status and overview.
   - Provider status should come from serving summaries, not direct queue/checkpoint joins.
   - Overview projection materialization should run after sync completion, not during reads.

8. Break large modules after the seams are stable.
   - Split `lib/google-ads/warehouse.ts`, `lib/google-ads/serving.ts`, `lib/meta/serving.ts`, `lib/migrations.ts`, and `app/api/overview-summary/route.ts` along layer boundaries.

## Phase plan

| Phase | Goal | Safe changes allowed | Exit criteria |
| --- | --- | --- | --- |
| `Phase 0` | Audit + baseline | Docs, tests, scripts, read-only SQL only | Current contract and risk map are frozen |
| `Phase 1` | Migration isolation | Startup/bootstrap changes, readiness gates, no route contract changes | No request-path read/access `runMigrations()`; explicit request-external migration entrypoint documented |
| `Phase 2` | Read-path write removal | Move cache/projection/serving-state writes off-path | No `GET`-path DB writes, durable cache writes, projection hydrations, or refresh triggers |
| `Phase 3` | Explicit serving write ownership | Extract materializer/writer modules and wire non-`GET` owners without contract changes | User-facing serving/projection/cache writes come only from explicit owner modules |
| `Phase 4` | Lane separation | Refactor live/warehouse/projection adapters behind same contracts | Historical reads are warehouse-or-serving only |
| `Phase 5` | Serving-model stabilization | New materializers and provider-status projections | Status/overview routes no longer query raw control tables directly |
| `Phase 6` | Cutover and cleanup | Repository split, dead-code removal, schema cleanup planning | Stable serving contracts and controlled cutover plan |

## Non-goals for this phase

- No endpoint response-shape changes.
- No table rename/drop.
- No schema or migration rewrites.
- No cutover from live lane to warehouse lane.
- No behavior-changing refactor.
