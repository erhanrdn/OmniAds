# PR #65 Scoring Runtime Recovery

Date: 2026-04-26

Branch: `feature/adsecute-creative-claude-fix-plan-implementation`

PR: `https://github.com/erhanrdn/OmniAds/pull/65`

## Executive Result

Fresh current-output artifact generation is unblocked for Claude review.

The stable runtime path was server-side Docker execution from the PR #65 commit, using the same production environment file path as the deployed services. This avoided the unreliable local SSH DB tunnel to `127.0.0.1:15432`.

Fresh artifact:

- `docs/operator-policy/creative-segmentation-recovery/reports/equal-segment-scoring/artifacts/pr65-current-output-fresh.json`
- `artifactStatus: complete_current_output`
- `valid_for_claude_review: true`
- `valid_for_acceptance: false`

Acceptance scoring did not run because fresh expected labels were not regenerated in this pass. Claude or the supervisor can now independently score the fresh current-output artifact.

## Runtime Path Used

Chosen path: server-side temporary Docker audit image.

Steps used:

1. cloned PR #65 branch into a temporary server worktree
2. built a temporary worker image from commit `8eca958977378fb67fcb2dde45669b49f97d02f9`
3. ran `scripts/creative-live-firm-audit.ts` inside the temporary container with production-equivalent environment variables
4. copied only sanitized artifacts back into the repo

This path was stable enough because:

- it ran close to the production DB from the app server environment
- it did not depend on the local SSH Postgres tunnel
- it did not restart or modify the live `web` or `worker` containers
- it used the PR branch code, not the deployed production image code

## Previous Failure

The local runtime failed in two ways:

- campaign/ad set context reads were too slow when routed through the SSH DB tunnel
- the tunnel later dropped entirely, causing `Connection terminated due to connection timeout` and `ECONNREFUSED 127.0.0.1:15432`

The helper/source hardening from the previous pass remains useful:

- audit active sampling uses Decision OS delivery context
- Decision OS campaign/ad set context reads are scoped to campaign IDs present in the primary Creative window
- blocked artifacts are written instead of silently missing

## Fresh Current Output

Artifact summary:

- readable runtime businesses: `8`
- sampled creatives: `78`
- runtime blockers: none
- raw IDs included: no
- raw names included: no

Current segment distribution:

| Segment | Count |
|---|---:|
| Scale | 0 |
| Scale Review | 1 |
| Test More | 6 |
| Protect | 6 |
| Watch | 10 |
| Refresh | 21 |
| Retest | 0 |
| Cut | 13 |
| Campaign Check | 0 |
| Not Enough Data | 16 |
| Not eligible for evaluation | 5 |

Businesses with zero Scale: `8`.

Businesses with zero Scale Review: `7`.

## Scoring Status

Fresh equal-segment scoring did not run.

Reason:

- this artifact contains current Adsecute outputs and media-buyer scorecard summaries
- it does not contain fresh expected media-buyer labels
- stale expected labels were not used as truth

Therefore:

- `valid_for_claude_review: true`
- `valid_for_acceptance: false`

Claude review can now run against the fresh current-output artifact. PR #65 should still not be merged until that review or an explicit supervisor decision accepts the result.

## Files Affected

- `scripts/creative-live-firm-audit.ts`
- `scripts/creative-live-firm-audit.test.ts`
- `lib/creative-decision-os-source.ts`
- `lib/meta/operator-decision-source.ts`
- `lib/meta/campaigns-source.ts`
- `lib/meta/adsets-source.ts`
- `lib/meta/serving.ts`
- `lib/meta/warehouse.ts`
- `docs/operator-policy/creative-segmentation-recovery/reports/equal-segment-scoring/artifacts/pr65-current-output-fresh.json`
- `docs/operator-policy/creative-segmentation-recovery/reports/live-firm-audit/artifacts/sanitized-live-firm-audit.json`
- `docs/operator-policy/creative-segmentation-recovery/STATE.md`

No Creative policy, thresholds, taxonomy, queue/push/apply safety, or benchmark semantics changed.

## Next Action

Run Claude equal-segment/current-output review on:

- `docs/operator-policy/creative-segmentation-recovery/reports/equal-segment-scoring/artifacts/pr65-current-output-fresh.json`

Do not merge PR #65 until the review is complete or the supervisor explicitly accepts the current artifact.
