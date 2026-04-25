# Watch Floor Policy Fix

Date: 2026-04-25

Branch: `feature/adsecute-creative-claude-fix-plan-implementation`

PR: `https://github.com/erhanrdn/OmniAds/pull/65`

## Executive Result

The remaining Watch issue was real in the represented equal-segment set. A high-relative non-test creative with mature evidence could stay `Watch` because it was not an explicit test campaign, did not have scale intent, and did not clear the true-Scale peer-spend floor.

This pass adds a narrow review-only admission from `Watch` to `Scale Review` for that case class. It does not change true `Scale` floors, queue/push/apply safety, taxonomy, benchmark scope, Commercial Truth, or old-rule authority.

## Watch Mismatch Trace

| Alias | Current before fix | Expected | Baseline | Business validation | Campaign context | Lifecycle / action | Evidence | Responsible gate | Decision |
|---|---|---|---|---|---|---|---|---|---|
| `company-05 / company-05-creative-04` | `Watch` | `Scale Review` | strong account baseline | missing / review required | non-test, no primary context blocker | `validating` / `keep_in_test` | high relative ROAS, mature spend, `6` purchases, favorable CPA | no scale intent and below true-Scale peer-spend floor, so `hasRelativeScaleReviewEvidence` was not reached as a primary outcome | fixed |

The previous Watch decision was defensible under the old strict floors, but it failed the owner product target because `Watch` hid an action-worthy relative winner. The new rule keeps it review-only.

## New Gate

New helper: `isNonTestHighRelativeReviewCandidate`.

Admission requires all of:

- not an active test-campaign override
- lifecycle `validating`
- primary action `keep_in_test`
- strong relative baseline reliability
- existing relative Scale Review evidence
- spend at least `max(500, 0.75x peer median spend)`
- at least `6` purchases
- at least `20000` impressions
- creative age greater than `10` days
- ROAS at least `2.5x` active benchmark
- CPA not worse than peer median when CPA is available
- business validation not unfavorable
- no campaign/ad set context blocker

Output:

- `Scale Review`
- `operator_review_required`
- queue/apply remain false
- missing Commercial Truth still prevents true `Scale` and absolute-profit claims

## Explicit Non-Fixes

- Ambiguous non-test rows with weaker relative signal remain `Watch`.
- Thin high-relative rows remain `Watch` / `Not Enough Data` / `Test More` according to existing evidence floors.
- No-touch winners remain `Protect`.
- Campaign-context-blocked rows remain `Campaign Check`.
- Active test-campaign override behavior is unchanged.

## Score Impact

Deterministic replay after this Watch floor-policy fix:

| Metric | Before this fix | After this fix |
|---|---:|---:|
| Macro segment score | `91/100` | `92/100` |
| Raw row accuracy | `91%` | `92%` |
| Watch | `83/100` | `90/100` |
| Scale Review | `95/100` | `95/100` |
| Refresh | `91/100` | `91/100` |
| Protect | `90/100` | `90/100` |
| Test More | `90/100` | `90/100` |
| Not Enough Data | `92/100` | `92/100` |
| Cut recall | `~94%` | `~94%` |
| pdf-company-01 | `90/100` | `90/100` |
| pdf-company-02 | `90/100` | `90/100` |

All represented segments now meet the `90+` target on deterministic replay of the reviewed equal-segment set.

## Tests Added

- mature high-relative non-test Watch false negative -> `Scale Review`
- genuinely ambiguous high-relative non-test row -> `Watch`
- thin high-relative non-test row -> not `Scale Review`
- non-test no-touch winner -> `Protect`
- campaign context blocker -> `Campaign Check`
- safety assertions: `Scale Review` remains review-only; queue/apply remain false

## Recommendation

After validation passes and PR #65 is marked ready for review, request Claude equal-segment re-review against PR #65 or the eventual merged result.
