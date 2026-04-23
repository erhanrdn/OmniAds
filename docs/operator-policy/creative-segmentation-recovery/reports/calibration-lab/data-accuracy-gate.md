# Creative Segmentation Calibration Lab - Data Accuracy Gate

Last updated: 2026-04-23 by Codex

## Result

Passed.

Calibration may proceed to the 10-agent media-buyer panel next. The panel was not run in this pass.

Current sanitized artifact:

`docs/operator-policy/creative-segmentation-recovery/reports/calibration-lab/artifacts/sanitized-calibration-dataset.json`

## Corrected Runtime Finding

The earlier local conclusion of "0 currently eligible Meta-connected businesses" was not product truth.

That result came from an environment mismatch:

- the helper was pointed at the production database
- but the local shell did not include the integration token decryption key needed to read encrypted Meta credentials
- with `DATABASE_URL` alone, `getIntegration()` could not verify current Meta connectivity

After rerunning with production-equivalent runtime env, live Meta connectivity was confirmed and the cohort recovered.

## Corrected Gate Counts

- Historical snapshot candidates inspected: 8
- DB-eligible candidates: 8
- Runtime-eligible candidates: 7
- Historical/DB-skipped candidates: 0
- Runtime-skipped candidates: 1
- Runtime skip reason: `meta_token_checkpointed = 1`
- Sampled candidates: 3
- Exported sampled rows: 32
- Active eligible zero-row candidates: 0
- Table vs Decision OS identifier mismatches: 0
- Max metric deltas: 0 for spend, value, ROAS, CPA, purchases, impressions, and link clicks
- Gate passed: true

## Exact Recovery Diagnosis

Live Meta connectivity was real in the checked runtime/database.

Sanitized candidate trace:

- `candidate-01`: connected row present, token row present, assigned account present, but live Meta reads failed with an OAuth checkpoint/token error; correctly skipped from calibration
- `candidate-02`: correctly eligible and sampleable
- `candidate-03`: correctly eligible and sampleable
- `candidate-04`: correctly eligible and sampleable
- remaining runtime-eligible candidates stayed outside the sample only because `MAX_COMPANIES = 3`

This means:

- no active eligible business still returns zero current Decision OS rows
- the previous zero-row blocker was recovered by correcting runtime parity and skipping the token-broken candidate

## What Changed In The Helper

- Added a runtime preflight so the helper will not silently misdiagnose live Meta connectivity when the token decryption key is missing.
- Added live Meta cohort screening before sampling.
- Excluded candidates that fail current live Meta reads with sanitized runtime skip reasons instead of letting them become zero-row blockers.
- Preserved the existing safety rules around thresholds, segmentation, queue/push/apply, and UI scope.

## Warehouse Fact Status

`meta_creative_daily` still has 0 rows in the checked database.

This remains a confidence limitation, not a gate blocker. Current verification confidence is still API/payload parity only.

## Decision

The Data Accuracy Gate now passes.

Calibration Lab may proceed to the 10-agent media-buyer panel next, but that panel was intentionally not started in this pass.
