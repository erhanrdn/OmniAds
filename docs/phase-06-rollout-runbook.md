# Phase 06 Rollout Runbook

## Preflight

1. `npx tsc --noEmit --pretty false`
2. `npm run test`
3. `npm run build`
4. `npm run test:smoke:local`

## Shadow release

Deploy the exact SHA with:

- `COMMAND_CENTER_EXECUTION_V1=1`
- `META_EXECUTION_APPLY_ENABLED=0`

Verify:

- reviewer sees execution preview and disabled apply
- commercial operator sees support labeling and audit slice
- `https://adsecute.com/api/build-info` and `https://www.adsecute.com/api/build-info` match the release SHA

## Canary apply release

Enable:

- `META_EXECUTION_APPLY_ENABLED=1`
- `META_EXECUTION_CANARY_BUSINESSES=<real_business_uuid>`
- `COMMERCIAL_SMOKE_OPERATOR_EXECUTION_BUSINESS_ID=<same_real_business_uuid>`

Then:

1. seed reviewer and commercial smoke operator
2. switch the commercial smoke operator to the canary business
3. approve a supported Meta ad set action
4. verify preview hash, diff, and support mode
5. apply
6. confirm provider-side live state changed
7. rollback
8. confirm provider-side live state restored

## Rollback readiness

- disable `META_EXECUTION_APPLY_ENABLED`
- redeploy previous exact SHA through the existing CI deploy workflow when needed
- retain additive execution tables
- re-run build-info verification and browser smoke after rollback
