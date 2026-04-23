# Creative Segmentation Recovery State

Last updated: 2026-04-23 by Codex

## Current Goal

Creative Segmentation Calibration Lab started from merged foundation and foundation hardening. The lab is currently blocked at the Data Accuracy Gate. Do not proceed to media-buyer-agent judgment or policy-threshold implementation until source data correctness is verified.

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

Internal policy segments may remain technical, but production UI labels must use media-buyer language and must not expose labels such as `blocked`, `contextual_only`, `hold_monitor`, `false_winner_low_evidence`, or `creative_learning_incomplete`. Policy/system ineligible rows may use the system note "Not eligible for evaluation" instead of masquerading as evidence-thin "Not Enough Data."

## Commercial Truth Guidance

Commercial Truth is an absolute business validation and execution-safety layer. It must block profit claims, budget/bid/target assumptions, push/apply eligibility, and the fully validated Scale path when missing.

Commercial Truth must not make the system blind to relative creative quality. With reliable explicit account or campaign baseline input, a creative may become `scale_review` / "Scale Review" when it strongly outperforms that baseline with sufficient spend and purchase evidence. Without reliable explicit baseline input, do not infer `scale_review`.

## Scale Review Current Behavior

`scale_review` exists and is push-safe. It is a relative creative-quality signal, not push approval. It can become `operator_review_required` only when the blocker is missing Commercial Truth / absolute business validation and the row otherwise has live evidence, provenance, trust metadata, preview truth, reliable relative baseline, and usable campaign/ad set context.

Hard blockers still force `blocked_from_push`: missing provenance, missing trust metadata, non-live/demo/snapshot/fallback/unknown evidence, missing or degraded preview truth, suppressed rows, inactive/archive rows, and weak campaign/ad set context. `scale_review` is never queue-eligible and `canApply` remains false.

## Baseline And Benchmark Status

Account and campaign relative baseline contracts exist. Baselines include scope, sanitized benchmark key, scope id/label, creative count, eligible creative count, spend basis, purchase basis, weighted ROAS, weighted CPA, median ROAS, median CPA, median spend, reliability, and missing context.

Default benchmark direction is account-wide. Campaign-level benchmark must be explicit and cannot be a silent side effect of selecting a campaign filter. Creative Decision OS exposes benchmark metadata, but future UI still needs an explicit benchmark scope display/control.

## Old Rule Challenger Status

The recovered old-rule challenger exists at `lib/creative-old-rule-challenger.ts` for calibration comparison only. It is independent from Decision OS, emits challenger action/reason/metrics/confidence/score, and is marked non-authoritative. It must not drive UI, queue, push, apply, or policy directly.

## Latest Completed Work

- Created a sanitized calibration helper: `scripts/creative-segmentation-calibration-lab.ts`.
- Created calibration lab report directory and machine-readable artifact under `docs/operator-policy/creative-segmentation-recovery/reports/calibration-lab/`.
- Ran the Data Accuracy Gate against the current Creative source path using the local DB tunnel and production env values in-process.
- Exported sanitized aliases and metrics only; no raw business/account/campaign/ad set/creative IDs, raw names, copy, URLs, tokens, or cookies are included.
- Verified the exported rows had zero Creative table vs Decision OS metric deltas and zero identifier mismatches.
- Stopped calibration before the 10-agent panel because the Data Accuracy Gate failed.

## Calibration Status

Blocked at Phase B - Data Accuracy Gate.

Sanitized artifact:

`docs/operator-policy/creative-segmentation-recovery/reports/calibration-lab/artifacts/sanitized-calibration-dataset.json`

Gate summary:

- Companies checked: 3
- Sampled rows exported: 24
- Gate passed: false
- Blocking issue: one sampled company returned zero current Decision OS rows
- `meta_creative_daily` was empty in the checked database, so independent warehouse-level creative fact verification was unavailable

## Agent Panel Status

Not run. The 10 media-buyer-agent panel must not run on this artifact because source correctness is not verified.

## Mismatch Summary

Only source-level mismatch synthesis is valid from this pass:

- insufficient data / unverifiable source for one sampled company
- account baselines can be present in exported rows, but relative-winner suppression is not policy-proven while the gate is failed
- old-rule challenger produced scale-like labels in the sample, but those remain diagnostic and cannot be treated as policy evidence yet
- UI label usefulness cannot be calibrated until source data is verified

## Remaining Blockers

- Current source path can return zero Decision OS rows for a sampled company without enough sanitized source-health detail for calibration.
- `meta_creative_daily` is empty, so the lab cannot cross-check current creative metrics against an independent creative fact table.
- Campaign baseline summaries in the artifact are diagnostic only; production campaign benchmark authority still requires explicit benchmark scope.
- The media-buyer-agent panel and deterministic policy recommendations are blocked until the data gate passes.

## Next Recommended Action

Implement a Creative source-health hardening pass before calibration:

- report why current Decision OS rows are zero for a sampled company
- distinguish snapshot bypass, live provider failure, empty provider data, and preview/media degradation
- preserve/verifiably expose performance metric availability separately from preview availability where safe
- add source-health fixtures so the Calibration Lab blocks cleanly on source failure
- rerun the Data Accuracy Gate, then run the 10-agent panel only if the gate passes

Policy threshold changes, segmentation rewrites, noisy UI, old-rule authority, and queue/push/apply safety changes remain out of scope.

## Reports And Validation

- Audit: `docs/operator-policy/creative-segmentation-recovery/reports/current-segmentation-audit.md`
- Foundation report: `docs/operator-policy/creative-segmentation-recovery/reports/foundation-final.md`
- Hardening report: `docs/operator-policy/creative-segmentation-recovery/reports/foundation-hardening-final.md`
- Data gate: `docs/operator-policy/creative-segmentation-recovery/reports/calibration-lab/data-accuracy-gate.md`
- Dataset summary: `docs/operator-policy/creative-segmentation-recovery/reports/calibration-lab/calibration-dataset-summary.md`
- Current trace: `docs/operator-policy/creative-segmentation-recovery/reports/calibration-lab/current-decision-trace.md`
- Agent panel status: `docs/operator-policy/creative-segmentation-recovery/reports/calibration-lab/agent-panel-judgments.md`
- Mismatch synthesis: `docs/operator-policy/creative-segmentation-recovery/reports/calibration-lab/mismatch-synthesis.md`
- Fixture plan: `docs/operator-policy/creative-segmentation-recovery/reports/calibration-lab/fixture-candidate-plan.md`
- Final lab report: `docs/operator-policy/creative-segmentation-recovery/reports/calibration-lab/final.md`
- PR: `https://github.com/erhanrdn/OmniAds/pull/34`

Latest local validation:

- `node --import tsx scripts/creative-segmentation-calibration-lab.ts` - completed and wrote sanitized artifact with gate failed.
- `npm test` - passed, 293 files and 2021 tests.
- `npx tsc --noEmit` - passed.
- `npm run build` - passed.
- `git diff --check` - passed.
- hidden/bidi/control scan - passed.
- No lint script exists in `package.json`.
