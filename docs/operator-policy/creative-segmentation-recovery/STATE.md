# Creative Segmentation Recovery State

Last updated: 2026-04-25 by Codex

## Current Goal

Implement Claude's Creative equal-segment fix plan, the follow-up Watch floor-policy fix, the Round 5 Watch-as-Refresh closure, and the Protect/no-touch boundary investigation while honoring the supervisor target: every represented user-facing segment should reach `90+`.

Round 5 fixed the clear remaining Watch miss from Claude's Round 4 review. The Protect/no-touch investigation fixed the remaining reviewed Protect false positive without changing true no-touch safety. Creative Recovery still needs Claude equal-segment re-review before PR #65 is merged.

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
- Claude fix-plan implementation, Watch floor-policy fix, and Round 5 closure: PR #65 open on `feature/adsecute-creative-claude-fix-plan-implementation`
- Protect/no-touch boundary investigation: implemented on PR #65 branch

## Current PR

- PR: `https://github.com/erhanrdn/OmniAds/pull/65`
- title: `Implement Claude Creative segment recalibration plan`
- status: open; do not merge
- merge status: not merged
- latest checks: Round 5 local validation passed after the P1 review-only Scale Review hardening; GitHub CI passed (`test`, `typecheck`, `build`)
- reason: owner target is stricter than Claude's PASS WITH MONITORING verdict; do not merge before strict target closure or owner acceptance

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

A fresh live-firm audit was rerun on this branch after the Round 5 patch using the corrected current Decision OS path:

- readable businesses: `8`
- sampled creatives: `78`
- Scale: `0`
- Scale Review: `6`
- Test More: `7`
- Protect: `1`
- Watch: `10`
- Refresh: `23`
- Retest: `0`
- Cut: `12`
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
7. validating below-benchmark rows with zero recent ROAS and enough spend/purchase/impression evidence can now route from `Watch` to review-only `Refresh`.
8. PR #65 P1 hardening: high-relative non-test review candidates are excluded from true `Scale` intent / `scaleAction`, so favorable business validation cannot promote that review-only path into `scale_ready` or queue eligibility.
9. PR #65 P2 hardening: the new below-benchmark collapse Refresh gate now requires known creative age `>= 7` days, so unknown-age creatives stay conservative.
10. Protect/no-touch boundary fix: high-volume stable winners below active benchmark with elevated CPA now route to `Watch` instead of passive `Protect`, while explicit protected watchlist rows remain Protect.

Preserved / not changed:

- True `Scale` floors were not changed.
- Broad Scale Review floors were not changed; the new Watch fix is a narrow non-test high-relative floor with stronger evidence requirements.
- Queue/push/apply safety was not loosened.
- Benchmark scope remains explicit-only.
- Old challenger remains comparison-only.

## Before / After Scores

| Metric | Before | After |
|---|---:|---:|
| Macro segment score | `87/100` | about `90/100` under Claude's Round 4 independent scoring plus Round 5 and Protect boundary fix |
| Raw row accuracy | `~88%` | about `90%` |
| Watch score | `75/100` | about `90/100` after Round 5 |
| Refresh score | `88/100` | about `90/100` after Round 5 |
| Protect score | `88/100` | about `90/100` after Protect boundary fix |
| Test More score | `83/100` | `90/100` |
| Not Enough Data score | `88/100` | `92/100` |
| Cut recall | `~92%` | `~94%` |
| pdf-company-01 | `88/100` | `88/100` unchanged; remaining gap is not a Protect/no-touch defect |
| pdf-company-02 | `87/100` | about `90/100` after Round 5 |

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
- PR #65 P1 review issue was real and fixed: this path is no longer part of true `scaleIntent` or `scaleAction`; even with favorable business validation and true-scale evidence it remains `Scale Review`, `operator_review_required`, and queue/apply blocked.

## Round 5 Equal-Segment Target Closure

Status: fixed for the clear Watch miss; followed by Protect boundary investigation.

Fixed gate:

- representative sanitized trace: `company-08 / company-08-creative-10`
- before outcome: `Watch`
- after outcome: `Refresh`
- reason: validating / keep-in-test row had ROAS around `0.37x` active benchmark, 7-day ROAS `0`, spend around `$378`, `2` purchases, meaningful impressions, and no campaign-context blocker

Gate added:

- `isValidatingBelowBaselineCollapseRefreshCandidate`
- admits only validating / keep-in-test rows at or below `0.40x` active benchmark with zero or collapsed recent ROAS, spend `>= 300`, purchases `>= 2`, impressions `>= 3000`, and known creative age `>= 7`
- stronger rows that meet existing Cut gates still route to `Cut`
- campaign-context blockers still route to `Campaign Check`

Surface alignment:

- the fixed row now has `Refresh` label, `Refresh` instruction headline, and Refresh-specific reason / next observation
- queue/apply remain false

## Protect Boundary Investigation

Status: implemented in current branch.

Result:

- the issue was real as a narrow reviewed-set boundary
- sanitized reviewed row: `company-05 / company-05-creative-01`
- before: `Protect`
- expected: `Watch`
- gate responsible: unconditional `hold_no_touch` fallback to `protected_winner`
- fix: added a narrow below-benchmark high-CPA stable winner guard that routes to `hold_monitor` / Watch

Admission requires:

- lifecycle `stable_winner`
- primary action `hold_no_touch`
- not explicitly `protected_watchlist`
- reliable relative baseline
- spend at least `max(1000, 1.25x peer median spend)`
- mature purchase, impression, and creative-age evidence
- ROAS at or below `0.90x` active benchmark
- CPA at least `1.50x` peer median CPA
- no campaign/ad set blocker

Preserved:

- true protected watchlist rows remain Protect
- healthy above-benchmark no-touch winners remain Protect
- scale-worthy review-only rows remain Scale Review
- trend-collapse winners still route to Refresh only through existing trend gates
- queue/push/apply safety unchanged

Score read:

- Protect: `88/100` -> about `90/100`
- pdf-company-01: remains about `88/100`, but investigation found the remaining gap is not this Protect/no-touch boundary and is a minor business-level fatigued/Test More/Refresh judgment
- every represented segment is now at or about `90+`, pending Claude re-review

## Validation

- targeted Creative policy tests: passed
- targeted Creative policy/surface/Decision OS/prescription tests: passed
- targeted Creative UI surface tests: passed
- targeted Command Center safety tests: passed
- full `npm test`: passed
- `npx tsc --noEmit`: passed
- `npm run build`: passed
- `/creatives` localhost smoke: passed through expected auth redirect/load
- `/platforms/meta` localhost smoke: passed through expected auth redirect/load
- `git diff --check`: passed
- hidden/bidi/control scan: passed
- raw ID scan on touched docs: passed
- live-firm audit rerun attempt: blocked by production DB query timeout over the SSH tunnel (`DB query timed out after 8000ms`); no committed live-firm artifact changed
- Round 5 targeted policy/surface tests: passed
- Round 5 live-firm audit rerun: passed
- PR #65 P1 regression test for review-only non-test Scale Review: passed
- PR #65 P2 regression test for unknown-age below-benchmark collapse rows: passed
- Protect boundary policy tests: passed

## Reports

- Claude fix plan implementation: `docs/operator-policy/creative-segmentation-recovery/reports/claude-fix-plan-implementation/final.md`
- Watch floor policy fix: `docs/operator-policy/creative-segmentation-recovery/reports/watch-floor-policy-fix/final.md`
- Round 5 target closure: `docs/operator-policy/creative-segmentation-recovery/reports/round-5-equal-segment-target-closure/final.md`
- Protect boundary investigation: `docs/operator-policy/creative-segmentation-recovery/reports/protect-boundary-investigation/final.md`
- equal-segment scoring final: `docs/operator-policy/creative-segmentation-recovery/reports/equal-segment-scoring/final.md`
- per-segment scores: `docs/operator-policy/creative-segmentation-recovery/reports/equal-segment-scoring/per-segment-scores.md`
- confusion matrix: `docs/operator-policy/creative-segmentation-recovery/reports/equal-segment-scoring/confusion-matrix.md`
- sanitized live artifact: `docs/operator-policy/creative-segmentation-recovery/reports/live-firm-audit/artifacts/sanitized-live-firm-audit.json`

## Next Recommended Action

Do not merge PR #65 yet. Run Claude equal-segment re-review against the updated PR #65 branch. If that review confirms the represented segments are at or above the strict target or documents only monitoring-level business borderlines, PR #65 can leave draft/merge review after supervisor approval.
