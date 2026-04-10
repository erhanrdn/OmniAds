# Serving Freshness Observability Runbook

Purpose: give operators one read-only status surface for the in-scope serving/projection/cache tables without changing ownership boundaries or adding new persistence.

## Status CLI

Command:

```bash
node --import tsx scripts/report-serving-freshness-status.ts <businessId> [--start-date=YYYY-MM-DD] [--end-date=YYYY-MM-DD] [--overview-provider=google|meta] [--demographics-dimension=<dimension>]
```

Behavior:

- Reads the current in-scope serving/projection/cache state directly from existing tables.
- Reuses the existing shared freshness boundaries from `lib/sync/report-warmer-boundaries.ts`.
- Does not run migrations.
- Does not write any state.
- Stays CLI-only in the current repo state; no new public or admin route was added.

This command is the read-only observability/status surface. It is not a manual owner, cache warmer, repair trigger, or release verification command.

Optional exact-selection flags:

- `--start-date` and `--end-date`
  Use these when checking an exact manual boundary such as:
  - an exact selected `platform_overview_summary_ranges` window
  - a non-default GA4 snapshot window
  - a non-recent Shopify overview snapshot window
- `--overview-provider`
  Limits exact overview-summary range inspection to `google` or `meta`.
- `--demographics-dimension`
  Lets the status output evaluate an exact non-`country` GA4 demographics boundary.

## Status Classifications

### `automated_present`

Meaning:

- The current bounded automated surface has a matching durable row in its serving/cache table.
- The output also includes the latest owner-side timestamps when those are derivable from existing control tables.

Expected owner:

- `ga4-sync`
- `search-console-sync`
- `shopify-sync`

Operator action:

- None by default.
- Review raw timestamp ages if the row exists but seems older than expected operationally.

### `automated_missing`

Meaning:

- The current bounded automated surface does not have a matching durable row in its target serving/cache table.
- This is not a request-path write issue; it means the explicit automated owner has not materialized the current bounded target row.

Expected owner:

- `ga4-sync`
- `search-console-sync`
- `shopify-sync`

Operator action:

- Inspect the corresponding owner lane and its latest owner-side timestamps in the CLI output.
- If targeted recovery is needed, use the existing explicit owner lane for that surface rather than a read path.

### `manual_boundary`

Meaning:

- The surface is intentionally operator-owned in the current policy.
- If an exact manual selection was not supplied, this classification means the boundary exists and remains intentional.
- If an exact manual selection was supplied and a matching durable row exists, the boundary is still manual but currently materialized.

Expected owner:

- `npm run overview:summary:materialize`
- `npm run reporting:cache:warm`

Operator action:

- Use the exact fallback command printed in the status row when you need targeted refresh or backfill.

### `manual_missing`

Meaning:

- An exact manual boundary was supplied to the CLI, but the exact durable row is not present.
- This is expected until an operator runs the explicit manual owner.

Expected owner:

- `npm run overview:summary:materialize`
- `npm run reporting:cache:warm`

Operator action:

- Run the exact fallback command printed in the status row.

### `unknown`

Meaning:

- The script could not conservatively conclude whether the surface should currently exist.
- Common reasons:
  - provider integration is not connected
  - provider account assignments are missing
  - the relevant table is not ready

Expected owner:

- Unchanged from the ownership map; this classification only means applicability could not be derived safely.

Operator action:

- Resolve the noted prerequisite first.

## Covered In-Scope Surfaces

- `platform_overview_summary_ranges`
- `provider_reporting_snapshots`
  - `ga4_analytics_overview`
  - `ga4_detailed_audience`
  - `ga4_detailed_cohorts`
  - `ga4_detailed_demographics`
  - `ga4_landing_page_performance_v1`
  - `ga4_detailed_landing_pages`
  - `ga4_detailed_products`
  - `ecommerce_fallback`
  - `overview_shopify_orders_aggregate_v6`
- `seo_results_cache`
  - `overview`
  - `findings`
- `shopify_serving_state`
- `shopify_reconciliation_runs`

## Manual Boundary Commands

Exact selected overview summary range:

```bash
npm run overview:summary:materialize -- --business-id <business_id> --provider google --start-date <yyyy-mm-dd> --end-date <yyyy-mm-dd>
```

Non-default GA4 window:

```bash
npm run reporting:cache:warm -- --business-id <business_id> --report-type <ga4_type> --start-date <yyyy-mm-dd> --end-date <yyyy-mm-dd>
```

Non-`country` GA4 demographics:

```bash
npm run reporting:cache:warm -- --business-id <business_id> --report-type ga4_detailed_demographics --start-date <yyyy-mm-dd> --end-date <yyyy-mm-dd> --dimension <dimension>
```

Non-recent Shopify overview snapshot:

```bash
npm run reporting:cache:warm -- --business-id <business_id> --report-type overview_shopify_orders_aggregate_v6 --start-date <yyyy-mm-dd> --end-date <yyyy-mm-dd>
```
