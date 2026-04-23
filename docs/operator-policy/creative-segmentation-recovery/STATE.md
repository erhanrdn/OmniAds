# Creative Segmentation Recovery State

Last updated: 2026-04-23 by Codex

## Current Goal

Creative Segmentation Calibration Lab is blocked at the Data Accuracy Gate. The gate has now been hardened so candidate businesses must be currently Meta-eligible before sampling. Do not proceed to media-buyer-agent judgment or Creative policy implementation until the remaining active eligible zero-row source issue is resolved or precisely classified.

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

## Corrected Candidate Eligibility Behavior

The calibration helper no longer samples businesses only because they have historical `meta_creatives_snapshots`.

Candidate businesses are eligible only when they have:

- current Meta provider connection with `status = connected`
- non-empty access token row
- at least one assigned Meta account

Ineligible historical snapshot businesses are skipped and counted by sanitized reason:

- `no_current_meta_connection`
- `meta_connection_not_connected`
- `no_access_token`
- `no_accounts_assigned`

## Corrected Coverage Model

`coverage.internalSegments` now contains only true internal Creative policy segments.

Quick-filter buckets are reported separately as `coverage.quickFilters`. `quick_filter:*` entries must not be mixed into internal segment distribution.

## Latest Completed Work

- Hardened `scripts/creative-segmentation-calibration-lab.ts` candidate selection around current Meta connection/account eligibility.
- Added helper unit coverage for candidate skips and quick-filter coverage separation.
- Reran the sanitized Data Accuracy Gate.
- Updated calibration reports and artifact.
- Confirmed no raw IDs are emitted in the new reports/artifact/helper scan.

## Calibration Status

Blocked at Phase B - Data Accuracy Gate.

Sanitized artifact:

`docs/operator-policy/creative-segmentation-recovery/reports/calibration-lab/artifacts/sanitized-calibration-dataset.json`

Corrected gate summary:

- Historical snapshot candidates inspected: 8
- Currently eligible candidates: 8
- Skipped candidates: 0
- Sampled eligible candidates: 3
- Sampled rows exported: 24
- Gate passed: false
- Active eligible zero-row candidates: 1
- Blocking issue: one active eligible sampled company returned zero current Decision OS rows
- `meta_creative_daily` row count: 0
- Current verification confidence: API/payload parity only

The candidate eligibility issue was real in code, but it was not the cause of the corrected rerun failure. The remaining blocker is a real active eligible zero-row source/data issue.

## Agent Panel Status

Not run. The 10 media-buyer-agent panel must not run until the corrected Data Accuracy Gate passes.

## Remaining Blockers

- One active eligible sampled business returns zero current Decision OS rows.
- Source-health output is not detailed enough to classify the zero-row cause as snapshot bypass, live provider failure, empty provider data, or preview/media degradation.
- `meta_creative_daily` is empty, so independent warehouse-level creative fact verification is unavailable.
- Campaign baseline summaries in the artifact are diagnostic only; production campaign benchmark authority still requires explicit benchmark scope.

## Next Recommended Action

Implement a Creative source-health diagnostic pass:

- report why an active eligible business has zero current Decision OS rows
- distinguish snapshot bypass, live provider failure, empty provider data, and preview/media degradation
- preserve/verifiably expose performance metric availability separately from preview availability where safe
- add source-health fixtures for active eligible zero-row cases
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
- Data gate hardening report: `docs/operator-policy/creative-segmentation-recovery/reports/calibration-lab/data-gate-hardening-final.md`
- Prior Calibration Lab PR: `https://github.com/erhanrdn/OmniAds/pull/34`
- Data Gate Hardening PR: `https://github.com/erhanrdn/OmniAds/pull/35`

Latest local validation:

- `npx vitest run scripts/creative-segmentation-calibration-lab.test.ts` - passed, 3 tests.
- `npm test` - passed, 294 files and 2024 tests.
- `npx tsc --noEmit` - passed.
- `npm run build` - passed.
- `git diff --check` - passed.
- hidden/bidi/control scan - passed.
- raw ID scan for calibration reports/artifact/helper - passed.
- No lint script exists in `package.json`.
- `node --import tsx scripts/creative-segmentation-calibration-lab.ts` - completed and wrote sanitized artifact with corrected gate failed.
