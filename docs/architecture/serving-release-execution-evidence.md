# Serving Release Execution Evidence

Purpose: record the final direct production release execution facts for the serving/projection/cache hardening work after the successful `main` release.

Date: 2026-04-10

Status: released to production

## Release Facts

- Release PR: [#11](https://github.com/erhanrdn/OmniAds/pull/11)
- PR title: `Fix main build-test release blockers`
- Merge method: standard GitHub merge commit
- Merged release SHA: [`a60ef2853aabbf9e46c383ed83ad79c82aa8b5fa`](https://github.com/erhanrdn/OmniAds/commit/a60ef2853aabbf9e46c383ed83ad79c82aa8b5fa)
- Previous rollback candidate identified before release: [`32751b7761fc978c71124df379b506aa45151261`](https://github.com/erhanrdn/OmniAds/commit/32751b7761fc978c71124df379b506aa45151261)
- Rollback candidate image status before release:
  - `ghcr.io/erhanrdn/omniads-web:32751b7761fc978c71124df379b506aa45151261` present
  - `ghcr.io/erhanrdn/omniads-worker:32751b7761fc978c71124df379b506aa45151261` present

## Preflight Result

Command executed:

```bash
node --import tsx scripts/verify-serving-direct-release.ts f8a3b5ac-588c-462f-8702-11cd24ff3cd2 --mode=preflight
```

Reported result:

- `pass`
- blockers: none
- summary counts:
  - `automated_present: 23`
  - `automated_missing: 0`
  - `manual_boundary: 2`
  - `manual_missing: 8`
  - `unknown: 1`

Interpretation:

- the automated in-scope serving/projection/cache surfaces were present before release
- intentional manual boundaries remained operator-visible and were not treated as release failures

## CI Publish And Deploy Chain

Release chain used only the existing repo-supported path documented in `docs/architecture/serving-direct-production-release-runbook.md`.

### CI workflow

- Workflow: `CI`
- Run URL: https://github.com/erhanrdn/OmniAds/actions/runs/24216646262
- Outcome: `success`

Observed job outcomes:

- `build-test`: `success`
- `detect-runtime-changes`: `success`
- `publish-images`: `success`
- `dispatch-deploy`: `success`
- `skip-runtime-deploy`: `skipped`

Published image verification for the merged release SHA:

- `ghcr.io/erhanrdn/omniads-web:a60ef2853aabbf9e46c383ed83ad79c82aa8b5fa` -> `200 OK`
- `ghcr.io/erhanrdn/omniads-worker:a60ef2853aabbf9e46c383ed83ad79c82aa8b5fa` -> `200 OK`

### Deploy workflow

- Workflow: `Deploy to Hetzner`
- Run URL: https://github.com/erhanrdn/OmniAds/actions/runs/24216842834
- Outcome: `success`

No alternate publish lane, canary flow, or private rollout flow was used.

## Observed Production Build

Command executed:

```bash
curl -fsSL https://adsecute.com/api/build-info
```

Observed response:

```json
{"buildId":"a60ef2853aabbf9e46c383ed83ad79c82aa8b5fa","nodeEnv":"production"}
```

Conclusion:

- public build info matched the merged release SHA after deploy

## Post-Deploy Verification Result

Command executed:

```bash
node --import tsx scripts/verify-serving-direct-release.ts \
  f8a3b5ac-588c-462f-8702-11cd24ff3cd2 \
  --mode=post_deploy \
  --base-url=https://adsecute.com \
  --expected-build-id=a60ef2853aabbf9e46c383ed83ad79c82aa8b5fa
```

Reported result:

- `pass`
- blockers: none
- `/api/build-info` status: `passed`
- observed build id matched expected build id
- freshness summary remained acceptable with `automated_missing: 0`

Additional verification facts:

- authenticated HTTP smoke was skipped
- exact reason: no operator session cookie was available in the executing environment
- this did not block release because the read-only build-id and freshness verification checks passed, and the existing docs already treat authenticated smoke as optional

## Intentional Manual Boundaries

The following boundaries remained accepted by design and were not release failures:

- exact selected `platform_overview_summary_ranges`
- non-default GA4 windows
- non-`country` GA4 demographics dimensions
- `overview_shopify_orders_aggregate_v6` windows outside the automated recent window

Their operator fallback commands remain documented in:

- `docs/architecture/serving-operational-freshness-matrix.md`
- `docs/architecture/serving-freshness-observability-runbook.md`
- `docs/architecture/serving-direct-production-release-runbook.md`

## Closeout Conclusion

Direct production release execution completed successfully for:

- release SHA `a60ef2853aabbf9e46c383ed83ad79c82aa8b5fa`

The release satisfied the repo-supported release contract:

- PR merge into `main`
- successful CI build/test
- successful exact-SHA image publish
- successful deploy workflow dispatch and execution
- public build-id confirmation
- successful read-only post-deploy verification

## Remaining Non-Blocking Follow-Up Risks

- authenticated route smoke was not exercised in the executing environment because no operator session cookie was available
- intentional manual freshness boundaries remain operator-owned by design
- previously documented non-blocking architecture debt in `docs/architecture/db-risk-register.md` remains follow-up work, but did not block this release
