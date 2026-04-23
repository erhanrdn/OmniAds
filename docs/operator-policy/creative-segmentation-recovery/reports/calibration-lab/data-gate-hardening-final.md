# Creative Segmentation Calibration Data Gate Hardening - Final

Last updated: 2026-04-23 by Codex

## Summary

PR: `https://github.com/erhanrdn/OmniAds/pull/35`

The candidate eligibility issue was real in the helper: candidate businesses were selected from historical `meta_creatives_snapshots` before current Meta connection eligibility was checked.

The helper now requires current eligibility before sampling:

- connected Meta provider connection
- non-empty access token
- at least one assigned Meta account

The corrected run still failed, but for a real source/data reason: one active eligible sampled company returned zero current Decision OS rows.

## Corrected Gate Result

- Gate passed: false
- Historical snapshot candidates inspected: 8
- Currently eligible candidates: 8
- Skipped candidates: 0
- Sampled eligible candidates: 3
- Active eligible zero-row candidates: 1
- Exported sampled rows: 24
- Table vs Decision OS mismatches on exported rows: 0
- Max metric deltas on exported rows: 0

## Coverage Model Fix

`coverage.internalSegments` now contains only policy internal segments.

Quick-filter buckets now live under `coverage.quickFilters`.

This prevents `quick_filter:*` entries from polluting the internal segment distribution.

## Warehouse Fact Status

`meta_creative_daily` has 0 rows in the checked database.

Because the current Creative product pipeline uses the creative API/snapshot source, the empty warehouse table is not treated as the immediate pass/fail blocker. It does lower gate confidence to API/payload parity only.

## Agent Panel Status

Not run. The corrected Data Accuracy Gate failed, so the 10 media-buyer-agent panel must wait.

## Next Action

Add source-health diagnostics for active eligible zero-row cases. The next pass should classify whether the zero-row result comes from snapshot bypass, live provider failure, empty provider data, or preview/media degradation before calibration proceeds.
