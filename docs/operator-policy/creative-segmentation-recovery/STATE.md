# Creative Segmentation Recovery State

Last updated: 2026-04-26 by Codex

## Current Goal

Implement deterministic Creative media-buyer scoring as the routing layer for Creative segmentation, replacing ad hoc isolated gate routing while preserving all queue/push/apply safety.

Current result: the media-buyer scorecard layer is implemented and `assessCreativeOperatorPolicy()` now routes the operator segment through `mediaBuyerScorecard.operatorSegment`. Fresh current-output artifact generation is unblocked through server-side Docker execution from the PR #65 commit. The artifact is valid for Claude review, but not valid for acceptance scoring because fresh expected labels were not regenerated.

## Program Status

- foundation: merged
- foundation hardening: merged
- calibration data gate: passed
- live Meta cohort recovery: complete
- original 10-agent calibration panel: complete
- implementation passes 1-6: merged
- pass 6 fatigue hardening: merged
- live output restoration: merged
- UI taxonomy/count hardening: merged
- test campaign actionability: merged
- critical media-buyer fixes: merged
- critical fix hardening: merged
- equal-segment scoring audit: complete
- equal-segment gate fixes: merged through PR #59
- final equal-segment fixes: merged through PR #61
- trend-collapse evidence hardening: merged through PR #63
- Claude fix-plan implementation, Watch floor-policy fix, and Round 5 closure: PR #65 open on `feature/adsecute-creative-claude-fix-plan-implementation`
- Protect/no-touch boundary investigation: implemented on PR #65 branch
- Round 6 Watch-as-Refresh edge verification: implemented on PR #65 branch; no additional policy change required
- PR #65 score reconciliation: complete; no policy change made
- Creative media-buyer scoring engine: implemented on PR #65 branch
- PR #65 fresh scoring unblock: source-read/audit helper hardened; fresh current-output artifact exists but is blocked and invalid for acceptance
- PR #65 scoring runtime recovery: server-side Docker audit completed; fresh current-output artifact is valid for Claude review

## Current PR

- PR: `https://github.com/erhanrdn/OmniAds/pull/65`
- title: `Implement Claude Creative segment recalibration plan`
- status: open; do not merge
- merge status: not merged
- latest commit: media-buyer scoring engine update on PR #65 branch
- latest checks: server-side current-output artifact generation completed from PR commit `8eca958977378fb67fcb2dde45669b49f97d02f9`; local validation for the runtime-recovery changes is pending final rerun in this pass
- reason: current exact equal-segment scores are still not proven because fresh expected labels were not regenerated; do not merge before Claude/supervisor review of the valid current-output artifact or explicit owner acceptance

## Media Buyer Scoring Engine

Status: implemented locally on PR #65 branch.

Added:

- `lib/creative-media-buyer-scoring.ts`
- `lib/creative-media-buyer-scoring.test.ts`

The scorecard computes:

- relative performance class
- evidence maturity
- trend state
- efficiency risk
- winner signal
- loser signal
- context state
- business validation state
- recommended user-facing segment
- internal operator segment
- confidence
- reason tags
- blocked actions
- review-only status

Routing change:

- `assessCreativeOperatorPolicy()` builds the scorecard once.
- `resolveSegment()` now returns `mediaBuyerScorecard.operatorSegment`.
- The old policy helper logic remains for missing-evidence, required-evidence, reason, and safety surface computation.

Safety preserved:

- `Scale` floors were not changed.
- `Scale Review` remains review-only when business validation / Commercial Truth is missing.
- `Cut`, `Refresh`, and `Retest` remain operator-review outcomes.
- queue/push/apply safety was not loosened.
- benchmark scope behavior was not changed.
- old challenger remains comparison-only.

Audit helper update:

- `scripts/creative-live-firm-audit.ts` now emits sanitized scorecard summaries for each sampled row.
- the helper no longer performs a duplicate campaign/ad set source-snapshot read after Decision OS has already resolved delivery context.
- the helper writes `docs/operator-policy/creative-segmentation-recovery/reports/equal-segment-scoring/artifacts/pr65-current-output-fresh.json`.
- the helper records per-business source-read failures and can write a blocked current-output artifact instead of failing without an artifact.
- Decision OS source reads now scope campaign/ad set context to campaign IDs referenced by the primary Creative decision window.

Fresh live audit attempts:

- SSH tunnel to local `127.0.0.1:15432` was established.
- `scripts/creative-live-firm-audit.ts` was run with production DB URL rewritten to the tunnel.
- first runs hit DB query timeouts on Meta campaign/ad set context reads.
- after source-read hardening, reruns progressed farther but the SSH DB tunnel dropped or returned connection timeouts/refusals during discovery/evaluation.
- a fresh blocked artifact was written at `docs/operator-policy/creative-segmentation-recovery/reports/equal-segment-scoring/artifacts/pr65-current-output-fresh.json`.
- artifact status: `blocked`
- `valid_for_acceptance: false`
- `validForClaudeReview: false`
- runtime blockers: `discovery:db_tunnel_connection_refused`, `prior_live_run:db_tunnel_connection_timeout`, `prior_live_run:database_query_timeout_meta_campaign_adset_context`

Server-side runtime recovery:

- runtime path: temporary Docker worker image built on the app server from PR #65 commit `8eca958977378fb67fcb2dde45669b49f97d02f9`
- production services were not restarted or modified
- the audit used the production-equivalent environment path from the app server and avoided the local SSH Postgres tunnel
- current-output artifact: `docs/operator-policy/creative-segmentation-recovery/reports/equal-segment-scoring/artifacts/pr65-current-output-fresh.json`
- artifact status: `complete_current_output`
- `valid_for_claude_review: true`
- `valid_for_acceptance: false`
- reason acceptance remains false: artifact has fresh current outputs, but no fresh expected-label scoring
- readable businesses: `8`
- sampled creatives: `78`
- current segment counts: `Scale 0`, `Scale Review 1`, `Test More 6`, `Protect 6`, `Watch 10`, `Refresh 21`, `Retest 0`, `Cut 13`, `Campaign Check 0`, `Not Enough Data 16`, `Not eligible 5`

Current acceptance status:

- represented segment scores are not re-proven after the scoring engine pass.
- Creative Recovery is not accepted yet.
- Next recommended action is to run Claude/supervisor review against the valid fresh current-output artifact.

## PR #65 Scoring Runtime Recovery

Status: current-output artifact unblocked; acceptance scoring still not valid.

Chosen runtime path:

- server-side temporary Docker audit image built from the PR #65 branch
- production-equivalent app server environment
- no local SSH DB tunnel

Why:

- local tunnel runs repeatedly failed with DB query timeouts and tunnel drops
- server-side container execution completed the audit without runtime blockers

Artifact status:

- path: `docs/operator-policy/creative-segmentation-recovery/reports/equal-segment-scoring/artifacts/pr65-current-output-fresh.json`
- `artifactStatus: complete_current_output`
- `valid_for_claude_review: true`
- `valid_for_acceptance: false`

Fresh equal-segment scoring:

- not run
- stale expected labels were not used
- Claude should independently score from the fresh artifact

Merge status:

- PR #65 must remain unmerged until review/acceptance completes

Last updated by Codex: 2026-04-26

## PR #65 Fresh Scoring Unblock

Status: superseded by PR #65 scoring runtime recovery.

Root cause found:

- The original live audit path duplicated campaign/ad set context reads after Decision OS had already fetched source context.
- The core source path also read broad campaign/ad set context for the full business, which was too slow over the SSH tunnel.
- After narrowing those reads to referenced campaign IDs, the remaining local-tunnel blocker was SSH/DB tunnel stability, not a proven policy/scoring defect.
- This blocker was resolved for current-output artifact generation by running the audit in a server-side temporary Docker image.

What was fixed:

- audit active-status sampling now uses Decision OS delivery context.
- Decision OS campaign/ad set context reads are campaign-ID scoped from the primary Creative decision window.
- blocked current-output artifacts are persisted instead of silently missing.

Fresh acceptance scoring:

- not run
- no current scores are valid for acceptance
- Claude review may now run against the fresh current-output artifact, but PR #65 must not merge before review/acceptance

Last updated by Codex: 2026-04-26

## Fresh Baseline Audit

Current `main` at branch start was the PR #63 state:

- macro replay: `87/100`
- raw replay accuracy: `87%`
- Watch: `75/100`
- Refresh: `84/100`
- Protect: `83/100`
- Test More: `83/100`
- Not Enough Data: `88/100`
- Cut recall: about `92%`

A fresh live-firm audit was rerun on this branch after the Round 5 patch using the corrected current Decision OS path:

- readable businesses: `8`
- sampled creatives: `78`
- Scale: `0`
- Scale Review: `6`
- Test More: `7`
- Protect: `1`
- Watch: `10`
- Refresh: `23`
- Retest: `0`
- Cut: `12`
- Campaign Check: `0`
- Not Enough Data: `14`
- Not eligible for evaluation: `5`

The committed sanitized artifact was updated at:

- `docs/operator-policy/creative-segmentation-recovery/reports/live-firm-audit/artifacts/sanitized-live-firm-audit.json`

The local private artifact remains local-only:

- `/tmp/adsecute-creative-live-firm-audit-local.json`

## Claude Fix Plan Implementation

Implemented:

1. validating trend-collapse Refresh admission now accepts mature quarter-trend collapse (`7d / 30d <= 0.25`) while preserving the PR #63 low-evidence guard.
2. catastrophic CPA `fatigued_winner` / `refresh_replace` Cut behavior was verified and preserved.
3. mature one-purchase catastrophic CPA rows can now route from `Not Enough Data` to review-safe `Cut`.
4. stable protected winners now use tiered trend-collapse sensitivity:
   - mild above-baseline winners (`1.0x` to `<1.4x` benchmark) can route to `Refresh` at `<=0.50` trend ratio
   - stronger winners keep the stricter `<=0.40` trend ratio
5. thin-spend weak-ratio positives now remain `Not Enough Data` instead of `Test More`; strong-relative thin-spend positives can still become `Test More`.
6. high-relative non-test Watch false negatives can now route to review-only `Scale Review` when evidence is mature and no context blocker exists.
7. validating below-benchmark rows with zero recent ROAS and enough spend/purchase/impression evidence can now route from `Watch` to review-only `Refresh`.
8. PR #65 P1 hardening: high-relative non-test review candidates are excluded from true `Scale` intent / `scaleAction`, so favorable business validation cannot promote that review-only path into `scale_ready` or queue eligibility.
9. PR #65 P2 hardening: the new below-benchmark collapse Refresh gate now requires known creative age `>= 7` days, so unknown-age creatives stay conservative.
10. Protect/no-touch boundary fix: high-volume stable winners below active benchmark with elevated CPA now route to `Watch` instead of passive `Protect`, while explicit protected watchlist rows remain Protect.
11. Round 6 verification: the requested `company-08 / creative-10` validating below-benchmark collapse shape is already covered by `isValidatingBelowBaselineCollapseRefreshCandidate`.

Preserved / not changed:

- True `Scale` floors were not changed.
- Broad Scale Review floors were not changed; the new Watch fix is a narrow non-test high-relative floor with stronger evidence requirements.
- Queue/push/apply safety was not loosened.
- Benchmark scope remains explicit-only.
- Old challenger remains comparison-only.

## Score Status

Previous after-score claims are superseded by the PR #65 score reconciliation.

What is proven:

- the current committed live artifact has `company-08 / company-08-creative-10` as `Refresh`
- the current committed live artifact segment distribution is `Scale Review 6`, `Test More 7`, `Protect 1`, `Watch 10`, `Refresh 23`, `Cut 12`, `Not Enough Data 14`, and `Not eligible 5`
- severe CPA examples `company-03 / company-03-creative-01` and `company-07 / company-07-creative-01` are `Cut`

What is not proven:

- exact current macro score
- exact current Watch / Refresh / Protect scores
- exact current IwaStore / TheSwaf equal-segment scores

Reason: the only local equal-segment expected-label artifact predates the latest PR #65 commits and is not safe as the score of record. Joining that stale expected-label artifact to the current live artifact produces an intentionally invalid reconciliation score, not an acceptance score.

## Watch Floor Policy Fix

Status: fixed in deterministic replay.

- before this fix: `Watch` at `83/100`
- after this fix: `Watch` at `90/100`

Gate fixed:

- representative sanitized trace: `company-05 / company-05-creative-04`
- before outcome: `Watch`
- after outcome: `Scale Review`
- reason: the row has strong baseline-backed relative evidence, mature spend/purchase/impression depth, non-worse CPA, missing business validation, non-test context, and no primary campaign blocker

The fix remains review-only:

- missing Commercial Truth still blocks true `Scale`
- queue/apply remain false
- campaign-context blockers still become `Campaign Check`
- no-touch winners still become `Protect`
- PR #65 P1 review issue was real and fixed: this path is no longer part of true `scaleIntent` or `scaleAction`; even with favorable business validation and true-scale evidence it remains `Scale Review`, `operator_review_required`, and queue/apply blocked.

## Round 5 Equal-Segment Target Closure

Status: fixed for the clear Watch miss; followed by Protect boundary investigation.

Fixed gate:

- representative sanitized trace: `company-08 / company-08-creative-10`
- before outcome: `Watch`
- after outcome: `Refresh`
- reason: validating / keep-in-test row had ROAS around `0.37x` active benchmark, 7-day ROAS `0`, spend around `$378`, `2` purchases, meaningful impressions, and no campaign-context blocker

Gate added:

- `isValidatingBelowBaselineCollapseRefreshCandidate`
- admits only validating / keep-in-test rows at or below `0.40x` active benchmark with zero or collapsed recent ROAS, spend `>= 300`, purchases `>= 2`, impressions `>= 3000`, and known creative age `>= 7`
- stronger rows that meet existing Cut gates still route to `Cut`
- campaign-context blockers still route to `Campaign Check`

Surface alignment:

- the fixed row now has `Refresh` label, `Refresh` instruction headline, and Refresh-specific reason / next observation
- queue/apply remain false

## Round 6 Watch Edge Verification

Status: verified; no new policy change required.

Requested target:

- sanitized row: `company-08 / company-08-creative-10`
- before outcome in Claude review: `Watch`
- expected: `Refresh`, unless existing severe Cut gates apply
- evidence shape: validating / keep-in-test, ROAS about `0.37x` active benchmark, recent ROAS `0`, spend around `$378`, `2` purchases, no campaign-context blocker

Current branch behavior:

- `isValidatingBelowBaselineCollapseRefreshCandidate` already admits this shape
- policy segment: `needs_new_variant`
- user-facing outcome: `Refresh`
- queue/apply remain false

Score read:

- Watch remains about `90/100` after the Round 5 fix
- macro remains about `90/100` after Round 5 plus Protect boundary
- no segment score changed in this no-op verification pass

Reconciliation update:

- the row outcome remains `Refresh`
- the score estimate should not be treated as the score of record
- a fresh equal-segment review must score the current artifact directly

## Protect Boundary Investigation

Status: implemented in current branch.

Result:

- the issue was real as a narrow reviewed-set boundary
- sanitized reviewed row: `company-05 / company-05-creative-01`
- before: `Protect`
- expected: `Watch`
- gate responsible: unconditional `hold_no_touch` fallback to `protected_winner`
- fix: added a narrow below-benchmark high-CPA stable winner guard that routes to `hold_monitor` / Watch

Admission requires:

- lifecycle `stable_winner`
- primary action `hold_no_touch`
- not explicitly `protected_watchlist`
- reliable relative baseline
- spend at least `max(1000, 1.25x peer median spend)`
- mature purchase, impression, and creative-age evidence
- ROAS at or below `0.90x` active benchmark
- CPA at least `1.50x` peer median CPA
- no campaign/ad set blocker

Preserved:

- true protected watchlist rows remain Protect
- healthy above-benchmark no-touch winners remain Protect
- scale-worthy review-only rows remain Scale Review
- trend-collapse winners still route to Refresh only through existing trend gates
- queue/push/apply safety unchanged

Score read:

- Protect boundary behavior changed as documented
- exact current Protect score is not proven by a fresh scoring artifact
- pdf-company-01 remains unresolved as a score claim until the next fresh review

## PR #65 Score Reconciliation

Status: complete; no policy change made.

Artifacts:

- reconciliation report: `docs/operator-policy/creative-segmentation-recovery/reports/pr65-score-reconciliation/final.md`
- committed reconciliation artifact: `docs/operator-policy/creative-segmentation-recovery/reports/equal-segment-scoring/artifacts/pr65-current-equal-segment.json`
- local private copy: `/tmp/adsecute-pr65-current-equal-segment-local.json`

Answers:

- Claude reviewed stale data for `company-08 / creative-10`; current artifact says `Refresh`, not `Watch`
- STATE.md overclaimed acceptance-level scores; exact current per-segment scores are not regenerated
- the joined stale expected-label artifact is marked `not_valid_for_acceptance`
- another policy fix is not justified by the `company-08 / creative-10` dispute alone
- a future policy fix may still be needed if a fresh review of the current artifact confirms other high-spend validating Watch/Refresh/Cut boundaries remain wrong

## Validation

- targeted Creative policy tests: passed
- targeted Creative policy/surface/Decision OS/prescription tests: passed
- targeted Creative UI surface tests: passed
- targeted Command Center safety tests: passed
- full `npm test`: passed
- `npx tsc --noEmit`: passed
- `npm run build`: passed
- `/creatives` localhost smoke: passed through expected auth redirect/load
- `/platforms/meta` localhost smoke: passed through expected auth redirect/load
- prior PR #65 `git diff --check`: passed before the current unstaged external-review edit
- hidden/bidi/control scan: passed
- raw ID scan on touched docs: passed
- touched-file `git diff --check`: passed
- full working-tree `git diff --check`: blocked by unstaged external-review trailing whitespace in `docs/external-reviews/creative-segmentation-recovery/equal-segment-review.md`; that file was already modified outside this pass and is not staged
- lint skipped: no `lint` script exists
- live-firm audit rerun attempt: blocked by production DB query timeout over the SSH tunnel (`DB query timed out after 8000ms`); no committed live-firm artifact changed
- Round 5 targeted policy/surface tests: passed
- Round 5 live-firm audit rerun: passed
- PR #65 P1 regression test for review-only non-test Scale Review: passed
- PR #65 P2 regression test for unknown-age below-benchmark collapse rows: passed
- Protect boundary policy tests: passed
- Round 6 Watch edge verification: passed; target fixture already resolves to Refresh
- equal-segment scoring audit: not rerun by script in this pass; no executable equal-segment scoring helper exists in the repo, and this pass made no policy change beyond verifying the existing Round 5 gate
- PR #65 scoring reconciliation artifact generated; marked `not_valid_for_acceptance` because it joins stale expected labels with the current live artifact

## Reports

- Claude fix plan implementation: `docs/operator-policy/creative-segmentation-recovery/reports/claude-fix-plan-implementation/final.md`
- Watch floor policy fix: `docs/operator-policy/creative-segmentation-recovery/reports/watch-floor-policy-fix/final.md`
- Round 5 target closure: `docs/operator-policy/creative-segmentation-recovery/reports/round-5-equal-segment-target-closure/final.md`
- Protect boundary investigation: `docs/operator-policy/creative-segmentation-recovery/reports/protect-boundary-investigation/final.md`
- Round 6 Watch edge verification: `docs/operator-policy/creative-segmentation-recovery/reports/round-6-watch-refresh-edge-fix/final.md`
- PR #65 score reconciliation: `docs/operator-policy/creative-segmentation-recovery/reports/pr65-score-reconciliation/final.md`
- equal-segment scoring final: `docs/operator-policy/creative-segmentation-recovery/reports/equal-segment-scoring/final.md`
- per-segment scores: `docs/operator-policy/creative-segmentation-recovery/reports/equal-segment-scoring/per-segment-scores.md`
- confusion matrix: `docs/operator-policy/creative-segmentation-recovery/reports/equal-segment-scoring/confusion-matrix.md`
- sanitized live artifact: `docs/operator-policy/creative-segmentation-recovery/reports/live-firm-audit/artifacts/sanitized-live-firm-audit.json`
- PR #65 current equal-segment reconciliation artifact: `docs/operator-policy/creative-segmentation-recovery/reports/equal-segment-scoring/artifacts/pr65-current-equal-segment.json`

## Next Recommended Action

Do not merge PR #65 and do not start another policy pass yet. Run a fresh Claude/supervisor review against the current PR #65 reconciliation artifact and current live artifact. If that review confirms current scores are below target, use the newly scored mismatches to select the next narrow fix.
