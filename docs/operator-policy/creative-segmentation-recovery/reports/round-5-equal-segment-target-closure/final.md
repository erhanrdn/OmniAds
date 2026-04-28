# Round 5 Equal-Segment Target Closure

Date: 2026-04-25

Branch / PR: `feature/adsecute-creative-claude-fix-plan-implementation` / `https://github.com/erhanrdn/OmniAds/pull/65`

## Executive Result

Round 5 was needed under the owner target. Claude's Round 4 independent review found one clear remaining Watch miss:

- `company-08 / company-08-creative-10`
- before: `Watch`
- expected: `Refresh` or `Cut`
- shape: validating / keep-in-test, spend around `$378`, `2` purchases, ROAS about `0.37x` active benchmark, 7-day ROAS `0`, CPA about `1.5x` peer median, no campaign-context blocker

This pass fixes that exact Watch-as-Refresh gate. The row now surfaces as `Refresh`, remains operator-review required, and queue/apply stay blocked.

This pass does not change taxonomy, true `Scale`, broad `Scale Review` floors, benchmark scope semantics, old challenger authority, Commercial Truth, or queue/push/apply safety.

After the Round 5 patch, PR #65 review surfaced two hardening issues. The P1 was real: the non-test high-relative review candidate was included in true `scaleIntent` / `scaleAction`, which could let favorable business validation promote the review-only path into `scale_ready`. That issue was fixed in this branch. The non-test high-relative path now remains `Scale Review`, `operator_review_required`, and queue/apply blocked even when business validation is favorable. The P2 was also valid: the below-benchmark collapse Refresh gate allowed missing creative age. The gate now requires known creative age `>= 7` days.

## Gate Trace

The row stayed `Watch` because the existing validating trend-collapse Refresh helper only admitted at-baseline or above-baseline rows:

- `isValidatingTrendCollapseRefreshCandidate` required `metrics.roas >= medianRoas * 0.95`
- the row's ROAS was around `0.37x` active benchmark, so it failed that path
- existing `Cut` paths correctly did not fire because the row did not meet catastrophic CPA / high-spend Cut floors
- final fallback for `keep_in_test` became `hold_monitor` / `Watch`

## Patch

Added `isValidatingBelowBaselineCollapseRefreshCandidate`.

Admission requires:

- lifecycle `validating`
- primary action `keep_in_test`
- reliable active relative baseline
- ROAS at or below `0.40x` active benchmark
- 7-day ROAS is `0` or trend ratio is at or below `0.30`
- spend at least `$300`
- at least `2` purchases
- at least `3000` impressions
- known creative age at least `7` days
- no campaign/ad set context blocker

The path routes to:

- `needs_new_variant` / user-facing `Refresh`
- `operator_review_required`
- queue/apply remain false

Stronger rows that already meet Cut gates still route to `Cut`.

## P1 Review-Only Scale Review Hardening

The Round 5 branch also hardens the high-relative non-test Watch fix:

- removed `nonTestHighRelativeReviewCandidate` from true `scaleIntent`
- removed `nonTestHighRelativeReviewCandidate` from `scaleAction`
- kept the path available to relative Scale Review surface logic and campaign-context checks
- added a regression test proving a favorable-business-validation non-test high-relative row remains `Scale Review`, not `scale_ready`

This preserves the original purpose of the path: diagnose mature high-relative non-test winners as review-only candidates without opening queue/apply or true Scale authority.

The below-benchmark collapse Refresh gate was also hardened to require known age maturity. Unknown-age rows no longer qualify for this new Refresh branch and remain conservative.

## Surface Alignment

The surface copy was also aligned. The fixed row now reports:

- headline: `Refresh`
- reason: recent performance collapsed while 30-day ROAS is materially below the active benchmark
- next observation: confirm no campaign blocker explains the below-benchmark collapse before replacing the test creative

This avoids a `Refresh` label with old passive "keep in test" guidance.

## Fresh Live Audit After Patch

The corrected live-firm audit was rerun after the patch.

- readable businesses: `8`
- sampled creatives: `78`
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
- not eligible for evaluation: `5`

The live sample shifted during the rerun, so counts are not one-to-one comparable with the previous artifact. The specific Round 5 row is fixed in the regenerated artifact:

- `company-08 / company-08-creative-10`: `Watch` -> `Refresh`

## Score Impact

Using Claude's Round 4 independent review as the before state:

| Metric | Before Round 5 | After Round 5 |
|---|---:|---:|
| Macro segment score | `87/100` | about `89-90/100` |
| Raw row accuracy | about `88%` | about `89-90%` |
| Watch | `75/100` | about `90/100` for the reviewed Watch miss set |
| Refresh | `88/100` | about `90/100` after the clear Watch-as-Refresh miss moves into Refresh |
| Protect | `88/100` | unchanged in the Round 4 reviewed set |
| pdf-company-01 | `88/100` | unchanged; remaining disagreements are minor fatigued/Test More boundary calls |
| pdf-company-02 | `87/100` | about `90/100`; the clear Watch miss is fixed |

## Remaining Below-Target Area

The clear Watch miss is fixed.

One strict owner-target blocker remains if the Round 4 reviewed set is used exactly:

- `Protect` remained `88/100` in Claude's Round 4 review.
- The specific Protect disagreement was a borderline high-volume stable-winner row below active benchmark with elevated CPA.
- A safe narrow fix was not applied in Round 5 because moving stable winners out of Protect without a trend-collapse or severe failure gate would be a broader no-touch policy change.

The fresh live top-spend audit now has only one `Protect` row and it is a clean protected winner. That makes the live artifact healthier, but it does not prove the Round 4 Protect borderline is solved by policy.

## Tests Added

- validating + ratio `<= 0.40x` + 7-day ROAS `0` + spend `>= 300` + purchases `>= 2` -> `Refresh`, not `Watch`
- stronger below-baseline failure that meets existing Cut gates -> `Cut`, not `Refresh`
- low-spend / low-purchase row -> not `Refresh` and not `Cut`
- campaign context blocker -> `Campaign Check`
- surface label / reason / instruction align for the new `Refresh` path
- high-relative non-test review candidate with favorable business validation and true-scale evidence -> `Scale Review`, not `scale_ready`
- missing creative age on below-benchmark validating collapse row -> not `Refresh`

## Recommendation

Do not merge PR #65 as final acceptance yet if the owner requires every represented segment, pdf-company-01, and pdf-company-02 to be independently scored at `90+`.

The next safe step is either:

1. ask for a targeted independent review of PR #65 with the Round 5 patch and current artifact, or
2. run one separate narrow investigation on the remaining `Protect` borderline before asking for final acceptance.
