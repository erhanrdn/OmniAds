# Creative Segmentation Recovery State

Last updated: 2026-04-24 by Codex

## Current Goal

Regenerate the live-firm audit on the corrected source path so the next step can be one final Claude live-firm product review.

This pass is audit regeneration only. No Creative policy logic was changed.

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
- corrected live-firm audit rerun: complete on branch, pending draft PR review

## Live-Firm Audit Status

The stale zero-row audit has been replaced with a corrected-source rerun.

Validated rerun results:

- readable live Meta businesses audited: `8`
- current Decision OS creatives across audited businesses: `306`
- sampled creatives: `78`
- businesses with zero current Decision OS creatives: `0`

## Corrected Live-Firm Segment Counts

Sampled live-firm segment counts:

- `Scale`: `0`
- `Scale Review`: `0`
- `Protect`: `6`
- `Watch`: `7`
- `Refresh`: `12`
- `Test More`: `6`
- `Campaign Check`: `0`
- `Not Enough Data`: `8`
- `Not eligible for evaluation`: `39`

## Top Systemic Problems

1. zero live `Scale` across the sampled audit cohort
2. zero live `Scale Review` across the sampled audit cohort
3. contextual-only output still dominates `39` of `78` sampled rows
4. `12` strong-relative rows are still buried under contextual-only gating
5. live instruction-headline alignment is still mixed for `Refresh`, `Test More`, and `Not Enough Data`

## Whether Current Creative Segmentation Is Trustworthy Enough

Not yet.

What is now proven:

- current live rows flow for every readable business
- the page surfaces live `Protect`, `Refresh`, `Watch`, `Test More`, and `Not Enough Data` states
- the remaining gaps are product-truth gaps, not source/output gaps

What still needs product review:

- whether zero live `Scale` / `Scale Review` is acceptable
- whether contextual-only gating is too strong on real strong-relative rows
- whether the page is now better than manual table reading across the full cohort

## Whether Another Live-Firm Audit Is Still Needed

Not before the final Claude review.

The next step is review of this corrected audit set, not another rerun.

## Next Recommended Action

Run one final Claude live-firm product review against the corrected live-firm audit outputs on this branch.

## Reports

- global summary: `docs/operator-policy/creative-segmentation-recovery/reports/live-firm-audit/global-summary.md`
- per-business summary: `docs/operator-policy/creative-segmentation-recovery/reports/live-firm-audit/per-business-summary.md`
- agent panel: `docs/operator-policy/creative-segmentation-recovery/reports/live-firm-audit/agent-panel.md`
- mismatch clusters: `docs/operator-policy/creative-segmentation-recovery/reports/live-firm-audit/mismatch-clusters.md`
- final: `docs/operator-policy/creative-segmentation-recovery/reports/live-firm-audit/final.md`

## Last Updated By Codex

- reran the live-firm audit on the corrected current Decision OS source path
- regenerated the sanitized live-firm artifact and local private reference artifact
- reran the 10-role media-buyer panel on the corrected sample
- regenerated the live-firm audit reports so the next step can be one final Claude live-firm product review
