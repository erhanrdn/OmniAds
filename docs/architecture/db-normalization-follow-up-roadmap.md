# DB Normalization Follow-Up Roadmap

Normalization is closed. This document is now a historical summary of the completed closeout work and the non-blocking follow-ups that sit outside the normalization verdict.

## Meta epic

Completed:
- Split `meta_campaign_daily` and `meta_adset_daily` config fields out of the fact tables.
- Added typed dimensions for campaigns and ad sets.
- Added typed campaign and adset config history tables.
- Moved `meta_ad_daily` and `meta_creative_daily` request-time dependencies off `payload_json`.
- Kept request contracts unchanged.
- Final closeout uses the gate-led readiness policy in `docs/architecture/meta-short-gate-readiness-note.md`; current same-build gate/smoke/parity are clean, while the fresh benchmark regression is tracked as a non-blocking operational caveat.
- Meta is not an open normalization blocker.

## Google Ads epic

Completed:
- Split `google_ads_*_daily` tables into metric facts plus entity dimensions.
- Removed request-time dependence on `campaign_name`, `ad_group_name`, `status`, and `payload_json`.
- Added canonical dimensions for account, campaign, ad_group, ad, keyword, asset_group, asset, product, geo, device, audience, and search_query.
- Promoted `google_ads_query_dictionary` to the canonical query dimension for hot/weekly/cluster tables.
- Kept search-intelligence reader contracts stable.
- Google Ads short gate is closed. Google Ads is not an open normalization blocker.

## Shopify epic

Completed:
- Closed the Shopify cleanup cutover.
- Moved fact payload blobs and mutable webhook/repair/sync detail into archive/state lanes.
- Kept Shopify request-time summary reads projection-backed and read-only.
- Added Shopify dimensions for shops, customers, products, and variants.
- Kept `shopify_serving_state` and `shopify_reconciliation_runs` as projection/state tables.
- Dropped inline legacy payload/detail columns from live Shopify fact/control tables.
- Shopify is not an open normalization blocker.

## Shared gates

- No passive `GET` write-on-read regression.
- No HTTP-triggered migrations.
- No authoritative dependence on raw payload JSON.
- Every slice shipped with before/after compare and parity evidence.
- No active repair recommendations remain in the accepted closeout state.

## Residual non-normalization follow-up

- Future work in this area is limited to routine product, performance, or architectural cleanup outside the accepted normalization closeout.
