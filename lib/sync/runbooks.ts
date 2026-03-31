export interface SyncRunbookDefinition {
  key: string;
  title: string;
  summary: string;
}

export const SYNC_RUNBOOKS: Record<string, SyncRunbookDefinition> = {
  "google_ads:dead_letter_recovery": {
    key: "google_ads:dead_letter_recovery",
    title: "Google Ads Dead Letter Recovery",
    summary: "Review dead-letter partitions, replay safe scopes, then confirm queue drains.",
  },
  "google_ads:checkpoint_stall": {
    key: "google_ads:checkpoint_stall",
    title: "Google Ads Checkpoint Stall",
    summary: "Inspect checkpoint lag, worker freshness, and replay only if progress is truly stale.",
  },
  "google_ads:stale_reclaim": {
    key: "google_ads:stale_reclaim",
    title: "Google Ads Stale Reclaim",
    summary: "Validate reclaim reason, confirm no active lease, then allow cleanup or replay.",
  },
  "google_ads:active_lease_recovery_skip": {
    key: "google_ads:active_lease_recovery_skip",
    title: "Google Ads Active-Lease Recovery Skip",
    summary: "Recovery was skipped because live ownership still existed; verify whether the worker resumes.",
  },
  "google_ads:lease_conflict": {
    key: "google_ads:lease_conflict",
    title: "Google Ads Lease Conflict",
    summary: "A worker lost ownership during processing; inspect reclaim pressure and duplicate execution risk.",
  },
  "google_ads:worker_recovery": {
    key: "google_ads:worker_recovery",
    title: "Google Ads Worker Recovery",
    summary: "Worker heartbeat is missing while work is leased; verify worker availability and reclaim safety.",
  },
  "google_ads:worker_backlog": {
    key: "google_ads:worker_backlog",
    title: "Google Ads Queue Waiting Worker",
    summary: "Queued work exists without active leasing; verify worker assignment and queue pickup.",
  },
  "meta:dead_letter_recovery": {
    key: "meta:dead_letter_recovery",
    title: "Meta Dead Letter Recovery",
    summary: "Review dead-letter partitions, replay safe scopes, and confirm no active lease is bypassed.",
  },
  "meta:checkpoint_stall": {
    key: "meta:checkpoint_stall",
    title: "Meta Checkpoint Stall",
    summary: "Inspect checkpoint lag and worker progress before forcing replay or cleanup.",
  },
  "meta:stale_reclaim": {
    key: "meta:stale_reclaim",
    title: "Meta Stale Reclaim",
    summary: "Confirm expired ownership and stale progress before reclaiming or replaying work.",
  },
  "meta:active_lease_recovery_skip": {
    key: "meta:active_lease_recovery_skip",
    title: "Meta Active-Lease Recovery Skip",
    summary: "Recovery was skipped because Meta work still had an active owner lease.",
  },
  "meta:stale_run": {
    key: "meta:stale_run",
    title: "Meta Stale Run",
    summary: "A Meta run auto-closed as stale; verify worker health and repeated reclaim conditions.",
  },
  "meta:worker_recovery": {
    key: "meta:worker_recovery",
    title: "Meta Worker Recovery",
    summary: "Worker heartbeat is missing while Meta partitions remain leased.",
  },
  "meta:worker_backlog": {
    key: "meta:worker_backlog",
    title: "Meta Queue Waiting Worker",
    summary: "Meta queue has backlog without active leasing; inspect worker pickup and queue state.",
  },
  "meta:stale_lease": {
    key: "meta:stale_lease",
    title: "Meta Stale Lease",
    summary: "Leased Meta partitions appear stuck; verify reclaim criteria before intervention.",
  },
};

export function getSyncRunbook(key: string | null | undefined) {
  if (!key) return null;
  return SYNC_RUNBOOKS[key] ?? null;
}
