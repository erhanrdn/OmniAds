# Phase 3.1 Meta Executor Report

## Files Changed
- `lib/meta/decision-os.ts`
- `lib/meta/decision-os-source.ts`
- `app/api/meta/decision-os/route.ts`
- `app/api/meta/recommendations/route.ts`
- `lib/meta/decision-os.test.ts`
- `app/api/meta/decision-os/route.test.ts`
- `app/api/meta/recommendations/route.test.ts`

## Behavior
- Separated Meta reporting range from the decision analysis window.
- `startDate`/`endDate` remain backward-compatible reporting dates.
- Added `analyticsStartDate`/`analyticsEndDate` and `decisionAsOf` handling in the Meta decision route/source.
- Kept Meta action identity stable across analytics-window changes by deriving provenance hashes from stable decision evidence and the primary source window, not selected UI dates.
- Attached provenance, `actionFingerprint`, and `evidenceHash` to Meta campaign, ad set, and geo action rows.
- Kept recommendation fallback behavior on the selected reporting range and non-authoritative when Decision OS is unavailable.

## Tests
- `./node_modules/.bin/vitest run lib/meta/decision-os.test.ts app/api/meta/decision-os/route.test.ts app/api/meta/recommendations/route.test.ts`
- Result: 3 test files passed, 19 tests passed.
