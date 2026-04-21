# Creative Executor Report

## Files Changed

- `lib/creative-decision-os.ts`
- `lib/creative-decision-os-source.ts`
- `app/api/creatives/decision-os/route.ts`
- `lib/creative-decision-os.test.ts`
- `app/api/creatives/decision-os/route.test.ts`
- `lib/operator-decision-provenance.ts`
- `lib/command-center.test.ts`

## Behavior Changed

- Separated Creative reporting dates from decision timing.
- `startDate` / `endDate` now behave as reporting dates in the Creative route/source.
- Added `analyticsStartDate` / `analyticsEndDate` / `decisionAsOf` handling in the Creative route.
- Creative decision context now resolves from the analytics window and `decisionAsOf`, while historical analysis uses the reporting window.
- Primary creative decisions, family grouping, and queue segmentation no longer depend on the reporting range.
- Creative action-bearing rows now carry per-row provenance plus stable `evidenceHash` and `actionFingerprint`.
- The Creative provenance payload is derived from stable decision evidence and the primary decision window, not selected reporting dates.

## Tests

- `npx vitest run lib/creative-decision-os.test.ts app/api/creatives/decision-os/route.test.ts`

## Notes

- I did not change the shared decision-provenance contract shape beyond the minimal cast fix needed for hashing.
- Broader repository typecheck failures exist outside this slice and were not part of the Creative executor work.
