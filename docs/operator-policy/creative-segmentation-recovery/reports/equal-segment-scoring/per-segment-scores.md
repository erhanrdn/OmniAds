# Creative Equal-Segment Per-Segment Scores

Date: 2026-04-25

Scoring method: equal-weight macro by represented user-facing segment. Scale and Cut misses remain severe product risks, but the macro score does not give Scale or Cut extra numeric weight.

The before state uses Claude's independent Round 2 equal-segment review. The after state uses deterministic replay of the final fixed gates on that reviewed live cohort.

| Segment | Represented | Before | After | Result |
|---|---:|---:|---:|---|
| Scale | no | not represented | not represented | no valid expected examples |
| Scale Review | yes | 95 | 95 | unchanged; Scale Review floors were not changed |
| Test More | yes | 83 | 83 | unchanged |
| Protect | yes | 83 | 83 | unchanged from Claude Round 2 |
| Watch | yes | 55 | 75 | validating at-benchmark trend-collapse miss leaves Watch for Refresh |
| Refresh | yes | 73 | 84 | catastrophic CPA rows leave Refresh for Cut; one validating collapse row enters Refresh |
| Retest | limited | 100 | 100 | one-sample segment; reported but not used as free credit |
| Cut | yes | 90 | 92 | catastrophic CPA Refresh misses now route to Cut |
| Campaign Check | no | not represented | not represented | no valid expected examples |
| Not Enough Data | yes | 88 | 88 | unchanged |

Macro segment score across represented non-trivial segments:

- before: `83/100`
- after: `87/100`

Raw row accuracy:

- before: `83%`
- after: `87%`

## Weakest Segments After Fix

1. `Watch`: `75/100`
2. `Test More`: `83/100`
3. `Protect`: `83/100`

`Refresh` improves to `84/100` after the catastrophic CPA rows leave that bucket.

## Strongest Segments After Fix

1. `Scale Review`: `95/100`
2. `Cut`: `92/100`
3. `Not Enough Data`: `88/100`

## Fixed Examples

- `company-03 / creative-01` shape: CPA `12.68x` median, ROAS `0.11x` benchmark, fatigued/refresh-replace -> `Cut`
- `company-07 / creative-01` shape: CPA `2.92x` median, zero recent read, high spend, below benchmark -> `Cut`
- `company-02 / creative-03` shape: validating/keep-in-test, 30-day ROAS near benchmark, 7-day ROAS zero -> `Refresh`

## Documented Non-Fix

- `company-05 / creative-04` remains `Watch`: high-relative signal is present, but the row is not explicit test-campaign context and does not meet the current true-scale peer-spend floor. Scale Review floors were intentionally left unchanged.

## Not Represented

`Scale` and `Campaign Check` had no valid expected examples in the reviewed equal-segment set. They are not granted free score credit.
