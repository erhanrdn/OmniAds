# Creative Test Campaign Actionability Final

Last updated: 2026-04-24 by Codex

## Verdict

Status: fixed on branch, pending normal PR review.

The test-campaign actionability failure was real. The corrected live-firm audit still had `Scale = 0`, `Scale Review = 0`, and `Cut = 0` before this pass, even though sampled live rows contained strong relative winners and mature zero-purchase test losers. That made the Creative page too passive for media-buyer triage.

This pass did not force fake `Scale` rows. `Scale` remains `0` after the patch because business-validation and queue/apply safety are still strict.

## Root Cause

Two deterministic gates were suppressing useful guidance:

- protected-winner preemption: `hold_no_touch` / protected rows returned `Protect` before the review-only `Scale Review` gate could evaluate true relative-scale evidence with missing business validation
- deployment `limited` over-blocking: target-lane precision limits were treated as primary campaign blockers, which could bury review-level winner/loser guidance under `Campaign Check`
- mature zero-purchase softness: high-exposure `keep_in_test` rows with zero purchases were softened into `Watch`, so clear test losers did not surface as `Cut` candidates

## Fix

- Expansion-worthy protected winners can now surface as `Scale Review` when:
  - evidence is live and trusted
  - relative baseline reliability is sufficient
  - true relative-scale evidence is present
  - business validation / Commercial Truth is the missing blocker
  - campaign context is not hard-blocked
- `Scale Review` remains review-only. It does not enable queue/apply.
- Deployment compatibility `limited` no longer suppresses review-level diagnosis by itself. `blocked` deployment context still routes to `Campaign Check`.
- Mature zero-purchase test losers now surface as `Cut` review when spend/exposure are meaningful and purchases remain zero.
- Borderline mature zero-purchase cases can still remain `Watch`.

## Live Rerun

Runtime path: corrected current Creative Decision OS source path.

Audit window: last 30 completed days, excluding today.

Readable live businesses: `8`

Sampled creatives: `78`

Before this pass:

- `Scale`: `0`
- `Scale Review`: `0`
- `Cut`: `0`
- `Protect`: `14`
- `Watch`: `20`
- `Refresh`: `16`
- `Test More`: `8`
- `Not Enough Data`: `14`
- `Campaign Check`: `0`
- `Retest`: `0`
- `Not eligible for evaluation`: `6`

After this pass:

- `Scale`: `0`
- `Scale Review`: `3`
- `Cut`: `5`
- `Protect`: `9`
- `Watch`: `17`
- `Refresh`: `15`
- `Test More`: `8`
- `Not Enough Data`: `15`
- `Campaign Check`: `0`
- `Retest`: `0`
- `Not eligible for evaluation`: `6`

Businesses with zero `Scale`: `8`

Businesses with zero `Scale Review`: `7`

## Representative Sanitized Traces

### Scale Review Recovery

Sanitized rows:

- `company-01-creative-02`
- `company-01-creative-03`
- `company-01-creative-10`

Shared trace:

- primary action before policy surface: `hold_no_touch`
- lifecycle: `stable_winner`
- relative strength: `review_only_scale_candidate`
- baseline reliability: `strong`
- business validation: `missing`
- final user-facing segment: `Scale Review`
- queue/apply: not enabled

Diagnosis:

These rows were previously hidden as passive `Protect`. They now say what a media buyer needs to know: relative winner, review before scale because business validation is missing.

### Cut Recovery

Sanitized rows:

- `company-02-creative-05`
- `company-05-creative-05`
- `company-05-creative-07`
- `company-05-creative-10`
- `company-07-creative-07`

Shared trace:

- primary action before policy surface: `keep_in_test`
- lifecycle: `validating`
- purchases in the primary window: `0`
- spend/exposure: meaningful enough to move past early learning
- final user-facing segment: `Cut`
- queue/apply: not enabled; operator review required

Diagnosis:

These rows no longer look like early learning or passive Watch. They are now presented as stop/replace candidates with review-safe wording.

## PDF Contexts

The PDFs were treated as product context only. Numeric truth came from the current runtime and sanitized audit artifacts.

Private name matching found `pdf-company-01` as `company-01`. After the patch, the sanitized sample for that context contains:

- `Scale Review`: `3`
- `Protect`: `1`
- `Watch`: `6`

Private name matching found `pdf-company-02` as `company-08`. After the patch, the sanitized sample contains:

- `Watch`: `5`
- `Refresh`: `1`
- `Not Enough Data`: `3`
- `Protect`: `1`
- `Scale Review`: `0`
- `Cut`: `0`

The `pdf-company-02` context is not automatically promoted in this pass because the current runtime sample does not show a true relative-scale candidate in active context. If the live UI still shows an active Protect row that a media buyer expects to scale, that should be the next private trace target for product review.

## Specific Private Case

The earlier `private-case-01` match is represented by sanitized `company-03` rows. Current runtime matching finds three candidate rows in that private-name family, all surfaced as `Refresh` rather than `Pause`.

That means the old `Pause` wording is not the current primary operator segment. The current policy still treats those rows as fatigue/replacement cases, not Scale Review.

## Safety

Preserved:

- no queue/apply/push loosening
- missing Commercial Truth still blocks true `Scale`
- `Scale Review` remains review-only
- selected reporting range remains non-authoritative
- old rule challenger remains comparison-only
- no new taxonomy labels
- no silent benchmark-scope switch

## Remaining Risks

- `Scale` remains zero, which is acceptable for this pass because no true-Scale queue-safe case was intentionally unlocked.
- `Scale Review` appears in only one audited business. This is materially better than zero, but still needs live product review.
- The `pdf-company-02` context remains a product question because the current runtime sample did not reproduce the user-observed active Protect-to-scale expectation.
- Campaign-level explicit benchmark audit was not expanded into a new standalone product workflow in this pass; the existing explicit benchmark control remains unchanged.

## Next Action

Open the PR, run full validation, and review the branch as a focused product correction. If checks pass and the sanitized report is accepted, the next step should be a fresh Claude product review using the regenerated live-firm artifact.
