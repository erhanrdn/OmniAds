# Creative Segmentation Recovery State

Last updated: 2026-04-24 by Codex

## Current Goal

Finish source-side live-firm cleanup, then hand the current live sample to one final Claude product review.

This pass stayed narrow. It did not retune Creative policy thresholds or change taxonomy.

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
- corrected live-firm audit rerun: complete on branch
- scale-review-gap recovery: complete on branch, pending normal PR flow

## Was This Pass Needed

Yes.

The corrected live-firm audit still showed:

- `Scale = 0`
- `Scale Review = 0`
- four businesses fully buried under `Not eligible for evaluation`

That was still enough to justify one narrow source/output recovery pass before a final live-firm product review.

## Top Live-Firm Scale Review Blocker

The main blocker was **not** the review-only scale rule itself.

It was the top-level Creative `evidenceSource` resolver:

- primary 30d creative rows were live
- support windows and campaign/ad set snapshot reads could still be `unknown`
- the aggregate resolver collapsed that mixed state to `unknown`
- operator policy then fail-closed to `contextual_only`
- the surface rendered that as `Not eligible for evaluation`

That source-authority collapse buried real downstream states such as `Protect`, `Refresh`, `Watch`, `Test More`, and `Not Enough Data` before they could surface.

## What Was Fixed

Source-only change:

- the Decision OS source now treats the primary 30d creative window as the authoritative row-evidence source
- support-window or campaign/ad set unreadability no longer erases live row authority by itself

Preserved:

- no queue/push/apply loosening
- no Creative taxonomy changes
- no benchmark-scope changes
- no Commercial Truth logic changes
- no old-rule challenger promotion

## Live-Firm Counts After Rerun

Comparison basis:

- same deterministic corrected live-firm sample
- `78` sampled creatives
- the four previously source-gated businesses were re-evaluated live
- already-live businesses were unchanged by construction

### Before

- `Scale`: `0`
- `Scale Review`: `0`
- `Protect`: `6`
- `Refresh`: `12`
- `Watch`: `7`
- `Test More`: `6`
- `Not Enough Data`: `8`
- `Not eligible for evaluation`: `39`

### After

- `Scale`: `0`
- `Scale Review`: `0`
- `Protect`: `16`
- `Refresh`: `14`
- `Watch`: `21`
- `Test More`: `8`
- `Not Enough Data`: `13`
- `Not eligible for evaluation`: `6`

Business counts:

- businesses with zero `Scale`: `8`
- businesses with zero `Scale Review`: `8`

## What The Rerun Proved

The pass materially improved live readability:

- `33` sampled rows moved out of `Not eligible for evaluation`
- previously buried rows now surface as meaningful live outputs
- the largest recovered states were `Protect`, `Watch`, `Refresh`, `Test More`, and `Not Enough Data`

Representative recovered transitions:

- `company-01-creative-01` -> `Protect`
- `company-01-creative-04` -> `Watch`
- `company-02-creative-01` -> `Refresh`
- `company-04-creative-02` -> `Test More`
- `company-08-creative-06` -> `Not Enough Data`

## What The Rerun Did Not Prove

The pass did **not** create a believable hidden `Scale Review` distribution.

After the source fix:

- `Scale Review` remained `0`
- the strongest previously suspicious row (`company-01-creative-04`) resolved to `Watch`, not `Scale Review`
- most previously buried strong rows resolved to `Protect`, `Refresh`, or `Watch`

That means the remaining zero-`Scale Review` state now looks like a real current product judgment, not a hidden source-path failure.

## Whether Current Creative Output Is Trustworthy Enough

Improved, but still not signed off.

What is now trustworthy:

- current live row flow
- live source authority for previously buried businesses
- the fact that many zero-review misses were actually source-suppressed `Protect` / `Refresh` / `Watch` rows

What still needs product judgment:

- whether zero live `Scale` / zero live `Scale Review` is acceptable
- whether the current live taxonomy is good enough versus manual table reading
- whether the remaining `Watch` / `Not Enough Data` / `Protect` mix is the right buyer-facing outcome

## Whether Another Implementation Pass Is Needed

Not before one final Claude live-firm product review.

Reason:

- the hidden source bug is fixed
- the remaining gap no longer has a safe deterministic source-layer patch
- any further change would be a real product-policy retune

## Whether This Is Ready For Final Claude Live-Firm Review

Yes.

Reason:

- the corrected live-firm sample is no longer blocked by source/output mismatch
- the last safe source-authority recovery is now in place
- the remaining zero-`Scale Review` question is product-level, not a hidden runtime bug

## Next Recommended Action

Run one final Claude live-firm product review on top of:

- the corrected live-firm audit
- the source-authority recovery
- the scale-review-gap reports from this pass

## Reports

- implementation pass 6 final: `docs/operator-policy/creative-segmentation-recovery/reports/implementation-pass-6-final.md`
- live output restoration final: `docs/operator-policy/creative-segmentation-recovery/reports/live-output-restoration-final.md`
- scale-review-gap candidate set: `docs/operator-policy/creative-segmentation-recovery/reports/scale-review-gap/candidate-set.md`
- scale-review-gap gate trace: `docs/operator-policy/creative-segmentation-recovery/reports/scale-review-gap/gate-trace.md`
- scale-review-gap cluster analysis: `docs/operator-policy/creative-segmentation-recovery/reports/scale-review-gap/cluster-analysis.md`
- scale-review-gap final: `docs/operator-policy/creative-segmentation-recovery/reports/scale-review-gap/final.md`

## Last Updated By Codex

- confirmed the pass was still needed after the corrected live-firm rerun
- traced the suppressor to aggregate source-authority collapse before policy evaluation
- patched the Decision OS source resolver so live primary rows remain live
- reran the previously affected live-firm sample and confirmed meaningful outputs now surface
- confirmed that remaining zero `Scale Review` now appears to be a real product judgment, not a hidden source bug
