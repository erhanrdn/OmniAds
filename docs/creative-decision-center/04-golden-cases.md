# Golden Media-Buyer Cases

Machine-readable artifact: `docs/creative-decision-center/generated/golden-cases.json`

These are fixture-backed assertions for V2.1 implementation. They must become executable resolver/adapter tests before behavior changes.

| # | inputSummary | expectedPrimaryDecision | expectedBuyerAction | actionability | problemClass | priority | confidence | topReasonTag | maturity | fallback |
|---:|---|---|---|---|---|---|---|---|---|---|
| 1 | active ad + active campaign/adset + 24h spend 0 + impressions 0 | Diagnose | fix_delivery | diagnose | delivery | high | medium | active_no_spend_24h | learning | diagnose_data |
| 2 | no spend but campaign paused | Diagnose | diagnose_data | diagnose | campaign_context | medium | medium | campaign_or_adset_context_requires_review | learning | diagnose_data |
| 3 | adset paused | Diagnose | diagnose_data | diagnose | campaign_context | medium | medium | campaign_or_adset_context_requires_review | learning | diagnose_data |
| 4 | disapproved creative | Diagnose | fix_policy | diagnose | policy | high | high | disapproved_or_limited | learning | diagnose_data |
| 5 | limited delivery with reason | Diagnose | fix_policy | diagnose | policy | high | high | disapproved_or_limited | learning | diagnose_data |
| 6 | policy status unknown | Diagnose | diagnose_data | diagnose | data_quality | medium | low | missing_policy_status | learning | diagnose_data |
| 7 | new launch under 48h with low spend | Test More | watch_launch | review_only | launch_monitoring | medium | medium | new_launch_window | too_early | diagnose_data |
| 8 | new launch under 72h with enough spend but no purchase | Test More | watch_launch | review_only | launch_monitoring | high | medium | new_launch_window | learning | diagnose_data |
| 9 | new launch with severe overspend and no purchases | Test More | watch_launch | review_only | launch_monitoring | high | medium | new_launch_severe_spend_no_purchase | learning | diagnose_data |
| 10 | mature high-spend loser | Cut | cut | review_only | performance | high | high | severe_sustained_loser | mature | diagnose_data |
| 11 | mature high-confidence winner | Scale | scale | review_only | performance | high | high | strong_relative_winner | mature | diagnose_data |
| 12 | winner entering fatigue | Refresh | refresh | review_only | fatigue | high | high | fatigue_composite | mature | diagnose_data |
| 13 | CTR down but frequency flat and CPM flat | Test More | test_more | review_only | insufficient_signal | medium | medium | partial_fatigue_signal | actionable | diagnose_data |
| 14 | frequency up but CTR stable | Test More | test_more | review_only | insufficient_signal | medium | medium | partial_fatigue_signal | actionable | diagnose_data |
| 15 | CPM up but CPA/ROAS stable | Test More | test_more | review_only | insufficient_signal | medium | medium | partial_fatigue_signal | actionable | diagnose_data |
| 16 | benchmark missing | Diagnose | diagnose_data | diagnose | data_quality | medium | low | benchmark_context_not_strong | learning | diagnose_data |
| 17 | benchmark weak | Diagnose | diagnose_data | diagnose | data_quality | medium | low | benchmark_context_not_strong | learning | diagnose_data |
| 18 | stale data | Diagnose | diagnose_data | diagnose | data_quality | high | low | stale_data | learning | diagnose_data |
| 19 | attribution/truth missing | Diagnose | diagnose_data | diagnose | data_quality | high | low | truth_missing | learning | diagnose_data |
| 20 | tracking drop suspected | Diagnose | diagnose_data | diagnose | data_quality | high | low | truth_degraded | learning | diagnose_data |
| 21 | high priority but low confidence delivery issue | Diagnose | diagnose_data | diagnose | data_quality | high | low | missing_delivery_proof | learning | diagnose_data |
| 22 | low maturity but high priority policy issue | Diagnose | fix_policy | diagnose | policy | high | high | disapproved_or_limited | too_early | diagnose_data |
| 23 | mature data but low confidence due to attribution degradation | Diagnose | diagnose_data | diagnose | data_quality | high | low | truth_degraded | mature | diagnose_data |
| 24 | active creative with spend but zero impressions anomaly | Diagnose | diagnose_data | diagnose | data_quality | high | low | spend_without_impressions | learning | diagnose_data |
| 25 | high CTR but poor CVR / landing issue | Diagnose | diagnose_data | diagnose | performance | medium | medium | landing_or_cvr_issue | actionable | diagnose_data |
| 26 | strong ROAS but tiny spend, not mature | Test More | test_more | review_only | insufficient_signal | medium | medium | tiny_spend_winner | too_early | diagnose_data |
| 27 | strong CPA but low purchase count, not scalable yet | Test More | test_more | review_only | insufficient_signal | medium | medium | low_purchase_count | learning | diagnose_data |
| 28 | top 3 fatigue cluster | Refresh | refresh | review_only | fatigue | high | high | fatigue_composite | mature | diagnose_data |
| 29 | no new winner in 7 days | Protect | protect | review_only | performance | medium | medium | winner_gap_aggregate_only | mature | diagnose_data |
| 30 | approved but unused creative exists | Diagnose | diagnose_data | diagnose | campaign_context | medium | medium | unused_approved_aggregate_only | too_early | diagnose_data |
| 31 | family winner aging with no backup variants | Protect | protect | review_only | performance | medium | medium | backup_variant_aggregate_only | mature | diagnose_data |
| 32 | old challenger says scale_hard but V2 says Test More | Test More | test_more | review_only | insufficient_signal | medium | medium | low_evidence | learning | diagnose_data |
| 33 | operator surface says act_now but V2 says Diagnose | Diagnose | diagnose_data | diagnose | data_quality | high | low | truth_degraded | learning | diagnose_data |
| 34 | old V1 stable_winner maps to V2 Protect | Protect | protect | review_only | performance | medium | high | stable_winner | mature | diagnose_data |
| 35 | old V1 fatigued_winner maps to V2 Refresh | Refresh | refresh | review_only | fatigue | high | high | fatigue_composite | mature | diagnose_data |

Blunt requirement: PR 2 should add these as failing/locked tests before resolver behavior changes.

