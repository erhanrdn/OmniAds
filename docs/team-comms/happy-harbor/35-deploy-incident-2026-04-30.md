# Happy Harbor Deploy Incident - 2026-04-30

## Rollback to 96bd038

### Runtime rollback

- Final production web image: `ghcr.io/erhanrdn/omniads-web:96bd0386208868b18d9763d64917ab9d4aa22b53`.
- Final production worker image: `ghcr.io/erhanrdn/omniads-worker:96bd0386208868b18d9763d64917ab9d4aa22b53`.
- Public build-info returned `buildId=96bd0386208868b18d9763d64917ab9d4aa22b53`.
- Runtime registry reported both `web` and `worker` as `healthy`, with no validation issues.
- Docker health was confirmed healthy for both containers after clearing only the previously authorized `omniads-worker` / `meta_raw_snapshots` DELETE lock convoy.

### Compose env final state

Both production env files were pinned to the rollback SHA:

```text
/var/www/adsecute/.env:APP_IMAGE_TAG=96bd0386208868b18d9763d64917ab9d4aa22b53
/var/www/adsecute/.env:APP_BUILD_ID=96bd0386208868b18d9763d64917ab9d4aa22b53
/var/www/adsecute/.env.production:APP_IMAGE_TAG=96bd0386208868b18d9763d64917ab9d4aa22b53
/var/www/adsecute/.env.production:APP_BUILD_ID=96bd0386208868b18d9763d64917ab9d4aa22b53
```

### Database cleanup

Dropped the eight owner-authorized canonical/calibration tables:

- `admin_feature_flag_kill_switches`
- `calibration_thresholds_by_business`
- `calibration_versions`
- `creative_canonical_cohort_assignments`
- `creative_canonical_decision_events`
- `creative_canonical_resolver_admin_controls`
- `creative_canonical_resolver_flags`
- `decision_override_events`

Verification after `DROP TABLE ... CASCADE`:

```text
SELECT table_name ... IN (...) -> 0 rows
SELECT indexname ... canonical/calibration/override patterns -> 0 rows
```

No other production table schema was modified.

### Main branch decision

I chose the default-preserve path:

1. Reset local `main` to `96bd0386208868b18d9763d64917ab9d4aa22b53`.
2. Cherry-picked the docs-only auto-deploy guard from `8b04fd3` onto that base; the new local guard commit is `cf48e6d`.
3. Added this rollback report as a docs-only commit with `[skip ci]` to avoid rebuilding and auto-deploying a non-`96bd038` image.

Result: runtime code on `main` is back to `96bd038`; only the CI docs guard and this incident report remain on top.

### PR and branch cleanup

- PR #84 was already merged by GitHub before this rollback. It cannot be converted to `merged=false` after the fact.
- I added a PR comment documenting that the merged code was removed from `main` by owner-authorized rollback.
- Deleted remote branch `codex/canonical-decision-refactor`.

### Side effects left intact

- `creative_decision_os_snapshots.payload` contains 5 historical snapshot rows with embedded `canonicalDecision` JSON, including 2 rows generated during the cutover verification.
- I left those rows intact because `96bd038` ignores unknown JSON keys in snapshot payloads, and the owner explicitly noted the persistence shape is backwards-compatible.
- The 75 backfilled canonical observability event rows were removed by dropping `creative_canonical_decision_events`.

### Follow-ups

- Bulk migration runner still re-runs idempotent `CREATE INDEX IF NOT EXISTS` statements on hot tables and can hang on `meta_raw_snapshots`.
- Worker partition cleanup still creates a lock convoy with concurrent `DELETE FROM meta_raw_snapshots WHERE partition_id = $1::uuid`.
- Deploy script/env mutation remains unreliable; incident evidence showed stale or wrong `APP_IMAGE_TAG` values unless manually corrected.
- CI auto-dispatch on push to `main` remains risky for runtime rollback commits; the preserved docs-only guard does not cover force-push runtime resets.
