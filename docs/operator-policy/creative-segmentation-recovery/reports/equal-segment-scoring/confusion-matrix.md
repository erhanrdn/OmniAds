# Equal-Segment Confusion Matrix

Rows are expected media-buyer segments. Columns are current Adsecute segments.

| Expected / Actual | Scale | Scale Review | Test More | Protect | Watch | Refresh | Retest | Cut | Campaign Check | Not Enough Data |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Scale Review | 0 | 6 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| Test More | 0 | 0 | 6 | 0 | 2 | 0 | 0 | 0 | 0 | 0 |
| Protect | 0 | 0 | 0 | 5 | 0 | 0 | 0 | 0 | 0 | 0 |
| Watch | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 4 |
| Refresh | 0 | 0 | 2 | 0 | 0 | 18 | 0 | 0 | 0 | 2 |
| Retest | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 0 |
| Cut | 0 | 0 | 0 | 0 | 2 | 2 | 0 | 11 | 0 | 0 |
| Not Enough Data | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 7 |

## Most Frequent Confusions

| # | Row | Expected | Actual | Business impact |
| --- | --- | --- | --- | --- |
| 1 | company-05/company-05-creative-09 | Cut | Watch | Expected Cut: Mature below-baseline, trend-collapse, CPA-inefficient, or zero-purchase loser has enough evidence for cut review. Current Adsecute segment is Watch. |
| 2 | company-05/company-05-creative-10 | Cut | Refresh | Expected Cut: Mature below-baseline, trend-collapse, CPA-inefficient, or zero-purchase loser has enough evidence for cut review. Current Adsecute segment is Refresh. |
| 3 | company-02/company-02-creative-02 | Cut | Refresh | Expected Cut: Mature below-baseline, trend-collapse, CPA-inefficient, or zero-purchase loser has enough evidence for cut review. Current Adsecute segment is Refresh. |
| 4 | company-08/company-08-creative-05 | Cut | Watch | Expected Cut: Mature below-baseline, trend-collapse, CPA-inefficient, or zero-purchase loser has enough evidence for cut review. Current Adsecute segment is Watch. |
| 5 | company-02/company-02-creative-06 | Scale Review | Protect | Expected Scale Review: Strong relative winner; business validation is missing or incomplete, so review-only. Current Adsecute segment is Protect. |
| 6 | company-06/company-06-creative-03 | Refresh | Test More | Expected Refresh: Fatigue or replacement signal is the dominant operator action. Current Adsecute segment is Test More. |
| 7 | company-06/company-06-creative-06 | Refresh | Test More | Expected Refresh: Fatigue or replacement signal is the dominant operator action. Current Adsecute segment is Test More. |
| 8 | company-06/company-06-creative-08 | Refresh | Not Enough Data | Expected Refresh: Fatigue or replacement signal is the dominant operator action. Current Adsecute segment is Not Enough Data. |
| 9 | company-06/company-06-creative-09 | Refresh | Not Enough Data | Expected Refresh: Fatigue or replacement signal is the dominant operator action. Current Adsecute segment is Not Enough Data. |
| 10 | company-08/company-08-creative-09 | Watch | Not Enough Data | Expected Watch: Evidence is meaningful but not strong, weak, protected, fatigued, or contextual enough for a stronger label. Current Adsecute segment is Not Enough Data. |

## Business Impact

Scale and Cut confusions are not overweighted in the macro score, but they remain high-severity risks. Severe-risk mismatch count: 5.
