# Meta Authoritative Finalization v2 Production Rollout Record

Date recorded: `2026-04-07`

This note captures the production rollout outcome for Meta authoritative
finalization v2 after shadow deploy, blocker fixes, live validation, and the
`T0` / autonomous `D-1` acceptance checks completed on real businesses.

## Rollout Summary

- Final live build during validation: `3c13c44772ee510c67cfabc6b77ab05dae33b039`
- `META_AUTHORITATIVE_FINALIZATION_V2=1`
- `META_AUTHORITATIVE_FINALIZATION_CANARY_BUSINESSES=` (global enable)
- Meta production runtime remains provider-specific
- Historical serving stays publication-gated

## Production Validation Record

### Manual Historical Refresh And Publish Verification

Validated on real production businesses and days:

1. Grandmix
   - `businessId=5dbc7147-f051-4681-a4d6-20617170074f`
   - `providerAccountId=act_805150454596350`
   - `day=2026-04-05`
   - result: `finalized_verified`
   - publication evidence:
     - `publishedAt=2026-04-06T21:47:05.115Z`
     - `publicationReason=authoritative_refresh`

2. TheSwaf
   - `businessId=172d0ab8-495b-4679-a4c6-ffa404c389d3`
   - `providerAccountId=act_822913786458311`
   - `day=2026-04-04`
   - result: `finalized_verified`
   - publication evidence:
     - `publishedAt=2026-04-06T22:12:12.485Z`
     - `publicationReason=authoritative_refresh`

Refresh HTTP semantics validated over the internal `CRON_SECRET` path:

- `/api/sync/refresh` with valid bearer token reaches the route
- invalid or missing bearer token still returns `401`
- idle historical refresh no longer returns a false `already_running`
- accepted historical refresh returns truthful `processing`

### Autonomous D-1 Finalization Verification

Validated on real production businesses without manual refresh or manual
reschedule during the acceptance observation:

1. Bilsem Zeka
   - `businessId=6c690fa4-6395-40b5-9755-e99b34d69bc3`
   - `providerAccountId=act_840779107261785`
   - `accountTimezone=Europe/Istanbul`
   - `D-1 day=2026-04-06`
   - `verificationState=finalized_verified`
   - source evidence:
     - `source_kind=finalize_day`
     - `fetch_status=completed`
   - publication evidence:
     - `publishedAt=2026-04-06T22:00:32.353Z`
     - `publicationReason=authoritative_refresh`

2. Halıcızade
   - `businessId=75f65b18-97e5-426c-a791-a8f693d34c84`
   - `providerAccountId=act_590466298182006`
   - `accountTimezone=Asia/Istanbul`
   - `D-1 day=2026-04-06`
   - `verificationState=finalized_verified`
   - source evidence:
     - `source_kind=finalize_day`
     - `fetch_status=completed`
   - publication evidence:
     - `publishedAt=2026-04-06T21:44:04.963Z`
     - `publicationReason=authoritative_refresh`

## Product-Ready Decision

Meta authoritative finalization v2 passed the release gate used in this rollout:

- production runtime remained provider-specific
- historical publication gating remained in force
- manual historical refresh semantics were truthful
- real historical days reached `finalized_verified`
- autonomous `D-1` rollover produced `finalize_day` source evidence and verified publication

Release verdict recorded from this rollout: `GO`

## Known Non-Blocking Follow-Ups

1. Hetzner deploy workflow reliability
   - the GitHub deploy workflow repeatedly stopped short of container cutover
   - manual host-side completion was required

2. `meta:refresh-state` observability gap
   - business-level `authoritative` can still return `null` even when exact
     day-level verification is already `finalized_verified`

3. Stale worker telemetry rows
   - old worker heartbeat rows from previous builds remain visible in health
     output and add noise during operator inspection

## Recommended Post-Rollout Monitoring

1. Watch `/admin/sync-health` for:
   - dead letters
   - stale leases
   - retryable failures
   - `D-1` SLA breaches
2. Re-check a sample of real Meta businesses over the next 24-48 hours for:
   - continued `finalized_verified` rollover
   - publication advancement
   - absence of manual recovery requirements
