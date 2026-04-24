# Creative Segmentation Recovery State

Last updated: 2026-04-24 by Codex

## Current Goal

Finish the Creative date-range invariance hardening pass, then send the corrected product surface to one final Claude live-firm product review.

This pass is narrow product-truth hardening. It does not retune Creative policy thresholds, change queue/apply/push safety, promote the old rule engine, or silently change benchmark scope.

## Program Status

- foundation: complete
- foundation hardening: complete
- calibration data gate: `passed`
- live Meta cohort recovery: complete
- original 10-agent calibration panel: complete
- implementation pass 1: merged
- implementation pass 2: merged
- implementation pass 3: merged
- implementation pass 4: merged
- implementation pass 5: merged
- implementation pass 6: merged
- implementation pass 6 hardening: merged
- live output restoration: merged
- corrected live-firm audit rerun: complete
- scale-review-gap recovery: complete
- UI truth and Scale Review pass: complete on branch, pending normal PR flow
- date-range invariance audit: complete on branch, pending normal PR flow

## Date-Range Invariance Audit

Status: fixed/clarified on branch.

Finding:

- a production-equivalent private trace for sanitized `company-03` compared Last 14 days and Last 30 days under the same benchmark scope
- both ranges used the same `decisionAsOf` (`2026-04-23`) and the same primary Decision OS window (`2026-03-25` to `2026-04-23`)
- shared Decision OS rows: `16`
- same-creative segment changes: `0`

Root cause:

- the observed count changes are consistent with visible reporting-set changes, not primary segment mutation
- top Creative segment filters count only the currently visible/reporting table rows via `visibleIds`
- the UI did not state that count scope clearly enough

Fix:

- Creative top filter copy now says counts follow the visible reporting set while row segments use the Decision OS window
- Creative Decision Support copy now says counts follow the current visible reporting set and row segments stay anchored to the Decision OS window
- filter button accessibility labels now identify the counts as visible reporting-set counts
- deterministic tests cover visible-set filter counts and UI copy

Remaining risk:

- if a future trace shows the same creative changing primary segment with identical `decisionAsOf` and identical benchmark scope, that is a separate Decision OS source-path blocker

## Final Acceptance Status

Creative Recovery final acceptance is revoked until the actual Creative UI and live-firm output are reviewed again.

Reason:

- the actual UI still exposed ambiguous primary grouping labels such as `Review`, `Check`, `Hold`, and `Evergreen`
- those labels were not the agreed Creative operator taxonomy
- the current live audit still shows zero `Scale` and zero `Scale Review`

## UI Taxonomy Mismatch

The mismatch was real and has been fixed in this branch.

Primary Creative segment filters now use the agreed taxonomy:

- `Scale`
- `Scale Review`
- `Test More`
- `Protect`
- `Watch`
- `Refresh`
- `Retest`
- `Cut`
- `Campaign Check`
- `Not Enough Data`

System-ineligible rows can still appear as `Not eligible for evaluation`, but that state is not exposed as a primary Creative segment filter.

Additional aligned surfaces:

- overview summary labels
- quick filters
- operator cards
- preview cards
- creative detail badges
- instruction headlines
- Decision OS summary copy

## Benchmark Scope Status

Benchmark scope behavior is unchanged and remains explicit.

- default benchmark: account-wide
- campaign filter alone: does not switch benchmark authority
- explicit campaign benchmark: opt-in only
- benchmark scope remains visible in Creative operator context

## Live Scale Review Audit Result

The corrected live audit was rerun after this branch's UI and instruction fixes.

Scope:

- readable live Meta businesses: `8`
- sampled creatives: `78`
- deterministic sample: active creatives first, then 30-day spend descending, up to 10 per business

Live segment counts:

- `Scale`: `0`
- `Scale Review`: `0`
- `Protect`: `14`
- `Watch`: `20`
- `Refresh`: `16`
- `Test More`: `8`
- `Not Enough Data`: `14`
- `Campaign Check`: `0`
- `Retest`: `0`
- `Cut`: `0`
- `Not eligible for evaluation`: `6`

Business counts:

- businesses with zero `Scale`: `8`
- businesses with zero `Scale Review`: `8`

## Scale Review Zero Diagnosis

The zero `Scale Review` count is real in the current audit sample.

The closest candidates:

- four rows carry `true_scale_candidate` evidence metadata
- all four resolve to `Protect`
- each has `primaryAction = hold_no_touch`
- each is treated as a protected winner
- missing business validation blocks true `Scale`
- the review-only Scale Review path intentionally excludes protected winners

This branch did not force `Scale Review` counts upward.

No bucket-mapping bug was found for the current zero-`Scale Review` sample. The remaining question is product-level: whether the current protected-winner interpretation is right, or whether policy should later distinguish some protected winners as review-worthy scale candidates.

## Specific Case Trace

The user-observed case was traced privately and is documented with sanitized aliases only.

- business alias: `company-03`
- creative alias: `company-03-creative-07`
- current resolved segment after this branch: `Refresh`
- current instruction headline after this branch: `Refresh: company-03-creative-07`
- active status: not active in campaign/ad set context
- benchmark scope: account
- baseline reliability: strong
- relative strength class: none
- business validation: missing
- queue/apply: blocked

Diagnosis:

- the observed `Pause` wording was a real UI/detail wording mismatch, not the current resolved operator segment
- the row does not clear the account-relative Scale Review gate in the current decision path
- the current deterministic interpretation is a fatigued winner / replacement case, surfaced as `Refresh`
- safety remains conservative because business validation is missing

## Current Readiness

Ready for one final Claude live-firm product review after this PR passes checks and merges.

Not ready for final product acceptance yet.

The final review should focus on:

- whether zero `Scale Review` is acceptable when the closest audited rows are protected winners
- whether `Refresh` is the right product answer for `company-03-creative-07`
- whether the corrected UI taxonomy is understandable in the actual Creative page

## Next Recommended Action

Complete normal PR flow for this branch, then run one final Claude live-firm product review using:

- `docs/operator-policy/creative-segmentation-recovery/reports/ui-truth-scale-review-fix/final.md`
- the corrected live-firm audit artifact
- the live output restoration reports
- the scale-review-gap reports
- the date-range invariance audit

## Reports

- UI truth and Scale Review fix: `docs/operator-policy/creative-segmentation-recovery/reports/ui-truth-scale-review-fix/final.md`
- live output restoration final: `docs/operator-policy/creative-segmentation-recovery/reports/live-output-restoration-final.md`
- scale-review-gap final: `docs/operator-policy/creative-segmentation-recovery/reports/scale-review-gap/final.md`
- date-range invariance audit: `docs/operator-policy/creative-segmentation-recovery/reports/date-range-invariance-audit.md`
- implementation pass 6 final: `docs/operator-policy/creative-segmentation-recovery/reports/implementation-pass-6-final.md`

## Last Updated By Codex

- confirmed the actual UI taxonomy mismatch was real
- replaced primary Creative segment filters with the agreed taxonomy
- aligned overview, card, detail, and instruction wording with the operator segment
- reran the corrected live audit and confirmed `Scale = 0`, `Scale Review = 0`
- traced the specific user-observed case privately and documented only sanitized aliases
- audited date-range invariance and found no same-creative relabeling in the traced runtime path
- clarified that Creative segment filter counts follow the visible reporting set while row segments stay Decision OS anchored
- left policy thresholds and safety gates unchanged
