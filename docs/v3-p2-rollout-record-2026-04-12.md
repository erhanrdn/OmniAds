# V3-P2 Rollout Record

Date: `2026-04-12`
Status: `local_only_pending_deploy`
Baseline live SHA: `fe243d32cf61cac68b68ebed7a2c1da0c8e9552c`

Scope:
- Added `requiredInputs` to commercial truth coverage.
- Added read-only `bootstrapSuggestions` to the commercial truth snapshot.
- Surfaced benchmark checklist, missing truth, calibration bootstrap, and top-of-surface ceiling banners.

Verification:
- `npx tsc --noEmit`
- `npx vitest run lib/business-commercial.test.ts app/api/business-commercial-settings/route.test.ts components/decision-trust/DecisionAuthorityPanel.test.tsx`
- `npm test`

Observed benchmark truth state:
- Grandmix: blocking truth missing, calibration profiles `0`
- IwaStore: blocking truth missing, calibration profiles `0`
- TheSwaf: blocking truth missing, calibration profiles `0`

Blockers:
- Operator-grade capture flow was not executed from this session.
- Commercial truth remains blocker-first until real business inputs are captured and deployed.
