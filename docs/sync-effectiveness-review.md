# Sync Effectiveness Review

See also:

- [Sync Control Plane Product Readiness And Google Ads Runtime](/Users/harmelek/Adsecute/docs/architecture/sync-control-plane-product-readiness-and-google-ads-runtime.md)

Use one global workflow to judge whether the rebuilt Google Ads and Meta syncs are actually improving right now:

- Admin: `/admin/sync-health`
- CLI: `npm run ops:sync-effectiveness-review`

This review is evidence-only. It does not change execution posture, does not enable retention, and does not weaken the locked Google or Meta truth contracts.

## What It Reports

For both Google Ads and Meta, the review reports:

1. Freshness / lag
   - `Trusted day`: the most recent globally trusted day visible right now.
   - `Warehouse through`: the most recent globally visible rebuilt core day, even when trusted publication/support is still incomplete.
   - `Lag`: calendar-day gap between today and the reported day.
   - `Moved`: whether recent checkpoint, worker, or publication evidence shows active motion.

2. Coverage / rebuild progress
   - current rebuild state from the shared global review:
     - `cold_bootstrap`
     - `backfill_in_progress`
     - `partial_upstream_coverage`
     - `quota_limited`
     - `blocked`
     - `repair_required`
     - `ready`
   - progressing vs stalled business counts

3. Quota / rate-limit pressure
   - how many businesses are currently quota-limited
   - whether the current snapshot suggests quota is the reason catch-up is stalled

4. Truth / publication health
   - Google Ads: whether current rebuilt data actually shows current `84`-day hot-window support
   - Meta: whether protected published truth is visible, non-zero, and which latest protected day is visible

5. Conservative effectiveness summary
   - `improving`
   - `stable_but_incomplete`
   - `stalled_by_quota`
   - `blocked_repair_needed`
   - `sparse_due_to_rebuild`
   - `ready_with_current_support`

## How To Read It During Rebuild

Use the summary conservatively:

- `improving`
  - backfill is still incomplete, but recent worker/checkpoint/publication movement is visible
  - coverage is moving forward, not just sitting in queue

- `stable_but_incomplete`
  - some rebuilt coverage exists, but the snapshot does not yet show enough fresh movement to claim catch-up
  - use provider drilldown to explain what is still missing

- `stalled_by_quota`
  - quota pressure is visible and the snapshot does not show enough recent movement to claim real catch-up
  - do not infer success just because some rows are present

- `blocked_repair_needed`
  - blocked, dead-letter, integrity, or repair-required evidence is still active
  - treat the rebuild as operationally blocked until the blocker clears

- `sparse_due_to_rebuild`
  - the warehouse is still in cold bootstrap
  - sparse rebuilt rows are not evidence of healthy sync

- `ready_with_current_support`
  - the provider now shows current support under the locked contract
  - this is still evidence only, not automatic posture change

## Provider-Specific Notes

### Google Ads

- `Trusted day` is based on current rebuilt hot-window support, not just any core row presence.
- `Warehouse through` uses rebuilt core daily coverage even when hot-window support is still incomplete.
- A current `84`-day support window must be visible before the review treats Google readiness as current.

### Meta

- `Trusted day` is based on protected published truth, not raw rebuild rows.
- `Warehouse through` uses rebuilt core daily coverage so operators can still see backfill movement before publication is complete.
- Because Meta `today` remains live-only, a healthy protected-truth lag will normally be at least `1` day.
