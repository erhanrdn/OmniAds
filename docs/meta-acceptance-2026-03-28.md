# Meta Acceptance Checklist — 2026-03-28

## Scope
- Goal: close Meta backend/productization work so only UI/UX polish remains.
- Business used for live validation: `IwaStore`
- `businessId`: `f8a3b5ac-588c-462f-8702-11cd24ff3cd2`
- Validation timezone: `Europe/Istanbul`
- Meta account timezone: `America/Los_Angeles`
- Meta account current day reference during validation: `2026-03-27`

## Timezone Alignment
- Meta presets now resolve against `currentDateInTimezone`, not the local browser day.
- Validation example:
  - local/browser day: `2026-03-28`
  - selected preset: `today`
  - resolved Meta range: `2026-03-27` → `2026-03-27`
  - authoritative source: `/api/meta/status.currentDateInTimezone`
- Expected UI behavior:
  - no initial fetch against the wrong local day
  - date trigger and query params resolve from the same Meta reference day
  - header helper text shows the account day and timezone

## Contract Closure
- `historicalSync` remains in [lib/meta/serving.ts](/Users/harmelek/Adsecute/lib/meta/serving.ts) as a compatibility-only field.
- Critical UI readiness/progress decisions no longer depend on `historicalSync`.
- Meta read routes are read-only and no longer trigger request-time warehouse repair:
  - [app/api/meta/summary/route.ts](/Users/harmelek/Adsecute/app/api/meta/summary/route.ts)
  - [app/api/meta/trends/route.ts](/Users/harmelek/Adsecute/app/api/meta/trends/route.ts)
  - [app/api/meta/campaigns/route.ts](/Users/harmelek/Adsecute/app/api/meta/campaigns/route.ts)
  - [app/api/meta/adsets/route.ts](/Users/harmelek/Adsecute/app/api/meta/adsets/route.ts)
  - [app/api/meta/breakdowns/route.ts](/Users/harmelek/Adsecute/app/api/meta/breakdowns/route.ts)
  - [lib/overview-service.ts](/Users/harmelek/Adsecute/lib/overview-service.ts)
- Read-route response contract now standardizes:
  - `isPartial: boolean`
  - `notReadyReason?: string | null`

## Admin and Recovery Closure
- Admin sync health Meta recovery actions now use the real consumer path:
  - [app/api/admin/sync-health/route.ts](/Users/harmelek/Adsecute/app/api/admin/sync-health/route.ts)
- Script parity updated:
  - [scripts/meta-cleanup.ts](/Users/harmelek/Adsecute/scripts/meta-cleanup.ts)
  - [scripts/meta-reschedule.ts](/Users/harmelek/Adsecute/scripts/meta-reschedule.ts)
  - [scripts/meta-refresh-state.ts](/Users/harmelek/Adsecute/scripts/meta-refresh-state.ts)
  - [scripts/meta-replay-dead-letter.ts](/Users/harmelek/Adsecute/scripts/meta-replay-dead-letter.ts)
- Admin UI shows Meta queue/recovery signals including:
  - queue depth
  - leased/running count
  - dead-letter count
  - oldest queued partition
  - latest activity
  - completed days
  - stale lease count
  - state row count
  - issue chips for `queue_waiting_worker`, `stale_lease`, `dead_letter_present`, `state_missing`

## Live Smoke
- Snapshot 1 at `2026-03-28T05:25:03.786Z`
  - queue depth: `1438`
  - leased: `24`
  - succeeded: `16`
  - failed: `16`
  - dead-letter: `0`
  - latest activity: `2026-03-28T05:03:33.872Z`
- Snapshot 2 after 10 seconds
  - no movement detected
  - conclusion: queue existed, but consumer did not visibly advance during that window
- Recovery validation run
  - command: `node --import tsx scripts/meta-reschedule.ts f8a3b5ac-588c-462f-8702-11cd24ff3cd2`
  - result: `attempted=4`, `succeeded=4`, `failed=0`, `skipped=false`
- Post-recovery snapshot
  - queue depth: `1446`
  - leased: `8`
  - succeeded: `24`
  - failed: `24`
  - dead-letter: `0`
  - latest activity: `2026-03-28T05:26:08.901Z`
  - state latest background activity refreshed across `account_daily`, `adset_daily`, `creative_daily`, `ad_daily`

## Acceptance Outcome
- Passed:
  - request-time sync removed from Meta read paths
  - Meta recovery actions route to the real consumer
  - queue/state metrics are visible in admin
  - worker progress can be resumed through recovery tooling
  - build passes
- Follow-up observation:
  - Meta queue may still need scheduler/watchdog tuning because a short passive observation window showed no autonomous movement before manual reschedule

## Remaining Work
- Backend/productization: complete for this cycle
- Only UI/UX polish remains:
  - progress bar spacing and loading states
  - paused/partial/action-required copy tone
  - empty state copy
  - admin sync health visual hierarchy
  - date and ready-through formatting polish
