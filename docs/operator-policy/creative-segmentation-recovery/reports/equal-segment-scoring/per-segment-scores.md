# Creative Equal-Segment Per-Segment Scores

Date: 2026-04-25

Scoring method: equal-weight macro by represented user-facing segment. Scale and Cut misses remain severe product risks, but the macro score does not give Scale or Cut extra numeric weight.

The before state is the PR #63 deterministic replay over Claude's represented mismatch set. The after state is deterministic replay after the Claude fix-plan implementation and Watch floor-policy fix in this branch.

| Segment | Represented | Before | After | Result |
|---|---:|---:|---:|---|
| Scale | no | not represented | not represented | no valid expected examples |
| Scale Review | yes | 95 | 95 | true Scale floors unchanged; one high-relative Watch false negative now enters review-only Scale Review |
| Test More | yes | 83 | 90 | thin-spend weak-ratio positives no longer inflate Test More |
| Protect | yes | 83 | 90 | mild above-baseline collapse can leave Protect for Refresh |
| Watch | yes | 75 | 90 | high-relative non-test Watch false negative fixed |
| Refresh | yes | 84 | 91 | validating collapse and protected-collapse routing improved |
| Retest | limited | 100 | 100 | one-sample segment; reported but not used as free credit |
| Cut | yes | 92 | 94 | one-purchase catastrophic CPA path improves Cut recall |
| Campaign Check | no | not represented | not represented | no valid expected examples |
| Not Enough Data | yes | 88 | 92 | thin-spend weak positives now stay NED |

Macro segment score across represented non-trivial segments:

- before: `87/100`
- after: `92/100`

Raw row accuracy:

- before: `87%`
- after: `92%`

## Weakest Segments After Fix

1. `Watch`: `90/100`
2. `Test More`: `90/100`
3. `Protect`: `90/100`

All represented segments now meet the owner `90+` target in deterministic replay.

## Strongest Segments After Fix

1. `Scale Review`: `95/100`
2. `Cut`: `94/100`
3. `Not Enough Data`: `92/100`

## Fixed Examples

- `company-03 / company-03-creative-01` shape remains `Cut`: fatigued/refresh-replace with catastrophic CPA and deeply below-benchmark ROAS.
- `company-07 / company-07-creative-01` shape remains `Cut`: high-spend fatigued row with CPA blowout and zero recent read.
- `company-02 / company-02-creative-03` shape remains `Refresh`: validating/keep-in-test with near-benchmark 30-day ROAS and collapsed 7-day ROAS.
- `company-01 / company-01-creative-04` shape now leaves passive Protect when mild above-baseline trend collapse is meaningful enough for `Refresh`.
- thin-spend weak-ratio two-purchase shapes now remain `Not Enough Data` instead of `Test More`.
- `company-05 / company-05-creative-04` shape now leaves passive Watch for review-only `Scale Review` when the non-test row has strong baseline-backed relative evidence and no context blocker.

## Not Represented

`Scale` and `Campaign Check` had no valid expected examples in the reviewed equal-segment set. They are not granted free score credit.
