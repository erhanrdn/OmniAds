# Creative Segmentation Recovery State

Last updated: 2026-04-24 by Codex

## Current Goal

Complete the narrow mature-loser Cut / Refresh hardening pass, then send the regenerated live output for one final product review.

Creative Recovery acceptance remains revoked until final product review. The previous accepted-with-monitoring state is no longer valid because live test campaign contexts showed mostly passive guidance with `Scale = 0`, `Scale Review = 0`, and `Cut = 0`, and the direct live-data review found one remaining mature-loser gap.

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
- test campaign actionability: merged
- mature below-baseline loser hardening: fixed on branch, pending normal PR flow

## Test Campaign Actionability

Status: merged.

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

## Mature Loser Cut / Refresh Hardening

Status: fixed on branch.

Finding:

- the remaining mature-loser gap was real
- the direct live-data review found `pdf-company-02` mature `keep_in_test` / `validating` rows with meaningful spend, non-zero purchases, and ROAS materially below account baseline still surfacing as `Watch`
- the exact gate was the Cut admission path: it caught mature zero-purchase losers, but did not admit mature below-baseline losers with purchases

Fix:

- added deterministic admission for mature below-baseline purchase losers
- required reliable relative baseline, meaningful spend, purchase evidence, mature age/exposure, and ROAS at or below `0.8x` active benchmark median ROAS
- campaign/ad set blockers still produce `Campaign Check`
- thin evidence still avoids Cut
- queue/apply/push safety remains unchanged
- no Scale / Scale Review floors changed

Sanitized `pdf-company-02` trace after the fix:

- `company-08-creative-01`: `6930.16` spend, `48` purchases, `1.28` ROAS vs `1.82` account median ROAS -> `Cut`
- `company-08-creative-02`: `3427.44` spend, `26` purchases, `1.39` ROAS vs `1.82` account median ROAS -> `Cut`
- `company-08-creative-03`: `1155.34` spend, `7` purchases, `1.29` ROAS vs `1.82` account median ROAS -> `Cut`

`pdf-company-01` regression result:

- sanitized `pdf-company-01` remains stable: `Scale Review = 3`, `Protect = 1`, `Watch = 6`
- the borderline `pdf-company-01` Scale Review question was intentionally not bundled into this pass

## Current Live Counts

Runtime rerun: corrected current Decision OS source path.

Readable live businesses: `8`

Sampled creatives: `78`

Latest post-hardening segment counts:

- `Scale`: `0`
- `Scale Review`: `5`
- `Test More`: `8`
- `Protect`: `11`
- `Watch`: `12`
- `Refresh`: `14`
- `Retest`: `0`
- `Cut`: `9`
- `Campaign Check`: `0`
- `Not Enough Data`: `13`
- `Not eligible for evaluation`: `6`

Business-level counts:

- businesses with zero `Scale`: `8`
- businesses with zero `Scale Review`: `6`

## PDF Test Contexts

Private runtime matching was used; committed files use sanitized aliases only.

`pdf-company-01` context:

- sanitized alias: `company-01`
- post-fix sample: `Scale Review = 3`, `Protect = 1`, `Watch = 6`
- result: the previous zero-Scale-Review failure is resolved for this sanitized context

`pdf-company-02` context:

- sanitized alias: `company-08`
- post-hardening sample: `Cut = 3`, `Scale Review = 2`, `Protect = 3`, `Watch = 1`, `Not Enough Data = 1`
- result: the mature below-baseline purchase losers now surface as Cut review work instead of passive Watch
- remaining risk: none in this specific mature-loser gate; future review may still evaluate the broader product feel on live data

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

Ready next step: one final Claude product review after this PR passes checks and merges.

Another implementation pass should not start unless the final product review or live operators identify a specific remaining defect.

## Reports

- test campaign actionability final: `docs/operator-policy/creative-segmentation-recovery/reports/test-campaign-actionability/final.md`
- mature loser Cut / Refresh final: `docs/operator-policy/creative-segmentation-recovery/reports/mature-loser-cut-refresh/final.md`
- regenerated sanitized live artifact: `docs/operator-policy/creative-segmentation-recovery/reports/live-firm-audit/artifacts/sanitized-live-firm-audit.json`
- implementation pass 6 final: `docs/operator-policy/creative-segmentation-recovery/reports/implementation-pass-6-final.md`
- date-range invariance audit: `docs/operator-policy/creative-segmentation-recovery/reports/date-range-invariance-audit.md`

## Last Updated By Codex

- revoked the accepted-with-monitoring state for Creative Recovery
- fixed protected-winner Scale Review suppression
- fixed mature zero-purchase test loser suppression into passive Watch
- fixed mature below-baseline-with-purchases loser suppression into passive Watch
- narrowed campaign-context over-blocking so `limited` deployment precision does not hide review-level guidance
- reran the live-firm audit on the corrected current source path
- documented sanitized `pdf-company-01`, `pdf-company-02`, and `private-case-01` traces
