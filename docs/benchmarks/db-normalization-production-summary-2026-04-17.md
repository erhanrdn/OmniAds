# DB Normalization Production Summary 2026-04-17

Source of truth:
- Hetzner production before/after compare
- Operator artefact root: `/tmp/db-normalization-hetzner-prod-1`

## Window

- Before: `2026-04-17T04:12:01.780Z`
- After: `2026-04-17T05:18:16.800Z`
- Database size delta: `+7,690,706,944` bytes

## Read benchmark deltas

- `google_ads_overview_30d`: `-4632.48 ms avg`, `-7317.76 ms p95`
- `meta_creatives_30d`: `-327.33 ms avg`, `-33.14 ms p95`
- `overview_data_no_trends_30d`: `-2332.31 ms avg`, `-3272.29 ms p95`
- `overview_data_no_trends_90d`: `-3494.76 ms avg`, `-5411.51 ms p95`
- `overview_trend_bundle_30d`: `-1818.98 ms avg`, `-2187.03 ms p95`
- `shopify_warehouse_overview_90d`: `-1036.19 ms avg`, `-1320.95 ms p95`

## Write benchmark deltas

- `core_write_cycle`: `-5080.65 ms avg`, `-5677.80 ms p95`
- `serving_write_cycle`: `-3067.69 ms avg`, `-3212.13 ms p95`
- `warehouse_write_cycle_google`: `-5028.86 ms avg`, `-5190.50 ms p95`
- `warehouse_write_cycle_meta`: `-4856.55 ms avg`, `-4424.16 ms p95`
- `warehouse_write_cycle_shopify`: `-2268.59 ms avg`, `-2119.26 ms p95`

## Structural summary

- Baseline SQL parity delta: `0`
- Column-shape delta:
  - operational `JSONB`: no net growth in tracked core/control/raw/warehouse/serving families
  - `TEXT[]`: no tracked increase
- Family size delta:
  - `warehouse`: `+7,137,615,872` bytes
  - `raw`: `+230,391,808` bytes
  - `control`: `+210,403,328` bytes
  - `serving`: `+68,050,944` bytes
  - `audit`: `+4,669,440` bytes

## Notes

- The historical explain-plan artefact still used the label `legacy_integrations_upsert` for the core write path sample.
- The benchmark script now uses canonical provider connection / credential upsert terminology for future runs.
