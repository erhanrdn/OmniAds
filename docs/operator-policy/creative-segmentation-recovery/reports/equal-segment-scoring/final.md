# Creative Equal-Segment Scoring Final

Date: 2026-04-25

## Executive Result

Result: Claude fix plan plus the narrow Watch floor-policy fix are implemented. Deterministic replay now reaches the owner target of `90+` for every represented segment.

This pass used deterministic replay of Claude's represented mismatch set plus a fresh live-firm audit artifact from the corrected Decision OS source path. It did not ask Claude for review.

## Fresh Baseline

Current `main` at branch start was the PR #63 state:

- macro replay: `87/100`
- raw replay accuracy: `87%`
- Watch: `75/100`
- Refresh: `84/100`
- Protect: `83/100`
- Test More: `83/100`
- Not Enough Data: `88/100`
- Cut recall: about `92%`

## After This Pass

Deterministic replay after the Claude fix-plan implementation and Watch floor-policy fix:

- macro segment score: `92/100`
- raw row accuracy: `92%`
- pdf-company-01 score: `90/100`
- pdf-company-02 score: `90/100`
- Watch score: `90/100`

The represented-segment target is now met in deterministic replay. Claude should re-review independently before final acceptance.

## Fresh Live Cohort Summary

Fresh live-firm audit artifact:

- generated at: `2026-04-25T00:21:50.877Z`
- readable businesses: `8`
- sampled creatives: `78`
- businesses with zero `Scale`: `8`
- businesses with zero `Scale Review`: `5`

Fresh post-patch live segment distribution:

- `Scale`: `0`
- `Scale Review`: `6`
- `Test More`: `8`
- `Protect`: `4`
- `Watch`: `7`
- `Refresh`: `18`
- `Retest`: `0`
- `Cut`: `16`
- `Campaign Check`: `0`
- `Not Enough Data`: `14`
- `Not eligible for evaluation`: `5`

`Scale` remains zero. This pass did not change Scale floors. `Scale Review` remains present and review-only.

## Fixed Mismatch Classes

1. mature one-purchase catastrophic CPA rows can now route from `Not Enough Data` to review-safe `Cut`
2. mild above-baseline protected winners with meaningful recent collapse can now route from `Protect` to `Refresh`
3. thin-spend weak-ratio positives now remain `Not Enough Data` instead of `Test More`
4. mature validating trend-collapse now admits a quarter-trend collapse threshold while preserving low-evidence guards
5. existing fatigued/refresh-replace CPA blowout `Cut` behavior remains intact
6. mature high-relative non-test `Watch` false negatives can now route to review-only `Scale Review`

## High-Relative Watch Trace

Sanitized row: `company-05 / company-05-creative-04`.

Before Watch floor fix: `Watch`.

After Watch floor fix: `Scale Review`.

Reason:

- high relative ROAS is present
- purchases are present
- the row is not explicit test-campaign context
- the row does not clear the true-Scale peer-spend floor
- before this pass, policy did not treat non-test `keep_in_test` high-relative rows as Scale Review candidates without scale intent

The new gate is intentionally narrower than normal Scale Review admission: it requires a strong baseline, at least `2.5x` benchmark ROAS, mature spend/purchase/impression evidence, CPA not worse than peer median, no unfavorable business validation, and no campaign context blocker.

## Is Current Output Better Than Manual Table Reading?

It is better for the reviewed Cut/Refresh/NED/Test More/Protect/Watch failure classes. It is ready for independent Claude equal-segment re-review.

## Another Implementation Pass

No additional implementation pass is recommended before Claude re-review.

PR #65 can leave draft after checks pass. Claude equal-segment re-review should run next.
