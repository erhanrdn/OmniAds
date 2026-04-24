# Creative UI Truth And Scale Review Fix

Last updated: 2026-04-24 by Codex

## Status

This pass was needed.

The product acceptance state is revoked until the actual Creative UI and live output can be reviewed with the intended operator language. The pass stayed narrow:

- no Creative policy threshold retune
- no broad segmentation rewrite
- no queue, push, or apply safety loosening
- no old-rule challenger promotion
- no silent benchmark-scope change

## UI Taxonomy Audit

The UI taxonomy mismatch was real.

Ambiguous user-facing grouping labels were still visible in Creative surfaces:

- `Review`
- `Check`
- `Hold`
- `Evergreen`

Those labels were umbrella authority buckets, not the agreed media-buyer segment taxonomy. They hid multiple operator meanings and made row, bucket, and instruction language easy to misread.

## UI Fix

Primary Creative segment filters now use the agreed taxonomy:

- `Scale`
- `Scale Review`
- `Test More`
- `Protect`
- `Watch`
- `Refresh`
- `Retest`
- `Cut`
- `Campaign Check`
- `Not Enough Data`

The top filter bar now keeps those labels visible even when a segment has zero current rows. System-ineligible rows stay outside the primary taxonomy filters.

Additional UI wording was aligned:

- overview summary labels now use `Test More`, `Refresh`, `Cut / Campaign Check`, and `Protect`
- operator cards and preview cards expose the resolved operator segment
- detail badges prefer the resolved operator segment over legacy action names
- legacy detail language such as `pause` now maps to `Cut` only when no current operator segment is available
- `Scale Review` prescription copy now says `Scale Review`, not a generic review instruction
- `Refresh`, `Retest`, `Cut`, and `Campaign Check` prescription headlines keep the operator label visible while preserving safety wording

## Benchmark Scope Audit

The benchmark-scope contract stayed intact.

- default scope remains account-wide
- a campaign filter alone does not switch benchmark authority
- explicit campaign benchmark control remains opt-in
- scope metadata remains visible in the Creative operator context

No benchmark-scope logic was changed in this pass.

## Live Scale Review Audit

The corrected live audit was rerun after the UI and wording fixes.

Audit scope:

- readable live Meta businesses: `8`
- sampled creatives: `78`
- deterministic sample: active creatives first, then 30-day spend descending, up to 10 per business

Segment counts:

| Segment | Count |
| --- | ---: |
| Scale | 0 |
| Scale Review | 0 |
| Protect | 14 |
| Watch | 20 |
| Refresh | 16 |
| Test More | 8 |
| Not Enough Data | 14 |
| Campaign Check | 0 |
| Retest | 0 |
| Cut | 0 |
| Not eligible for evaluation | 6 |

Business counts:

- businesses with zero `Scale`: `8`
- businesses with zero `Scale Review`: `8`

The zero `Scale Review` count is numerically real in the current sample. This pass did not force rows into `Scale Review`.

## Scale Review Gate Finding

The audit found four rows with `true_scale_candidate` evidence metadata. All four currently resolve to `Protect`, not `Scale Review`.

The suppressing gate is explicit and intentional:

- each row has `primaryAction = hold_no_touch`
- each row is treated as a protected winner
- missing business validation blocks `Scale`
- the review-only Scale Review admission path intentionally excludes protected winners
- queue/apply remains blocked

This is not a bucket mapping bug.

Other strong-relative rows outside `Protect` resolved to `Watch`, `Refresh`, or `Test More` because of evidence maturity, fatigue/lifecycle state, or current action intent. No safe deterministic policy patch was made from this sample.

## Specific Private Case Trace

The user-observed case was traced privately using the local-only audit reference. The committed alias is:

- business alias: `company-03`
- creative alias: `company-03-creative-07`

Trace summary:

- active status: not active in current campaign/ad set context
- campaign status: paused
- ad set status: campaign paused
- 30-day spend: `225.34`
- 30-day purchase value: `968.42`
- 30-day ROAS: `4.30`
- 30-day purchases: `10`
- 7-day ROAS: `6.28`
- 90-day ROAS: `4.66`
- benchmark scope: account
- baseline reliability: strong
- relative strength class: none
- business validation: missing
- policy state: live and trusted, but business validation missing
- current user-facing segment after this pass: `Refresh`
- current instruction headline after this pass: `Refresh: company-03-creative-07`
- queue/apply: blocked

Diagnosis:

- the observed `Pause` wording was a real UI/detail wording mismatch, not the current resolved operator segment
- the row is not a current `Scale Review` candidate under the account-wide benchmark because it does not clear the relative-strength gate
- current policy treats it as a fatigued winner / replacement case, so `Refresh` is the surfaced operator segment
- safety remains conservative because business validation is missing

## Product Truth Result

Fixed in this pass:

- primary Creative filters now use the agreed taxonomy
- cards/details expose the resolved operator segment
- legacy `Pause` detail wording no longer overrides the current operator segment
- overview and prescription wording no longer present vague segment buckets as primary operator language

Not changed in this pass:

- `Scale` remains zero
- `Scale Review` remains zero
- protected winners remain `Protect`
- missing business validation still blocks true `Scale`
- queue/apply/push safety remains unchanged

The remaining zero-`Scale Review` state is no longer explained by the UI bucket labels. In the current audited sample, the rows that come closest to Scale Review are either protected winners or have other deterministic gates. That makes this a product-review question rather than a safe mapping-only fix.

## Readiness

Ready for one final Claude live-firm product review after this PR passes checks and merges.

The review should focus on:

- whether zero `Scale Review` is acceptable when the closest current candidates are protected winners
- whether `Refresh` is the right operator segment for `company-03-creative-07`
- whether the now-visible taxonomy is understandable enough on the actual Creative page
