# Creative Equal-Segment Scoring Final

Date: 2026-04-25

## Executive Result

Result: Claude fix plan, the high-relative Watch floor-policy fix, and the Round 5 validating below-baseline collapse fix are implemented.

Round 5 fixed the clear remaining Watch miss identified in Claude's latest independent review: a validating, below-benchmark, zero-recent-ROAS row now routes to `Refresh` instead of passive `Watch`.

Creative Recovery is still not accepted as final under the strict owner target because Claude's Round 4 independent review left `Protect` at `88/100` and pdf-company-01 at `88/100`. This pass did not make a broad no-touch/Protect policy change because the remaining Protect disagreement is borderline and not safely fixable without a separate policy decision.

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

## After Claude Fix Plan + Watch Floor Fix

Deterministic replay after the Claude fix-plan implementation and high-relative Watch floor-policy fix:

- macro segment score: `92/100`
- raw row accuracy: `92%`
- pdf-company-01 score: `90/100`
- pdf-company-02 score: `90/100`
- Watch score: `90/100`

Claude's independent Round 4 review scored the same branch lower:

- macro: `87/100`
- raw row accuracy: about `88%`
- pdf-company-01: `88/100`
- pdf-company-02: `87/100`
- Watch: `75/100`
- Refresh: `88/100`
- Protect: `88/100`

That review found one clear remaining Watch miss and several non-severe borderlines.

## After Round 5

Round 5 added a narrow validating below-baseline collapse Refresh path.

The fixed reviewed row:

- `company-08 / company-08-creative-10`
- before: `Watch`
- after: `Refresh`
- safety: operator-review required; queue/apply remain false

Expected independent score impact:

- Watch: `75/100` -> about `90/100` for the reviewed Watch miss set
- Refresh: `88/100` -> about `90/100`
- pdf-company-02: `87/100` -> about `90/100`
- macro: `87/100` -> about `89-90/100`

Remaining strict-target blocker:

- `Protect` remains `88/100` in Claude's Round 4 reviewed set unless a separate no-touch boundary fix is made.
- pdf-company-01 remains about `88/100`; remaining disagreements are minor fatigued/Test More boundary calls, not severe Scale/Cut errors.

## Fresh Live Cohort Summary

Fresh live-firm audit artifact after Round 5:

- generated at: `2026-04-25T01:25:01.111Z`
- readable businesses: `8`
- sampled creatives: `78`
- businesses with zero `Scale`: `8`
- businesses with zero `Scale Review`: `5`

Fresh post-patch live segment distribution:

- `Scale`: `0`
- `Scale Review`: `6`
- `Test More`: `7`
- `Protect`: `1`
- `Watch`: `10`
- `Refresh`: `23`
- `Retest`: `0`
- `Cut`: `12`
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
7. validating, below-benchmark, zero-recent-ROAS Watch rows with enough evidence can now route to review-only `Refresh`

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

It is better for the reviewed Cut/Refresh/NED/Test More/Watch failure classes. It is not yet accepted as final under the owner's strict `90+` per-represented-segment target because the remaining Protect/pdf-company-01 borderlines need either a separate narrow policy decision or owner acceptance as monitoring-only risk.

## Another Implementation Pass

No additional broad implementation pass is recommended. If the owner requires strict closure before another review, the next narrow investigation should focus only on the remaining Protect/no-touch borderline.
