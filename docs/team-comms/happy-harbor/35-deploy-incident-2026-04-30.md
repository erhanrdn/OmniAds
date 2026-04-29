# Happy Harbor Deploy Incident — 2026-04-30

## 1. Timeline

- 2026-04-29 21:07 UTC: PR #84 merged. Merge SHA: `11f191f883821a9c525f47d39eb83407665c86e4`.
- 2026-04-29 21:12 UTC: `deploy-hetzner.yml` run `25134151798` started by `workflow_dispatch` for `11f191f883821a9c525f47d39eb83407665c86e4`.
- 2026-04-29 21:12:31 UTC: Deploy phase entered `run_migrations`.
- 2026-04-29 21:12:31 UTC: Deploy script stopped `adsecute-worker-1` before migrations to reduce DB contention.
- 2026-04-29 21:12:42 UTC: Migrate container started.
- 2026-04-29 21:22:42 UTC: Migration process timed out after `600000ms`.
- 2026-04-29 21:22:43 UTC: Deploy job failed before `Recreate web and worker`; worker remained exited.
- 2026-04-29 21:27 UTC: Initial restore attempt using `docker compose up -d worker` hit a compose-env residue from the failed deploy and briefly recreated web + worker on `6755e76b75a17b4d0036cc7bfe03a6aee5b82793`.
- 2026-04-29 21:28 UTC: Corrected `.env` and `.env.production` back to rollback SHA `96bd0386208868b18d9763d64917ab9d4aa22b53` and recreated web + worker on the rollback image.
- 2026-04-29 21:31 UTC: Production web and worker were both healthy on `96bd0386208868b18d9763d64917ab9d4aa22b53`.

## 2. Worker Exit 137 Root Cause

`docker inspect adsecute-worker-1` before restore:

```text
OOMKilled=false ExitCode=137 Error=
FinishedAt=2026-04-29T21:12:42.038654586Z
StartedAt=2026-04-29T18:57:23.999490167Z
Image=ghcr.io/erhanrdn/omniads-worker:96bd0386208868b18d9763d64917ab9d4aa22b53
```

Root cause: not OOM. `OOMKilled=false`. The deploy workflow intentionally stopped the worker before migrations, then the migration phase timed out before the workflow reached the worker recreate step. The resulting `137` is consistent with container stop/SIGKILL behavior during the deploy phase, not a memory kill.

## 3. Worker Restoration

Compose project found at:

```text
/var/www/adsecute/docker-compose.yml
```

Important finding: the failed deploy's prepare-runtime phase had already rewritten:

```text
/var/www/adsecute/.env
/var/www/adsecute/.env.production
```

to:

```text
APP_IMAGE_TAG=6755e76b75a17b4d0036cc7bfe03a6aee5b82793
APP_BUILD_ID=6755e76b75a17b4d0036cc7bfe03a6aee5b82793
```

This caused the first `docker compose up -d worker` restore attempt to recreate both web and worker on `6755e76...`. I immediately corrected both env files back to:

```text
APP_IMAGE_TAG=96bd0386208868b18d9763d64917ab9d4aa22b53
APP_BUILD_ID=96bd0386208868b18d9763d64917ab9d4aa22b53
```

and ran:

```bash
cd /var/www/adsecute
docker compose up -d web worker
```

Current container state after correction:

```text
adsecute-worker-1  Up 3 minutes (healthy)  ghcr.io/erhanrdn/omniads-worker:96bd0386208868b18d9763d64917ab9d4aa22b53
adsecute-web-1     Up 3 minutes (healthy)  ghcr.io/erhanrdn/omniads-web:96bd0386208868b18d9763d64917ab9d4aa22b53
```

Build-info after restore:

```json
{
  "buildId": "96bd0386208868b18d9763d64917ab9d4aa22b53",
  "workerPresent": true,
  "issues": [],
  "deployGate": "pass",
  "releaseGate": "pass"
}
```

60-second worker log tail showed the worker stayed up and processed sync work. It did show transient DB timeouts in Meta partition work, but no crash loop:

```text
[meta-sync] partition_stage_failed ... errorMessage: 'Database query timed out after 30000ms.'
[meta-sync] partition_failed ... errorClass: 'transient'
[durable-worker] lifecycle_partition_failed ... message: 'meta_partition_processing_failed'
```

## 4. Deploy Run Log Excerpts

Deploy run:

```text
https://github.com/erhanrdn/OmniAds/actions/runs/25134151798
```

Relevant migration step excerpt:

```text
2026-04-29T21:12:31Z Running remote deploy phase=run_migrations on primary
2026-04-29T21:12:31Z Stopping worker before migrations to reduce DB contention
2026-04-29T21:12:32Z Container adsecute-worker-1 Stopping
2026-04-29T21:12:42Z Container adsecute-worker-1 Stopped
2026-04-29T21:12:42Z Running migrations for 11f191f883821a9c525f47d39eb83407665c86e4
2026-04-29T21:12:42Z Container adsecute-migrate-1 Creating
2026-04-29T21:12:42Z Container adsecute-migrate-1 Created
2026-04-29T21:12:42Z Attaching to migrate-1
2026-04-29T21:22:42Z Gracefully stopping... (press Ctrl+C again to force)
2026-04-29T21:22:42Z Container adsecute-migrate-1 Stopping
2026-04-29T21:22:42Z Container adsecute-migrate-1 Stopped
2026-04-29T21:22:43Z migrate-1 | Error: Database migrations timed out after 600000ms.
2026-04-29T21:22:43Z migrate-1 |     at Timeout._onTimeout (/app/lib/migrations.ts:56:16)
2026-04-29T21:22:43Z deploy_phase=run_migrations failed_command=return "${status}"
2026-04-29T21:22:43Z Missing container for service worker
2026-04-29T21:22:43Z Process completed with exit code 124.
```

The migration runner does not print each SQL statement before execution, so the GitHub log alone does not show the last statement. The active database backend did.

## 5. Hung Migration Statement

The active database backend left by the timed-out migration is:

```text
pid=1359862
application_name=omniads-worker
state=active
wait_event_type=Lock
wait_event=relation
duration=18m40s at sample time 2026-04-29T21:31:23Z
query=CREATE INDEX IF NOT EXISTS idx_meta_raw_snapshots_business
      ON meta_raw_snapshots (business_id, fetched_at DESC)
```

Source location:

```text
lib/migrations.ts:2262
```

This is not a new PR #84 canonical-table statement. It exists in both `96bd038` and `11f191f`. The migration runner executes all idempotent migrations from the top, so it reached this existing index statement before the new canonical tables.

Why it hung:

- The statement needs a relation lock on `meta_raw_snapshots`.
- It was blocked by active `meta_raw_snapshots` delete/insert work.
- Blockers included long-running queries such as:

```text
DELETE FROM meta_raw_snapshots WHERE partition_id = $1::uuid
```

and concurrent inserts into `meta_raw_snapshots`.

Representative blocker sample:

```text
blocked_pid=1359862
blocked_query=CREATE INDEX IF NOT EXISTS idx_meta_raw_snapshots_business ON meta_raw_snapshots (business_id, fetched_at DESC)
blocking_query=DELETE FROM meta_raw_snapshots WHERE partition_id = $1::uuid
blocking_duration=28m22s
```

`pg_indexes` already reports the index exists:

```text
idx_meta_raw_snapshots_business
CREATE INDEX idx_meta_raw_snapshots_business ON public.meta_raw_snapshots USING btree (business_id, fetched_at DESC)
```

Even with `IF NOT EXISTS`, Postgres still needs to acquire relation-level locks to check and/or proceed, so it can block behind writers. `pg_stat_progress_create_index` was empty, which indicates this backend was waiting before meaningful create-index progress.

## 6. Zombie Migration Transaction

Yes, a migration backend was still alive after the workflow failed.

Sample at 2026-04-29T21:31:23Z:

```text
pid=1359862
application_name=omniads-worker
state=active
xact_start=2026-04-29T21:12:43.092Z
query_start=2026-04-29T21:12:43.092Z
wait_event_type=Lock
wait_event=relation
query=CREATE INDEX IF NOT EXISTS idx_meta_raw_snapshots_business ON meta_raw_snapshots (business_id, fetched_at DESC)
```

I did not terminate this backend because owner approval is required.

## 7. New Migration Statements Between `96bd038` and `11f191f`

None of the new canonical/calibration tables exist in production:

```text
calibration_versions: missing
calibration_thresholds_by_business: missing
decision_override_events: missing
creative_canonical_resolver_flags: missing
creative_canonical_cohort_assignments: missing
admin_feature_flag_kill_switches: missing
creative_canonical_resolver_admin_controls: missing
creative_canonical_decision_events: missing
```

New statements that still need to apply:

```sql
CREATE TABLE IF NOT EXISTS calibration_versions (...);
CREATE INDEX IF NOT EXISTS idx_calibration_versions_business_created
  ON calibration_versions (business_id, ad_account_id, objective_family, format_family, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calibration_versions_segment_created
  ON calibration_versions (segment_key, created_at DESC);

CREATE TABLE IF NOT EXISTS calibration_thresholds_by_business (...);
CREATE INDEX IF NOT EXISTS idx_calibration_thresholds_business_active
  ON calibration_thresholds_by_business (business_id, ad_account_id, objective_family, format_family, retired_at, activated_at DESC);

CREATE TABLE IF NOT EXISTS decision_override_events (...);
CREATE INDEX IF NOT EXISTS idx_decision_override_events_business_created
  ON decision_override_events (business_id, ad_account_id, objective_family, format_family, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_decision_override_events_severity_queue
  ON decision_override_events (severity, queued_at DESC)
  WHERE queued_at IS NOT NULL AND handled_at IS NULL;

CREATE TABLE IF NOT EXISTS creative_canonical_resolver_flags (...);
CREATE TABLE IF NOT EXISTS creative_canonical_cohort_assignments (...);
CREATE TABLE IF NOT EXISTS admin_feature_flag_kill_switches (...);
CREATE TABLE IF NOT EXISTS creative_canonical_resolver_admin_controls (...);
CREATE INDEX IF NOT EXISTS idx_creative_canonical_resolver_admin_controls_type
  ON creative_canonical_resolver_admin_controls (control_type, business_id, enabled);

CREATE TABLE IF NOT EXISTS creative_canonical_decision_events (...);
CREATE INDEX IF NOT EXISTS idx_creative_canonical_decision_events_business_created
  ON creative_canonical_decision_events (business_id, cohort, created_at DESC);
```

The timeout occurred before these new statements were reached.

## 8. Recommended Path Forward

Do not retry deploy until the migration backend and raw snapshot lock contention are handled.

Recommended sequence:

1. Owner decides whether to terminate the zombie migration backend `pid=1359862`.
   - It is currently waiting on `meta_raw_snapshots`.
   - I did not terminate it.
2. Reduce `meta_raw_snapshots` writer contention before migrations.
   - The deploy stopped only `worker`, but DB still had long-running delete/insert activity against `meta_raw_snapshots`.
   - Identify whether those sessions are from web requests, old worker connections, or provider sync jobs before retry.
3. Add preflight to deploy workflow before migrations:
   - fail fast if any active query is waiting on or holding relation locks for `meta_raw_snapshots`;
   - fail fast if previous migration backend is still active.
4. For the actual retry, choose one of these owner-approved paths:
   - Apply migrations manually with a longer timeout after lock contention is clear, then re-run deploy with `run_migrations=false`.
   - Increase deploy workflow migration timeout and retry after confirming no zombie backend and no raw-snapshot lock contention.
   - Split migrations into smaller batches so existing raw-snapshot idempotent index checks cannot block canonical table creation.
   - Refactor structurally risky migrations: avoid `CREATE INDEX IF NOT EXISTS` on hot tables during deploy; use `CREATE INDEX CONCURRENTLY` outside the main deploy transaction/path where appropriate.

Current production state remains legacy:

```text
web    96bd0386208868b18d9763d64917ab9d4aa22b53
worker 96bd0386208868b18d9763d64917ab9d4aa22b53
canonical activation not run
canonical tables absent
```
