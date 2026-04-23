# Creative Segmentation Holdout Validation Split

Last updated: 2026-04-23 by Codex

## Purpose

Pass 5 adds a deterministic business-level holdout split so the current Creative Segmentation can be checked on live eligible companies without tuning only to the original calibration sample.

## Source Cohort

Source artifact:

- `docs/operator-policy/creative-segmentation-recovery/reports/calibration-lab/artifacts/sanitized-holdout-validation.json`

Current live cohort summary:

- historical snapshot candidates: `8`
- currently eligible snapshot candidates: `8`
- runtime-eligible live Meta companies: `7`
- runtime runtime-skips: `1`
- runtime skip reason: `meta_token_checkpointed = 1`

## Deterministic Alias Logic

Business aliases are assigned before the split and do not depend on query order.

Alias logic:

- rank runtime-eligible businesses by `sha256("creative-company-alias-v1:" + business_id)`
- assign `company-01`, `company-02`, ... in that stable rank order

This keeps sanitized aliases stable across reruns of the same live cohort.

## Deterministic Split Logic

Split logic version: `creative-holdout-v1`

Split rule:

- rank the same runtime-eligible businesses by `sha256("creative-holdout-v1:" + business_id)`
- send the first rounded `25%` to holdout
- keep at least `1` holdout business and at least `2` calibration businesses
- disable holdout entirely below `5` runtime-eligible businesses

Current run:

- total runtime-eligible companies: `7`
- calibration companies: `5`
- holdout companies: `2`

Calibration aliases:

- `company-02`
- `company-04`
- `company-05`
- `company-06`
- `company-07`

Holdout aliases:

- `company-01`
- `company-03`

## Small-Cohort Note

This is still a small holdout.

- live cohort size is enough to run a conservative split
- it is not large enough to justify threshold retuning from a single disagreement cluster
- holdout findings in this pass are fit for diagnosis and narrow regression locking, not broad optimization
