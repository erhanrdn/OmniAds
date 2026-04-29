# Happy Harbor - Production Deploy Confirmation

## Deploy Summary

| Item | Value |
| --- | --- |
| Deploy SHA | `5adaa2be5e40391e3499e90a62b806b92ef31f55` |
| Source branch | `main` |
| Closing commit | `5adaa2b Document Happy Harbor sequence closing` |
| CI run | https://github.com/erhanrdn/OmniAds/actions/runs/25082819885 |
| Deploy timestamp | 2026-04-28T23:42:39Z recovery deploy started; 2026-04-28T23:43:39Z completed |
| Successful deploy run | https://github.com/erhanrdn/OmniAds/actions/runs/25083415012 |
| Post-deploy verify run | https://github.com/erhanrdn/OmniAds/actions/runs/25083444335 |
| Feature flag cleanup issue | https://github.com/erhanrdn/OmniAds/issues/83 |

The 8 Happy Harbor commits from `c079f9f` through `5adaa2b` were pushed to `origin/main`. CI completed green. The CI `test` job included `Creative Decision OS v2 safety (PR-blocking)` and that step completed successfully.

Runtime build-info after deploy reported the expected SHA live, web fresh, worker fresh, `deployGate=pass`, and `releaseGate=pass`.

## Deploy Run Notes

The requested manual deploy with `run_migrations=true` was triggered for the full SHA:

- Run: https://github.com/erhanrdn/OmniAds/actions/runs/25083044653
- Result: failed in `Run database migrations`
- Failure mode: migration container hit the deploy workflow's 600000 ms timeout.

Recovery action:

- Re-ran `Deploy to Hetzner` for the same SHA with `require_current_main_head=true` and `run_migrations=false`.
- Result: success.
- Post-deploy verify automatically ran and passed.

No rollback was performed. The production runtime is serving the target SHA and the Happy Harbor smoke passed on the deployed ingress. The Phase B `creativeVerdicts` contract is served from the creative snapshot payload/response shape, not from a separate new database column.

Ingress note:

- `https://app.adsecute.com/creatives` returned Vercel 404 / `DEPLOYMENT_NOT_FOUND`.
- `https://adsecute.com/creatives` returned the expected auth redirect when unauthenticated and loaded successfully with a valid production session.
- Smoke was executed against `https://adsecute.com/creatives`, which is the active Hetzner/nginx production ingress for this deploy.

## Production Smoke

Smoke method:

- Created temporary production sessions for an existing user and deleted the session rows after each script run.
- Forced the creatives surface to the last 30 days so the table date range matched the latest Decision OS snapshots.
- Tested 2 businesses:
  - `TheSwaf` (`target_pack_configured=true`)
  - `IwaStore` (`target_pack_configured=false`)

Observed UI:

| Business | Table VerdictBand count | Detail rows opened | Result |
| --- | ---: | ---: | --- |
| TheSwaf | 20 | 3 | pass |
| IwaStore | 20 | 3 | pass |

Detail smoke confirmed:

- Phase pill, headline, and CTA rendered together in `VerdictBand`.
- Detail drawer opened from table rows.
- No API request failures or console errors were observed in the smoke run.
- `IwaStore` showed `Break-even: median proxy` in detail evidence for `target_pack_configured=false` creatives.

Six-action coverage:

| Primary decision | Production creative | Observed phase/headline | Observed CTA |
| --- | --- | --- | --- |
| Scale | `IwaStore / creative_1qxpvdx` | `TEST / Test Winner` | `Promote to Scale (review)` |
| Test More | `IwaStore / creative_mvouqb` | `TEST / Test Inconclusive` | `Continue Testing (review)` |
| Protect | `IwaStore / creative_15m2a6d` | `SCALE / Scale Performer` | `Keep Active (review)` |
| Refresh | `IwaStore / creative_oh3fxx` | `POST-SCALE / Scale Fatiguing` | `Refresh Creative (review)` |
| Cut | `TheSwaf / creative_2dptrn` | `SCALE / Scale Underperformer` | `Cut Now (review)` |
| Diagnose | `IwaStore / creative_bzfqye` | `SCALE / Needs Diagnosis` | `Investigate` |

Smoke verdict: green on the active production ingress, with the ingress caveat above.

## Rollout Follow-Up

`?verdictContract=v0` remains live for the agreed two-week compatibility window.

Follow-up issue opened:

- https://github.com/erhanrdn/OmniAds/issues/83
- Target review date: 2026-05-13
- Scope: verify no active support/debug flows still require `?verdictContract=v0`, remove the compatibility path, and rerun `creative:v2:safety` plus standard CI.
