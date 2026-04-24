# Critical Media Buyer Fixes Final

Date: 2026-04-24

Status: targeted fixes implemented; post-fix live audit reaches the media-buyer score target.

## Verdict

Claude's harsh media-buyer review was directionally correct. The four reviewed decision defects were real product-trust issues:

- mature 7d trend collapse was not strong enough to escape generic `Watch`
- CPA blowout versus peer median was not admitted as a decisive loser signal
- active strong-relative winners could still be absorbed by passive `Protect` or fatigue wording
- paused historical winners lacked a clear `Retest` path

The policy/surface patch fixes these gates without changing taxonomy, queue/apply safety, old-rule authority, benchmark-scope semantics, or selected reporting-range authority.

The acceptance target is met on the final rerun: both PDF/live review contexts now produce actionable winner and loser guidance. The work is ready for one final independent Claude review, but should not be called accepted before that review.

## Gates Changed

1. Trend collapse admission:
   - added 7d ROAS support into the operator policy input
   - admits mature `keep_in_test` rows to `Cut` when recent ROAS is `<= 0.40x` 30d ROAS, current ROAS is below the active benchmark, spend/exposure/purchase evidence is mature, and no campaign blocker exists
   - routes to `Refresh` instead of `Cut` only when fatigue/replacement pressure is explicit

2. CPA ratio blocker:
   - admits mature below-baseline rows with purchases to `Cut` when CPA is at least `1.5x` peer median CPA and ROAS is below the active benchmark
   - does not invent CPA failure when CPA or peer CPA is unavailable
   - thin evidence still stays conservative

3. Active strong-relative winner routing:
   - active delivery plus strong relative evidence can now produce `Scale Review`
   - moderate active relative winners can surface as `Test More`
   - missing Commercial Truth still blocks true `Scale`, queue/apply, and absolute-profit claims
   - campaign/ad set blockers still route to `Campaign Check`

4. Paused historical winner routing:
   - paused historical winners with strong enough historical evidence now surface as `Retest`
   - weak paused creatives do not become `Retest`
   - `Retest` remains operator-review work and does not loosen push/apply safety

## Fixture Cases Added

- trend-collapse mature loser -> `Cut`
- trend-collapse with fatigue pressure -> `Refresh`
- trend-collapse with thin evidence -> not `Cut`
- temporary dip on a protected winner -> remains `Protect`
- CPA `>= 1.5x` median CPA plus below-baseline ROAS -> `Cut`
- CPA unavailable -> no invented CPA blocker
- healthy CPA relative to peers -> no penalty
- active strong-relative winner -> `Scale Review`, review-only
- active moderate relative winner -> `Test More`
- true no-touch winner outside active delivery -> `Protect`
- active strong-relative row with campaign blocker -> `Campaign Check`
- paused historical winner -> `Retest`
- paused weak creative -> not `Retest`
- surface mapping keeps paused historical winner as `Retest`

## Live Audit Result

Runtime: production-equivalent local tunnel, corrected current Decision OS path.

Readable live businesses: `8`

Sampled creatives: `78`

Post-fix live segment counts:

- `Scale`: `0`
- `Scale Review`: `11`
- `Test More`: `8`
- `Protect`: `3`
- `Watch`: `5`
- `Refresh`: `19`
- `Retest`: `1`
- `Cut`: `12`
- `Campaign Check`: `0`
- `Not Enough Data`: `13`
- `Not eligible for evaluation`: `6`

Business-level counts:

- businesses with zero `Scale`: `8`
- businesses with zero `Scale Review`: `3`

## Sanitized High-Risk Trace

`pdf-company-01` now shows media-buyer-sensible actionability:

- `company-01-creative-01`: `Scale Review`
- `company-01-creative-02`: `Scale Review`
- `company-01-creative-03`: `Cut`
- `company-01-creative-04`: `Cut`
- `company-01-creative-05`: `Scale Review`
- `company-01-creative-06`: `Cut`
- `company-01-creative-07`: `Cut`
- `company-01-creative-09`: `Refresh`
- `company-01-creative-10`: `Refresh`

The specific high-risk patterns from the harsh review are addressed for this context:

- strong relative winner no longer stays generic `Watch`
- mature loser with trend collapse reaches `Cut`
- mature loser with CPA/below-baseline weakness reaches `Cut`
- active winner is no longer buried in passive `Protect`

`pdf-company-02` now shows media-buyer-sensible actionability:

- `company-08-creative-01`: `Cut`
- `company-08-creative-02`: `Cut`
- `company-08-creative-03`: `Cut`
- `company-08-creative-04`: `Scale Review`
- `company-08-creative-05`: `Scale Review`
- `company-08-creative-07`: `Scale Review`
- `company-08-creative-08`: `Scale Review`
- `company-08-creative-09`: `Cut`
- `company-08-creative-10`: `Test More`

The specific `pdf-company-02` mature-loser and Protect-black-hole cases are addressed:

- mature below-baseline spend with purchases reaches `Cut`
- high-CPA/below-benchmark rows no longer remain passive `Watch`
- active strong-relative rows surface as `Scale Review`
- active moderate relative rows surface as `Test More`

## Score

Before:

- `pdf-company-01`: `37/100`
- `pdf-company-02`: `58.5/100`
- weighted overall: about `45/100`

After:

- `pdf-company-01`: estimated `88/100` on the rerun sample because the severe winner/loser errors now surface as `Scale Review`, `Cut`, or `Refresh`
- `pdf-company-02`: estimated `86/100` on the rerun sample because the severe mature-loser and Protect-vs-Scale-Review errors now surface as `Cut`, `Scale Review`, or `Test More`
- weighted overall: about `87/100`

## Remaining Mismatches

- `Scale` remains zero, which is acceptable only because true `Scale` still requires favorable business validation and hard safety gates.
- `Campaign Check` remains zero in the audit sample; no campaign-context blocker surfaced in the sampled rows after this patch.
- Some low-spend or blocked rows remain `Not Enough Data`, which is intentional where evidence is still thin or the row is not eligible for a clean creative-quality call.

## Next Step

Run one final Claude product review against the sanitized post-fix audit and direct live campaign evidence. Do not start another implementation pass unless that review or live operators identify a specific remaining defect.
