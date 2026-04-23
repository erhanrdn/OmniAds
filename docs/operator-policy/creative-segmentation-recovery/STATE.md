# Creative Segmentation Recovery State

Last updated: 2026-04-23 by Codex

## Current Goal

Implementation pass 5 is complete as a holdout validation and targeted-tuning pass.

The immediate next step is a single Claude product review on the current live holdout-backed state.

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
- implementation pass 5: complete on branch, pending normal PR flow

## What Pass 5 Implemented

Pass 5 added validation infrastructure and decision evidence, not a broad policy rewrite.

Implemented:

- deterministic live-cohort holdout split
- stable sanitized company alias assignment for holdout reporting
- current-evaluation artifact for calibration and holdout cohorts
- holdout-specific 10-role panel rerun on representative live rows
- raw `[meta-serving]` log suppression in sanitized calibration/holdout runs
- regression coverage for deterministic split stability and small-cohort fallback

Not implemented:

- no Creative policy threshold change
- no queue/push/apply loosening
- no benchmark-scope semantic change
- no broad scale-path rewrite

## Holdout Validation Result

Holdout validation ran successfully.

Current live cohort:

- runtime-eligible companies: `7`
- calibration split: `5`
- holdout split: `2`
- all evaluated creatives: `293`
- holdout creatives: `101`

Current holdout user-facing distribution:

- `Campaign Check = 3`
- `Refresh = 2`
- `Protect = 2`
- `Watch = 11`
- `Test More = 8`
- `Not Enough Data = 43`
- `Not eligible for evaluation = 32`
- `Scale Review = 0`
- `Scale = 0`

## Whether Tuning Was Implemented In Pass 5

No policy tuning was implemented.

Reason:

- the holdout rerun did not produce a clean true-`Scale` confirmation
- it also did not produce a single uncontested `Scale Review` false negative
- remaining disagreements were real but boundary-only
- no single deterministic fix was strong enough to justify pass-5 code tuning

## Whether `Scale` / `Scale Review` Look Healthy Enough

Current reading:

- true `Scale` remains appropriately strict
- `Scale Review` remains review-only and safety-preserving
- missing Commercial Truth is not erasing most relative diagnoses anymore
- the live holdout cohort is dominated by missing business validation, so pass 5 did not yield a strong live expansion case for either `Scale` or `Scale Review`

One boundary issue remains:

- one holdout row (`company-01/company-01-creative-03`) split the panel across `Watch`, `Scale Review`, and `Protect`

That is important enough to document, but not strong enough to retune from this pass alone.

## Remaining Mismatch Clusters

1. `Watch` vs `Scale Review` / `Protect` on a strong relative row with missing business validation and fatigue-watch pressure
2. `Not Enough Data` vs `Watch` wording for a high-spend zero-purchase row
3. `Test More` vs `Watch` wording for an under-sampled positive row that still trails strong baselines

No foundational mismatch cluster remains around:

- `Campaign Check`
- `Refresh`
- `Protect`
- old-rule challenger overreach
- evidence-thin rows leaking into action-forward labels

## Whether Creative Segmentation Recovery Is Ready For A Claude Product Review

Yes.

Reason:

- holdout validation actually ran on the live eligible cohort
- segmentation is materially better than the original calibration baseline on the important confirmed clusters
- remaining issues are now boundary/product-judgment questions, not data-accuracy failures
- the taxonomy is coherent
- the relative-strength vs business-validation story is coherent
- no major old-rule-style mismatch cluster remains unaddressed

## Whether Pass 6 Is Needed

Not before Claude review.

Pass 6 should be decided only after the single Claude product review lands.

## Next Recommended Action

1. merge implementation pass 5 through normal PR flow
2. run one Claude product review against the current holdout-backed state
3. use that review to decide whether a focused pass 6 is warranted for the remaining boundary cases

## Reports

- calibration final: `docs/operator-policy/creative-segmentation-recovery/reports/calibration-lab/final.md`
- mismatch synthesis: `docs/operator-policy/creative-segmentation-recovery/reports/calibration-lab/mismatch-synthesis.md`
- fixture candidate plan: `docs/operator-policy/creative-segmentation-recovery/reports/calibration-lab/fixture-candidate-plan.md`
- implementation pass 1 final: `docs/operator-policy/creative-segmentation-recovery/reports/implementation-pass-1-final.md`
- implementation pass 2 final: `docs/operator-policy/creative-segmentation-recovery/reports/implementation-pass-2-final.md`
- implementation pass 3 final: `docs/operator-policy/creative-segmentation-recovery/reports/implementation-pass-3-final.md`
- implementation pass 4 final: `docs/operator-policy/creative-segmentation-recovery/reports/implementation-pass-4-final.md`
- holdout split: `docs/operator-policy/creative-segmentation-recovery/reports/holdout-validation-split.md`
- pass 5 current eval: `docs/operator-policy/creative-segmentation-recovery/reports/implementation-pass-5-current-eval.md`
- pass 5 agent panel: `docs/operator-policy/creative-segmentation-recovery/reports/implementation-pass-5-agent-panel.md`
- pass 5 delta analysis: `docs/operator-policy/creative-segmentation-recovery/reports/implementation-pass-5-delta-analysis.md`
- pass 5 final: `docs/operator-policy/creative-segmentation-recovery/reports/implementation-pass-5-final.md`

## Last Updated By Codex

- built deterministic holdout validation for the live eligible cohort
- reran current segmentation on calibration and holdout splits
- reran the 10-role diagnosis panel on a representative holdout slice
- documented that no further safe policy tuning was warranted from pass 5 alone
- prepared the work for one Claude product review before any pass 6
