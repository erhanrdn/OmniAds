# Scale Review Gap Recovery - Final

Last updated: 2026-04-24 by Codex

## 1. Result

This pass was needed.

The corrected live-firm rerun still showed:

- `Scale = 0`
- `Scale Review = 0`
- four businesses fully buried under `Not eligible for evaluation`

The narrow source fix was real and safe. It restored live user-facing outputs for the previously source-gated businesses.

What it did **not** show is a believable hidden `Scale Review` distribution waiting behind one more safe patch.

## 2. Top Suppressing Gate Found

The main suppressor was upstream source-authority aggregation, not the review-level scale rule.

Root path:

1. `getCreativeDecisionOsForRange()` aggregated the primary 30d creative source together with support-window and campaign/ad set snapshot evidence
2. any `unknown` support source degraded the combined `evidenceSource` to `unknown`
3. operator policy then fail-closed to `contextual_only`
4. the Creative surface rendered that as `Not eligible for evaluation`

This was suppressing real live product states across multiple businesses before review-level logic had a chance to surface.

## 3. What Was Fixed

Source-only change:

- the Decision OS source resolver now treats the primary 30d creative window as the authoritative row-evidence source
- support windows and campaign/ad set snapshot unreadability no longer erase live row authority by themselves

Not changed:

- no Creative threshold retune
- no taxonomy change
- no queue/push/apply loosening
- no benchmark-scope change
- no Commercial Truth loosening

## 4. Before vs After

Comparison basis:

- same deterministic corrected live-firm sample
- `78` sampled creatives
- only the previously source-gated businesses were re-evaluated live
- unaffected businesses were carried forward unchanged because this patch cannot alter already-live evidence rows or the sample-selection rule

### Before

- `Scale`: `0`
- `Scale Review`: `0`
- `Protect`: `6`
- `Refresh`: `12`
- `Watch`: `7`
- `Test More`: `6`
- `Not Enough Data`: `8`
- `Not eligible for evaluation`: `39`

### After

- `Scale`: `0`
- `Scale Review`: `0`
- `Protect`: `16`
- `Refresh`: `14`
- `Watch`: `21`
- `Test More`: `8`
- `Not Enough Data`: `13`
- `Not eligible for evaluation`: `6`

### Zero-Count Business Read

- businesses with zero `Scale`: `8 -> 8`
- businesses with zero `Scale Review`: `8 -> 8`

## 5. What Actually Surfaced

The patch recovered meaningful live states instead of fake review-level promotions.

Representative transitions:

- `Not eligible for evaluation -> Protect`
  - `company-01-creative-01`
  - `company-01-creative-02`
  - `company-01-creative-03`
  - `company-08-creative-04`
  - `company-08-creative-05`
  - `company-08-creative-07`

- `Not eligible for evaluation -> Refresh`
  - `company-02-creative-01`
  - `company-02-creative-04`

- `Not eligible for evaluation -> Watch`
  - `company-01-creative-04`
  - `company-01-creative-05`
  - `company-02-creative-02`
  - `company-08-creative-01`

- `Not eligible for evaluation -> Test More`
  - `company-04-creative-02`
  - `company-04-creative-03`

- `Not eligible for evaluation -> Not Enough Data`
  - `company-02-creative-07`
  - `company-04-creative-07`
  - `company-08-creative-06`

## 6. Why Scale Review Stayed Zero

The candidate trace narrowed the plausible hidden `Scale Review` set to one clean row:

- `company-01-creative-04`

After the source fix, that row did **not** become `Scale Review`. It resolved to:

- user-facing segment: `Watch`
- lifecycle: `validating`
- primary action: `keep_in_test`
- evidence source: `live`
- baseline reliability: `strong`
- trust disposition: `review_hold`

So the row that looked closest to a hidden review-only winner still does not clear the current product rule once its live authority is restored.

That matters because it means:

- the zero-`Scale Review` result is no longer being caused by a hidden source bug
- a further patch would become a policy retune, not a source recovery
- there is no safe cross-account deterministic change left in this pass

## 7. Outcome

This pass fixed a real live-firm source-authority problem and made the live sample materially more readable.

It did **not** prove that the live product should now emit `Scale Review`.

The remaining zero-`Scale Review` state appears to be a real current product judgment, not a hidden source-path failure.

## 8. Recommended Next Action

Do one final Claude live-firm product review on top of this state.

That review should judge whether the remaining zero-`Scale Review` distribution is acceptable product behavior or whether a final narrow policy pass is still warranted.
