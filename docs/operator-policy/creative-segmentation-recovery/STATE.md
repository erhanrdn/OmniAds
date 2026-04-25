# Creative Segmentation Recovery State

Last updated: 2026-04-25 by Codex

## Current Goal

Implement Claude's Creative equal-segment fix plan while honoring the supervisor target: every represented user-facing segment should reach `90+`.

Creative Recovery is still not accepted because `Watch` remains below `90` after this pass.

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
- final equal-segment fixes: merged through PR #61
- trend-collapse evidence hardening: merged through PR #63
- Claude fix-plan implementation: draft PR #65 open on `feature/adsecute-creative-claude-fix-plan-implementation`

## Current PR

- PR: `https://github.com/erhanrdn/OmniAds/pull/65`
- title: `Implement Claude Creative segment recalibration plan`
- status: draft/open
- merge status: not merged
- reason: `Watch` remains below the owner `90+` represented-segment target

## Fresh Baseline Audit

Current `main` at branch start was the PR #63 state:

- macro replay: `87/100`
- raw replay accuracy: `87%`
- Watch: `75/100`
- Refresh: `84/100`
- Protect: `83/100`
- Test More: `83/100`
- Not Enough Data: `88/100`
- Cut recall: about `92%`

A fresh live-firm audit was rerun on this branch after the patch using the corrected current Decision OS path:

- readable businesses: `8`
- sampled creatives: `78`
- Scale: `0`
- Scale Review: `7`
- Test More: `7`
- Protect: `1`
- Watch: `11`
- Refresh: `20`
- Retest: `2`
- Cut: `11`
- Campaign Check: `0`
- Not Enough Data: `14`
- Not eligible for evaluation: `5`

The committed sanitized artifact was updated at:

- `docs/operator-policy/creative-segmentation-recovery/reports/live-firm-audit/artifacts/sanitized-live-firm-audit.json`

The local private artifact remains local-only:

- `/tmp/adsecute-creative-live-firm-audit-local.json`

## Claude Fix Plan Implementation

Implemented:

1. validating trend-collapse Refresh admission now accepts mature quarter-trend collapse (`7d / 30d <= 0.25`) while preserving the PR #63 low-evidence guard.
2. catastrophic CPA `fatigued_winner` / `refresh_replace` Cut behavior was verified and preserved.
3. mature one-purchase catastrophic CPA rows can now route from `Not Enough Data` to review-safe `Cut`.
4. stable protected winners now use tiered trend-collapse sensitivity:
   - mild above-baseline winners (`1.0x` to `<1.4x` benchmark) can route to `Refresh` at `<=0.50` trend ratio
   - stronger winners keep the stricter `<=0.40` trend ratio
5. thin-spend weak-ratio positives now remain `Not Enough Data` instead of `Test More`; strong-relative thin-spend positives can still become `Test More`.

Skipped / not changed:

- Scale / Scale Review floors were not changed.
- The high-relative Watch case remains Watch because it is non-test context and fails the current true-scale peer-spend/intent floor.
- Queue/push/apply safety was not loosened.
- Benchmark scope remains explicit-only.
- Old challenger remains comparison-only.

## Before / After Scores

| Metric | Before | After |
|---|---:|---:|
| Macro segment score | `87/100` | `91/100` |
| Raw row accuracy | `87%` | `91%` |
| Watch score | `75/100` | `83/100` |
| Refresh score | `84/100` | `91/100` |
| Protect score | `83/100` | `90/100` |
| Test More score | `83/100` | `90/100` |
| Not Enough Data score | `88/100` | `92/100` |
| Cut recall | `~92%` | `~94%` |
| pdf-company-01 | `80/100` | `90/100` |
| pdf-company-02 | `82/100` | `90/100` |

## Remaining Blocker

`Watch` remains below the supervisor target:

- after score: `83/100`
- target: `90+`

The remaining blocker is a high-relative non-test Watch floor-policy question:

- representative sanitized trace: `company-05 / company-05-creative-04`
- current outcome: `Watch`
- reason: strong relative signal is present, but the row is not explicit test-campaign context and does not clear the current true-scale peer-spend/intent floor

Next narrow fix should decide whether this class should remain Watch or become a review-oriented state without changing Scale safety.

## Reports

- Claude fix plan implementation: `docs/operator-policy/creative-segmentation-recovery/reports/claude-fix-plan-implementation/final.md`
- equal-segment scoring final: `docs/operator-policy/creative-segmentation-recovery/reports/equal-segment-scoring/final.md`
- per-segment scores: `docs/operator-policy/creative-segmentation-recovery/reports/equal-segment-scoring/per-segment-scores.md`
- confusion matrix: `docs/operator-policy/creative-segmentation-recovery/reports/equal-segment-scoring/confusion-matrix.md`
- sanitized live artifact: `docs/operator-policy/creative-segmentation-recovery/reports/live-firm-audit/artifacts/sanitized-live-firm-audit.json`

## Next Recommended Action

Open the PR for this branch after validation.

Do not request Claude equal-segment review yet if the owner requires every represented segment to be `90+`. The next implementation pass, if authorized, should be a narrow Watch floor-policy pass for high-relative non-test Watch cases.
