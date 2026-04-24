# Scale Review Gap - Cluster Analysis

Last updated: 2026-04-24 by Codex

## Cluster 1 - Source-Authority Collapse To Contextual-Only

- businesses affected: `4`
- sampled rows affected: `39`
- strong-relative or true-scale rows affected: `12`
- appears in at least `3` businesses: `yes`

Pattern:

- businesses with current Decision OS rows still surface entirely as `Not eligible for evaluation`
- the rows are not missing from the product anymore
- the shared suppressor is `evidenceSource = unknown`

Why this matters:

- it buries multiple downstream product states before they can surface
- it is the main reason the corrected live sample still showed `Scale = 0` and `Scale Review = 0`

Proposed deterministic rule candidate:

- primary 30d creative rows should determine row-evidence authority
- support windows and campaign/ad set snapshots should degrade context quality, not erase live row authority

Fixture candidate:

- `primary = live`
- support windows include `unknown`
- campaign/ad set snapshot source is `unknown`
- row otherwise qualifies for review-level logic
- expected aggregate evidence source remains `live`

Overfitting risk:

- low
- this is a source-contract correction, not a performance-threshold retune

Recommended timing:

- fix now

## Cluster 2 - Rows That Are Actually Protect, Not Scale Review

- businesses affected: `4`
- rows affected: `10`
- appears in at least `3` businesses: `yes`

Pattern:

- rows look strong on spend and relative metrics
- once traced, they align better with stable shipped-winner handling than with review-only scale promotion

Representative rows:

- `company-01-creative-02`
- `company-01-creative-03`
- `company-01-creative-10`
- `company-05-creative-02`
- `company-05-creative-08`
- `company-07-creative-06`
- `company-08-creative-04`
- `company-08-creative-05`
- `company-08-creative-07`
- `company-08-creative-08`

Proposed deterministic rule candidate:

- no rule change
- these rows should remain `Protect` after the source fix if their underlying action/lifecycle supports it

Fixture candidate:

- strong relative row
- protected stable-winner shape
- missing business validation does not convert `Protect` into `Scale Review`

Overfitting risk:

- low
- existing policy already supports this; the main risk is misclassifying these as scale misses

Recommended timing:

- no change now

## Cluster 3 - Rows That Are Actually Refresh, Not Scale Review

- businesses affected: `3`
- rows affected: `3`
- appears in at least `3` businesses: `yes`

Pattern:

- rows are strong enough to look suspicious at first glance
- trace shows fatigue / `refresh_replace` shape rather than a review-only promotion shape

Representative rows:

- `company-02-creative-04`
- `company-04-creative-03`
- `company-05-creative-09`

Proposed deterministic rule candidate:

- no rule change
- source fix should allow the correct `Refresh` state to surface where live authority exists

Fixture candidate:

- strong relative row
- fatigue or decay state present
- expected output remains `Refresh`

Overfitting risk:

- low
- this is a trace-and-label correctness issue, not a threshold problem

Recommended timing:

- no change now

## Cluster 4 - Context-Limited Strong Rows

- businesses affected: `2`
- rows affected: `2`
- appears in at least `3` businesses: `no`

Pattern:

- rows have meaningful relative signal
- campaign/ad set context is still the primary blocker

Representative rows:

- `company-05-creative-06`
- `company-04-creative-02`

Proposed deterministic rule candidate:

- no change in this pass
- these rows should remain `Campaign Check` or `Watch`-like, not `Scale Review`

Fixture candidate:

- strong relative row
- explicit weak campaign context
- expected output remains context-limited

Overfitting risk:

- medium
- the row count is small and the product intent is already coherent

Recommended timing:

- later only if live review still shows confusion after the source fix

## Decision

Only Cluster 1 supports a safe cross-account patch in this pass.

Why:

- deterministic
- present across multiple businesses
- explains the current zero-`Scale Review` live sample without loosening safety
- does not require invented baselines or Commercial Truth

What this does **not** justify:

- broad `Scale Review` threshold retunes
- `Scale` expansion
- campaign benchmark semantics changes
- UI taxonomy changes
