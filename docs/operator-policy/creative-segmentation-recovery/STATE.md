# Creative Segmentation Recovery State

Last updated: 2026-04-25 by Codex

## Current Goal

Send the completed final equal-segment fix work for Claude equal-segment re-review.

Creative Recovery is still not accepted as final until that review completes.

## Program Status

- foundation: merged
- foundation hardening: merged
- calibration data gate: passed
- live Meta cohort recovery: complete
- original 10-agent calibration panel: complete
- implementation passes 1-6: merged
- pass 6 fatigue hardening: merged
- live output restoration: merged
- UI taxonomy/count hardening: merged
- test campaign actionability: merged
- critical media-buyer fixes: merged
- critical fix hardening: merged
- equal-segment scoring audit: complete
- equal-segment gate fixes: merged through PR #59
- final equal-segment fixes: in progress on `feature/adsecute-creative-equal-segment-final-fixes`

## Claude Equal-Segment Re-Review Result

Claude's independent re-review found the PR #59 score claim was overstated:

- macro segment score: about `83/100`, not `86/100`
- raw row accuracy: about `83%`, not `90%`
- Watch score: `55/100`
- Refresh score: `73/100`
- Cut recall: below target because Cut-shaped rows were still hiding in Refresh
- IwaStore: about `80/100`
- TheSwaf: about `82/100`

Decision: Creative Recovery remains not accepted until the final fixes are reviewed.

## Final Equal-Segment Fixes

Implemented in this pass:

1. catastrophic CPA `fatigued_winner` / `refresh_replace` rows now route to review-safe `Cut`
   - fixes the Refresh-as-Cut hiding pattern from Claude Round 2
   - queue/push/apply authority remains review-gated
2. validating `keep_in_test` rows with at-benchmark 30-day ROAS and near-zero 7-day ROAS now route to `Refresh`
   - fixes the strongest Watch-as-Refresh miss
   - missing/unavailable 7-day or frequency evidence does not trigger the rule
3. high-relative Watch case traced and documented as defensible under current Scale Review floors
   - `company-05 / creative-04` remains `Watch`
   - reason: not explicit test-campaign context and spend is below the true-scale peer-spend floor for that account
   - Scale / Scale Review floors were intentionally unchanged

Preserved:

- no taxonomy changes
- no Scale / Scale Review floor changes
- no queue/push/apply loosening
- no old-rule takeover
- no Commercial Truth or baseline invention
- benchmark scope remains explicit
- selected reporting range remains non-authoritative

## Before / After Scores

Before uses Claude Round 2 independent review. After uses deterministic replay of the fixed gates over the same reviewed live cohort.

| Metric | Before | After |
|---|---:|---:|
| Macro segment score | `83/100` | `87/100` |
| Raw row accuracy | `83%` | `87%` |
| Watch score | `55/100` | `75/100` |
| Refresh score | `73/100` | `84/100` |
| Cut recall | `~77%` | `~92%` |
| IwaStore | `80/100` | `80/100` |
| TheSwaf | `82/100` | `82/100` |

## Latest Segment Replay

Post-fix deterministic replay on the reviewed live artifact:

- `Scale`: `0`
- `Scale Review`: `6`
- `Test More`: `13`
- `Protect`: `6`
- `Watch`: `9`
- `Refresh`: `16`
- `Retest`: `1`
- `Cut`: `14`
- `Campaign Check`: `0`
- `Not Enough Data`: `8`
- `Not eligible for evaluation`: `5`

## Remaining Weakest Segments

After the final targeted fixes:

- `Watch`: `75/100`
- `Test More`: `83/100`
- `Protect`: `83/100`

No additional implementation pass should start until Claude reruns the equal-segment review.

## Reports

- final equal-segment fixes: `docs/operator-policy/creative-segmentation-recovery/reports/equal-segment-final-fixes/final.md`
- equal-segment scoring final: `docs/operator-policy/creative-segmentation-recovery/reports/equal-segment-scoring/final.md`
- per-segment scores: `docs/operator-policy/creative-segmentation-recovery/reports/equal-segment-scoring/per-segment-scores.md`
- confusion matrix: `docs/operator-policy/creative-segmentation-recovery/reports/equal-segment-scoring/confusion-matrix.md`
- sanitized live artifact: `docs/operator-policy/creative-segmentation-recovery/reports/live-firm-audit/artifacts/sanitized-live-firm-audit.json`

## Next Recommended Action

Open the PR for `feature/adsecute-creative-equal-segment-final-fixes`, wait for checks, and merge only if the gates pass.

After merge, request Claude equal-segment re-review against `main`.

Creative Recovery should only be accepted if that review confirms the macro quality and no new severe live operator defect appears.
