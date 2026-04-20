import type { GoogleAdsSyncStateRecord } from "@/lib/google-ads/warehouse-types";

function pickNewestTimestamp(
  left: string | null | undefined,
  right: string | null | undefined,
) {
  if (!left) return right ?? null;
  if (!right) return left;
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  if (!Number.isFinite(leftMs)) return right;
  if (!Number.isFinite(rightMs)) return left;
  return leftMs >= rightMs ? left : right;
}

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
    latestBackgroundActivityAt: pickNewestTimestamp(
      existing.latestBackgroundActivityAt,
      next.latestBackgroundActivityAt,
    ),
    latestSuccessfulSyncAt: pickNewestTimestamp(
      existing.latestSuccessfulSyncAt,
      next.latestSuccessfulSyncAt,
    ),
  };
}
