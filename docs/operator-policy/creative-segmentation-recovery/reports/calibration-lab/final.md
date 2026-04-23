# Creative Segmentation Calibration Lab - Final Report

Last updated: 2026-04-23 by Codex

## 1. Branch / PR Status

Branch: `feature/adsecute-calibration-data-gate-hardening`

PR: `https://github.com/erhanrdn/OmniAds/pull/35`

## 2. Data Accuracy Gate Result

Failed after hardening. Calibration remains blocked at Phase B.

The corrected gate now samples only currently eligible Meta-connected businesses. It inspected 8 historical snapshot candidates, found 8 currently eligible candidates, sampled 3, and exported 24 sanitized rows. One active eligible sampled business still returned zero current Decision OS rows.

## 3. Dataset Coverage Summary

Artifact:

`docs/operator-policy/creative-segmentation-recovery/reports/calibration-lab/artifacts/sanitized-calibration-dataset.json`

Coverage:

- Historical snapshot candidates inspected: 8
- Eligible candidates: 8
- Skipped candidates: 0
- Sampled candidates: 3
- Active eligible zero-row candidates: 1
- Sampled rows: 24
- Table vs Decision OS mismatches on exported rows: 0
- Max metric deltas on exported rows: 0
- Gate passed: false

## 4. Current Decision OS Failure Modes

The prior sampling risk is fixed. The remaining verified failure is source/data availability for an active eligible business:

- one active eligible sampled company returned zero current Decision OS rows
- `meta_creative_daily` is empty, so independent warehouse creative fact verification is unavailable
- current verification relies on API/payload parity for exported rows
- source-health details are still not explicit enough to classify why the eligible zero-row company returned no rows

## 5. Old-Rule Challenger Findings

The old-rule challenger remains independent and read-only. In the exported sample it produced:

- `watch`: 5
- `kill`: 4
- `scale`: 4
- `pause`: 7
- `test_more`: 3
- `scale_hard`: 1

These are diagnostic only. They did not drive UI, policy, queue, push, or apply behavior.

## 6. Agent Panel Findings

Not run. The corrected data gate failed, so agent judgment was intentionally skipped.

## 7. Mismatch Clusters

Only source-level clusters were produced:

- active eligible business with zero current Decision OS rows
- warehouse-level creative fact verification unavailable because `meta_creative_daily` is empty
- account baseline present but relative-winner suppression not policy-proven while the gate is failed
- UI label usefulness not judgeable until source data is verified

## 8. Recommended Deterministic Policy Changes

None. Do not change Creative policy thresholds from this blocked gate-hardening pass.

Recommended deterministic source changes:

- add explicit source-health output for active eligible zero-row cases
- distinguish snapshot bypass, live provider failure, empty provider data, and preview/media degradation
- classify whether performance metrics exist separately from preview/media metadata
- keep campaign benchmark authority explicit

## 9. Fixture Candidates

Source-health fixtures should come before policy fixtures:

- historical snapshot business without current Meta eligibility should be skipped, not counted as a gate failure
- active eligible business returning zero Decision OS rows should block the gate with a source-health reason
- quick-filter coverage must remain separate from internal segment coverage

## 10. Data Gaps

- No rows in `meta_creative_daily` for independent creative fact verification.
- One active eligible sampled company produced zero current Decision OS rows.
- Source-health reasons are not detailed enough in the exported dataset to classify the zero-row company beyond the active eligible source blocker.
- Campaign baseline summaries are diagnostic only until explicit campaign benchmark scope is wired into the lab input.

## 11. UI / Naming Recommendations

Do not add noisy UI. Later, expose only concise source-health/operator notes where they prevent confusion.

## 12. Whether Policy Implementation Can Start

No. Fix or classify the active eligible zero-row source issue first.

## 13. What Codex Should Implement Next

Implement a Creative source-health diagnostic pass:

- report why an active eligible business has zero current Decision OS rows
- capture sanitized source status in the artifact
- make snapshot/live-provider failure modes explicit
- rerun the data gate, then run the agent panel only if the gate passes

## 14. What Must Not Be Done

- Do not run the media-buyer panel on this blocked artifact.
- Do not tune thresholds from this sample.
- Do not make the old-rule challenger authoritative.
- Do not loosen queue/push/apply safety.
- Do not expose agent opinions in the product UI.
