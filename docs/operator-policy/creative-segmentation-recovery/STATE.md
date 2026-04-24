# Creative Segmentation Recovery State

Last updated: 2026-04-24 by Codex

## Current Goal

Complete the Creative test campaign actionability correction pass, then send the regenerated live output for product review.

Creative Recovery acceptance remains revoked. The previous accepted-with-monitoring state is no longer valid because live test campaign contexts showed mostly passive guidance with `Scale = 0`, `Scale Review = 0`, and `Cut = 0`.

## Program Status

- foundation: complete
- foundation hardening: complete
- calibration data gate: `passed`
- live Meta cohort recovery: complete
- original 10-agent calibration panel: complete
- implementation pass 1: merged
- implementation pass 2: merged
- implementation pass 3: merged
- implementation pass 4: merged
- implementation pass 5: merged
- implementation pass 6: merged
- implementation pass 6 hardening: merged
- live output restoration: merged
- corrected live-firm audit rerun: complete
- UI taxonomy/count hardening: merged
- test campaign actionability: fixed on branch, pending normal PR flow

## Test Campaign Actionability

Status: fixed on branch.

Finding:

- the actionability failure was real
- the corrected live audit still had `Scale = 0`, `Scale Review = 0`, and `Cut = 0`
- protected winners with true relative-scale evidence were being hidden under `Protect`
- high-exposure zero-purchase test rows were being softened into `Watch`
- deployment compatibility `limited` was acting too much like a primary Campaign Check blocker for review-level diagnosis

Fix:

- protected rows that are true relative winners and only blocked by missing business validation can now surface as review-only `Scale Review`
- deployment `limited` remains supporting caution, but only `blocked` campaign/ad set context suppresses the primary winner/loser outcome into `Campaign Check`
- high-exposure zero-purchase `keep_in_test` rows now surface as `Cut` review candidates
- borderline zero-purchase rows can still remain `Watch`
- missing Commercial Truth still blocks true `Scale`, queue/apply, and absolute-profit claims

## Current Live Counts

Runtime rerun: corrected current Decision OS source path.

Readable live businesses: `8`

Sampled creatives: `78`

Post-fix segment counts:

- `Scale`: `0`
- `Scale Review`: `3`
- `Test More`: `8`
- `Protect`: `9`
- `Watch`: `17`
- `Refresh`: `15`
- `Retest`: `0`
- `Cut`: `5`
- `Campaign Check`: `0`
- `Not Enough Data`: `15`
- `Not eligible for evaluation`: `6`

Business-level counts:

- businesses with zero `Scale`: `8`
- businesses with zero `Scale Review`: `7`

## PDF Test Contexts

Private runtime matching was used; committed files use sanitized aliases only.

`pdf-company-01` context:

- sanitized alias: `company-01`
- post-fix sample: `Scale Review = 3`, `Protect = 1`, `Watch = 6`
- result: the previous zero-Scale-Review failure is resolved for this sanitized context

`pdf-company-02` context:

- sanitized alias: `company-08`
- post-fix sample: `Watch = 5`, `Refresh = 1`, `Not Enough Data = 3`, `Protect = 1`
- `Scale Review = 0`
- result: not promoted in this pass because the current runtime sample did not show a true relative-scale candidate in active context
- remaining risk: if the operator still sees an active Protect row that should scale, that row needs a fresh private trace

Earlier `private-case-01` matching:

- sanitized alias family: `company-03`
- current matching rows surface as `Refresh`, not `Pause`
- current deterministic read remains fatigue/replacement, not Scale Review

## Safety Status

Unchanged:

- no queue/apply/push loosening
- no Creative taxonomy change
- no broad policy rewrite
- no old-rule takeover
- old rule challenger remains comparison-only
- benchmark scope remains explicit-only
- selected reporting range remains non-authoritative
- no invented Commercial Truth or baselines

## Readiness

Creative output is improved but not accepted as final yet.

Ready next step: fresh Claude product review after this PR passes checks and merges.

Pass 7 should not start unless review or live operators identify a specific remaining product defect. The most likely remaining question is the `pdf-company-02` context where current runtime data does not reproduce a Scale Review candidate, despite user-observed product concern.

## Reports

- test campaign actionability final: `docs/operator-policy/creative-segmentation-recovery/reports/test-campaign-actionability/final.md`
- regenerated sanitized live artifact: `docs/operator-policy/creative-segmentation-recovery/reports/live-firm-audit/artifacts/sanitized-live-firm-audit.json`
- implementation pass 6 final: `docs/operator-policy/creative-segmentation-recovery/reports/implementation-pass-6-final.md`
- date-range invariance audit: `docs/operator-policy/creative-segmentation-recovery/reports/date-range-invariance-audit.md`

## Last Updated By Codex

- revoked the accepted-with-monitoring state for Creative Recovery
- fixed protected-winner Scale Review suppression
- fixed mature zero-purchase test loser suppression into passive Watch
- narrowed campaign-context over-blocking so `limited` deployment precision does not hide review-level guidance
- reran the live-firm audit on the corrected current source path
- documented sanitized `pdf-company-01`, `pdf-company-02`, and `private-case-01` traces
