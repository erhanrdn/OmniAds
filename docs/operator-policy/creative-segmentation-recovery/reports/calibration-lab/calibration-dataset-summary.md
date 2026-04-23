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

## Coverage

- Companies checked: 3
- Sampled rows exported: 24
- Gate passed: false
- Blocking issue: one sampled company returned zero current Decision OS rows.

User-facing segment coverage in exported rows:

- Not eligible for evaluation: 13
- Not Enough Data: 4
- Campaign Check: 3
- Watch: 2
- Test More: 2

Internal segment coverage in exported rows:

- `contextual_only`: 13
- `investigate`: 3
- `creative_learning_incomplete`: 3
- `hold_monitor`: 2
- `promising_under_sampled`: 2
- `false_winner_low_evidence`: 1

Old-rule challenger coverage:

- `pause`: 8
- `watch`: 5
- `kill`: 4
- `scale`: 4
- `test_more`: 2
- `scale_hard`: 1

Push-readiness coverage:

- `blocked_from_push`: 17
- `read_only_insight`: 7

## Data Fields Included

Each exported row includes:

- company/account/campaign/ad set/creative aliases
- current Decision OS internal segment
- current user-facing segment
- old-rule challenger segment and reason
- account baseline metrics and reliability
- lab-computed campaign baseline metrics and reliability when same-campaign peers exist
- spend, purchases, CPA, ROAS, value, impressions, and link clicks where available
- recent 7-day, mid 30-day, and long 90-day metrics
- fatigue status, lifecycle state, primary action
- commercial truth availability
- campaign/ad set context flags
- evidence quality
- current push readiness
- sanitized instruction headline, reason summary, and missing evidence

## Usability

This artifact is usable for source-shape inspection and fixture planning. It is not usable for media-buyer calibration because the data accuracy gate failed.
