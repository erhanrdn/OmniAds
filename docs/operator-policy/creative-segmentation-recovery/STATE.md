# Creative Segmentation Recovery State

Last updated: 2026-04-25 by Codex

## Current Goal

Implement Claude's Creative equal-segment fix plan and the follow-up Watch floor-policy fix while honoring the supervisor target: every represented user-facing segment should reach `90+`.

Deterministic replay now reaches `90+` for every represented segment. Creative Recovery still needs Claude equal-segment re-review before final acceptance.

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
- Claude fix-plan implementation and Watch floor-policy fix: PR #65 open on `feature/adsecute-creative-claude-fix-plan-implementation`

## Current PR

- PR: `https://github.com/erhanrdn/OmniAds/pull/65`
- title: `Implement Claude Creative segment recalibration plan`
- status: open; ready for review after validation
- merge status: not merged
- reason: awaiting independent Claude equal-segment re-review; do not merge before review/owner acceptance

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
- Scale Review: `6`
- Test More: `8`
- Protect: `4`
- Watch: `7`
- Refresh: `18`
- Retest: `0`
- Cut: `16`
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
6. high-relative non-test Watch false negatives can now route to review-only `Scale Review` when evidence is mature and no context blocker exists.

Preserved / not changed:

- True `Scale` floors were not changed.
- Broad Scale Review floors were not changed; the new Watch fix is a narrow non-test high-relative floor with stronger evidence requirements.
- Queue/push/apply safety was not loosened.
- Benchmark scope remains explicit-only.
- Old challenger remains comparison-only.

## Before / After Scores

| Metric | Before | After |
|---|---:|---:|
| Macro segment score | `87/100` | `92/100` |
| Raw row accuracy | `87%` | `92%` |
| Watch score | `75/100` | `90/100` |
| Refresh score | `84/100` | `91/100` |
| Protect score | `83/100` | `90/100` |
| Test More score | `83/100` | `90/100` |
| Not Enough Data score | `88/100` | `92/100` |
| Cut recall | `~92%` | `~94%` |
| pdf-company-01 | `80/100` | `90/100` |
| pdf-company-02 | `82/100` | `90/100` |

## Watch Floor Policy Fix

Status: fixed in deterministic replay.

- before this fix: `Watch` at `83/100`
- after this fix: `Watch` at `90/100`

Gate fixed:

- representative sanitized trace: `company-05 / company-05-creative-04`
- before outcome: `Watch`
- after outcome: `Scale Review`
- reason: the row has strong baseline-backed relative evidence, mature spend/purchase/impression depth, non-worse CPA, missing business validation, non-test context, and no primary campaign blocker

The fix remains review-only:

- missing Commercial Truth still blocks true `Scale`
- queue/apply remain false
- campaign-context blockers still become `Campaign Check`
- no-touch winners still become `Protect`

## Remaining Blockers

No represented segment is below `90` in deterministic replay.

Remaining requirement: independent Claude equal-segment re-review.

## Reports

- Claude fix plan implementation: `docs/operator-policy/creative-segmentation-recovery/reports/claude-fix-plan-implementation/final.md`
- Watch floor policy fix: `docs/operator-policy/creative-segmentation-recovery/reports/watch-floor-policy-fix/final.md`
- equal-segment scoring final: `docs/operator-policy/creative-segmentation-recovery/reports/equal-segment-scoring/final.md`
- per-segment scores: `docs/operator-policy/creative-segmentation-recovery/reports/equal-segment-scoring/per-segment-scores.md`
- confusion matrix: `docs/operator-policy/creative-segmentation-recovery/reports/equal-segment-scoring/confusion-matrix.md`
- sanitized live artifact: `docs/operator-policy/creative-segmentation-recovery/reports/live-firm-audit/artifacts/sanitized-live-firm-audit.json`

## Next Recommended Action

After checks pass, mark PR #65 ready for review and request Claude equal-segment re-review against PR #65 or the eventual merged result.
