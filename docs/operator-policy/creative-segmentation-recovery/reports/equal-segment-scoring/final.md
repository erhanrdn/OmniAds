# Creative Equal-Segment Scoring Final

Date: 2026-04-25

## Executive Result

Result: final targeted gate fixes complete; ready for Claude equal-segment re-review.

Claude's independent Round 2 review corrected the prior Codex claim and established the current before state:

- macro segment score: about `83/100`
- raw row accuracy: about `83%`
- IwaStore score: about `80/100`
- TheSwaf score: about `82/100`
- weakest segments: `Watch`, `Refresh`, and Cut recall

After this final narrow gate pass, deterministic replay of the reviewed live cohort gives:

- macro segment score: `87/100`
- raw row accuracy: `87%`
- IwaStore score: `80/100`
- TheSwaf score: `82/100`

The target is met on deterministic replay of Claude's reviewed mismatch set. A fresh Claude equal-segment review should run next because this pass did not ask Claude for review.

## Live Cohort Summary

Latest reviewed live artifact:

- readable businesses: `8`
- sampled creatives: `78`
- businesses with zero `Scale`: `8`
- businesses with zero `Scale Review`: `6`

Post-fix replay segment distribution:

- `Scale`: `0`
- `Scale Review`: `6`
- `Test More`: `13`
- `Protect`: `6`
- `Watch`: `9`
- `Refresh`: `16`
- `Retest`: `1`
- `Cut`: `14`
- `Campaign Check`: `0`
- `Not Enough Data`: `8`
- `Not eligible for evaluation`: `5`

`Scale` remains zero. This pass did not change Scale or Scale Review floors. The fix target was Cut recall and Watch/Refresh confusion, not Scale generation.

## IwaStore / TheSwaf

Claude Round 2 scores:

- IwaStore: `80/100`
- TheSwaf: `82/100`

Post-fix replay:

- IwaStore: `80/100`
- TheSwaf: `82/100`

The pass does not regress either campaign context. The fixed rows are cross-account catastrophic CPA Refresh and validating trend-collapse Watch cases.

## Fixed Mismatch Classes

1. catastrophic CPA `fatigued_winner` / `refresh_replace` rows no longer stay in soft `Refresh`; they route to review-safe `Cut`
2. high-spend fatigued rows with zero recent read, catastrophic CPA, and materially below-benchmark ROAS route to `Cut`
3. validating `keep_in_test` rows with at-benchmark mid/30-day performance and 7-day ROAS collapse route to `Refresh`

## High-Relative Watch Trace

The traced high-relative Watch case remains unchanged:

- sanitized row: `company-05 / creative-04`
- ROAS: `2.83x` active benchmark
- purchases: `6`
- spend: below the current true-scale peer-spend floor for that account
- campaign context: not explicit test campaign

The current Watch output is defensible under the existing Scale Review floors. This pass intentionally does not loosen those floors.

## Most Common Wrong Gates Before This Fix

1. CPA blowout gating did not cover `fatigued_winner` / `refresh_replace`
2. Refresh admitted some catastrophic CPA losers that should have been review-safe Cut
3. validating trend-collapse rows near benchmark had no narrow Refresh path and stayed Watch

## Is Current Output Better Than Manual Table Reading?

The live output is materially better than the Round 2 before state for the reviewed failure classes. It is ready for independent equal-segment re-review, but not final acceptance without that review.

## Another Implementation Pass

Do not start another implementation pass now. Run Claude equal-segment re-review first.

If another pass is needed, it should be based on new post-fix evidence and should remain narrow.
