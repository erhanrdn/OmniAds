# Creative Trend-Collapse Evidence Hardening

Date: 2026-04-25

## Verdict

Result: PR #61 P1 issue was real and fixed.

The validating trend-collapse Refresh helper could run before the under-sampled branch and did not require creative age maturity. That meant a very new validating creative with a noisy 7-day dip could be promoted into `Refresh` before the policy had enough evidence to say the creative needed replacement.

## Fix

`isValidatingTrendCollapseRefreshCandidate` now requires the existing meaningful-read helper:

- spend must clear the stronger of the absolute floor and the active peer median spend
- purchases must be at least `2`
- impressions must be at least `5000`
- creative age must be greater than `10` days

The mature validating collapse path from PR #61 still works because the reviewed fixture has enough age, spend, purchase, and impression evidence.

## Preserved Behavior

- catastrophic CPA fatigued/refresh rows still route to review-safe `Cut`
- mature validating trend-collapse rows still route to `Refresh`
- mature severe validating failures still route to existing `Cut`
- missing 7-day ROAS, unavailable frequency, or missing fatigue data does not trigger `Refresh`
- Scale / Scale Review floors are unchanged
- queue/push/apply safety is unchanged

## Tests Added

- very new validating creative with a 7-day dip does not become `Refresh`
- under-sampled validating creative with a 7-day dip does not become `Refresh`
- previous mature validating trend-collapse fixture remains `Refresh`
- previous severe validating Cut fixture remains `Cut`
- previous missing 7-day/frequency safeguards still pass

## Score Impact

The score intent from PR #61 remains acceptable:

- macro segment score replay remains `87/100`
- Watch score replay remains `75/100`
- Refresh score replay remains `84/100`
- Cut recall replay remains about `92%`

This hardening closes a correctness hole before Claude equal-segment re-review. It does not claim final acceptance.

## Next Action

After this hardening PR merges, run Claude equal-segment re-review against `main`.
