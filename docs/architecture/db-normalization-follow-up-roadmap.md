# DB Normalization Follow-Up Roadmap

The canonical core backbone is complete. The remaining normalization work is provider-specific warehouse cleanup. Rollout order is fixed:

1. Meta
2. Google Ads
3. Shopify

Each epic uses the same pattern:
- additive schema
- backfill
- parity compare
- reader cutover
- cleanup

## Meta epic

Targets:
- Split `meta_campaign_daily` config fields out of the fact table.
- Split `meta_adset_daily` config fields out of the fact table.
- Introduce typed dimensions:
  - campaign dimension
  - adset dimension
- Introduce typed history:
  - campaign config history
  - adset config history
- Move `meta_ad_daily` and `meta_creative_daily` request-time dependencies off `payload_json`.

Acceptance:
- current reads join dimension + history instead of reading config from daily fact columns
- raw payload remains archive-only
- request contracts unchanged

## Google Ads epic

Targets:
- Separate `google_ads_*_daily` tables into metric facts plus entity dimensions.
- Remove request-time dependence on:
  - `campaign_name`
  - `ad_group_name`
  - `status`
  - `payload_json`
- Introduce canonical dimensions:
  - account
  - campaign
  - ad_group
  - ad
  - keyword
  - asset_group
  - asset
  - product
  - geo
  - device
  - audience
  - search_query
- Make `google_ads_query_dictionary` the canonical query dimension for hot/weekly/cluster tables.

Acceptance:
- search-intelligence readers resolve through typed dimensions
- payload blobs become archive-only
- critical read benchmarks do not show unexplained `p95` regression

## Shopify epic

Targets:
- Introduce dimensions:
  - shops
  - customers
  - products
  - variants
- Keep orders, refunds, transactions, returns, and sales events as ledger/fact tables.
- Move payload blobs and mutable status snapshots into archive/state lanes.
- Keep `shopify_serving_state` and `shopify_reconciliation_runs` as projection-only tables.

Acceptance:
- request-time reads no longer depend on warehouse payload blobs
- trust/projection reads remain stable
- overview/shopify contract unchanged

## Shared gates

- No passive `GET` write-on-read regression.
- No HTTP-triggered migrations.
- No authoritative dependence on raw payload JSON.
- Every slice ships with before/after compare and parity evidence.
