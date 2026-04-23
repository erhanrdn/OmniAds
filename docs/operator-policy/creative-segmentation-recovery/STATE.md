# Creative Segmentation Recovery State

Last updated: 2026-04-23 by Codex

## Current Goal

Establish the Creative Segmentation Recovery foundation: shared context, current-state audit, narrow policy/surface fixes, and deterministic tests. This is not the calibration lab and not the full Creative policy rewrite.

## Product Doctrine

Adsecute is not a dashboard. The Creative page should behave like an expert Meta media buyer operator system that helps the user quickly understand what to scale, test more, protect, watch, refresh, retest, cut, check at campaign/context level, or ignore until enough data exists.

## User-Facing Segment Names

- Scale
- Scale Review
- Test More
- Protect
- Watch
- Refresh
- Retest
- Cut
- Campaign Check
- Not Enough Data

Internal policy segments may remain technical, but production UI labels must use media-buyer language and must not expose labels such as `blocked`, `contextual_only`, `hold_monitor`, `false_winner_low_evidence`, or `creative_learning_incomplete`.

## Commercial Truth Guidance

Commercial Truth is an absolute business validation and execution-safety layer. It must block profit claims, budget/bid/target assumptions, push/apply eligibility, and the fully validated Scale path when missing.

Commercial Truth must not make the system blind to relative creative quality. With explicit account or campaign baseline input, a creative may become `scale_review` / "Scale Review" when it strongly outperforms that baseline with sufficient spend and purchase evidence. Without explicit baseline input, do not infer `scale_review`.

## Benchmark Guidance

Default benchmark direction is account-wide. Campaign-level benchmark should be an explicit operator-triggered evaluation mode, not a silent side effect of selecting a campaign filter. The active benchmark scope must be visible. Current code has account-style peer fallback in `selectBenchmark`, but no explicit account/campaign `relativeBaseline` is wired into Creative policy yet.

## Old Rule Engine Guidance

The old rule engine is a challenger, not ground truth. Useful principles to preserve: relative account comparison, evidence sufficiency, and simple media-buyer labels. Do not copy old ROAS-only or low-purchase behavior blindly. Current active `buildHeuristicCreativeDecisions` now delegates to `buildCreativeDecisionOs`, so a truly independent old-rule challenger was not found in active code.

## Completed Work

- Created shared recovery context and reports folder.
- Added internal `scale_review` policy segment.
- Added explicit `relativeBaseline` input for account/campaign-relative Scale Review recognition.
- Added tests proving missing Commercial Truth does not suppress `scale_review` when explicit baseline exists, and does not create `scale_review` when baseline is missing.
- Preserved safety: `scale_review` is not queue-eligible, cannot apply, and does not become `safe_to_queue`.
- Removed verified unreachable `hasRoasOnlyPositiveSignal` branch inside `resolveSegment`.
- Narrowly patched kill/Cut recognition so `kill_candidate` no longer requires Commercial Truth in Creative policy; push/apply remains manual-only or blocked by policy.
- Fixed narrow HOLD conflation in Creative surface routing so `investigate` maps toward Campaign Check instead of the Hold bucket.
- Added media-buyer label mapping tests for Scale Review, Cut, Not Enough Data, Campaign Check, and Protect.

## Open Risks

- Upstream Decision OS still over-gates scale candidates before policy assessment: degraded Commercial Truth and `economics.status !== "eligible"` can turn `promote_to_scaling` into `keep_in_test`, so live `scale_review` will not appear until explicit baseline input is computed and wired upstream.
- Campaign benchmark mode is not implemented. Campaign filters do not expose a benchmark scope switch or visible active scope.
- The exact Claude review file `docs/external-reviews/creative-segmentation-recovery/claude-product-review.md` is absent. Existing Claude review inputs are `naming-and-calibration-review.md` and `claude-strategy-review.md`; do not overwrite Claude review files unless explicitly asked.
- Quick filter buckets remain coarse (`Scale`, `Test`, `Refresh`, `Hold`, `Evergreen`). Row-level operator labels are improved, but full 10-label production taxonomy is not complete.
- Independent old rule engine challenger is not active in current code; calibration may need git-history recovery or a new challenger harness based on documented old behavior.

## Reports And Tests

- Audit: `docs/operator-policy/creative-segmentation-recovery/reports/current-segmentation-audit.md`
- Foundation report: `docs/operator-policy/creative-segmentation-recovery/reports/foundation-final.md`
- Targeted tests passed:
  - `npx vitest run lib/creative-operator-policy.test.ts lib/creative-operator-surface.test.ts`
  - `npx vitest run lib/creative-decision-os.test.ts components/creatives/CreativeDecisionOsOverview.test.tsx components/creatives/CreativesTableSection.test.tsx`
  - `npx vitest run lib/command-center.test.ts`
- Full validation passed:
  - `npm test` (292 files, 2008 tests)
  - `npx tsc --noEmit`
  - `npm run build`
  - `git diff --check`
- No lint script exists in `package.json`.

## Next Recommended Action

Run full validation, open the foundation PR, and request Claude product review. After review, the next engineering step should be Account Baseline computation plus an explicit benchmark-scope contract before the Calibration Lab runs.
