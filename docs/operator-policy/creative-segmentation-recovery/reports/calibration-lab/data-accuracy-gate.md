# Creative Segmentation Calibration Lab - Data Accuracy Gate

Last updated: 2026-04-23 by Codex

## Result

Blocked. Calibration must not proceed to media-buyer judgment yet.

Current sanitized artifact:

`docs/operator-policy/creative-segmentation-recovery/reports/calibration-lab/artifacts/sanitized-calibration-dataset.json`

Live gate result from 2026-04-23:

- Gate passed: false
- Historical snapshot candidates inspected: 8
- Unique candidate businesses: 8
- Deduped duplicate rows: 0
- Currently eligible candidates: 0
- Skipped candidates: 8
- Sampled eligible candidates: 0
- Verifiable sampled rows exported: 0
- Active eligible zero-row candidates: 0
- Table vs Decision OS identifier mismatches: 0
- Max metric deltas: 0 for spend, value, ROAS, CPA, purchases, impressions, and link clicks

## Exact Diagnosis

The earlier "active eligible zero-row" blocker was a false-positive eligibility problem in the calibration helper.

After aligning candidate eligibility with the same current Meta integration/account resolution used by the creative source path, all historical snapshot candidates were skipped before sampling:

- `no_current_meta_connection`: 8
- `meta_connection_not_connected`: 0
- `no_access_token`: 0
- `no_accounts_assigned`: 0

This means there is no remaining active eligible business that currently returns zero Decision OS rows.

The current blocker is simpler and more severe:

- there are zero currently Meta-connected businesses available for calibration

## What Was Verified

- Candidate selection no longer inflates business counts when duplicate provider rows are present.
- Candidate eligibility is now resolved through the current source-path integration/account helpers.
- The prior zero-row sampled businesses are no longer considered eligible candidates under the current source path.
- `meta_creative_daily` remains empty and therefore does not provide independent warehouse-level verification.

## Warehouse Fact Status

`meta_creative_daily` has 0 rows in the checked database.

This is still a confidence limitation, not the primary pass/fail blocker. Current verification remains API/payload parity only.

## Decision

Stop calibration at Phase B.

Do not run the 10 media-buyer-agent panel until at least one currently Meta-connected business is available for calibration or a new valid eligible cohort is supplied.
