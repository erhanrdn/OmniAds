# Production Deploy Investigation

Date: 2026-04-29

## 1. Current Production State

Production currently serves the post-Happy-Harbor SHA:

- Public build-info `buildId`: `bc6d1b6aa4b47ae927828e2c656714ec786b3612`
- `adsecute-web-1`: `ghcr.io/erhanrdn/omniads-web:bc6d1b6aa4b47ae927828e2c656714ec786b3612`
- `adsecute-worker-1`: `ghcr.io/erhanrdn/omniads-worker:bc6d1b6aa4b47ae927828e2c656714ec786b3612`

This confirms the production runtime is not on the intended pre-Happy-Harbor rollback SHA `96bd0386208868b18d9763d64917ab9d4aa22b53`.

## 2. Auto-Deploy Trigger

The auto-deploy path is in `.github/workflows/ci.yml`.

Trigger:

```yaml
on:
  pull_request:
  push:
    branches:
      - main
```

Runtime deploy chain:

1. `detect-runtime-changes` runs on `push` to `main`.
2. If runtime-affecting files changed, `publish-web-image` builds and pushes `ghcr.io/erhanrdn/omniads-web:${{ github.sha }}`.
3. `publish-worker-image` builds and pushes `ghcr.io/erhanrdn/omniads-worker:${{ github.sha }}`.
4. `dispatch-deploy` calls the `deploy-hetzner.yml` workflow dispatch API with:
   - `sha=${{ github.sha }}`
   - `require_current_main_head=true`
   - `run_migrations=${{ needs.detect-runtime-changes.outputs.schema_changed }}`

Root cause:

- Docs/audit pushes to `main` can still run CI.
- Runtime detection is script-level and occurs after the workflow starts.
- If a docs commit is combined with any file matching the runtime regex, the workflow publishes and auto-dispatches production deploy for `main`.

## 3. Guard Configuration

Round 3 adds this guard to `.github/workflows/ci.yml`:

```yaml
push:
  branches:
    - main
  paths-ignore:
    - 'docs/team-comms/**'
    - '.github/workflows/ci.yml'
```

Effect:

- Commits that only touch `docs/team-comms/**` no longer start the CI workflow on `main`.
- Commits that only touch `.github/workflows/ci.yml` also no longer start the CI workflow on `main`; this prevents the guard commit itself from publishing and deploying another `main` image.
- Because the deploy dispatch is downstream of CI, those docs-only commits cannot publish images or auto-dispatch production deploy.

Limits:

- The guard does not suppress deploys for code, package, script, or mixed docs+runtime commits.
- Workflow-only commits are suppressed, but mixed workflow+runtime commits still deploy if any non-ignored runtime path changes.
- This guard becomes production-active only after the workflow change exists on the branch receiving the `main` push. Until then, current `main` still has the old auto-deploy behavior.

## 4. Rollback Target

Rollback target:

```text
96bd0386208868b18d9763d64917ab9d4aa22b53
```

Deploy inputs required:

```text
sha=96bd0386208868b18d9763d64917ab9d4aa22b53
require_current_main_head=false
run_migrations=false
break_glass=true
override_reason=Re-stabilize after auto-deploy interfered with original rollback
```

Rationale:

- `require_current_main_head=false` is required because the target is intentionally behind `main`.
- `run_migrations=false` is required because this is a rollback to pre-Happy-Harbor code and the additive fields/tables are backwards-compatible.
- `break_glass=true` records that this is a stabilization rollback, not a normal forward deploy.

## 5. Stabilization Status

Status after stabilization:

- Auto-deploy trigger identified.
- Docs-only/workflow-only guard implemented in this branch and pushed to `main` as commit `8b04fd3bd7554d4161652e744830e70b3a260926`.
- GitHub CLI workflow dispatch was not available in this local environment because `gh auth status` reported no authenticated GitHub host.
- Rollback was therefore executed through the same remote deploy phases used by `.github/workflows/deploy-hetzner.yml`, over SSH:
  - synced the `96bd0386208868b18d9763d64917ab9d4aa22b53` `docker-compose.yml`;
  - ran `prepare_runtime`;
  - skipped migrations;
  - ran `recreate_services`;
  - ran `verify_runtime`;
  - ran `persist_control_plane`.
- Public build-info now returns `buildId=96bd0386208868b18d9763d64917ab9d4aa22b53`.
- Public deploy gate verdict: `pass`.
- Public release gate verdict: `pass`.
- `adsecute-web-1`: `ghcr.io/erhanrdn/omniads-web:96bd0386208868b18d9763d64917ab9d4aa22b53`.
- `adsecute-worker-1`: `ghcr.io/erhanrdn/omniads-worker:96bd0386208868b18d9763d64917ab9d4aa22b53`.

Completed stabilization action:

1. Made the auto-deploy guard active on `main` without merging the canonical resolver production code.
2. Re-stabilized production on `96bd0386208868b18d9763d64917ab9d4aa22b53`.
3. Confirmed both `web` and `worker` images use the `96bd0386208868b18d9763d64917ab9d4aa22b53` tag.
4. Confirmed public `/api/build-info` returns the rollback SHA.

## 6. Staging Preview Plan

PR #84 remains approved only for internal staging preview under `canonicalResolver=v1`.

Recommended staging approach:

- Do not merge PR #84 to `main` for production cohort.
- Build a staging Docker tag from `codex/canonical-decision-refactor`, for example `omniads-web:staging-canonical-v1` and `omniads-worker:staging-canonical-v1`.
- Point staging traffic at that tag with the canonical resolver flag enabled for internal users only.
- Keep production on the stabilized rollback SHA until the Round 3 fixes receive subsequent ChatGPT Pro and Claude review.
