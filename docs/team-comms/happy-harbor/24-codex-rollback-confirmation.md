# Happy Harbor - Production Rollback Confirmation

## Rollback Summary

| Item | Value |
| --- | --- |
| Rollback target SHA | `96bd0386208868b18d9763d64917ab9d4aa22b53` |
| Rollback reason | Happy Harbor verdict policy regression on small businesses |
| Audit outcome commit | `348169927ac1138f42041d8b3a809bc4e7d921cf` |
| Effective rollback timestamp | 2026-04-29T00:56:51Z |
| Final rollback deploy run | https://github.com/erhanrdn/OmniAds/actions/runs/25085545285 |
| Post-deploy verify run | https://github.com/erhanrdn/OmniAds/actions/runs/25085611562 |

Audit/outcome artifacts were committed and pushed before rollback:

- `docs/team-comms/happy-harbor/audit-F-iwastore-theswaf/raw-metrics.json`
- `docs/team-comms/happy-harbor/audit-F-iwastore-theswaf/claude-rating.json`
- `docs/team-comms/happy-harbor/audit-F-iwastore-theswaf/comparison.json`
- `scripts/happy-harbor-faz-f-iwastore-theswaf-audit.ts`
- `scripts/happy-harbor-faz-f-claude-rater.ts`

The first rollback deploy to `96bd0386208868b18d9763d64917ab9d4aa22b53` succeeded, but the audit outcome push also triggered CI auto-deploy for `348169927ac1138f42041d8b3a809bc4e7d921cf`, which temporarily moved production forward again. After that CI deploy completed, a second break-glass rollback was run.

The final rollback run recreated web and worker on the target image and skipped migrations as requested. Its workflow conclusion is red because the deploy workflow's `Verify local runtime readiness` phase failed during the fresh worker-heartbeat check. Runtime state after that failure was still the rollback SHA:

- `adsecute-web-1`: `ghcr.io/erhanrdn/omniads-web:96bd0386208868b18d9763d64917ab9d4aa22b53`
- `adsecute-worker-1`: `ghcr.io/erhanrdn/omniads-worker:96bd0386208868b18d9763d64917ab9d4aa22b53`
- `/api/build-info`: `buildId=96bd0386208868b18d9763d64917ab9d4aa22b53`, `deployGate=pass`, `releaseGate=pass`, web fresh, worker fresh

Because the final deploy workflow was red, post-deploy verify was triggered manually. It completed successfully.

## Smoke Observations

Smoke was executed on the active Hetzner/nginx production ingress:

- `https://adsecute.com/creatives`

Ingress caveat:

- `https://app.adsecute.com/creatives` still returns Vercel 404 / `DEPLOYMENT_NOT_FOUND`.
- `https://adsecute.com/creatives` returns the expected auth redirect when unauthenticated and loads with a valid production session.

Smoke setup:

- Created temporary production sessions for an existing user and deleted the session rows after each run.
- Forced the creatives surface to the last 30 days to match the latest Decision OS snapshot windows.
- Tested `IwaStore` and `TheSwaf`.

Observed quick filters:

| Business | Quick filter count | Counts |
| --- | ---: | --- |
| IwaStore | 6 | Scale 1, Test More 1, Protect 0, Refresh 6, Cut 1, Diagnose 26 |
| TheSwaf | 6 | Scale 1, Test More 1, Protect 0, Refresh 2, Cut 6, Diagnose 30 |

UI rollback checks:

- Old 6-pill quick filter row is back.
- Table rows no longer render the Happy Harbor VerdictBand column.
- `creative-v2-preview-surface` is back.
- `Today Priority / Buyer Command Strip` is present inside the V2 preview surface.
- `creative-decision-os-surface` renamed surface is absent.
- `?creativeDecisionOsV2Preview=0` hides the V2 preview surface and Today Priority section.

Detail checks:

| Business | Creative | Detail verdict | Blanket diagnose? |
| --- | --- | --- | --- |
| IwaStore | `creative_1qxpvdx` | `Scale` / review-only scale wording | No |
| IwaStore | `creative_gav4ek` | `Refresh` wording | No |
| TheSwaf | `creative_2dptrn` | `Refresh` wording | No |
| TheSwaf | `creative_1d99qi7` | `Test More` wording | No |

Smoke verdict: green on the active production ingress. The blanket `diagnose` behavior is gone in the sampled IwaStore and TheSwaf detail views, and the pre-Happy-Harbor quick-filter/operator surface behavior is restored.

## Follow-Up State

Rollback keeps git history intact. `main` remains at the audit outcome commit while production runs the older SHA `96bd0386208868b18d9763d64917ab9d4aa22b53`.

Suspended after rollback:

- `?verdictContract=v0` cleanup plan
- buyer comprehension panel
- Happy Harbor UI rollout assumptions

The `creativeVerdicts` snapshot payload/extra DB data remains in production storage and is ignored by the rollback code path.
