# Creative Equal-Segment Scoring Final

Date: 2026-04-25

## Executive Result

Result: Claude fix plan implemented, but Creative Recovery is still not accepted because `Watch` remains below the owner target of `90+` for every represented segment.

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

Deterministic replay after the Claude fix-plan implementation:

- macro segment score: `91/100`
- raw row accuracy: `91%`
- pdf-company-01 score: `90/100`
- pdf-company-02 score: `90/100`
- Watch score: `83/100`

The macro score is above `90`, but the represented-segment target is not met because `Watch` remains below `90`.

## Fresh Live Cohort Summary

Fresh live-firm audit artifact:

- generated at: `2026-04-24T23:51:48.171Z`
- readable businesses: `8`
- sampled creatives: `78`
- businesses with zero `Scale`: `8`
- businesses with zero `Scale Review`: `6`

Fresh post-patch live segment distribution:

- `Scale`: `0`
- `Scale Review`: `7`
- `Test More`: `7`
- `Protect`: `1`
- `Watch`: `11`
- `Refresh`: `20`
- `Retest`: `2`
- `Cut`: `11`
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

## High-Relative Watch Trace

Sanitized row: `company-05 / company-05-creative-04`.

Current result: `Watch`.

Reason:

- high relative ROAS is present
- purchases are present
- the row is not explicit test-campaign context
- the row does not clear the current true-scale peer-spend floor
- the current policy does not treat non-test `keep_in_test` high-relative rows as Scale Review candidates without scale intent

This is a defensible result under the current floors, but it is also the main reason Watch remains below the `90+` target. A further fix would require an explicit product decision for high-relative non-test Watch rows.

## Is Current Output Better Than Manual Table Reading?

It is better for the reviewed Cut/Refresh/NED/Test More/Protect failure classes. It is not accepted as final because Watch still hides at least one action-worthy or review-worthy class under the owner scoring target.

## Another Implementation Pass

Yes, if the owner target remains `90+` for every represented segment.

The next pass should be narrow and should focus only on Watch floor policy:

- high-relative non-test Watch rows
- whether those rows should become Scale Review, Test More, or a clearer Watch review state
- no Scale floor loosening unless the investigation proves a deterministic gate bug
