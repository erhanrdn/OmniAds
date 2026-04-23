# Creative Segmentation Calibration Lab - Current Decision Trace

Last updated: 2026-04-23 by Codex

## Trace

Current pipeline inspected:

1. Creative table route calls the Meta creative source with business, date range, creative grouping, and metadata mode.
2. `getCreativeDecisionOsForRange` fetches current creative rows plus fixed recent/mid/long windows.
3. Decision OS builds account-relative baseline metadata and uses explicit benchmark scope only when provided.
4. Old-rule challenger can be run independently against the same sanitized metrics for comparison.
5. Creative operator policy resolves internal segment, push readiness, and instruction data.
6. Creative operator surface maps internal policy output to user-facing segment label, instruction, and quick filter bucket.

## Gate Failure Point

The calibration run failed before media-buyer judgment:

- For exported rows, Creative table rows and Decision OS rows matched by creative identifier and metrics.
- One sampled company returned zero current Decision OS rows.
- The checked warehouse table `meta_creative_daily` was empty, so it could not independently verify source metrics.
- The lab therefore cannot prove that a cross-company sample represents the live Creative table and Decision OS accurately.

## Current Suppression Observations

Observed from exported rows and code trace:

- Many rows land in `contextual_only` and user-facing "Not eligible for evaluation" because evidence or source quality is degraded.
- `scale_review` did not appear in this sanitized sample even though account baseline reliability was strong for exported rows.
- Old-rule challenger marked five rows as `scale` or `scale_hard`, while Decision OS did not emit Scale or Scale Review in the sample.
- Commercial Truth was missing in exported rows and correctly kept push readiness blocked or read-only rather than apply/queue eligible.
- Campaign baseline values in the artifact are diagnostic only; they did not silently authorize campaign-relative segmentation.

## Correctness Assessment

No policy-threshold conclusion should be drawn yet. The first failure is source verifiability, not a proven segmentation-rule failure.

The next implementation pass should make the creative source path report source-health blockers explicitly enough that the lab can distinguish:

- no real creative rows
- snapshot exists but is bypassed or degraded
- live provider read failed
- preview/media metadata missing while performance metrics still exist
- Commercial Truth missing
- campaign/ad set context missing
