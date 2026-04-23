# Creative Segmentation Calibration Lab - Final Report

Last updated: 2026-04-23 by Codex

## 1. Data Accuracy Gate Result

Failed after source-health diagnosis. Calibration remains blocked at Phase B.

Live rerun result:

- Historical snapshot candidates inspected: 8
- Unique candidate businesses: 8
- Deduped duplicate rows: 0
- Eligible candidates: 0
- Skipped candidates: 8
- Sampled candidates: 0
- Active eligible zero-row candidates: 0
- Sampled rows: 0
- Gate passed: false

## 2. Exact Diagnosis

The prior "active eligible zero-row" blocker was not a surviving Decision OS row-loss bug.

After aligning candidate eligibility with the current creative source integration/account path, all historical snapshot candidates were skipped as:

- `no_current_meta_connection`: 8

So the real blocker is now:

- no currently Meta-connected businesses are available for calibration

## 3. Confidence Limitation

`meta_creative_daily` is still empty, so independent warehouse creative fact verification is unavailable.

Current confidence level remains API/payload parity only.

## 4. Agent Panel Status

Not run. The gate is still blocked, so the 10-agent media-buyer panel must not start.

## 5. Recommended Next Action

Restore at least one current Meta-connected business for the calibration cohort, or supply a new valid eligible cohort, then rerun the calibration helper.
