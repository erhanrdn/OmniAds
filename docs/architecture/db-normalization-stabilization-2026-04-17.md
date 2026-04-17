# DB Normalization Stabilization 2026-04-17

This document records the first clean post-normalization production observation sample after rollout to Hetzner production.

## Sampled state

- Sample time: `2026-04-17T09:29:03.845Z`
- Build: `7f7e807695e4f67ce62d9a4a557241e5f2189a3c`
- API sample: `https://adsecute.com/api/build-info`
- DB audit sample: `2026-04-17T09:29:03.378Z`

## Production signals

- `controlPlanePersistence.exactRowsPresent = true`
- `deployGate.verdict = pass`
- `releaseGate.verdict = pass`
- `repairPlan.recommendations = []`
- web runtime: `healthy`
- worker runtime: `healthy`
- ref coverage summary:
  - `totalRefTables = 161`
  - `tablesWithRefGaps = 0`
  - `businessRefGapTables = 0`
  - `providerRefGapTables = 0`

## Commands used

```bash
curl -fsS https://adsecute.com/api/build-info
node --import tsx scripts/sync-control-plane-verify.ts --build-id 7f7e807695e4f67ce62d9a4a557241e5f2189a3c --environment production --provider-scope meta
node --import tsx scripts/meta-watch-window.ts --expected-build-id 7f7e807695e4f67ce62d9a4a557241e5f2189a3c --base-url https://adsecute.com
node --import tsx scripts/db-normalization-audit.ts --run-dir /tmp/db-normalization-stabilization-2026-04-17
```

Operator note:
- `sync-control-plane-verify.ts` is a DB-direct check. Run it only in a shell that is pointed at the same production `DATABASE_URL` as the live Hetzner deployment.

## Exit criteria status

- `exactRowsPresent = true`: pass
- deploy gate regression: none observed
- release gate regression: none observed
- repair plan blocker: none observed
- ref gaps: none observed
- retained compatibility tables still present: yes
  - expected until second maintenance window

## Artefact policy

- Repo contains only this sanitized summary.
- Raw JSON artefacts and DB fingerprints remain in operator-only storage or ephemeral execution paths such as `/tmp/...`.
