# Creative Segmentation Recovery State

Last updated: 2026-04-23 by Codex

## Current Goal

Harden the Creative Segmentation Recovery foundation so the Calibration Lab can start from explicit baselines, safe `scale_review` behavior, readable operator labels, and a non-authoritative legacy challenger. This is not the Calibration Lab and not the full Creative policy rewrite.

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

Internal policy segments may remain technical, but production UI labels must use media-buyer language and must not expose labels such as `blocked`, `contextual_only`, `hold_monitor`, `false_winner_low_evidence`, or `creative_learning_incomplete`. Policy/system ineligible rows may use the system note "Not eligible for evaluation" instead of masquerading as a creative-quality segment.

## Commercial Truth Guidance

Commercial Truth is an absolute business validation and execution-safety layer. It must block profit claims, budget/bid/target assumptions, push/apply eligibility, and the fully validated Scale path when missing.

Commercial Truth must not make the system blind to relative creative quality. With reliable explicit account or campaign baseline input, a creative may become `scale_review` / "Scale Review" when it strongly outperforms that baseline with sufficient spend and purchase evidence. Without reliable explicit baseline input, do not infer `scale_review`.

## Scale Review Current Behavior

`scale_review` is a relative creative-quality signal, not push approval. It can become `operator_review_required` only when the blocker is missing Commercial Truth / absolute business validation and the row otherwise has live evidence, provenance, trust metadata, preview truth, reliable relative baseline, and usable campaign/ad set context.

Hard blockers still force `blocked_from_push`: missing provenance, missing trust metadata, non-live/demo/snapshot/fallback/unknown evidence, missing or degraded preview truth, suppressed rows, inactive/archive rows, and weak campaign/ad set context. `scale_review` is never queue-eligible and `canApply` remains false.

## Benchmark Guidance

Default benchmark direction is account-wide. Campaign-level benchmark must be explicit and cannot be a silent side effect of selecting a campaign filter. Creative Decision OS now exposes `summary.benchmarkScope` and per-row relative baseline metadata: `benchmarkScope`, `benchmarkScopeLabel`, `benchmarkSource`, `benchmarkReliability`, and `relativeBaseline`.

Campaign scope is used only when `benchmarkScope: { scope: "campaign", scopeId }` is passed. Future UI should show the active scope label without making the selected reporting range an action authority.

## Baseline Computation Status

Account and campaign baselines are computed deterministically when row data exists. Baselines include scope, sanitized benchmark key, scope id/label, creative count, eligible creative count, spend basis, purchase basis, weighted ROAS, weighted CPA, median ROAS, median CPA, median spend, reliability, and missing context.

Reliability values are `strong`, `medium`, `weak`, and `unavailable`. Only `strong` or `medium` baselines can support `scale_review`. Missing or weak baselines downgrade to non-scale-review outcomes and are reported as data gaps.

## Old Rule Engine Guidance

The old rule engine is a challenger, not ground truth. Useful principles to preserve: relative account comparison, evidence sufficiency, and simple media-buyer labels. Do not copy old ROAS-only or low-purchase behavior blindly.

Current active `buildHeuristicCreativeDecisions` still delegates to `buildCreativeDecisionOs`. A recovered old-rule-style helper now exists at `lib/creative-old-rule-challenger.ts` for calibration comparison only. It emits challenger action, reason, metrics used, confidence, score, and non-authoritative flags. It must not drive UI, queue, push, apply, or policy directly.

## Completed Work

- Created shared recovery context and reports folder.
- Added internal `scale_review` policy segment.
- Added explicit account/campaign relative baseline computation and metadata wiring into Creative Decision OS.
- Added benchmark scope metadata with account default and explicit campaign scope.
- Added tests proving missing Commercial Truth does not suppress `scale_review` when a reliable explicit baseline exists, and does not create `scale_review` when baseline is missing or weak.
- Hardened `scale_review` push readiness around provenance, trust, evidence source, preview truth, suppression/archive status, and campaign/ad set context.
- Preserved safety: `scale_review` is not queue-eligible, cannot apply, and does not become `safe_to_queue`.
- Removed verified unreachable `hasRoasOnlyPositiveSignal` branch inside `resolveSegment`.
- Patched the small-account ROAS-only edge so low spend with meaningful purchase evidence is not automatically treated as ROAS-only noise.
- Narrowly patched kill/Cut recognition so `kill_candidate` no longer requires Commercial Truth in Creative policy; push/apply remains manual-only or blocked by policy.
- Fixed HOLD conflation in Creative surface routing so `investigate` maps toward Campaign Check instead of the Hold bucket.
- Replaced system/policy blocked `blocked` and `contextual_only` row labels with "Not eligible for evaluation" instead of "Not Enough Data."
- Updated the coarse blocked quick-filter label to "Check" so Campaign Check rows do not sit under a contradictory Refresh label.
- Restored an independent old-rule challenger helper for calibration comparison only.

## Open Risks

- The explicit campaign benchmark contract exists in code, but the Creative UI still does not expose a campaign benchmark switch or persistent scope label. Do not silently bind campaign filters to benchmark authority.
- Quick filter buckets remain coarse (`Scale`, `Test`, `Check`, `Hold`, `Evergreen`). Row-level operator labels are improved, but full 10-label production taxonomy is not complete.
- The restored old-rule challenger is intentionally a calibration baseline only and should not drive UI or policy directly.
- Calibration Lab should still use fixtures/live accounts to tune thresholds; this hardening does not claim the current threshold values are final.

## Reports And Tests

- Audit: `docs/operator-policy/creative-segmentation-recovery/reports/current-segmentation-audit.md`
- Foundation report: `docs/operator-policy/creative-segmentation-recovery/reports/foundation-final.md`
- Hardening report: `docs/operator-policy/creative-segmentation-recovery/reports/foundation-hardening-final.md`
- Targeted tests passed:
  - `npx vitest run lib/creative-operator-policy.test.ts lib/creative-operator-surface.test.ts lib/creative-decision-os.test.ts lib/creative-old-rule-challenger.test.ts components/creatives/CreativeDecisionOsOverview.test.tsx`
  - `npx vitest run lib/creative-operator-policy.test.ts lib/creative-operator-surface.test.ts lib/creative-decision-os.test.ts lib/creative-old-rule-challenger.test.ts components/creatives/CreativeDecisionOsOverview.test.tsx lib/command-center.test.ts`
- Latest typecheck passed:
  - `npx tsc --noEmit`
- Full validation passed:
  - `npm test` - passed, 293 files and 2021 tests.
  - `npx tsc --noEmit` - passed.
  - `npm run build` - passed.
  - `git diff --check` - passed.
  - hidden/bidi/control scan - passed.
- No lint script exists in `package.json`.

## Calibration Lab Readiness

Calibration Lab can start after this hardening branch is merged and CI is green. Required prerequisites now exist: safe `scale_review`, explicit account/campaign baseline metadata, benchmark-scope contract, old-rule challenger output, and deterministic regression tests.

## Next Recommended Action

Open and merge the hardening PR when checks pass, then start the Creative Segmentation Calibration Lab. Do not ask Claude for another review in this hardening pass.
