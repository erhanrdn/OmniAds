# Product-Truth Review - Live Sample Audit

Last updated: 2026-04-24 by Codex

## Method

The corrected live-firm audit was rerun from the current `main` source path.

Selection rule:

- currently connected/readable Meta businesses only
- last 30 completed days, excluding today
- active creatives first
- sort by 30-day spend descending
- top 10 creatives per business maximum
- fill with highest-spend inactive/recent creatives if fewer than 10 active rows exist

Committed artifact:

- `docs/operator-policy/creative-segmentation-recovery/reports/product-truth-review/artifacts/sanitized-live-product-truth-sample.json`

Local private artifact:

- `/tmp/adsecute-creative-live-firm-audit-local.json`

## Cohort

| Metric | Count |
| --- | ---: |
| Historical snapshot candidates | 9 |
| Runtime eligible businesses | 8 |
| Runtime skipped candidates | 1 |
| Sampled creatives | 78 |
| Businesses with zero Scale | 8 |
| Businesses with zero Scale Review | 8 |

Skipped runtime reason:

- `meta_token_checkpointed`: 1

## Segment Distribution

| Segment | Count |
| --- | ---: |
| Scale | 0 |
| Scale Review | 0 |
| Test More | 8 |
| Protect | 13 |
| Watch | 21 |
| Refresh | 16 |
| Retest | 0 |
| Cut | 0 |
| Campaign Check | 0 |
| Not Enough Data | 14 |
| Not eligible for evaluation | 6 |

## Per-Business Summary

| Company alias | Sampled | Active sampled | Segment mix | Zero Scale | Zero Scale Review |
| --- | ---: | ---: | --- | --- | --- |
| `company-01` | 10 | 10 | Protect 2, Watch 5, Not Enough Data 1, Refresh 2 | yes | yes |
| `company-02` | 8 | 8 | Refresh 2, Watch 3, Protect 1, Not Enough Data 2 | yes | yes |
| `company-03` | 10 | 5 | Protect 1, Not Enough Data 3, Not eligible 1, Refresh 4, Test More 1 | yes | yes |
| `company-04` | 10 | 10 | Watch 1, Test More 2, Not eligible 5, Not Enough Data 2 | yes | yes |
| `company-05` | 10 | 10 | Protect 3, Not Enough Data 1, Refresh 2, Watch 4 | yes | yes |
| `company-06` | 10 | 10 | Watch 2, Test More 5, Not Enough Data 3 | yes | yes |
| `company-07` | 10 | 10 | Refresh 6, Protect 1, Watch 2, Not Enough Data 1 | yes | yes |
| `company-08` | 10 | 0 | Watch 4, Protect 5, Not Enough Data 1 | yes | yes |

## Strong Relative Rows Not Surfacing As Scale Review

Representative examples:

| Alias | Current segment | Spend | ROAS | Purchases | Relative class | Old challenger | Notes |
| --- | --- | ---: | ---: | ---: | --- | --- | --- |
| `company-05-creative-02` | Protect | 10167.46 | 10.45 | 12 | strong_relative | Scale | Active, very strong, protected winner; business validation unfavorable. |
| `company-05-creative-06` | Watch | 6061.48 | 7.26 | 4 | strong_relative | Scale | Active, strong relative, missing validation, campaign-limited. |
| `company-05-creative-08` | Protect | 5374.56 | 5.60 | 5 | strong_relative | Scale | Active, strong, protected winner; business validation unfavorable. |
| `company-05-creative-09` | Refresh | 4932.19 | 6.08 | 4 | strong_relative | Scale | Active, fatigue state wins over scale-review. |
| `company-01-creative-01` | Protect | 1671.91 | 5.62 | 58 | true_scale_candidate | Watch | Active, true-scale evidence metadata, protected winner. |
| `company-01-creative-02` | Watch | 777.12 | 4.74 | 21 | strong_relative | Watch | Active, strong relative, missing business validation. |
| `company-01-creative-05` | Protect | 306.43 | 8.53 | 15 | true_scale_candidate | Scale | Active, true-scale evidence metadata, protected winner. |

Product-truth concern:

- The current policy may be overprotecting some active strong-relative rows.
- The system has no review-only scale surface across the live sample even though several rows have credible purchase/value evidence and strong baselines.
- This is no longer a source-path issue; it is a product policy/gate question.

## Weak Rows Not Surfacing As Cut

Representative examples:

| Alias | Current segment | Spend | ROAS | Purchases | Old challenger | Notes |
| --- | --- | ---: | ---: | ---: | --- | --- |
| `company-05-creative-03` | Not Enough Data | 10022.46 | 0.80 | 1 | Cut | Internal action is block-deploy, but user-facing label reads Not Enough Data. |
| `company-05-creative-05` | Watch | 6375.92 | 0.00 | 0 | Cut | High spend, zero purchases, campaign-limited; Watch is weak for buyer action. |
| `company-05-creative-07` | Watch | 5621.45 | 0.00 | 0 | Cut | Same pattern. |
| `company-05-creative-10` | Watch | 4524.33 | 0.00 | 0 | Cut | Same pattern. |
| `company-08-creative-09` | Not Enough Data | 587.18 | 0.38 | 1 | Cut | Internal block-deploy with weak output label. |

Product-truth concern:

- `Cut = 0` is not defensible from live data alone.
- Some weak/high-spend rows are being softened into `Watch` or `Not Enough Data`.
- At minimum, instruction severity and label alignment are not media-buyer clear for mature weak rows.

## Old Challenger Read

The old challenger is not truth, but it flags useful disagreement clusters:

- Old `Scale` vs current non-scale: multiple strong-relative rows, mostly current `Protect`.
- Old `Cut` vs current non-cut: multiple high-spend weak rows, mostly current `Watch` or `Not Enough Data`.
- Old `Watch` vs current `Protect`/`Refresh`: some old output is too blunt and misses lifecycle nuance.

Conclusion:

- Do not import the old rule engine.
- Use it as a challenger to identify where current gates may be too conservative or too soft.

## Live Audit Verdict

The current Creative Decision OS is not yet product-truth trustworthy.

It is useful for grouping rows, but across the live top-spend sample:

- `Scale = 0`
- `Scale Review = 0`
- `Cut = 0`
- multiple credible strong-relative rows are not reviewable for scale
- multiple weak/high-spend rows are not surfaced as `Cut`

This is a product-policy problem, not a source-path or UI taxonomy problem.
