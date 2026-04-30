# Golden Media-Buyer Cases

These cases must become executable fixtures before resolver behavior changes. Do not only test `buyerAction`; each case asserts confidence, priority, problemClass, maturity, and top reason tag.

| caseId | inputSummary | expectedPrimaryDecision | expectedBuyerAction | expectedActionability | expectedProblemClass | expectedPriorityBand | expectedConfidenceBand | expectedTopReasonTag | expectedMaturity | expectedSafeFallbackIfDataMissing |
|---|---|---|---|---|---|---|---|---|---|---|
| GC-001 | active ad + active campaign/adset + 24h spend 0 + impressions 0 | Diagnose | fix_delivery | diagnose | delivery | high | medium | active_no_spend_24h | learning | diagnose_data |
| GC-002 | no spend but campaign paused | Diagnose | diagnose_data | diagnose | campaign_context | medium | medium | campaign_paused | learning | diagnose_data |
| GC-003 | adset paused | Diagnose | diagnose_data | diagnose | campaign_context | medium | medium | adset_paused | learning | diagnose_data |
| GC-004 | disapproved creative | Diagnose | fix_policy | diagnose | policy | high | high | disapproved_or_limited | learning | diagnose_data |
| GC-005 | limited delivery with reason | Diagnose | fix_policy | diagnose | policy | high | high | disapproved_or_limited | learning | diagnose_data |
| GC-006 | policy status unknown | Diagnose | diagnose_data | diagnose | data_quality | medium | low | missing_policy_status | learning | diagnose_data |
| GC-007 | new launch under 48h with low spend | Test More | watch_launch | review_only | launch_monitoring | medium | medium | new_launch_window | too_early | diagnose_data |
| GC-008 | new launch under 72h with enough spend but no purchase | Test More | watch_launch | review_only | launch_monitoring | high | medium | new_launch_window | learning | diagnose_data |
| GC-009 | new launch with severe overspend and no purchases | Test More | watch_launch | review_only | launch_monitoring | high | medium | new_launch_severe_spend_no_purchase | learning | diagnose_data |
| GC-010 | mature high-spend loser | Cut | cut | review_only | performance | high | high | severe_sustained_loser | mature | diagnose_data |
| GC-011 | mature high-confidence winner | Scale | scale | review_only | performance | high | high | strong_relative_winner | mature | diagnose_data |
| GC-012 | winner entering fatigue | Refresh | refresh | review_only | fatigue | high | high | fatigue_composite | mature | diagnose_data |
| GC-013 | CTR down but frequency flat and CPM flat | Test More | test_more | review_only | insufficient_signal | medium | medium | partial_fatigue_signal | actionable | diagnose_data |
| GC-014 | frequency up but CTR stable | Test More | test_more | review_only | insufficient_signal | medium | medium | partial_fatigue_signal | actionable | diagnose_data |
| GC-015 | CPM up but CPA/ROAS stable | Test More | test_more | review_only | insufficient_signal | medium | medium | partial_fatigue_signal | actionable | diagnose_data |
| GC-016 | benchmark missing | Diagnose | diagnose_data | diagnose | data_quality | medium | low | benchmark_missing | learning | diagnose_data |
| GC-017 | benchmark weak | Diagnose | diagnose_data | diagnose | data_quality | medium | low | weak_benchmark | learning | diagnose_data |
| GC-018 | stale data | Diagnose | diagnose_data | diagnose | data_quality | high | low | stale_data | learning | diagnose_data |
| GC-019 | attribution/truth missing | Diagnose | diagnose_data | diagnose | data_quality | high | low | truth_missing | learning | diagnose_data |
| GC-020 | tracking drop suspected | Diagnose | diagnose_data | diagnose | data_quality | high | low | tracking_drop_suspected | learning | diagnose_data |
| GC-021 | high priority but low confidence delivery issue | Diagnose | diagnose_data | diagnose | data_quality | high | low | missing_delivery_proof | learning | diagnose_data |
| GC-022 | low maturity but high priority policy issue | Diagnose | fix_policy | diagnose | policy | high | high | disapproved_or_limited | too_early | diagnose_data |
| GC-023 | mature data but low confidence due to attribution degradation | Diagnose | diagnose_data | diagnose | data_quality | high | low | truth_degraded | mature | diagnose_data |
| GC-024 | active creative with spend but zero impressions anomaly | Diagnose | diagnose_data | diagnose | data_quality | high | low | spend_without_impressions | learning | diagnose_data |
| GC-025 | high CTR but poor CVR / landing issue | Diagnose | diagnose_data | diagnose | performance | medium | medium | landing_or_cvr_issue | actionable | diagnose_data |
| GC-026 | strong ROAS but tiny spend, not mature | Test More | test_more | review_only | insufficient_signal | medium | medium | tiny_spend_winner | too_early | diagnose_data |
| GC-027 | strong CPA but low purchase count, not scalable yet | Test More | test_more | review_only | insufficient_signal | medium | medium | low_purchase_count | learning | diagnose_data |
| GC-028 | top 3 fatigue cluster | Refresh | refresh | review_only | fatigue | high | high | fatigue_composite | mature | diagnose_data |
| GC-029 | no new winner in 7 days | Protect | protect | review_only | performance | medium | medium | winner_gap_aggregate_only | mature | disable_aggregate |
| GC-030 | approved but unused creative exists | Diagnose | diagnose_data | diagnose | campaign_context | medium | medium | unused_approved_aggregate_only | too_early | disable_aggregate |
| GC-031 | family winner aging with no backup variants | Protect | protect | review_only | performance | medium | medium | backup_variant_aggregate_only | mature | disable_aggregate |
| GC-032 | old challenger says scale_hard but V2 says Test More | Test More | test_more | review_only | insufficient_signal | medium | medium | low_evidence | learning | diagnose_data |
| GC-033 | operator surface says act_now but V2 says Diagnose | Diagnose | diagnose_data | diagnose | data_quality | high | low | truth_degraded | learning | diagnose_data |
| GC-034 | old V1 stable_winner maps to V2 Protect | Protect | protect | review_only | performance | medium | high | stable_winner | mature | diagnose_data |
| GC-035 | old V1 fatigued_winner maps to V2 Refresh | Refresh | refresh | review_only | fatigue | high | high | fatigue_composite | mature | diagnose_data |

## Case Notes

- GC-001 proves `fix_delivery` requires active ad, active campaign/adset, zero spend, and zero impressions proof.
- GC-002 proves a paused campaign must become campaign context / `diagnose_data`, not `fix_delivery`.
- GC-003 proves a paused adset must not be treated as a delivery failure.
- GC-004 proves disapproval is a policy blocker before performance.
- GC-005 proves limited delivery with a reason can become `fix_policy`.
- GC-006 proves unknown policy status cannot become confident `fix_policy`.
- GC-007 proves low-spend new launches should stay in launch monitoring.
- GC-008 proves early no-purchase data is not enough for hard cut without maturity.
- GC-009 proves severe early spend still needs an explicit severe-loss rule before hard cut.
- GC-010 proves mature high-spend losers can map to `Cut` / `cut`.
- GC-011 proves mature high-confidence winners can map to `Scale` / `scale`.
- GC-012 proves composite fatigue maps to `Refresh` / `refresh`.
- GC-013 proves CTR drop alone is not enough for confident fatigue.
- GC-014 proves frequency increase alone is not enough for confident fatigue.
- GC-015 proves CPM increase alone is not enough for confident fatigue.
- GC-016 proves missing benchmark forces `diagnose_data` or confidence cap.
- GC-017 proves weak benchmark prevents high-confidence scale/cut.
- GC-018 proves stale data blocks hard confident actions.
- GC-019 proves missing attribution/truth blocks performance confidence.
- GC-020 proves suspected tracking drop is data quality first.
- GC-021 proves high priority can still be low confidence when delivery proof is missing.
- GC-022 proves low maturity can still be high priority when policy proof exists.
- GC-023 proves mature data can still be low confidence if attribution is degraded.
- GC-024 proves spend-without-impressions anomaly is data quality, not performance.
- GC-025 proves landing/CVR issues should be diagnosed rather than disguised as creative failure.
- GC-026 proves strong ROAS at tiny spend is not scalable yet.
- GC-027 proves strong CPA with low purchase count is not scalable yet.
- GC-028 proves fatigue clusters are aggregate-sensitive and need composite proof.
- GC-029 proves winner gaps are aggregate-only and should not force a random row action.
- GC-030 proves approved-but-unused creatives are aggregate-only until launch/delivery linkage exists.
- GC-031 proves backup variant gaps are family-level unless a true primary creative exists.
- GC-032 proves old challenger aggressiveness should become regression context, not authority.
- GC-033 proves operator urgency must not override V2 data-quality diagnosis.
- GC-034 proves V1 `stable_winner` maps to V2 `Protect`.
- GC-035 proves V1 `fatigued_winner` maps to V2 `Refresh`.

## Fixture Requirements

- Every executable fixture must include the expected engine primary decision.
- Every executable fixture must include the expected buyer-facing action.
- Every executable fixture must include actionability, problem class, priority, confidence, maturity, and top reason tag.
- Every fixture with missing required data must assert the safe fallback.
- Aggregate-only cases must assert that no row-level `brief_variation` is emitted.
- These cases are required before resolver behavior changes.
