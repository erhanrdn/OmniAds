# 1. Phase
P2 compact Meta UI summary contract completed on 2026-04-14. This phase moved the Meta card's compact sync truth into a typed `/api/meta/status` summary contract, kept the existing pill and notice intact, and localized the card progress block for English and Turkish without changing worker throughput, scheduler concurrency, queue leasing, retry behavior, Postgres configuration, or the overall admin health page design.

## 2. Files Reviewed
- `docs/meta-sync-hardening/report.md`
- `app/api/meta/status/route.ts`
- `lib/meta/status-types.ts`
- `lib/meta/integration-progress.ts`
- `lib/meta/page-readiness.ts`
- `lib/meta/ui.ts`
- `lib/meta/ui-status.ts`
- `lib/meta/status-operations.ts`
- `lib/sync/sync-status-pill.ts`
- `app/(dashboard)/integrations/page.tsx`
- `components/integrations/meta-integration-progress.tsx`
- `components/integrations/integrations-card.tsx`
- `components/meta/meta-sync-progress.tsx`
- `app/admin/sync-health/page.tsx`
- `lib/admin-operations-health.ts`
- `package.json`
- `vitest.config.ts`
- `lib/meta/page-readiness.test.ts`
- `lib/meta/ui-status.test.ts`
- `lib/meta/ui.test.ts`
- `lib/meta/status-operations.test.ts`
- `lib/sync/sync-status-pill.test.ts`
- `lib/meta/integration-progress.test.ts`
- `components/integrations/integrations-card.test.tsx`
- `app/api/meta/status/route.test.ts`

## 3. Files Changed
- `app/api/meta/status/route.ts`
- `app/api/meta/status/route.test.ts`
- `app/(dashboard)/integrations/page.tsx`
- `components/integrations/meta-integration-progress.tsx`
- `components/integrations/integrations-card.tsx`
- `components/integrations/integrations-card.test.tsx`
- `lib/meta/status-types.ts`
- `lib/meta/integration-summary.ts`
- `lib/meta/integration-summary.test.ts`
- `lib/meta/integration-progress.ts`
- `lib/meta/integration-progress.test.ts`
- `docs/meta-sync-hardening/report.md`

## 4. Contract Added
- Added `MetaStatusResponse.integrationSummary`.
- `integrationSummary` is a compact typed UI-facing contract with:
  - `visible`
  - `state`
  - `scope`
  - `attentionNeeded`
  - stable stage keys: `connection`, `queue_worker`, `core_data`, `priority_window`, `extended_surfaces`, `attention`
- Each stage now carries only compact semantics and evidence:
  - `state`
  - `percent`
  - stable `code`
  - compact evidence such as assigned account count, primary timezone, queue depth, leased partitions, retry/dead-letter counts, ready-through date, completed/total days, pending surface count/list, blocker count/codes, repair signal count/action kinds
- Added pure server/client-safe derivation in `lib/meta/integration-summary.ts` and used it from the Meta status route.

## 5. Client Consumption Changes
- `lib/meta/integration-progress.ts` now consumes `status.integrationSummary` first.
- Safe rollout fallback remains: if the route summary is absent, the client derives the same contract through `buildMetaIntegrationSummary(status)` instead of re-composing English UI truth from scattered raw fields.
- The Meta card progress renderer now maps compact summary codes into localized card copy instead of depending on raw nested route fields.
- The Integrations page now threads the current language into the Meta card progress block.
- The card keeps the existing sync pill, existing sync notice, disconnected/no-assignment hiding behavior, and blocked/paused/stale/action_required overrides.

## 6. Localization Changes
- Removed the English-only Meta card progress block behavior.
- Localized Meta stage titles, labels, details, and evidence in both `en` and `tr`.
- Kept the route contract language-neutral by sending codes plus compact evidence only.
- Reused existing Meta wording patterns where practical for paused, stale, and attention states via existing Meta UI helpers.
- Made the context honest on the card:
  - default Integrations page fetch renders `recent_window`
  - selected range renders `selected_range`
  - current-day requests render `current_day`
  - disconnected / no assignment resolves to `not_applicable`

## 7. Test Commands Run
- `npm test -- lib/meta/page-readiness.test.ts lib/meta/ui-status.test.ts lib/meta/ui.test.ts lib/meta/status-operations.test.ts lib/sync/sync-status-pill.test.ts lib/meta/integration-progress.test.ts components/integrations/integrations-card.test.tsx lib/meta/integration-summary.test.ts app/api/meta/status/route.test.ts`

## 8. Test Results
- Passed: `9` test files
- Passed: `71` tests
- Added focused contract coverage in `lib/meta/integration-summary.test.ts`
- Updated `lib/meta/integration-progress.test.ts` to prove summary-first behavior and EN/TR localization
- Updated `components/integrations/integrations-card.test.tsx` to validate English and Turkish card rendering
- Added a narrow `/api/meta/status` shaping assertion for `integrationSummary`

## 9. Remaining Risks
- The compact summary is currently adopted by the Meta integrations card path, but other compact Meta UI consumers still read raw status fields directly.
- `integrationSummary.scope` is intentionally compact; deeper consumers that need more than `recent_window | selected_range | current_day | not_applicable` still need raw route fields for finer truth-mode nuance.
- Unknown future blocker or repair codes fall back to underscore-expanded labels on the client until explicit localization is added.

## 10. Recommended Next Phase
P3: converge remaining Meta UI consumers on the compact summary contract.
