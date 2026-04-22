# Phase 3.1 Workflow Auditor Report

## Files Changed
- `lib/command-center.ts`
- `lib/command-center-execution-service.ts`
- `lib/command-center.test.ts`
- `lib/command-center-execution-service.test.ts`

## Behavior
- Command Center actions now preserve upstream provenance when it is present and fall back to a deterministic local fingerprint only when provenance is absent.
- Selected reporting `startDate` / `endDate` stay in the reporting context; they no longer participate in primary action identity.
- Default queue selection now requires provenance-backed eligibility, so rows without provenance stay out of the queue budget.
- Execution preview/apply now refuses to take the provider-backed path when provenance is missing.
- Legacy/demo/snapshot-style rows that arrive without provenance remain manual-only and cannot become push eligible.

## Tests
- `npm test -- lib/command-center.test.ts lib/command-center-execution-service.test.ts`
- `npm test -- app/api/command-center/execution/route.test.ts app/api/command-center/execution/apply/route.test.ts app/api/command-center/execution/rollback/route.test.ts`
- `npm test -- app/api/command-center/actions/route.test.ts app/api/command-center/actions/batch/route.test.ts app/api/command-center/actions/note/route.test.ts`
- Result: 8 test files passed, 34 tests passed.
