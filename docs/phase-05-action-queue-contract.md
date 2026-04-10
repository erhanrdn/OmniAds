# Phase 05 Action Queue Contract

## Contract Version
- `command-center.v1`

## Action Identity
- `actionFingerprint` is deterministic.
- Inputs:
  - source system
  - source type
  - entity type
  - entity id
  - source decision id
  - recommended action
  - fingerprint contract version
- Date range is intentionally excluded so the same underlying decision keeps a stable workflow key across operator sessions.

## Action Payload
- `actionFingerprint`
- `sourceSystem`
- `sourceType`
- `title`
- `recommendedAction`
- `confidence`
- `priority`
- `summary`
- `decisionSignals`
- `evidence`
- `guardrails`
- `relatedEntities`
- `tags`
- `watchlistOnly`
- `status`
- `assigneeUserId`
- `assigneeName`
- `snoozeUntil`
- `latestNoteExcerpt`
- `noteCount`
- `lastMutatedAt`
- `lastMutationId`
- `createdAt`
- `sourceContext`

## Workflow Rules
- `pending -> approved | rejected | snoozed | canceled`
- `approved -> completed_manual | canceled | failed`
- `rejected -> pending` via reopen
- `snoozed -> pending` via reopen
- `failed -> pending` via reopen
- `canceled -> pending` via reopen
- `completed_manual -> pending` via reopen
- `executed` is reserved and not targeted by Phase 05 UI mutations

## Mutation Contract
- `PATCH /api/command-center/actions`
- Required:
  - `businessId`
  - `actionFingerprint`
  - `clientMutationId`
  - `mutation`
- Optional:
  - `startDate`
  - `endDate`
  - `assigneeUserId`
  - `snoozeUntil`

## Note Contract
- `POST /api/command-center/actions/note`
- Required:
  - `businessId`
  - `actionFingerprint`
  - `clientMutationId`
  - `note`

## Journal Contract
- Journal entries are immutable.
- Each entry records:
  - action identity
  - action title
  - source system/type
  - event type
  - actor identity
  - human-readable message
  - optional note
  - metadata blob
  - timestamp

## Saved View Contract
- Built-in views are code-defined and immutable.
- Custom views persist:
  - `viewKey`
  - `name`
  - `definition`
- V1 definition fields:
  - `sourceTypes`
  - `statuses`
  - `tags`
  - `watchlistOnly`

## Handoff Contract
- `shift`
- `summary`
- `blockers`
- `watchouts`
- `linkedActionFingerprints`
- `fromUserId`
- `toUserId`
- `acknowledgedAt`
- `acknowledgedByUserId`

## Provenance Boundary
- Queue actions may only come from deterministic Meta/Creative decision outputs.
- `AI Commentary` is never a queue source, mutation source, or workflow authority.
