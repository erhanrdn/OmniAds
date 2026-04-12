# V3-P1 Rollout Record

Date: `2026-04-12`
Status: `local_only_pending_deploy`
Baseline live SHA: `fe243d32cf61cac68b68ebed7a2c1da0c8e9552c`

Scope:
- Replaced legacy execution apply/rollback booleans with proof levels.
- Added release-authority carry-forward acceptance-gap reporting.
- Regenerated [docs/v3-01-release-authority.md](/Users/harmelek/Adsecute/docs/v3-01-release-authority.md).

Verification:
- `node --import tsx scripts/generate-release-authority-doc.ts`
- `node --import tsx scripts/verify-release-authority.ts --mode=preflight`
- `npx tsc --noEmit`
- `npx vitest run components/admin/release-authority-panel.test.tsx app/api/release-authority/route.test.ts components/command-center/CommandCenterExecutionSupportMatrix.test.tsx lib/release-authority/report.test.ts`

Accepted gaps:
- `command_center_execution_apply_rollback` remains `provider_validated`, not `live_canary_proven`.

Blockers:
- No exact-SHA deploy was executed from this session.
