# Happy Harbor - Codex Rating Notes

## Process

- Generated at: 2026-04-28T17:54:18.213Z
- Rated rows: 200
- Sample hash: `a62235a29e3f6b75f678b2d223e4be1d8d6a750b317e604d82b98262aabac69c`
- Rating input was `sample-200.json`: Adsecute row-level label fields were HMAC-only, and generated Adsecute instruction/reason text was omitted.
- One source row inspected during schema discovery was excluded from the 200-row sample before rating.
- Plain labels were handled programmatically only for mask/reveal generation; Codex rating used the independent metric/baseline/context rule in `scripts/happy-harbor-faz-a.ts`.

## Thresholds Used

- Test winner: enough spend/purchase maturity, ROAS >= 1.2, and benchmark-relative ROAS >= 1.2; exceptional winners require stronger relative lift.
- Scale phase: active creative with spend at least 2x peer median and purchases >= 8.
- Inconclusive: spend < $50 or purchases < 3.
- Fatiguing: recent7 ROAS / long90 ROAS < 0.7.
- Missing commercial truth or non-favorable validation changes readiness to `needs_review`; source/context blockers change readiness to `blocked` and action to `diagnose`.

## Intra-Rater Consistency

- Randomization method: deterministic SHA-256 order over rowId, prefix `intra:`.
- Re-rated rows: 20
- Exact matches on phase + headline + action + actionReadiness: 20/20
- Consistency: 100%

| Re-rated rowId | Match |
| --- | --- |
| company-08\|company-08-account-02\|company-08-campaign-03\|company-08-adset-05\|company-08-creative-05 | yes |
| company-05\|company-05-account-02\|company-05-campaign-06\|company-05-adset-05\|company-05-creative-23 | yes |
| company-02\|company-02-account-01\|company-02-campaign-02\|company-02-adset-02\|company-02-creative-04 | yes |
| company-08\|company-08-account-02\|company-08-campaign-03\|company-08-adset-07\|company-08-creative-16 | yes |
| company-03\|company-03-account-01\|company-03-campaign-01\|company-03-adset-01\|company-03-creative-08 | yes |
| company-05\|company-05-account-01\|company-05-campaign-07\|company-05-adset-08\|company-05-creative-57 | yes |
| company-04\|company-04-account-01\|company-04-campaign-10\|company-04-adset-02\|company-04-creative-33 | yes |
| company-05\|company-05-account-01\|company-05-campaign-04\|company-05-adset-02\|company-05-creative-30 | yes |
| company-05\|company-05-account-01\|company-05-campaign-01\|company-05-adset-01\|company-05-creative-17 | yes |
| company-05\|company-05-account-01\|company-05-campaign-04\|company-05-adset-02\|company-05-creative-10 | yes |
| company-04\|company-04-account-01\|company-04-campaign-11\|company-04-adset-02\|company-04-creative-27 | yes |
| company-04\|company-04-account-01\|company-04-campaign-09\|company-04-adset-05\|company-04-creative-28 | yes |
| company-06\|company-06-account-01\|company-06-campaign-01\|company-06-adset-02\|company-06-creative-40 | yes |
| company-06\|company-06-account-01\|company-06-campaign-01\|company-06-adset-01\|company-06-creative-04 | yes |
| company-05\|company-05-account-01\|company-05-campaign-05\|company-05-adset-04\|company-05-creative-11 | yes |
| company-04\|company-04-account-01\|company-04-campaign-04\|company-04-adset-03\|company-04-creative-07 | yes |
| company-06\|company-06-account-01\|company-06-campaign-01\|company-06-adset-01\|company-06-creative-03 | yes |
| company-06\|company-06-account-01\|company-06-campaign-01\|company-06-adset-01\|company-06-creative-06 | yes |
| company-05\|company-05-account-01\|company-05-campaign-03\|company-05-adset-03\|company-05-creative-43 | yes |
| company-06\|company-06-account-01\|company-06-campaign-01\|company-06-adset-02\|company-06-creative-49 | yes |

## Five Hardest Rows

| rowId | phase | headline | action | confidence | why hard |
| --- | --- | --- | --- | --- | --- |
| company-01\|company-01-account-01\|company-01-campaign-02\|company-01-adset-03\|company-01-creative-03 | scale | Test Inconclusive | keep_testing | 0.7 | Decision has clean performance signal but blockers: business_validation_missing, trust_degraded_missing_truth |
| company-01\|company-01-account-01\|company-01-campaign-02\|company-01-adset-04\|company-01-creative-04 | scale | Test Inconclusive | keep_testing | 0.7 | Decision has clean performance signal but blockers: business_validation_missing, trust_degraded_missing_truth |
| company-01\|company-01-account-01\|company-01-campaign-04\|company-01-adset-07\|company-01-creative-25 | post-scale | Test Inconclusive | keep_testing | 0.7 | Decision has clean performance signal but blockers: business_validation_missing, trust_degraded_missing_truth |
| company-01\|company-01-account-01\|company-01-campaign-04\|company-01-adset-07\|company-01-creative-29 | post-scale | Test Inconclusive | keep_testing | 0.7 | Decision has clean performance signal but blockers: business_validation_missing, trust_degraded_missing_truth |
| company-02\|company-02-account-01\|company-02-campaign-01\|company-02-adset-01\|company-02-creative-01 | scale | Test Inconclusive | keep_testing | 0.7 | Decision has clean performance signal but blockers: business_validation_missing, trust_degraded_missing_truth |

