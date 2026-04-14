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

Phases 3 and 4 do not implement archival export. They establish the hot/warm foundation, complete the Google search-intelligence serving cutover, harden delete-safety proof, and keep retention execution in dry-run/off posture.

## Global posture

- Google retention behavior is one global contract across all businesses.
- `GOOGLE_ADS_RETENTION_EXECUTION_ENABLED` is the only destructive execution gate.
- Business-by-business rollout is not the preferred operating model.
- Scoped verification commands may inspect a single business, but they do not define a separate rollout posture.
- The DB server changed and the Google warehouse is rebuilding from provider APIs, so cold bootstrap, backfill, quota pressure, and partial upstream coverage are first-class operator truth.

## Global rebuild truth review workflow

Google rebuild review is now part of one shared operator workflow across providers.

1. Open `/admin/sync-health`.
2. Read `Global rebuild truth review`.
3. Inspect the Google block first for:
   - execution posture
   - `cold_bootstrap`
   - `backfill_in_progress`
   - `quota_limited`
   - `partial_upstream_coverage`
   - `blocked`
   - `ready`
4. For business-scoped drilldown, open `/api/google-ads/status?businessId=<businessId>` and inspect `operatorTruth.rebuild`.

Interpretation rules stay conservative:

- some rows existing is not strong readiness by itself
- sparse rebuilt coverage must not be mistaken for full historical support
- quota pressure remains operator truth even when recent rows are present
- partial upstream coverage remains operator truth even when core rows look usable

Use `npm run google:ads:product-gate -- <businessId>` or `npm run google:ads:retention-canary -- <businessId>` only as scoped proof paths after reading the global review, not as a business-by-business rollout ladder.

## Global Execution Readiness Gate

Google now contributes to one shared global execution-readiness gate for stronger execution or stronger warehouse trust.

Read it on `/admin/sync-health` under `globalRebuildReview.executionReadiness`.

Google holds the gate back when the global review still reports:

- `blocked`
- `quota_limited`
- `cold_bootstrap`
- `backfill_in_progress`
- `partial_upstream_coverage`

Interpretation:

- `not_ready`
  - Google or Meta still reports hard blockers that make stronger posture dishonest
- `conditionally_ready`
  - hard blockers are cleared, but some evidence such as partial coverage still keeps the gate from being fully ready
- `ready`
  - Google is no longer holding the global gate back

This gate does not change execution by itself:

- `GOOGLE_ADS_RETENTION_EXECUTION_ENABLED` remains the only destructive Google execution gate
- Google drilldown remains business-scoped because the data is business-scoped
- the decision about stronger posture remains one global manual contract

## Explicit execution posture review workflow

After reading the gate, use the additive operator review artifact:

1. Run `npm run ops:execution-readiness-review` or inspect `globalRebuildReview.executionPostureReview` on `/admin/sync-health`.
2. Treat the decision literally:
   - `no_go`
     - the global gate is still too weak for stronger posture
   - `hold_manual`
     - hard blockers are cleared, but missing evidence still keeps the system in the current manual posture
   - `eligible_for_explicit_review`
     - Google is no longer holding the global review back
     - operators may consider whether stronger posture should be reviewed next
     - this still does not auto-enable execution
3. Use the review to see:
   - current gate state
   - dominant blockers
   - missing evidence
   - current control posture
   - what must remain manual
   - what is forbidden even if the gate is `ready`

`ready` and `eligible_for_explicit_review` remain separate from enablement:

- `GOOGLE_ADS_RETENTION_EXECUTION_ENABLED` still stays explicit
- `META_RETENTION_EXECUTION_ENABLED` still stays explicit
- provider drilldown still explains the global decision instead of redefining it per business

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

## Phase 4 completion

Google Phase 4 is now complete.

- Google serving, status, product-gate, admin sync-health, and advisor-readiness tooling now assume raw `google_ads_search_term_daily` older than `120` days may be absent.
- Canonical search support remains additive-backed:
  - hot query rows from `google_ads_search_query_hot_daily`
  - weekly query fallback from `google_ads_top_query_weekly`
  - daily semantic cluster support from `google_ads_search_cluster_daily`
- Admin/product-gate recent search readiness now reads additive search-intelligence coverage instead of requiring raw search-term row presence.
- Retention dry-run rows now record what would be deleted and what would remain per table:
  - `eligibleRows`
  - `oldestEligibleValue`
  - `newestEligibleValue`
  - `retainedRows`
  - `latestRetainedValue`
- `/api/google-ads/status` now exposes a dedicated retention block with latest raw-hot-table dry-run stats and the explicit scoped verification command.
- `npm run google:ads:product-gate -- <businessId>` now surfaces the same raw-hot-table dry-run posture in operator-readable text.
- `npm run google:ads:retention-canary -- <businessId>` remains the explicit scoped verification path for raw search-term cleanup.

## Current advisor readiness contract

Advisor readiness remains intentionally conservative even after the serving cutover.

- Decision Snapshot readiness is still gated by recent 84-day support coverage.
- The required surfaces are `campaign_daily`, `search_term_daily`, and `product_daily`.
- For the search surface, that recent support now comes from additive search-intelligence coverage rather than raw two-year `google_ads_search_term_daily` history.
- The retention policy defined in this document still does not by itself enable destructive cleanup.
- The selected range remains contextual for the operator UI and does not redefine decision readiness.
- `/api/google-ads/status.operatorTruth` now distinguishes:
  - `cold_bootstrap`
  - `backfill_in_progress`
  - `quota_limited`
  - `partial_upstream_coverage`
  - true `blocked` states

## Explicit non-goals after Phase 4

- No destructive cleanup execution
- No silent deletion of historical data
- No major UI redesign
- No global enablement of `GOOGLE_ADS_RETENTION_EXECUTION_ENABLED`
- No automatic execute-mode business-specific delete posture
- No warehouse partition rewrite
- No claim that archival/cold storage is fully implemented
- No broad legacy cleanup beyond the Google search-intelligence cutover

## Delete-safety proof now present

- `GET /api/google-ads/search-intelligence` and advisor search support stay aggregate-backed when a requested window falls outside the raw `120` day hot window.
- `GET /api/google-ads/status` recent search coverage reads additive search-intelligence coverage, not long-history raw row counts.
- `/admin/sync-health` and `google:ads:product-gate` now use additive recent search coverage for Google operational readiness.
- `npm run google:ads:advisor-readiness -- <businessId> <startDate> <endDate>` now checks additive search-intelligence coverage for the `search_term_daily` requirement.
- `npm run google:ads:retention-canary -- <businessId>` explicitly verifies:
  - raw search terms remain empty outside the hot window
  - historical search intelligence stays aggregate-backed
  - recent advisor support still has `84` additive-backed days

## Dry-run observability

- The scheduled Google retention runtime still defaults to `dry_run`.
- `google_ads_retention_runs.summary_json.rows` now records per-table delete candidates and retained-row posture, with special operator focus on:
  - `google_ads_search_term_daily`
  - `google_ads_search_query_hot_daily`
- `/api/google-ads/status` exposes the latest raw-hot-table dry-run stats under `retention`.
- `google:ads:product-gate` prints the latest raw-hot-table dry-run stats plus the scoped verification command.
- Execution remains disabled by default unless `GOOGLE_ADS_RETENTION_EXECUTION_ENABLED=true` is explicitly supplied.
- Rebuild honesty matters while the new DB server catches up:
  - sparse warehouse rows are not treated as healthy long-history truth
  - quota-limited fetch pressure is surfaced explicitly
  - partial upstream coverage is not collapsed into ready/healthy wording

## Deferred after Phase 4

- explicit operator-approved global execute review
- global enablement of destructive Google retention
- archival strategy for raw payloads and non-hot search detail
- broader legacy cleanup outside the touched Google search-intelligence and operational reporting paths
- cross-provider follow-up now shifts to Meta Phase 7 executor cutover in the master plan
