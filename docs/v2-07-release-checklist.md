# V2-07 Release Checklist

## Pre-merge

- [ ] `npx tsc --noEmit --pretty false`
- [ ] targeted Vitest for execution preview, support matrix, duplicate replay, and rollback-truth regressions
- [ ] `npm run test`
- [ ] `npm run build`
- [ ] local reviewer smoke passes
- [ ] local commercial smoke passes

## Deploy

- [ ] merge candidate is an exact SHA on `main`
- [ ] deploy that exact SHA through the existing Hetzner workflow
- [ ] verify `https://adsecute.com/api/build-info`
- [ ] verify `https://www.adsecute.com/api/build-info`
- [ ] verify `GET /api/release-authority`
- [ ] run `node --import tsx scripts/verify-release-authority.ts --mode=post_deploy --base-url=https://adsecute.com --expected-build-id=<sha>`

## Live Execution Validation

- [ ] execution preview shows the explicit support matrix
- [ ] selected-family rollback truth is visible in the execution panel
- [ ] unsupported and manual-only families stay explicit
- [ ] apply remains disabled outside the Meta execution canary allowlist
- [ ] duplicate apply or rollback requests do not issue a second provider write

## Canary Proof

- [ ] `META_EXECUTION_APPLY_ENABLED=1`
- [ ] `META_EXECUTION_CANARY_BUSINESSES=<real_business_uuid>`
- [ ] `COMMERCIAL_SMOKE_OPERATOR_EXECUTION_BUSINESS_ID=<same_real_business_uuid>`
- [ ] supported action preview renders on the canary business
- [ ] approve -> apply works
- [ ] execution audit entry is written
- [ ] rollback works
- [ ] live Graph re-read confirms restore
- [ ] `node --import tsx scripts/verify-serving-direct-release.ts <canary_business_id> --mode=post_deploy --base-url=https://adsecute.com --session-cookie=<cookie> --expected-build-id=<sha>`

## Rollback Readiness

- [ ] previous known-good SHA recorded as `5bdf330869ae9170e8f6a8aa977c26a831fd1dba`
- [ ] disabling `META_EXECUTION_APPLY_ENABLED` is documented as the first containment step
- [ ] exact-SHA rollback path is documented and tested
- [ ] post-rollback build-info, release-authority, and smoke verification path is documented
