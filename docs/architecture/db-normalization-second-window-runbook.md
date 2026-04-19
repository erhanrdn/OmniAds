# DB Normalization Second Window Runbook

Purpose: historical record of the legacy-core removal window.

Status: complete.

Tables removed in the completed second window:
- `integrations`
- `provider_account_assignments`
- `provider_account_snapshots`

## Historical notes

- The window completed after stabilization held clean for at least `72 hours` and `3` normal deploy cycles.
- `scripts/db-normalization-audit.ts` reported `tablesWithRefGaps = 0` before and after removal.
- The production backup/export and drop dependencies now live only in the archived deploy and workflow history.
- The manual preflight artifact path for the completed run was `/tmp/adsecute-db-normalization-second-window-manual/463aa4b69cb5708c3a6d9bc3d73246a47477023c/preflight`.

## Archived command set

The exact command sequence used during the window is preserved in prior operator artifacts and workflow history. No further action is required for the live repository state.
