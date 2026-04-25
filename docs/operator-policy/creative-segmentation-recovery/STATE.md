# Creative Segmentation Recovery State

Last updated: 2026-04-25 by Codex

## Current Goal

Finish the Creative Decision OS manual snapshot pass.

Creative Recovery remains not accepted as final until the Creative page stops
auto-mutating operator analysis from reporting-range changes and the snapshot
pass is merged.

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
- Creative Decision OS manual snapshots: implemented on branch, PR pending

## Creative Decision OS Manual Snapshot Pass

Status: implemented on `feature/adsecute-creative-decision-os-snapshots`; PR pending.

PR:

- URL: `https://github.com/erhanrdn/OmniAds/pull/66`
- title: `Add manual Creative Decision OS analysis snapshots`
- branch: `feature/adsecute-creative-decision-os-snapshots`
- local validation: passed
- GitHub status contexts: none reported by the connector at PR-open time
- merge status: pending normal PR merge

Root issue:

- `app/(dashboard)/creatives/page.tsx` enabled a `creative-decision-os` query on page load.
- that query key included `drStart` and `drEnd`
- changing the selected reporting range could refetch `/api/creatives/decision-os`
- the API `GET` path computed Decision OS immediately

Fix summary:

- added `creative_decision_os_snapshots`
- added `lib/creative-decision-os-snapshots.ts`
- changed Creative Decision OS API behavior:
  - `GET /api/creatives/decision-os` loads the latest matching snapshot only
  - `POST /api/creatives/decision-os` manually computes and saves a snapshot
- changed the Creative page to:
  - load snapshot state on page load
  - show `Run Creative Analysis`
  - show last analyzed timestamp
  - show analysis scope and benchmark scope
  - keep reporting-range changes reporting-only
  - show not-run state when a matching business/scope snapshot does not exist

Snapshot identity:

- business
- analysis scope: account or campaign
- benchmark scope: account or campaign
- benchmark scope id when campaign-scoped

Reporting dates are stored as context only and are not snapshot authority.

Policy/safety impact:

- no Creative segmentation retune
- no taxonomy change
- no Scale / Scale Review floor change
- no queue/push/apply safety change
- no Command Center safety change

Validation so far:

- targeted snapshot store/API/page/drawer tests passed
- full `npm test`
- `npm run build`
- `npx tsc --noEmit`
- `git diff --check`
- hidden/bidi/control scan
- raw ID scan on touched docs/reports
- runtime smoke on `/creatives` and `/platforms/meta`

Remaining before merge:

- PR checks

## Final Equal-Segment PR Flow

Status: complete.

- PR: `https://github.com/erhanrdn/OmniAds/pull/61`
- title: `Fix final Creative equal-segment misses`
- branch: `feature/adsecute-creative-equal-segment-final-fixes`
- checks: passed
- merge method: squash
- merged commit: `bc8cc1f1654f61f09154230e1605653dcc3b34f4`
- merged to: `main`

## PR #61 P1 Trend-Collapse Evidence Issue

Status: fixed and merged through PR #63.

- PR: `https://github.com/erhanrdn/OmniAds/pull/63`
- title: `Harden Creative trend-collapse Refresh evidence guard`
- branch: `feature/adsecute-creative-trend-collapse-evidence-hardening`
- checks: passed
- merge method: squash
- merged commit: `9393bde844c4417f49a6b4aaa48407639da47ff6`
- merged to: `main`

The issue was real. `isValidatingTrendCollapseRefreshCandidate` could run before the under-sampled branch and did not require creative age maturity, so a very new validating creative with a noisy 7-day dip could become `Refresh`.

Guard added:

- the validating trend-collapse Refresh helper now requires the existing meaningful-read helper
- this enforces peer-relative spend maturity, at least `2` purchases, at least `5000` impressions, and creative age greater than `10` days

Tests added:

- very new validating creative + 7-day dip => not `Refresh`
- under-sampled validating creative + 7-day dip => not `Refresh`
- mature validating trend-collapse fixture remains `Refresh`
- mature severe failure fixture remains `Cut`
- missing 7-day/frequency evidence still does not trigger `Refresh`

The PR #61 score intent remains acceptable:

- macro segment score replay remains `87/100`
- Watch score replay remains `75/100`
- Refresh score replay remains `84/100`
- Cut recall replay remains about `92%`

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
- trend-collapse evidence hardening: `docs/operator-policy/creative-segmentation-recovery/reports/trend-collapse-evidence-hardening/final.md`
- equal-segment scoring final: `docs/operator-policy/creative-segmentation-recovery/reports/equal-segment-scoring/final.md`
- per-segment scores: `docs/operator-policy/creative-segmentation-recovery/reports/equal-segment-scoring/per-segment-scores.md`
- confusion matrix: `docs/operator-policy/creative-segmentation-recovery/reports/equal-segment-scoring/confusion-matrix.md`
- sanitized live artifact: `docs/operator-policy/creative-segmentation-recovery/reports/live-firm-audit/artifacts/sanitized-live-firm-audit.json`

## Next Recommended Action

Request Claude equal-segment re-review against `main`.

Creative Recovery should only be accepted if that review confirms the macro quality and no new severe live operator defect appears.
