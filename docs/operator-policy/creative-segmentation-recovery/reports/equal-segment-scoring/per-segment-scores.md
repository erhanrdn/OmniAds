# Equal-Segment Scores

Main score: **79/100** macro across represented expected segments. Raw accuracy: **79.2%**.

| Segment | Status | Expected | Actual | TP | FP | FN | Precision | Recall | Correctness | Score | Correct examples | Incorrect examples |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Scale | not represented | 0 | 0 | 0 | 0 | 0 | n/a | n/a | n/a | n/a | - | - |
| Scale Review | represented | 7 | 6 | 6 | 0 | 1 | 100 | 85.7 | 85.7 | 92.3 | company-01/company-01-creative-01, company-01/company-01-creative-02, company-01/company-01-creative-05 | company-02/company-02-creative-06: actual Protect |
| Test More | represented | 8 | 8 | 6 | 2 | 2 | 75 | 75 | 75 | 75 | company-03/company-03-creative-10, company-04/company-04-creative-02, company-04/company-04-creative-03 | company-04/company-04-creative-01: actual Watch; company-06/company-06-creative-02: actual Watch |
| Protect | represented | 5 | 6 | 5 | 1 | 0 | 83.3 | 100 | 100 | 90.9 | company-03/company-03-creative-01, company-05/company-05-creative-04, company-05/company-05-creative-06 | - |
| Watch | represented | 6 | 6 | 2 | 4 | 4 | 33.3 | 33.3 | 33.3 | 33.3 | company-02/company-02-creative-03, company-08/company-08-creative-04 | company-01/company-01-creative-08: actual Not Enough Data; company-03/company-03-creative-02: actual Not Enough Data; company-07/company-07-creative-08: actual Not Enough Data |
| Refresh | represented | 22 | 20 | 18 | 2 | 4 | 90 | 81.8 | 81.8 | 85.7 | company-01/company-01-creative-09, company-01/company-01-creative-10, company-02/company-02-creative-01 | company-06/company-06-creative-03: actual Test More; company-06/company-06-creative-06: actual Test More; company-06/company-06-creative-08: actual Not Enough Data |
| Retest | represented | 2 | 2 | 2 | 0 | 0 | 100 | 100 | 100 | 100 | company-05/company-05-creative-02, company-08/company-08-creative-02 | - |
| Cut | represented | 15 | 11 | 11 | 0 | 4 | 100 | 73.3 | 73.3 | 84.6 | company-01/company-01-creative-03, company-01/company-01-creative-04, company-01/company-01-creative-06 | company-02/company-02-creative-02: actual Refresh; company-05/company-05-creative-09: actual Watch; company-05/company-05-creative-10: actual Refresh |
| Campaign Check | not represented | 0 | 0 | 0 | 0 | 0 | n/a | n/a | n/a | n/a | - | - |
| Not Enough Data | represented | 7 | 13 | 7 | 6 | 0 | 53.8 | 100 | 100 | 70 | company-02/company-02-creative-07, company-02/company-02-creative-08, company-03/company-03-creative-03 | - |

## Expected Segment Counts

| Expected segment | Rows |
| --- | --- |
| Scale | 0 |
| Scale Review | 7 |
| Test More | 8 |
| Protect | 5 |
| Watch | 6 |
| Refresh | 22 |
| Retest | 2 |
| Cut | 15 |
| Campaign Check | 0 |
| Not Enough Data | 7 |
