# Creative Segmentation Calibration Lab - Source Health Final

Last updated: 2026-04-23 by Codex

## Result

Data Accuracy Gate is still blocked.

The helper now does three things the previous pass did not:

- dedupes duplicate candidate rows at business level before eligibility counts
- emits per-candidate source-health classification for zero-row cases
- aligns candidate eligibility with the current creative source integration/account read path

## What Was Completed

- Added defensive business-level candidate collapse in `scripts/creative-segmentation-calibration-lab.ts`.
- Added targeted helper tests for duplicate provider rows, duplicate credential rows, and multiplicative duplicate rows.
- Wired zero-row source-health diagnostics into the calibration artifact model.
- Added live-insights probing so `no_data` can be separated into:
  - no current creative activity
  - provider read failure
  - source mapping bug
- Documented the `meta_creative_daily` confidence limitation without making it the primary blocker.

## Candidate Dedupe Status

Real defensive issue in code shape; patched.

- Expected on clean schema: no duplicate business rows
- Still possible under legacy drift or dirty normalized data: duplicate `provider_connections` or `integration_credentials`
- Current helper behavior: one candidate row per business, with deduped duplicate-row counts preserved for reporting

## Zero-Row Diagnosis Status

Confirmed live in this session.

The previous active eligible zero-row case was not a surviving Decision OS row-loss bug.

Live rerun result:

- historical snapshot candidates: 8
- eligible candidates: 0
- skipped candidates: 8
- sampled candidates: 0
- zero-row eligible candidates: 0

All skipped businesses resolved to:

- `no_current_meta_connection`

## Whether Calibration May Start

No.

The 10-agent media-buyer panel must still not start because there is no currently eligible Meta-connected calibration cohort.

## Recommended Next Action

Restore at least one current Meta-connected business in the source path, or provide a new currently eligible calibration cohort, then rerun the calibration helper.
