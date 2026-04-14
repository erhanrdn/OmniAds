# 1. Phase

P5: benchmark Meta sync and close release readiness

# 2. Files Reviewed

- `docs/meta-sync-hardening/report.md`
- `docs/meta-sync-hardening/postgres-runbook.md`
- `README.md`
- `lib/sync/meta-sync.ts`
- `lib/sync/provider-status-truth.ts`
- `lib/sync/provider-worker-adapters.ts`
- `lib/db.ts`
- `lib/startup-diagnostics.ts`
- `lib/admin-operations-health.ts`
- `app/api/admin/sync-health/route.ts`
- `app/admin/sync-health/page.tsx`
- `app/api/meta/status/route.ts`
- `lib/meta/status-types.ts`
- `components/meta/meta-sync-progress.tsx`
- `scripts/_operational-runtime.ts`
- `scripts/meta-sync-drain-rate.ts`
- `scripts/meta-sync-db-diagnostics.ts`
- `scripts/meta-soak-snapshot.ts`
- `scripts/meta-progress-diff.ts`
- `scripts/meta-state-check.ts`
- `scripts/meta-terminal-running-runs-report.ts`
- `scripts/sync-hardening-acceptance.ts`
- `scripts/sync-soak-report.ts`
- `scripts/sync-effectiveness-review.ts`
- `scripts/google-ads-throughput-probe.ts`
- `scripts/tmp-today-yesterday-diagnostic.ts`
- root `tmp_*.mjs` diagnostics
- `.github/workflows/ci.yml`
- `.github/workflows/deploy-hetzner.yml`
- `lib/sync/meta-sync.test.ts`
- `lib/sync/provider-status-truth.test.ts`
- `lib/sync/provider-worker-adapters.test.ts`
- `lib/admin-operations-health.test.ts`
- `app/api/meta/status/route.test.ts`
- `lib/sync/meta-sync-lease-epoch.test.ts`
- `lib/sync/meta-sync-scheduled-work.test.ts`
- `lib/db.test.ts`
- `lib/admin-db-diagnostics.test.ts`
- `lib/sync-effectiveness-review.test.ts`

# 3. Recent Relevant Commits Reviewed

- `0dd5fed` `fixup(P4): finalize report closure`
- `1c1a462` `P4: harden self-hosted Postgres path`
- `204ce94` `P3: harden Meta sync throughput`
- `b7b0f9a` `fix(meta): enhance integration summary with detailed state and operations data`
- `a6ff37e` `P2: add compact Meta UI summary contract`
- `5f89deb` `feat: add Meta integration progress components and tests`

# 4. Files Changed

- `README.md`
- `docs/meta-sync-hardening/release-acceptance.md`
- `docs/meta-sync-hardening/report.md`
- `lib/meta-sync-benchmark.ts`
- `lib/meta-sync-benchmark.test.ts`
- `package.json`
- `scripts/_operational-runtime.ts`
- `scripts/meta-sync-benchmark.ts`
- `scripts/meta-sync-db-diagnostics.ts`
- `scripts/meta-sync-drain-rate.ts`
- `scripts/meta-sync-readiness-snapshot.ts`
- deleted `scripts/tmp-today-yesterday-diagnostic.ts`
- deleted root `tmp_*.mjs` diagnostics

# 5. Benchmark / Soak Tooling

- Added `lib/meta-sync-benchmark.ts` as the repo-owned measurement core for readiness snapshots, drain-state classification, and multi-sample benchmark summaries.
- Added `scripts/meta-sync-readiness-snapshot.ts` for a single business snapshot that combines queue depth, pending lane/scope composition, recent core readiness, recent truth state, priority-window truth state, operator posture, and authoritative publish evidence.
- Added `scripts/meta-sync-benchmark.ts` for repeatable multi-sample captures with a series summary that reports `ready`, `busy`, `waiting`, `blocked`, or `stalled` from actual queue and readiness movement.
- Hardened `scripts/meta-sync-drain-rate.ts` so the aggregate summary uses the real latest activity timestamp and oldest queued partition across the sampled businesses instead of the first result row.
- Consolidated startup-log suppression in `scripts/_operational-runtime.ts` so maintained operational scripts can emit clean JSON without per-file copy/paste helpers.
- Live validation against `TheSwaf` (`172d0ab8-495b-4679-a4c6-ffa404c389d3`) produced a benchmark-ready stalled sample: queue depth `11`, pending-by-lane `maintenance=6` and `extended=5`, pending-by-scope `account_daily=6` and `ad_daily=5`, recent core readiness `14%`, priority-window truth `processing`, and benchmark `observedState=stalled`.

# 6. Release Acceptance Criteria

- Added `docs/meta-sync-hardening/release-acceptance.md` as the durable repo-owned acceptance package for this phase.
- The document defines the exact command set to run: `meta:readiness-snapshot`, `meta:drain-rate`, `meta:benchmark`, `meta:db:diagnostics`, and the authoritative fallback checks `meta:state-check`, `meta:verify-day`, and `meta:verify-publish`.
- It defines the required metrics to capture, what “healthy enough to market” means, acceptable recent/core progress expectations, required operator signals, and the exact interpretation of `busy`, `waiting`, `blocked`, and `stalled`.
- It also defines failure handling so a failed acceptance run leads to a repair path instead of more ad-hoc diagnostics.

# 7. Operator / Visibility Findings

- Current code already had the right operator truth primitives in `/admin/sync-health`; the missing piece was a reproducible script package that captures the same truth in repo-owned JSON for acceptance and before/after comparisons.
- The live `TheSwaf` sample showed why this phase was needed: the system is not merely “busy”. Operator posture was `progressState=partial_stuck`, `activityState=stalled`, `stallFingerprints=[historical_starvation, checkpoint_not_advancing]`, `workerOnline=false`, `dbBacklogState=stalled`, and `meta:drain-rate` reported `large_and_not_draining`.
- The same live sample also showed the required user-facing truth gap clearly: recent summary/campaign readiness was only `14%`, recent truth was still `processing`, priority-window truth was still `processing`, and there was no `lastSuccessfulPublishAt`.
- `meta-sync-db-diagnostics.ts` on the same business preserved enough evidence to distinguish absence of worker activity from a DB bottleneck: there were no active runner leases or worker heartbeats, no blocked locks, and `pg_stat_statements` was disabled, which is useful but non-blocking context for the next operational pass.

# 8. Temp Script Hygiene Findings

- Deleted the unreferenced root `tmp_*.mjs` diagnostics and `scripts/tmp-today-yesterday-diagnostic.ts`.
- These files were clearly ad-hoc investigation probes that duplicated or predated maintained coverage now provided by `meta:readiness-snapshot`, `meta:benchmark`, `meta:drain-rate`, `meta:db:diagnostics`, `meta:state-check`, and the authoritative verify scripts.
- No repo references pointed at the deleted temp files, and removing them reduces the risk of future operator drift toward unsupported workflows.

# 9. Test Commands Run

- `npx vitest run lib/meta-sync-benchmark.test.ts lib/db.test.ts lib/admin-db-diagnostics.test.ts lib/admin-operations-health.test.ts lib/sync/provider-status-truth.test.ts`
- `npx tsc --noEmit`
- `npx vitest run lib/meta-sync-benchmark.test.ts lib/sync/meta-sync.test.ts lib/sync/provider-status-truth.test.ts lib/sync/provider-worker-adapters.test.ts lib/admin-operations-health.test.ts app/api/meta/status/route.test.ts lib/sync/meta-sync-lease-epoch.test.ts lib/sync/meta-sync-scheduled-work.test.ts lib/db.test.ts lib/admin-db-diagnostics.test.ts`
- `node --import tsx scripts/meta-sync-readiness-snapshot.ts --business biz-1 --dry-run`
- `node --import tsx scripts/meta-sync-benchmark.ts --business biz-1 --samples 2 --interval-seconds 0 --dry-run`
- `node --import tsx scripts/meta-sync-readiness-snapshot.ts --business 172d0ab8-495b-4679-a4c6-ffa404c389d3`
- `node --import tsx scripts/meta-sync-benchmark.ts --business 172d0ab8-495b-4679-a4c6-ffa404c389d3 --samples 1 --interval-seconds 0`
- `node --import tsx scripts/meta-sync-drain-rate.ts --business 172d0ab8-495b-4679-a4c6-ffa404c389d3 --window-minutes 15 --out /tmp/meta-drain-rate.json`
- `node --import tsx scripts/meta-sync-db-diagnostics.ts --business 172d0ab8-495b-4679-a4c6-ffa404c389d3 --out /tmp/meta-db-diagnostics.json`

# 10. Test Results

- Targeted validation passed: `5` files and `52` tests.
- `npx tsc --noEmit` passed.
- Broad sync/admin regression subset passed: `10` files and `139` tests.
- New readiness and benchmark scripts passed dry-run validation.
- Live script validation succeeded and produced usable acceptance evidence for `TheSwaf`, including a benchmark summary of `observedState=stalled`.

# 11. Remaining Risks

- The new scripts make stalled versus draining behavior reproducible, but they still depend on DB access and `/admin/sync-health`-equivalent read visibility; if production credentials or admin visibility drift, the acceptance path degrades.
- `pg_stat_statements` was disabled in the sampled environment, so DB diagnostics still cannot rank real Meta statement cost until the host-level extension is enabled.
- A single-sample benchmark is enough to prove output shape and identify obvious stalls, but a real release acceptance with backlog present still requires the documented multi-sample run before calling the system healthy enough to market.

# 12. Recommended Next Steps

- Run the documented multi-sample benchmark on the acceptance business before any market-facing claim, and keep the JSON evidence outside the repo with the tested SHA.
- Restore worker heartbeat visibility or worker availability for businesses that currently look like `TheSwaf`; without worker presence the system will keep reading as `waiting` or `stalled` rather than `busy`.
- Enable `pg_stat_statements` on the self-hosted Postgres path so future benchmark failures can separate scheduler ownership issues from real statement-cost ceilings without returning to one-off diagnostics.
