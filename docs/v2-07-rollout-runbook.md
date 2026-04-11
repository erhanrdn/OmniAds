# V2-07 Rollout Runbook

## Preflight

1. `npx tsc --noEmit --pretty false`
2. `npm run test`
3. `npm run build`
4. run local reviewer and commercial smoke

## Shadow Verification

Deploy the exact SHA with:

- `COMMAND_CENTER_EXECUTION_V1=1`
- `META_EXECUTION_APPLY_ENABLED=0`

Verify:

- execution preview is visible
- support matrix is visible
- rollback truth copy is visible
- apply remains disabled
- reviewer and commercial live smoke pass

## Canary Apply Verification

Enable:

- `META_EXECUTION_APPLY_ENABLED=1`
- `META_EXECUTION_CANARY_BUSINESSES=<real_business_uuid>`
- `COMMERCIAL_SMOKE_OPERATOR_EXECUTION_BUSINESS_ID=<same_real_business_uuid>`

Then:

1. seed reviewer and commercial smoke operator
2. switch the commercial smoke operator to the canary business
3. open a supported Meta ad set action
4. verify preview diff, support matrix, and rollback truth
5. approve
6. apply
7. confirm provider-side live state changed
8. confirm immutable execution audit is written
9. rollback
10. confirm provider-side live state restored

## Duplicate Mutation Safety Check

During canary verification, duplicate `clientMutationId` requests must:

- replay the stored terminal result, or
- stop with a non-dispatching conflict while the original attempt is still settling

No duplicate flow may issue a second provider write for the same `clientMutationId`.

## Rollback Readiness

1. First containment step: disable `META_EXECUTION_APPLY_ENABLED`.
2. If the release must be reverted, redeploy exact SHA `5bdf330869ae9170e8f6a8aa977c26a831fd1dba`.
3. Re-run:
   - `https://adsecute.com/api/build-info`
   - `https://www.adsecute.com/api/build-info`
   - `GET /api/release-authority`
   - reviewer smoke
   - commercial smoke
