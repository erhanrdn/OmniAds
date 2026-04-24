# Creative Equal-Segment Gate Fixes Final

Date: 2026-04-25

Branch: `feature/adsecute-creative-equal-segment-gate-fixes`

## Executive Result

Status: implemented.

The equal-segment review identified three high-confidence gate misses. This pass implemented only those three gates:

1. `Protect` candidates with stable/fatigued winner lifecycle now route to `Refresh` when recent ROAS collapses below the active benchmark.
2. `blocked` lifecycle rows with CPA blowout and below-baseline ROAS now route to `Cut` instead of early `Not Enough Data`.
3. high-spend validating rows with no 7d data can route to `Cut` when the 30d read is mature, purchase-bearing, and materially below benchmark.

No Scale / Scale Review floors, taxonomy, benchmark scope rules, Commercial Truth rules, or queue/push/apply safety gates were changed.

## Gate Changes

### Fix 1: Protect Trend Collapse

Before:

- trend-collapse logic existed for validating / keep-in-test loser paths
- stable winner and fatigued winner rows could remain `Protect` even when the recent read collapsed

After:

- `stable_winner` or `fatigued_winner`
- `primaryAction` is `hold_no_touch` or `refresh_replace`
- spend is at least `200`
- impressions are at least `5,000`
- recent ROAS / 30d ROAS is at most `0.40`
- recent ROAS is below the active benchmark median

Result: `Refresh`, review required.

### Fix 2: Blocked Lifecycle CPA Blowout

Before:

- blocked lifecycle rows with one purchase could be classified as under-sampled before CPA/ROAS weakness was considered

After:

- `lifecycleState = blocked`
- `primaryAction` is `block_deploy` or `keep_in_test`
- purchases are below the old mature kill-candidate path
- CPA is at least `2.0x` peer median CPA
- ROAS is at most `0.5x` active benchmark median ROAS
- spend is at least `250`
- impressions are at least `8,000`

Result: `Cut`, review required.

### Fix 3: High-Spend Below-Baseline Without 7d Data

Before:

- some high-spend purchase-bearing validating rows needed 7d data before the Cut path admitted them

After:

- `lifecycleState = validating`
- `primaryAction = keep_in_test`
- spend is at least `max(5000, 5x peer median spend)`
- purchases are at least `4`
- ROAS is at most `0.80x` active benchmark median ROAS
- impressions are at least `8,000`
- campaign/ad set context is not blocked

Result: `Cut`, review required.

## Equal-Segment Score

Baseline from the equal-segment review:

- macro segment score: `76/100`
- raw row accuracy: `81%`
- Watch score: `50/100`
- Protect score: `60/100`
- Cut score: `87/100`
- Cut recall: below target because Cut misses were hidden under `Watch` and `Not Enough Data`
- IwaStore score: `78/100`
- TheSwaf score: `90/100`

Post-fix deterministic replay on the reviewed mismatch set:

- macro segment score: `86/100`
- raw row accuracy: `90%`
- Watch score: `75/100`
- Protect score: `86/100`
- Cut score: `91/100`
- Cut recall: `100%` for the three reviewed gate-miss classes
- IwaStore score: `87/100`
- TheSwaf score: `100/100`

The post-fix score is computed against the fixed equal-segment review fixture/mismatch set. The live audit was also rerun, but live sampling shifted during the run, so the committed live artifact is used as product-output evidence rather than as a stable human-scored benchmark.

## Live Audit Rerun

Corrected current Decision OS source path, production-equivalent runtime:

- readable businesses: `8`
- sampled creatives: `78`
- `Scale`: `0`
- `Scale Review`: `6`
- `Test More`: `13`
- `Protect`: `6`
- `Watch`: `10`
- `Refresh`: `17`
- `Retest`: `1`
- `Cut`: `12`
- `Campaign Check`: `0`
- `Not Enough Data`: `8`
- `Not eligible for evaluation`: `5`

The three target gate classes no longer have obvious remaining misses in the latest sanitized artifact.

Note: the audit command wrote the sanitized artifact and local private artifact, then exited non-zero because a background snapshot warm attempted to fetch `localhost:3000` while no dev server was running. The generated artifact is present and sanitized.

## Fixtures Added

Fixture-backed policy tests were added for:

- stable protected winner + recent collapse below benchmark => `Refresh`
- above-baseline stable winner whose recent read falls below benchmark => `Refresh`
- fatigued protected winner + recent collapse below benchmark => `Refresh`
- protected winner with thin trend evidence remains `Protect`
- blocked lifecycle CPA blowout below baseline => `Cut`
- blocked lifecycle thin evidence remains conservative
- blocked lifecycle CPA unavailable does not invent Cut
- blocked lifecycle healthy CPA does not trigger Cut
- high-spend below-baseline validating row without 7d data => `Cut`
- high-spend below-baseline with campaign context blocker => `Campaign Check`
- high-spend above baseline does not trigger Cut
- protected high-spend winner without collapse remains `Protect`
- spend below floor does not trigger the high-spend Cut path

## Remaining Risk

- `Scale` remains rare/zero in the latest live artifact; this pass intentionally did not change Scale or Scale Review floors.
- `Campaign Check` is not represented in the latest live artifact.
- the live audit command should be rerun with a dev server available if a clean zero-exit audit run is required.
- a Claude equal-segment re-review is the correct next step because the score is based on deterministic replay of the reviewed mismatch set, not a fresh independent human review.

## Recommended Next Action

Run one Claude equal-segment re-review against:

- this branch
- the updated sanitized live artifact
- the equal-segment scoring reports
- the policy fixture diff

Do not start another implementation pass unless that review finds a specific remaining product defect.
