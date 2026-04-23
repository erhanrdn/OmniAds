# Creative Segmentation Pass 5 Delta Analysis

Last updated: 2026-04-23 by Codex

## Comparison Baseline

Pre-pass baseline:

- original validated calibration artifact and 10-agent panel on the initial 3-company sample

Current comparison source:

- pass-5 live holdout validation over `7` runtime-eligible companies
- holdout split of `5` calibration companies and `2` holdout companies

## What Improved

### Campaign Check

Improved and holding.

- original lab identified `Campaign Check` as a necessary missing cluster
- current holdout run still surfaces explicit `Campaign Check`
- holdout context-blocked rows count: `2`
- panel agreement on the main holdout context row was broad

### Not Enough Data vs Test More

Improved materially, though one naming boundary remains open.

- holdout evidence-thin action leaks: `0`
- `Test More` survives as a distinct under-sampled positive state
- `Not Enough Data` is no longer leaking into `Scale`, `Scale Review`, `Refresh`, or `Protect`
- remaining boundary: one high-spend zero-purchase row may read more like weak `Watch` than generic insufficient evidence

### Refresh for Fatigued Winners

Improved and confirmed.

- holdout `Refresh` rows: `2`
- panel agreement was broad
- old challenger remained worse by pushing toward `pause`

### Protect for Stable Winners

Improved and confirmed.

- holdout `Protect` rows: `2`
- panel agreement was broad
- old challenger remained worse by demoting winners into generic `watch`

### Commercial Truth Over-Gating

Much better than the original calibration state.

- relative diagnosis is still visible on live rows without Commercial Truth
- `Refresh`, `Protect`, `Watch`, `Test More`, and `Campaign Check` all survive missing business validation
- remaining boundary: one strong relative holdout row may still be too soft at `Watch`

### Old-Rule Challenger

Still not better than current policy.

- no holdout row showed the challenger clearly outperforming current logic
- challenger remained worse on:
  - `Campaign Check`
  - `Refresh`
  - `Protect`
  - thin-evidence negatives

## What Did Not Yet Confirm

### Scale Review

Not confirmed on holdout.

- holdout `Scale Review` rows: `0`
- holdout business-validation availability: `missing = 101 / 101`
- one holdout row (`company-01/company-01-creative-03`) became the main boundary disagreement
- panel did not converge strongly enough to justify retuning current logic in pass 5

### True Scale

Not confirmed on holdout.

- holdout `Scale` rows: `0`
- holdout true-`Scale` confirmations: `0`
- no holdout row had favorable business validation
- current strict true-`Scale` path remains unproven on the holdout side, but not contradicted

### Explicit Campaign Benchmark Scope In Live Holdout

Not exercised by current holdout.

- holdout benchmark scope usage: `account = 101`, `campaign = 0`
- explicit campaign benchmark support remains implemented and tested
- the current live holdout simply did not produce operator-selected campaign-scope reads

## New Regressions

No high-confidence new regression cluster surfaced.

Specifically:

- no evidence-thin rows leaked into action-forward segments
- no context-blocked row leaked into a scale-like label
- no old-rule challenger row clearly beat the current policy

## Remaining Mismatch Clusters After Holdout

1. `Watch` vs `Scale Review` / `Protect` on one strong relative boundary row with missing business validation and fatigue-watch pressure
2. `Not Enough Data` vs `Watch` wording for a high-spend zero-purchase row
3. `Test More` vs `Watch` wording for an under-sampled positive row that still trails strong baselines

These are real but narrow.

They are no longer foundational data-accuracy or taxonomy failures.

## Pass 5 Decision

No safe policy retuning was warranted in pass 5.

Reason:

- holdout validation succeeded
- current logic is materially better than the original calibration baseline on the important confirmed clusters
- remaining disagreements are boundary cases with real panel disagreement, not clear deterministic misses
