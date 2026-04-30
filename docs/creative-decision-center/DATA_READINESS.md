# Data Readiness

Status: framework plus known risks. Live data coverage is TODO unless a read-only snapshot/DB audit is run.

Known facts to preserve unless repo evidence proves otherwise:

- V2 input lacks `ctr`, `cpm`, `frequency`, `firstSeenAt`, `firstSpendAt`, `reviewStatus`, `disapprovalReason`, `limitedReason`, and `spend24h`.
- Therefore `fix_delivery`, `fix_policy`, `watch_launch`, and reliable fatigue require data enrichment before confident emission.
- If required data is missing, fallback to `diagnose_data` or cap confidence.
- `brief_variation` requires family grouping / supply / backlog / winner gap data and should be aggregate only.

## Buyer Actions

| action | requiredData | currentlyAvailable | whereAvailable | missingFields | likelyDataSource | safeFallbackIfMissing | canMVPEmit | confidenceImpact |
|---|---|---|---|---|---|---|---|---|
| scale | spend, purchases, CPA/ROAS, target or benchmark, truth, maturity | partial | V1/V2 metrics, commercial truth partial | target source, freshness, attribution quality | business target config, snapshot trust | test_more / diagnose_data | conditional | cap if target/benchmark/truth weak |
| cut | mature spend, CPA/ROAS vs target, no recovery, truth | partial | V1/V2 metrics | target source, maturity, freshness | commercial truth, historical windows | diagnose_data | conditional | no high-confidence cut without maturity/truth |
| refresh | CTR/CPM/frequency trend, fatigue proof, winner context | partial | V1 fatigue/historical windows | explicit `ctr`, `cpm`, `frequency` trend fields in V2 input | historical feature enrichment | test_more / diagnose_data | conditional | single-metric fatigue is low confidence |
| protect | stable winner, adequate history, no blockers | partial | V1 lifecycle/operator, V2 Protect | freshness/target context | V1/V2 + trust | test_more / diagnose_data | conditional | cap if benchmark weak |
| test_more | low maturity/insufficient signal | yes/partial | V1/V2/scoring | none critical | current metrics | diagnose_data if stale | yes | safe default |
| watch_launch | firstSeenAt/firstSpendAt/launch age, early spend/purchase | partial/no | launchDate only if present | firstSeenAt, firstSpendAt, launch basis | Meta ad created_time + earliest spend insight | diagnose_data | conditional | cannot be high confidence without launch basis |
| fix_delivery | active ad/campaign/adset + 24h no spend/impressions | no/partial | campaign/adset context partial | ad status, spend24h, impressions24h | Meta ad/adset/campaign status + 24h insights | diagnose_data | no until enriched | must not emit without proof |
| fix_policy | review/effective status + disapproval/limited reason | no/partial | status filter may exist, reason fields unknown | reviewStatus, effectiveStatus, disapprovalReason, limitedReason | Meta ad/ad creative review fields | diagnose_data | no until enriched | must not emit without proof |
| diagnose_data | missing required data, stale data, truth issue | partial | trust/provenance/snapshot | per-row freshness and missingData summary | snapshot/source health | diagnose_data | yes | honest fallback |

## Aggregate Actions

| action | requiredData | currentlyAvailable | whereAvailable | missingFields | likelyDataSource | safeFallbackIfMissing | canMVPEmit | confidenceImpact |
|---|---|---|---|---|---|---|---|---|
| brief_variation | family winner/fatigue, no backup, backlog/supply | partial/no | V1 family/supply plan partial | backlog, production status, backup variants | creative ops data + V1 family | disable aggregate | conditional/low | high false positive risk |
| creative_supply_warning | creative supply/backlog/winner gap | no | unknown | backlog, recent launches, production state | planning/ops system | disable aggregate | no | cannot be confident |
| winner_gap | last winner date | no/partial | historical snapshots if available | explicit last winner date | historical decision snapshots | disable aggregate | no until derived | avoid fake supply alarm |
| fatigue_cluster | top N fatigue proof | partial | V1 fatigue/historical metrics | top N definition, trend fields | feature enrichment | disable/low confidence | conditional | composite proof required |
| unused_approved_creatives | approved status + no delivery | no | unknown | effectiveStatus/reviewStatus + zero delivery proof | Meta status + insights | disable aggregate | no | must not infer from spend alone |

