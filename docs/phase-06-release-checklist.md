# Phase 06 Release Checklist

## Pre-merge

- [ ] `npx tsc --noEmit --pretty false`
- [ ] `npm run test`
- [ ] `npm run build`
- [ ] local browser smoke passes
- [ ] reviewer smoke shows execution preview with disabled apply
- [ ] commercial smoke shows execution preview, support badge, and audit slice

## Deploy

- [ ] merge to `main`
- [ ] deploy exact SHA through the existing Hetzner workflow
- [ ] verify `https://adsecute.com/api/build-info`
- [ ] verify `https://www.adsecute.com/api/build-info`
- [ ] run `node --import tsx scripts/verify-serving-direct-release.ts <businessId> --mode=post_deploy --base-url=https://adsecute.com --expected-build-id=<sha>`

## Shadow verification

- [ ] `COMMAND_CENTER_EXECUTION_V1=1`
- [ ] `META_EXECUTION_APPLY_ENABLED=0`
- [ ] reviewer live smoke passes
- [ ] commercial demo smoke passes

## Canary verification

- [ ] `META_EXECUTION_CANARY_BUSINESSES` points at a real non-demo business
- [ ] `COMMERCIAL_SMOKE_OPERATOR_EXECUTION_BUSINESS_ID` matches the canary business
- [ ] supported action preview renders
- [ ] approve -> apply works
- [ ] execution audit entry is written
- [ ] rollback works
- [ ] live Graph re-read confirms restore

## Release completion

- [ ] rollout record captured
- [ ] rollback SHA identified
- [ ] rollback switch tested: `META_EXECUTION_APPLY_ENABLED=0`
