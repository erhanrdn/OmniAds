import type { GoogleAdsSyncStateRecord } from "@/lib/google-ads/warehouse-types";

export function mergeGoogleAdsSyncStateWrite(input: {
  existing: GoogleAdsSyncStateRecord | null;
  next: GoogleAdsSyncStateRecord;
}): GoogleAdsSyncStateRecord {
  const { existing, next } = input;
  if (!existing) return next;

  const wouldEraseKnownCoverage = next.completedDays === 0 && existing.completedDays > 0;
  return {
    ...next,
    completedDays: wouldEraseKnownCoverage ? existing.completedDays : next.completedDays,
    readyThroughDate: wouldEraseKnownCoverage
      ? existing.readyThroughDate ?? next.readyThroughDate ?? null
      : next.readyThroughDate,
    lastSuccessfulPartitionDate: wouldEraseKnownCoverage
      ? existing.lastSuccessfulPartitionDate ?? next.lastSuccessfulPartitionDate ?? null
      : next.lastSuccessfulPartitionDate,
    // Current background activity should mirror active partition truth, not
    // keep stale terminal-partition timestamps alive forever.
    latestBackgroundActivityAt: next.latestBackgroundActivityAt ?? null,
    // Successful sync time follows warehouse coverage truth. Only preserve the
    // existing value when a no-op refresh temporarily erases known coverage.
    latestSuccessfulSyncAt:
      wouldEraseKnownCoverage && !next.latestSuccessfulSyncAt
        ? existing.latestSuccessfulSyncAt ?? null
        : next.latestSuccessfulSyncAt ?? null,
  };
}
