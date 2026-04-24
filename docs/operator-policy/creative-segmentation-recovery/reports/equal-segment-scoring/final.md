# Creative Equal-Segment Scoring Final

Date: 2026-04-25

## Executive Result

Result: targeted gate fixes complete; ready for Claude equal-segment re-review.

The equal-segment audit baseline was:

- macro segment score: `76/100`
- raw row accuracy: `81%`
- IwaStore score: `78/100`
- TheSwaf score: `90/100`

After the three fixture-backed gate fixes, deterministic replay of the reviewed mismatch set gives:

- macro segment score: `86/100`
- raw row accuracy: `90%`
- IwaStore score: `87/100`
- TheSwaf score: `100/100`

The score target is met on the reviewed mismatch set. A fresh Claude equal-segment review should be run next because this pass did not ask Claude for review.

## Per-Business Summary

Latest live artifact:

- readable businesses: `8`
- sampled creatives: `78`
- businesses with zero `Scale`: `8`
- businesses with zero `Scale Review`: `6`

Live segment distribution:

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

## IwaStore / TheSwaf

The equal-segment review baseline:

- IwaStore: `78/100`
- TheSwaf: `90/100`

Post-fix deterministic replay:

- IwaStore: `87/100`
- TheSwaf: `100/100`

The fixed classes cover the cited IwaStore trend-collapse Protect issue and the TheSwaf blocked CPA / mature loser issue. No raw business or creative names are committed.

## Top Mismatches Fixed

1. protected winner with 7d ROAS collapse below benchmark -> `Refresh`
2. second protected winner with near-total recent collapse -> `Refresh`
3. third protected winner with recent collapse -> `Refresh`
4. blocked lifecycle CPA blowout with below-baseline ROAS -> `Cut`
5. second blocked lifecycle CPA blowout with below-baseline ROAS -> `Cut`
6. high-spend below-baseline purchase-bearing row without 7d data -> `Cut`

## Most Common Wrong Gates Before Fix

1. stable/fatigued winner `Protect` admitted before recent trend collapse was checked
2. `isUnderSampled` admitted blocked lifecycle rows to `Not Enough Data` before CPA/ROAS failure was checked
3. high-spend validating rows needed 7d trend data before mature below-baseline failure could route to `Cut`

## Is Current Output Better Than Manual Table Reading?

The targeted defects from the equal-segment review are fixed. The output is better than the reviewed pre-fix state for the weakest segments, but it should not be accepted without the requested independent equal-segment re-review.

## Another Implementation Pass

Do not start another implementation pass now. Run the equal-segment re-review first.

If another pass is needed, the first recommended fix should come from that review and should remain narrow.
