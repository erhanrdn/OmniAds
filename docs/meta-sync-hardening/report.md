# 1. Phase
Meta integrations card visibility hardening completed on 2026-04-14 for the Integrations page. This phase added stage-by-stage Meta sync progress on the card without changing worker throughput, scheduler behavior, or Postgres configuration.

## 2. Files Reviewed
- `docs/meta-sync-hardening/report.md`
- `app/api/meta/status/route.ts`
- `lib/meta/page-readiness.ts`
- `lib/meta/status-types.ts`
- `lib/meta/ui.ts`
- `lib/meta/ui-status.ts`
- `lib/sync/sync-status-pill.ts`
- `app/(dashboard)/integrations/page.tsx`
- `components/integrations/integrations-card.tsx`
- `components/meta/meta-sync-progress.tsx`
- `lib/meta/status-operations.ts`
- `lib/sync/provider-status-truth.ts`
- `app/admin/sync-health/page.tsx`
- `lib/admin-operations-health.ts`
- `lib/meta/page-readiness.test.ts`
- `lib/meta/ui-status.test.ts`
- `lib/meta/ui.test.ts`
- `lib/meta/status-operations.test.ts`
- `lib/sync/sync-status-pill.test.ts`
- `lib/meta/warehouse-types.ts`
- `store/integrations-store.ts`
- `package.json`
- `vitest.config.ts`

## 3. Files Changed
- `lib/meta/integration-progress.ts`
- `lib/meta/integration-progress.test.ts`
- `components/integrations/meta-integration-progress.tsx`
- `components/integrations/integrations-card.tsx`
- `components/integrations/integrations-card.test.tsx`
- `docs/meta-sync-hardening/report.md`

## 4. What Was Implemented
- Added `resolveMetaIntegrationProgress(...)` to derive a compact Meta card progress model from existing `MetaStatusResponse` fields only.
- Built a fixed stage set for the card:
  - `Connection`
  - `Queue / worker`
  - `Core data`
  - `Priority range / recent window`
  - `Extended surfaces`
  - `Attention / recovery` only when needed
- Each stage now exposes:
  - `ready | working | waiting | blocked`
  - short label
  - short detail text
  - percent only when grounded by real counts
  - evidence such as queue depth, ready-through date, pending surfaces, or blocker / recovery summaries
- Reused existing Meta UI language where possible via existing route summaries and `getMetaSyncDescription(...)` for pause / stale / attention states.
- Mounted the new progress block only on the Meta integrations card and only when Meta is connected and at least one Meta account is assigned.
- Preserved the existing Meta sync pill and existing sync notice exactly as separate UI elements.
- Kept blocked / paused / stale / action_required states from presenting as optimistic by driving queue and attention stages from `operations`, `jobHealth`, `selectedRangeTruth`, and repair signals.
- Added focused helper coverage plus one narrow render test for the Meta card progress block.

## 5. Why This Design
- It surfaces existing backend truth without expanding the route contract in this phase.
- It stays compact enough for the integrations grid card while still answering:
  - whether the pipeline is alive
  - which layer is complete
  - what is still preparing
  - whether the system is busy or stuck
- It avoids fake certainty by grounding progress only in existing coverage, queue, readiness, and operations fields.
- It keeps this phase low-risk by extending the card instead of replacing the current pill / notice behavior.

## 6. Test Commands Run
- `npm test -- lib/meta/page-readiness.test.ts lib/meta/ui-status.test.ts lib/meta/ui.test.ts lib/meta/status-operations.test.ts lib/sync/sync-status-pill.test.ts lib/meta/integration-progress.test.ts components/integrations/integrations-card.test.tsx`

## 7. Test Results
- Passed: `7` test files
- Passed: `45` tests
- Included required Meta-focused coverage:
  - `lib/meta/page-readiness.test.ts`
  - `lib/meta/ui-status.test.ts`
  - `lib/meta/ui.test.ts`
  - `lib/meta/status-operations.test.ts`
  - `lib/sync/sync-status-pill.test.ts`
  - `lib/meta/integration-progress.test.ts`
- Included additional narrow render coverage:
  - `components/integrations/integrations-card.test.tsx`

## 8. Remaining Risks
- The card still derives compact UI truth on the client from many route fields. That is workable now, but it still leaves client-side composition drift risk.
- The Integrations page fetch does not pass a user-selected date range, so the new card usually reports the recent priority window rather than a live selected-range contract.
- The new stage block is English-only. Existing bilingual pill / notice behavior remains intact, but the new stage copy is not yet localized.

## 9. Recommended Next Phase
P2 compact UI-facing Meta status summary contract.

Reason:
- This phase proved the card can surface much better truth with existing fields, but the helper still has to compose that truth from many nested route fields.
- The next phase should add one compact, typed Meta UI summary object to `/api/meta/status` so clients no longer need to infer stage meaning from scattered readiness, coverage, queue, and operations fields.
- That keeps the current card behavior stable while reducing long-term drift before any later worker throughput or Postgres tuning work begins.
