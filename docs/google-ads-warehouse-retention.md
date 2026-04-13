# Google Ads Warehouse Retention

## Why retention is tiered

Google Ads data does not have one uniform storage value across all grains.

- Core daily facts are the durable operating history. They support trend baselines, business review, decision validation, and longitudinal pacing analysis.
- Breakdown daily facts remain useful, but their operational half-life is shorter because geo, device, audience, ad-group, and asset-group detail is mostly used for diagnosis and tactical tuning.
- Creative/ad/asset detail changes quickly and is expensive at full history. It is most useful in recent windows while assets are still active.
- Raw search-term facts are extremely high-cardinality. They are valuable hot, but not as two-year row-level storage.
- Top-query weekly aggregates preserve durable search demand evidence at much lower storage cost.
- Search cluster/theme aggregates preserve the durable intelligence layer that the product actually needs for decisioning.
- Change/action/outcome logs need longer retention because operators need to compare recommendations, actions, and outcomes over time.

## Approved retention targets

- Core daily: 25 months
- Breakdown daily (geo/device/audience/adgroup/asset-group): 13 months
- Creative/ad/asset daily: 180 days
- Raw search terms daily hot: 120 days (`google_ads_search_query_hot_daily`, `google_ads_search_term_daily`)
- Top queries weekly: 365 days
- Search cluster/theme aggregate: 25 months
- Change/action/outcome log: 25 months

## Why raw search terms are not kept hot for 2 years

Raw search terms have the worst storage pressure in the Google Ads warehouse:

- full query text repeats heavily
- row counts scale quickly with campaign breadth
- most long-tail rows lose direct operator value after recent governance windows
- keeping them hot for two years would preserve cost, not product value

The product does still need long-range search intelligence. The answer is not two-year raw hot storage. The answer is:

- short-horizon raw search-term hot storage
- durable normalized query dictionary
- weekly top-query aggregates
- durable search cluster/theme aggregates

That preserves the intelligence layer while reducing repeated raw-text pressure.

## Hot / warm / cold strategy

- Hot:
  - raw search-term daily hot table for the recent 120-day operating horizon (`google_ads_search_query_hot_daily`, `google_ads_search_term_daily`)
  - creative/ad/asset daily for recent optimization cycles
- Warm:
  - core daily
  - breakdown daily
  - top-query weekly
  - search cluster/theme aggregate
  - decision action/outcome log
- Cold:
  future archival or external export strategy for raw payloads and long-tail historical search detail

Phase 3 does not implement archival export. It establishes the hot/warm foundation, completes the Google search-intelligence serving cutover, and leaves retention execution in dry-run/off posture.

## Raw query storage vs cluster/theme intelligence

These are intentionally different layers.

- Raw query storage keeps row-level search-term evidence for recent inspection and debugging.
- Query dictionary normalizes repeated text and provides a durable query identity.
- Top-query weekly aggregate preserves durable winning and losing query demand at much lower cardinality.
- Search cluster/theme aggregate preserves the product-facing intelligence layer used by decisions and future governance systems.

The cluster/theme layer is not a lossy replacement for all raw data. It is the long-horizon intelligence surface.

## Phase 3 completion

Google Phase 3 is now complete.

- `google_ads_search_term_daily` remains readable only as a raw/debug/inspection surface.
- Raw search-term behavior is explicitly limited to the most recent `120` days.
- Canonical search intelligence now reads from the additive intelligence layer:
  - `google_ads_search_query_hot_daily` for hot query rows
  - `google_ads_top_query_weekly` for longer-range query fallback
  - `google_ads_search_cluster_daily` for daily semantic cluster support
- Google status and advisor-support coverage now read additive search-intelligence coverage instead of treating raw `google_ads_search_term_daily` as the intelligence source.
- Sync continues to write the additive search-intelligence tables alongside the raw hot/debug table.
- Retention execution remains behind an explicit disabled-by-default gate.

## Current advisor readiness contract

Advisor readiness remains intentionally conservative even after the serving cutover.

- Decision Snapshot readiness is still gated by recent 84-day support coverage.
- The required surfaces are `campaign_daily`, `search_term_daily`, and `product_daily`.
- For the search surface, that recent support now comes from additive search-intelligence coverage rather than raw two-year `google_ads_search_term_daily` history.
- The retention policy defined in this document still does not by itself enable destructive cleanup.
- The selected range remains contextual for the operator UI and does not redefine decision readiness.

## Explicit non-goals for Phase 3

- No destructive cleanup execution
- No silent deletion of historical data
- No major UI redesign
- No Phase 4 query-governance guardrail rewrite
- No warehouse partition rewrite
- No claim that archival/cold storage is fully implemented
- No broad legacy cleanup beyond the Google search-intelligence cutover

## Future work after Phase 3

- Google Phase 4: retention enforcement dry-run/canary rollout
- Prove there is no remaining `>120d` dependency on `google_ads_search_term_daily`
- Add explicit retention execution jobs with dry-run observability and canary verification
- Backfill dictionary/hash references for legacy search-term history if needed
- Consolidate advisor memory and execution logs into a fuller decision action/outcome lineage model
- Define archival strategy for raw payloads and non-hot search detail
