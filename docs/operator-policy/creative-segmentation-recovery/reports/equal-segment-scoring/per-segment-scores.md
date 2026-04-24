# Creative Equal-Segment Per-Segment Scores

Date: 2026-04-25

Scoring method: equal-weight macro by represented user-facing segment. Scale and Cut misses are still reported as product risks, but they do not receive extra numeric weight.

The after score uses deterministic replay of the equal-segment review mismatch set after the three gate fixes.

| Segment | Represented | Before | After | Result |
|---|---:|---:|---:|---|
| Scale | no | not represented | not represented | no valid expected examples |
| Scale Review | yes | 89 | 89 | unchanged; this pass did not change Scale Review floors |
| Test More | yes | 85 | 85 | unchanged |
| Protect | yes | 60 | 86 | trend-collapse Protect misses now route to Refresh |
| Watch | yes | 50 | 75 | high-spend below-baseline Cut miss removed from Watch |
| Refresh | yes | 78 | 84 | receives the stable/fatigued winner trend-collapse cases |
| Retest | limited | 90 | 90 | one-sample segment; not used as free macro credit |
| Cut | yes | 87 | 91 | blocked CPA and high-spend below-baseline false negatives fixed |
| Campaign Check | no | not represented | not represented | no valid expected examples |
| Not Enough Data | yes | 83 | 92 | blocked CPA blowout rows no longer hide under Not Enough Data |

Macro segment score across represented non-trivial segments:

- before: `76/100`
- after: `86/100`

Raw row accuracy:

- before: `81%`
- after: `90%`

## Weakest Segments After Fix

1. `Watch`: `75/100`
2. `Refresh`: `84/100`
3. `Test More`: `85/100`

## Strongest Segments After Fix

1. `Not Enough Data`: `92/100`
2. `Cut`: `91/100`
3. `Scale Review`: `89/100`

## Fixed Examples

- `pdf-company-01 / creative-06` shape: protected winner with recent ROAS collapse below benchmark now maps to `Refresh`.
- `pdf-company-06 / creative-04` shape: stable winner with near-total recent collapse now maps to `Refresh`.
- `pdf-company-07 / creative-06` shape: blocked lifecycle, CPA blowout, below-baseline ROAS now maps to `Cut`.
- `pdf-company-06 / creative-08` shape: blocked lifecycle, CPA blowout, below-baseline ROAS now maps to `Cut`.
- `pdf-company-04 / creative-09` shape: high-spend, purchase-bearing, below-baseline, no 7d data now maps to `Cut`.

## Not Represented

`Scale` and `Campaign Check` had no valid expected examples in the equal-segment review set. They are not granted free score credit.
