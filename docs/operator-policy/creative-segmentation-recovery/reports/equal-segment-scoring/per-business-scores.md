# Equal-Segment Per-Business Scores

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

## Notes

Per-business macro is averaged across expected segments represented inside that business only. The main score remains the global equal-segment macro score.
