# Creative Segmentation Recovery State

Last updated: 2026-04-23 by Codex

## Current Goal

Creative Segmentation Calibration Lab remains blocked at the Data Accuracy Gate. The current pass completed the source-health diagnosis and confirmed that the earlier zero-row sampled-business blocker was caused by false-positive eligibility, not by a surviving active eligible Decision OS row-loss bug.

## Candidate Dedupe Status

Status: patched, helper-tested, and rerun live.

Findings:

- snapshot candidate selection is already one row per business before provider joins
- duplicate candidate inflation can still happen if dirty legacy rows exist in `provider_connections` or `integration_credentials`
- the helper now collapses candidate rows by business before eligibility counts are computed
- the helper now resolves current Meta integration/account eligibility through the same current source-path helpers used by the creative source

Added helper coverage:

- duplicate provider rows
- duplicate credential rows
- multiplicative duplicate rows still counted once

## Latest Data Accuracy Gate Status

Status: still blocked.

Latest live gate result from 2026-04-23:

- historical snapshot candidates inspected: 8
- unique candidate businesses: 8
- deduped duplicate rows: 0
- currently eligible candidates: 0
- skipped candidates: 8
- sampled candidates: 0
- sampled rows exported: 0
- active eligible zero-row candidates: 0
- gate passed: false

Skipped candidates by reason:

- `no_current_meta_connection`: 8
- `meta_connection_not_connected`: 0
- `no_access_token`: 0
- `no_accounts_assigned`: 0

The latest confirmed artifact is still:

`docs/operator-policy/creative-segmentation-recovery/reports/calibration-lab/artifacts/sanitized-calibration-dataset.json`

## Zero-Row Diagnosis

Exact live classification is now confirmed.

Current precise status:

- the previous sampled zero-row businesses were false-positive eligible candidates
- once candidate selection was aligned with the current creative source path, they were excluded before sampling
- the rerun left no active eligible zero-row businesses

The real blocker is now:

- no currently Meta-connected businesses are available for calibration

## Whether Calibration Lab May Start

No.

Calibration Lab may not proceed to the 10-agent media-buyer panel yet.

## Remaining Blockers

- no currently Meta-connected businesses are available for calibration
- `meta_creative_daily` is still empty, so independent warehouse-level creative verification remains unavailable

## meta_creative_daily Confidence Limitation

Current verification confidence remains API/payload parity only.

- current Creative product verification uses the creative API/snapshot source path
- `meta_creative_daily` is not the immediate pass/fail blocker
- while it stays empty, independent warehouse-level creative verification is unavailable

## Next Recommended Action

Restore at least one current Meta-connected business for the calibration cohort, or supply a new cohort with live Meta connectivity, then rerun `scripts/creative-segmentation-calibration-lab.ts`.

## Reports

- Data gate: `docs/operator-policy/creative-segmentation-recovery/reports/calibration-lab/data-accuracy-gate.md`
- Current trace: `docs/operator-policy/creative-segmentation-recovery/reports/calibration-lab/current-decision-trace.md`
- Source-health diagnosis: `docs/operator-policy/creative-segmentation-recovery/reports/calibration-lab/source-health-diagnosis.md`
- Source-health final: `docs/operator-policy/creative-segmentation-recovery/reports/calibration-lab/source-health-final.md`

## Last Updated By Codex

- patched calibration helper candidate dedupe
- wired sanitized source-health classification into the helper artifact model
- aligned candidate eligibility to the current creative source path
- added targeted helper regression coverage
- reran the sanitized calibration helper live
- documented the confirmed blocker in reports and state
