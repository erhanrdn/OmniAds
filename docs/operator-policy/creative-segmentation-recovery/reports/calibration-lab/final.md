# Creative Segmentation Calibration Lab - Final Report

Last updated: 2026-04-23 by Codex

## 1. Branch / PR Status

Branch: `feature/adsecute-creative-segmentation-calibration-lab`

PR: `https://github.com/erhanrdn/OmniAds/pull/34`

## 2. Data Accuracy Gate Result

Failed. Calibration is blocked at Phase B.

The sanitized artifact checked three companies and exported 24 sampled rows, but one sampled company returned zero current Decision OS rows. The gate therefore cannot certify that the current Creative table and Decision OS source path are reliable enough for media-buyer judgment.

## 3. Dataset Coverage Summary

Artifact:

`docs/operator-policy/creative-segmentation-recovery/reports/calibration-lab/artifacts/sanitized-calibration-dataset.json`

Coverage:

- Companies checked: 3
- Sampled rows: 24
- Table vs Decision OS mismatches on exported rows: 0
- Max metric deltas on exported rows: 0
- Gate passed: false

## 4. Current Decision OS Failure Modes

Policy failure modes are not proven yet. The verified failure is source/data availability:

- one sampled company returned zero current Decision OS rows
- `meta_creative_daily` was empty in the checked database
- current lab data depends on the creative API/snapshot source path
- source-health details are not explicit enough for calibration to distinguish empty data from source failure

## 5. Old-Rule Challenger Findings

The old-rule challenger is independent and read-only. In the exported sample it produced:

- `pause`: 8
- `watch`: 5
- `kill`: 4
- `scale`: 4
- `test_more`: 2
- `scale_hard`: 1

These are diagnostic only. They did not drive UI, policy, queue, push, or apply behavior.

## 6. Agent Panel Findings

Not run. The data gate failed, so agent judgment was intentionally skipped.

## 7. Mismatch Clusters

Only source-level clusters were produced:

- insufficient data / unverifiable source
- account baseline present but relative-winner suppression not policy-proven
- UI label usefulness not judgeable until source data is verified

## 8. Recommended Deterministic Policy Changes

None yet. Do not change Creative policy thresholds from this blocked lab pass.

Recommended deterministic source changes:

- add explicit source-health output for empty current Decision OS rows
- distinguish snapshot bypass, live provider failure, and preview/media degradation
- preserve performance metric availability even when preview metadata is degraded, if the source can do so safely
- keep campaign benchmark authority explicit

## 9. Fixture Candidates

See `fixture-candidate-plan.md`. Source-health fixtures should come first, followed by policy fixtures after the data gate passes.

## 10. Data Gaps

- No rows in `meta_creative_daily` for independent creative fact verification.
- One sampled company produced zero current Decision OS rows.
- Source-health reasons are not detailed enough in the exported dataset to classify the zero-row company without runtime inspection.
- Campaign baseline summaries are diagnostic only until explicit campaign benchmark scope is wired into the lab input.

## 11. UI / Naming Recommendations

Do not add noisy UI. Later, expose only concise source-health/operator notes where they prevent confusion, such as "Not eligible for evaluation" for policy/source-ineligible rows.

## 12. Whether Policy Implementation Can Start

No. Fix and re-run the Data Accuracy Gate first.

## 13. What Codex Should Implement Next

Implement a source-health hardening pass for the Creative source path and calibration helper:

- report why current Decision OS rows are zero for a sampled company
- capture sanitized source status in the artifact
- make snapshot/live-provider failure modes explicit
- then rerun the calibration dataset and agent panel only if the gate passes

## 14. What Must Not Be Done

- Do not run the media-buyer panel on this blocked artifact.
- Do not tune thresholds from this sample.
- Do not make the old-rule challenger authoritative.
- Do not loosen queue/push/apply safety.
- Do not expose agent opinions in the product UI.
