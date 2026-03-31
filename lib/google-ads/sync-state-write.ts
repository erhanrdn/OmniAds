import type { GoogleAdsSyncStateRecord } from "@/lib/google-ads/warehouse-types";

export function mergeGoogleAdsSyncStateWrite(input: {
  existing: GoogleAdsSyncStateRecord | null;
  next: GoogleAdsSyncStateRecord;
}): GoogleAdsSyncStateRecord {
  const { existing, next } = input;
  if (!existing) return next;

  const wouldEraseKnownCoverage = next.completedDays === 0 && existing.completedDays > 0;
  if (!wouldEraseKnownCoverage) {
    return next;
  }

  return {
    ...next,
    completedDays: existing.completedDays,
    readyThroughDate: existing.readyThroughDate ?? next.readyThroughDate ?? null,
    lastSuccessfulPartitionDate:
      existing.lastSuccessfulPartitionDate ?? next.lastSuccessfulPartitionDate ?? null,
    latestSuccessfulSyncAt: existing.latestSuccessfulSyncAt ?? next.latestSuccessfulSyncAt ?? null,
  };
}
