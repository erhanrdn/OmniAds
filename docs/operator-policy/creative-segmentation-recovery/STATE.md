# Creative Segmentation Recovery State

Last updated: 2026-04-24 by Codex

## Current Goal

Restore trustworthy live-firm evaluation after the branch live-firm audit reported `0` current Creative Decision OS rows for all readable businesses.

This pass is source/output restoration only. No Creative policy logic was changed.

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
- live-firm audit branch: completed, but blocked by helper/source mismatch
- live output restoration: complete on branch, pending normal PR flow

## Root Cause Found

The prior live-firm zero-row result was caused by a helper parity bug, not by the current `/creatives` Decision OS route.

Specifically:

- screening used the live current creative source
- the branch audit used a warehouse-backed Decision OS helper path
- that helper depended on `meta_creative_daily`
- `meta_creative_daily` is currently empty for the audited live cohort
- the actual current Decision OS route reads live/persisted creative payloads and does return rows

## What Was Fixed

Helper-only changes:

- restored the live-firm audit helper to the real `getCreativeDecisionOsForRange()` path
- removed the warehouse-backed Decision OS fallback from the helper
- made the helper request base URL explicit and runtime-safe
- added a localhost refresh guard so CLI audit runs do not recurse or fail on background snapshot warm requests

Not changed:

- no Creative policy thresholds
- no taxonomy
- no UI
- no queue/push/apply safety
- no old-rule challenger behavior
- no Commercial Truth logic

## Whether Live Decision OS Rows Now Flow

Yes.

Validated current-source rerun results for the readable live Meta cohort:

- readable businesses: `8`
- businesses with non-zero current Decision OS rows: `8`
- businesses with zero current Decision OS rows: `0`
- total current Decision OS creatives: `319`

Per-business row counts:

- `company-01`: `50`
- `company-02`: `8`
- `company-03`: `16`
- `company-04`: `50`
- `company-05`: `56`
- `company-06`: `64`
- `company-07`: `35`
- `company-08`: `40`

## Live-Firm Segment Counts After Restoration

- `Scale`: `0`
- `Scale Review`: `0`
- `Protect`: `17`
- `Campaign Check`: `4`
- `Watch`: `47`
- `Refresh`: `24`
- `Test More`: `21`
- `Not Enough Data`: `138`
- `Not eligible for evaluation`: `68`
- `Retest`: `0`
- `Cut`: `0`

## Top Systemic Problems Now

The empty-state blocker is cleared.

The remaining live-firm questions are now real product-review questions:

1. zero live `Scale`
2. zero live `Scale Review`
3. high `Not Enough Data`
4. meaningful `Not eligible for evaluation` volume
5. whether `Watch` / `Refresh` / `Protect` / `Campaign Check` look trustworthy enough in live buyer context

## Whether Another Live-Firm Audit Is Still Needed

Yes.

Reason:

- the prior branch audit judged an invalid zero-row helper path
- the restored current-source rerun now produces real current rows and real segment counts
- the next step should be a fresh live-firm product review on this restored cohort

## Whether Current Creative Segmentation Is Trustworthy Enough

Not yet proven.

What is now proven:

- current row flow exists
- the live cohort is evaluable

What still needs review:

- whether the current segment distribution is product-trustworthy
- whether zero live `Scale` / `Scale Review` is acceptable
- whether the page is now genuinely better than manual table reading

## Next Recommended Action

Run one fresh live-firm Claude product review against the restored current-output cohort.

That review should evaluate actual segmentation quality, not empty-state behavior.

## Reports

- live output restoration trace: `docs/operator-policy/creative-segmentation-recovery/reports/live-output-restoration-trace.md`
- live output restoration final: `docs/operator-policy/creative-segmentation-recovery/reports/live-output-restoration-final.md`
- prior live-firm audit review: `docs/external-reviews/creative-segmentation-recovery/live-firm-audit-review.md`

## Last Updated By Codex

- traced the prior zero-row result to a warehouse-backed helper mismatch
- verified on the validated runtime that the actual current Decision OS path emits rows
- restored helper parity to the live `getCreativeDecisionOsForRange()` path
- reran the readable live cohort and confirmed `8/8` businesses now produce current Decision OS rows
