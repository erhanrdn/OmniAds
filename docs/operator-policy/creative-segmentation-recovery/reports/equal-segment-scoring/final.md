# Equal-Segment Creative Decision Quality Audit

Date: 2026-04-24

Status: complete. Audit only; no Creative policy, threshold, UI, queue/apply/push, Commercial Truth, benchmark-scope, or old-rule behavior changed.

## Executive Result

The current Creative Decision OS scores **79/100** on the equal-segment macro score across represented expected segments. Raw overall accuracy is **79.2%** across 72 scored creatives.

This is a macro/per-segment evaluation, so large Watch or Not Enough Data populations do not hide weaker performance in smaller segments. Scale and Campaign Check were not represented by valid expected examples in this reviewed sample and receive no free credit.

## Scope

- readable live Meta businesses: 8
- sampled creatives: 78
- scored creatives: 72
- excluded authority/status rows: 6
- live audit generated at: 2026-04-24T19:54:23.523Z
- window: 2026-03-25 to 2026-04-23, last 30 completed days excluding today

PDFs were used only to identify pdf-company-01 and pdf-company-02 contexts. Metrics and labels come from current live runtime data, not screenshot OCR.

## Current Segment Counts

| Segment | Current count |
| --- | --- |
| Scale | 0 |
| Scale Review | 6 |
| Test More | 8 |
| Protect | 6 |
| Watch | 6 |
| Refresh | 20 |
| Retest | 2 |
| Cut | 11 |
| Campaign Check | 0 |
| Not Enough Data | 13 |

Non-taxonomy authority/status rows: {"Not eligible for evaluation":6}. These are reported but excluded from the main macro score.

## Per-Segment Score Table

| Segment | Status | Expected | Actual | Precision | Recall | Score |
| --- | --- | --- | --- | --- | --- | --- |
| Scale | not represented | 0 | 0 | n/a | n/a | n/a |
| Scale Review | represented | 7 | 6 | 100 | 85.7 | 92.3 |
| Test More | represented | 8 | 8 | 75 | 75 | 75 |
| Protect | represented | 5 | 6 | 83.3 | 100 | 90.9 |
| Watch | represented | 6 | 6 | 33.3 | 33.3 | 33.3 |
| Refresh | represented | 22 | 20 | 90 | 81.8 | 85.7 |
| Retest | represented | 2 | 2 | 100 | 100 | 100 |
| Cut | represented | 15 | 11 | 100 | 73.3 | 84.6 |
| Campaign Check | not represented | 0 | 0 | n/a | n/a | n/a |
| Not Enough Data | represented | 7 | 13 | 53.8 | 100 | 70 |

Weakest represented segments: Watch (33.3), Not Enough Data (70), Test More (75).

Strongest represented segments: Retest (100), Scale Review (92.3), Protect (90.9).

## Per-Business Summary

| Business | Reviewed rows | Raw accuracy | Macro within business | Mismatches | Actual segment distribution |
| --- | --- | --- | --- | --- | --- |
| company-01 | 10 | 90 | 75 | 1 | Scale Review: 3, Cut: 4, Not Enough Data: 1, Refresh: 2 |
| company-02 | 8 | 75 | 70 | 2 | Refresh: 3, Watch: 1, Cut: 1, Protect: 1, Not Enough Data: 2 |
| company-03 | 9 | 88.9 | 80 | 1 | Protect: 1, Not Enough Data: 3, Refresh: 4, Test More: 1 |
| company-04 | 5 | 80 | 83.3 | 1 | Watch: 1, Test More: 2, Not Enough Data: 2 |
| company-05 | 10 | 80 | 83.3 | 2 | Refresh: 5, Retest: 1, Protect: 2, Cut: 1, Watch: 1 |
| company-06 | 10 | 50 | 68.8 | 5 | Cut: 1, Watch: 1, Test More: 5, Not Enough Data: 3 |
| company-07 | 10 | 90 | 75 | 1 | Refresh: 6, Protect: 2, Cut: 1, Not Enough Data: 1 |
| company-08 | 10 | 80 | 81.3 | 2 | Cut: 3, Retest: 1, Watch: 2, Scale Review: 3, Not Enough Data: 1 |

## PDF Context Scores

- pdf-company-01 (company-01): 90/100 across 10 scored rows.
- pdf-company-02 (company-08): 80/100 across 10 scored rows.

## Top 10 Mismatches

| # | Row | Expected | Adsecute | Spend | ROAS | Purchases | Likely wrong gate | Reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | company-05/company-05-creative-09 | Cut | Watch | 27463.33 | 2.06 | 10 | Cut loser routing | Expected Cut: Mature below-baseline, trend-collapse, CPA-inefficient, or zero-purchase loser has enough evidence for cut review. Current Adsecute segment is Watch. |
| 2 | company-05/company-05-creative-10 | Cut | Refresh | 25717.4 | 2.52 | 9 | Cut loser routing | Expected Cut: Mature below-baseline, trend-collapse, CPA-inefficient, or zero-purchase loser has enough evidence for cut review. Current Adsecute segment is Refresh. |
| 3 | company-02/company-02-creative-02 | Cut | Refresh | 2341.48 | 2.54 | 20 | Cut loser routing | Expected Cut: Mature below-baseline, trend-collapse, CPA-inefficient, or zero-purchase loser has enough evidence for cut review. Current Adsecute segment is Refresh. |
| 4 | company-08/company-08-creative-05 | Cut | Watch | 1216.46 | 1.49 | 10 | Cut loser routing | Expected Cut: Mature below-baseline, trend-collapse, CPA-inefficient, or zero-purchase loser has enough evidence for cut review. Current Adsecute segment is Watch. |
| 5 | company-02/company-02-creative-06 | Scale Review | Protect | 311.93 | 7.63 | 13 | Scale Review admission | Expected Scale Review: Strong relative winner; business validation is missing or incomplete, so review-only. Current Adsecute segment is Protect. |
| 6 | company-06/company-06-creative-03 | Refresh | Test More | 88.73 | 5.46 | 7 | fatigue routing | Expected Refresh: Fatigue or replacement signal is the dominant operator action. Current Adsecute segment is Test More. |
| 7 | company-06/company-06-creative-06 | Refresh | Test More | 43.68 | 1.62 | 2 | fatigue routing | Expected Refresh: Fatigue or replacement signal is the dominant operator action. Current Adsecute segment is Test More. |
| 8 | company-06/company-06-creative-08 | Refresh | Not Enough Data | 34.7 | 1.13 | 1 | fatigue routing | Expected Refresh: Fatigue or replacement signal is the dominant operator action. Current Adsecute segment is Not Enough Data. |
| 9 | company-06/company-06-creative-09 | Refresh | Not Enough Data | 23.52 | 5.32 | 1 | fatigue routing | Expected Refresh: Fatigue or replacement signal is the dominant operator action. Current Adsecute segment is Not Enough Data. |
| 10 | company-08/company-08-creative-09 | Watch | Not Enough Data | 587.18 | 0.38 | 1 | Watch boundary | Expected Watch: Evidence is meaningful but not strong, weak, protected, fatigued, or contextual enough for a stronger label. Current Adsecute segment is Not Enough Data. |

## Most Common Wrong Gates

| Likely wrong gate | Rows |
| --- | --- |
| Watch boundary | 4 |
| Cut loser routing | 4 |
| fatigue routing | 4 |
| Test More admission | 2 |
| Scale Review admission | 1 |

## Product Risk Notes

- Severe Scale/Cut risk rows: 5. They are not overweighted in the macro score but remain product risks.
- Scale has no represented expected examples because no reviewed row had favorable business validation plus true scale evidence.
- Scale Review and Cut are represented and scored independently.

## Better Than Manual Table Reading?

Yes, with caveats. The current output is useful enough to pre-classify most reviewed rows into media-buyer actions. The main residual risk is concentrated in mature below-baseline rows that remain Watch/Refresh instead of Cut, and a few Protect/Scale Review boundary cases.

## Whether Another Implementation Pass Is Needed

A broad implementation pass is not justified from this audit alone. A narrow future pass is reasonable if Claude or operators confirm the top mismatch classes on live rows.

Exact first recommended fix if needed: inspect the remaining mature below-baseline Watch/Refresh rows and decide whether Cut admission should include them. Do not change Scale, taxonomy, or safety from this audit alone.
