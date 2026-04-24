# Creative Segmentation Recovery State

Last updated: 2026-04-25 by Codex

## Current Goal

Complete the narrow equal-segment gate-fix pass and send the result for Claude equal-segment re-review.

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
- equal-segment gate fixes: implemented on branch, pending PR flow

## Equal-Segment Baseline

The equal-segment audit scored Creative Decision OS with equal weight by user-facing segment:

- macro segment score: `76/100`
- raw row accuracy: `81%`
- IwaStore score: `78/100`
- TheSwaf score: `90/100`

Weakest segments:

- `Watch`: `50/100`
- `Protect`: `60/100`
- `Refresh`: `78/100`

## Equal-Segment Gate Fixes

Implemented in this pass:

1. `Protect` trend-collapse extension
   - stable/fatigued winners can now leave `Protect` for `Refresh` when recent ROAS collapses below the active benchmark.
2. blocked lifecycle CPA blowout extension
   - blocked rows with CPA at least `2.0x` peer median and ROAS at most `0.5x` benchmark now route to review-safe `Cut` instead of early `Not Enough Data`.
3. high-spend below-baseline Cut admission without 7d data
   - mature validating rows can route to review-safe `Cut` when spend is at least `max(5000, 5x peer median spend)`, purchases are at least `4`, and ROAS is at most `0.80x` benchmark.

Preserved:

- no taxonomy changes
- no Scale / Scale Review floor changes
- no queue/push/apply loosening
- no old-rule takeover
- no Commercial Truth or baseline invention
- benchmark scope remains explicit
- selected reporting range remains non-authoritative

## Equal-Segment After Score

Post-fix deterministic replay on the reviewed mismatch set:

- macro segment score: `86/100`
- raw row accuracy: `90%`
- Watch score: `75/100`
- Protect score: `86/100`
- Cut score: `91/100`
- Cut recall: `100%` for the three reviewed gate-miss classes
- IwaStore score: `87/100`
- TheSwaf score: `100/100`

Acceptance targets from this pass are met on the reviewed mismatch set:

- macro `>= 85`: met
- Watch `>= 75`: met
- Protect `>= 80`: met
- Cut recall `>= 85`: met
- raw accuracy does not regress: met
- IwaStore and TheSwaf do not regress: met

## Latest Live Rerun

Production-equivalent runtime path with corrected current Decision OS source:

- readable businesses: `8`
- sampled creatives: `78`
- `Scale`: `0`
- `Scale Review`: `6`
- `Test More`: `13`
- `Protect`: `6`
- `Watch`: `10`
- `Refresh`: `17`
- `Retest`: `1`
- `Cut`: `12`
- `Campaign Check`: `0`
- `Not Enough Data`: `8`
- `Not eligible for evaluation`: `5`

Notes:

- the three target gate classes no longer show obvious remaining misses in the latest sanitized artifact
- the audit wrote the sanitized artifact and local private artifact
- the command then exited non-zero because a background snapshot warm attempted to fetch `localhost:3000` while no dev server was running; the artifact itself was generated

## Remaining Weakest Segments

After the targeted fixes:

- `Watch`: `75/100`
- `Refresh`: `84/100`
- `Test More`: `85/100`

No additional implementation pass should start until Claude reruns the equal-segment review.

## Reports

- equal-segment gate fixes: `docs/operator-policy/creative-segmentation-recovery/reports/equal-segment-gate-fixes/final.md`
- equal-segment scoring final: `docs/operator-policy/creative-segmentation-recovery/reports/equal-segment-scoring/final.md`
- per-segment scores: `docs/operator-policy/creative-segmentation-recovery/reports/equal-segment-scoring/per-segment-scores.md`
- confusion matrix: `docs/operator-policy/creative-segmentation-recovery/reports/equal-segment-scoring/confusion-matrix.md`
- sanitized live artifact: `docs/operator-policy/creative-segmentation-recovery/reports/live-firm-audit/artifacts/sanitized-live-firm-audit.json`

## Next Recommended Action

Open the PR, finish checks, and request a Claude equal-segment re-review after merge or on the PR branch.

Creative Recovery should only be accepted if that review confirms the macro quality and no new severe live operator defect appears.
