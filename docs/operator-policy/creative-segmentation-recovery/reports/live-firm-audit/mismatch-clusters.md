# Creative Live-Firm Audit - Mismatch Clusters

Last updated: 2026-04-24 by Codex

## 1. Zero-Scale / Zero-Scale-Review Businesses

Count:

- `8 / 8` audited businesses have zero `Scale`
- `8 / 8` audited businesses have zero `Scale Review`

Interpretation:

This is not yet evidence that calibrated policy is too conservative.

The stronger finding is upstream: every audited business also had zero current Decision OS creatives.

## 2. Live Readability vs Current Output Zero-Row Blocker

Count:

- `8 / 8` runtime-eligible businesses
- screening live creative rows per business: `8` to `64`
- current Decision OS creatives per business: `0`

Evidence:

- runtime token readability: `readable`
- runtime skip reasons show only one excluded candidate, `meta_token_checkpointed = 1`
- the zero-row state appears after live readability screening, at current Creative output evaluation

Code-path interpretation:

- `buildCreativeDecisionOs()` emits an empty response only when its input row set is empty
- the empty-state branch is explicit in `lib/creative-decision-os.ts`
- this means the blocker is current source row absence, not a downstream label filter that hid non-empty rows
- in the product route, the most plausible current causes are:
  - `decisionWindows.primary30d` mismatch versus the screened live window
  - a persisted zero-row snapshot being accepted for the primary decision window
  - malformed upstream rows with missing `creativeId`, which is a less likely edge case

Working classification:

- current source-data / current-output mismatch

## 3. Likely False Pauses / False Cuts

Not observable in this pass.

Reason:

- no current creative rows reached the user-facing output surface

## 4. Strong-Relative Rows Buried In Watch

Not observable in this pass.

Reason:

- no current creative rows were available to inspect row-level relative-strength handling

## 5. Commercial Truth Over-Gating

Not observable in this pass.

Reason:

- the audited output failed before row-level Commercial Truth interaction could be reviewed

## 6. Campaign-Context Suppression

Not observable in this pass.

Reason:

- no current creative rows were available for row-level campaign-context review

## 7. Label Confusion

Not observable in this pass.

Reason:

- the user-facing surface is empty, so label semantics cannot be judged at live-firm level

## 8. Over-Conservative Outputs

Observable only in a broad sense.

The current panel is over-conservative at live-firm level because it resolves to no output at all for readable businesses.

That is more severe than a boundary-label disagreement.

## 9. Old Challenger Better Than Current

Not observable in this pass.

Reason:

- no current creative rows were emitted, so no live-firm row-level comparison could run

## 10. Old Challenger Worse Than Current

Not observable in this pass.

Reason:

- same upstream blocker

## Bottom Line

The main live-firm mismatch cluster is not a label boundary.

It is a source/output availability gap:

- live-readable Meta creative rows exist
- current audited Creative Decision OS rows do not

That blocker must be remediated before any further live-firm row-level product-truth audit is meaningful.
