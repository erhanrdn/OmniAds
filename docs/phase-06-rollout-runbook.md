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
- `META_EXECUTION_KILL_SWITCH=0`

Verify:

- reviewer sees execution preview and disabled apply
- commercial operator sees capability registry, preflight checks, and audit slice
- `https://adsecute.com/api/build-info` and `https://www.adsecute.com/api/build-info` match the release SHA

## Canary apply release

Enable:

- `META_EXECUTION_APPLY_ENABLED=1`
- `META_EXECUTION_KILL_SWITCH=0`
- `META_EXECUTION_CANARY_BUSINESSES=<real_business_uuid>`
- `COMMERCIAL_SMOKE_OPERATOR_EXECUTION_BUSINESS_ID=<same_real_business_uuid>`

Then:

1. seed reviewer and commercial smoke operator
2. switch the commercial smoke operator to the canary business
3. approve a supported Meta ad set action
4. verify preview hash, capability registry, preflight checks, and support mode
5. apply
6. confirm post-apply validation passed and immutable provider diff evidence was written
7. confirm provider-side live state changed
8. rollback
9. confirm post-rollback validation passed and provider-side live state restored

## Rollback readiness

- disable `META_EXECUTION_APPLY_ENABLED`
- enable `META_EXECUTION_KILL_SWITCH=1` if an immediate safety stop is required
- redeploy previous exact SHA through the existing CI deploy workflow when needed
- retain additive execution tables
- re-run build-info verification and browser smoke after rollback
