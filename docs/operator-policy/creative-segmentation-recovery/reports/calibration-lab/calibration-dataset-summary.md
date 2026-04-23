# Creative Segmentation Calibration Lab - Dataset Summary

Last updated: 2026-04-23 by Codex

## Artifact

Machine-readable sanitized artifact:

`docs/operator-policy/creative-segmentation-recovery/reports/calibration-lab/artifacts/sanitized-calibration-dataset.json`

Sanitization rules:

- Raw business, account, campaign, ad set, and creative IDs are not exported.
- Raw names, copy, preview URLs, tokens, cookies, and customer-identifying values are not exported.
- Rows use deterministic aliases such as `company-02`, `company-02-campaign-01`, and `company-02-creative-01`.
- Instruction text is sanitized by replacing any included creative, campaign, or ad set names/IDs with aliases.

## Candidate Coverage

- Historical snapshot candidates inspected: 8
- Currently eligible candidates: 8
- Skipped candidates: 0
- Sampled eligible candidates: 3
- Active eligible zero-row candidates: 1

Skipped candidates by sanitized reason:

- `no_current_meta_connection`: 0
- `meta_connection_not_connected`: 0
- `no_access_token`: 0
- `no_accounts_assigned`: 0

## Row Coverage

- Sampled rows exported: 24
- Gate passed: false
- Blocking issue: one active eligible sampled company returned zero current Decision OS rows.

User-facing segment coverage in exported rows:

- Campaign Check: 3
- Not Enough Data: 6
- Watch: 2
- Test More: 3
- Not eligible for evaluation: 2
- Refresh: 5
- Protect: 3

Internal segment coverage in exported rows:

- `investigate`: 3
- `creative_learning_incomplete`: 4
- `hold_monitor`: 2
- `promising_under_sampled`: 3
- `contextual_only`: 2
- `false_winner_low_evidence`: 2
- `fatigued_winner`: 5
- `protected_winner`: 3

Quick-filter coverage:

- `blocked`: 8
- `watch`: 11
- `needs_truth`: 2
- `no_action`: 3

Old-rule challenger coverage:

- `watch`: 5
- `kill`: 4
- `scale`: 4
- `pause`: 7
- `test_more`: 3
- `scale_hard`: 1

Push-readiness coverage:

- `blocked_from_push`: 11
- `read_only_insight`: 10
- `operator_review_required`: 3

## Warehouse Verification

- `meta_creative_daily` available: false
- `meta_creative_daily` row count: 0
- Current verification confidence: API/payload parity only

This artifact is usable for source-shape inspection and fixture planning. It is not usable for media-buyer calibration because the corrected Data Accuracy Gate still failed.
