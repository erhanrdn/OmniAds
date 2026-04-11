# Command Center Execution Contract V1

Contract version: `command-center-execution.v1`

## GET `/api/command-center/execution`

Query params:

- `businessId`
- `startDate`
- `endDate`
- `actionFingerprint`

Response highlights:

- `supportMode`: `supported | manual_only | unsupported`
- `status`: `draft | ready_for_apply | applying | executed | failed | rolled_back | manual_only | unsupported`
- `previewHash`
- `approval`
- `permission`
- `currentState`
- `requestedState`
- `diff`
- `plan`
- `auditTrail`
- `rollback`

## POST `/api/command-center/execution/apply`

Body:

- `businessId`
- `startDate`
- `endDate`
- `actionFingerprint`
- `previewHash`
- `clientMutationId`

Rules:

- rejects stale `previewHash`
- rejects non-approved actions
- rejects non-canary or kill-switched apply
- idempotency is keyed by `clientMutationId`

## POST `/api/command-center/execution/rollback`

Body:

- `businessId`
- `startDate`
- `endDate`
- `actionFingerprint`
- `clientMutationId`

Rules:

- only available after a successful provider-backed apply
- restores captured pre-apply `status` and `dailyBudget`
- rejects when only a recovery note exists

## Audit fields

The audit trail records:

- operation
- execution status
- support mode
- actor snapshot
- approval snapshot
- preview hash
- rollback kind and note
- current and requested state summaries
- captured pre-apply state
- provider response summary
- failure reason
- provider entity references
