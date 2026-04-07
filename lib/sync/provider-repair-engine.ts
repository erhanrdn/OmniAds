import { enqueueGoogleAdsScheduledWork } from "@/lib/sync/google-ads-sync";
import { enqueueMetaScheduledWork, syncMetaRepairRange } from "@/lib/sync/meta-sync";
import * as metaWarehouse from "@/lib/meta/warehouse";
import * as googleAdsWarehouse from "@/lib/google-ads/warehouse";
import {
  buildBlockingReason,
  buildRepairableAction,
  compactBlockingReasons,
  compactRepairableActions,
  type ProviderAutoHealResult,
} from "@/lib/sync/provider-status-truth";

export interface ProviderRepairCycleOptions {
  enqueueScheduledWork?: boolean;
  metaDeadLetterSources?: string[] | null;
  queueWarehouseRepairs?: boolean;
}

const GRANDMIX_BUSINESS_ID = "5dbc7147-f051-4681-a4d6-20617170074f";
const GRANDMIX_MARCH_SUSPICIOUS_DATES = [
  "2026-03-01",
  "2026-03-02",
  "2026-03-03",
  "2026-03-04",
  "2026-03-05",
  "2026-03-06",
  "2026-03-07",
  "2026-03-08",
  "2026-03-09",
  "2026-03-10",
  "2026-03-11",
  "2026-03-13",
  "2026-03-18",
  "2026-03-23",
];

function buildContiguousDateRanges(dates: string[]) {
  const normalized = Array.from(new Set(dates)).sort();
  if (normalized.length === 0) return [] as Array<{ startDate: string; endDate: string }>;
  const ranges: Array<{ startDate: string; endDate: string }> = [];
  let startDate = normalized[0]!;
  let previousDate = normalized[0]!;
  for (const currentDate of normalized.slice(1)) {
    const previous = new Date(`${previousDate}T00:00:00Z`);
    previous.setUTCDate(previous.getUTCDate() + 1);
    const nextExpected = previous.toISOString().slice(0, 10);
    if (currentDate === nextExpected) {
      previousDate = currentDate;
      continue;
    }
    ranges.push({ startDate, endDate: previousDate });
    startDate = currentDate;
    previousDate = currentDate;
  }
  ranges.push({ startDate, endDate: previousDate });
  return ranges;
}

function addUtcDays(date: string, delta: number) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + delta);
  return next.toISOString().slice(0, 10);
}

export async function runGoogleAdsRepairCycle(
  businessId: string,
  options?: ProviderRepairCycleOptions
) {
  const enqueueScheduledWork = options?.enqueueScheduledWork ?? true;
  const cleanup = await googleAdsWarehouse
    .cleanupGoogleAdsPartitionOrchestration({ businessId })
    .catch(() => null);
  const replayedDeadLetters = await googleAdsWarehouse
    .replayGoogleAdsDeadLetterPartitions({ businessId })
    .catch(() => null);
  const replayedPoisoned = await googleAdsWarehouse
    .forceReplayGoogleAdsPoisonedPartitions({ businessId })
    .catch(() => null);
  const [queueHealthBeforeEnqueue, checkpointHealth] = await Promise.all([
    googleAdsWarehouse.getGoogleAdsQueueHealth({ businessId }).catch(() => null),
    googleAdsWarehouse
      .getGoogleAdsCheckpointHealth({ businessId, providerAccountId: null })
      .catch(() => null),
  ]);
  const enqueueResult = enqueueScheduledWork
    ? await enqueueGoogleAdsScheduledWork(businessId)
    : null;
  const blocked =
    ((queueHealthBeforeEnqueue?.deadLetterPartitions ?? 0) > 0 &&
      (replayedDeadLetters?.changedCount ?? 0) + (replayedPoisoned?.changedCount ?? 0) <= 0) ||
    (checkpointHealth?.checkpointFailures ?? 0) > 0;

  const blockingReasons = compactBlockingReasons([
    (queueHealthBeforeEnqueue?.deadLetterPartitions ?? 0) > 0 &&
    (replayedDeadLetters?.changedCount ?? 0) + (replayedPoisoned?.changedCount ?? 0) <= 0
      ? buildBlockingReason(
          "required_dead_letter_partitions",
          `${queueHealthBeforeEnqueue?.deadLetterPartitions ?? 0} Google Ads partition(s) remain dead-lettered after repair.`,
          { repairable: true }
        )
      : null,
    (checkpointHealth?.checkpointFailures ?? 0) > 0
      ? buildBlockingReason(
          "checkpoint_failures",
          `${checkpointHealth?.checkpointFailures ?? 0} Google Ads checkpoint failure(s) need replay or retry.`,
          { repairable: true }
        )
      : null,
  ]);
  const repairableActions = compactRepairableActions([
    buildRepairableAction(
      "replay_dead_letters",
      "Replay dead-lettered Google Ads partitions.",
      { available: (queueHealthBeforeEnqueue?.deadLetterPartitions ?? 0) > 0 }
    ),
    buildRepairableAction(
      "replay_poisoned_checkpoints",
      "Replay poisoned Google Ads checkpoints.",
      { available: (checkpointHealth?.checkpointFailures ?? 0) > 0 }
    ),
  ]);

  return {
    enqueueResult,
    repair: {
      reclaimed: cleanup?.stalePartitionCount ?? 0,
      replayed: (replayedDeadLetters?.changedCount ?? 0) + (replayedPoisoned?.changedCount ?? 0),
      requeued: Number((enqueueResult as { queuedCore?: number } | null)?.queuedCore ?? 0),
      blocked,
      blockingReasons,
      repairableActions,
      meta: {
        deadLetters: replayedDeadLetters,
        poisonedReplay: replayedPoisoned,
        enqueueScheduledWork,
      },
    } satisfies ProviderAutoHealResult,
  };
}

export async function runMetaRepairCycle(
  businessId: string,
  options?: ProviderRepairCycleOptions
) {
  const enqueueScheduledWork = options?.enqueueScheduledWork ?? true;
  const queueWarehouseRepairs = options?.queueWarehouseRepairs ?? true;
  let cleanup: Awaited<ReturnType<typeof metaWarehouse.cleanupMetaPartitionOrchestration>> | null = null;
  let cleanupError: string | null = null;
  try {
    cleanup = await metaWarehouse.cleanupMetaPartitionOrchestration({ businessId });
  } catch (error) {
    cleanupError = error instanceof Error ? error.message : String(error);
  }
  const replayedDeadLetters = await metaWarehouse
    .replayMetaDeadLetterPartitions({
      businessId,
      sources: options?.metaDeadLetterSources ?? null,
    })
    .catch(() => null);
  const requeuedFailed = await metaWarehouse
    .requeueMetaRetryableFailedPartitions({ businessId })
    .catch(() => []);
  const queueHealthBeforeEnqueue = await metaWarehouse.getMetaQueueHealth({ businessId }).catch(() => null);
  const integrityEndDate = new Date().toISOString().slice(0, 10);
  const integrityStartDate = addUtcDays(integrityEndDate, -45);
  const integrityIncidents = await metaWarehouse
    .getMetaWarehouseIntegrityIncidents({
      businessId,
      startDate: integrityStartDate,
      endDate: integrityEndDate,
      persistReconciliationEvents: true,
    })
    .catch(() => []);
  const repairDates = integrityIncidents
    .filter((incident) => incident.repairRecommended)
    .map((incident) => incident.date);
  if (businessId === GRANDMIX_BUSINESS_ID) {
    repairDates.push(...GRANDMIX_MARCH_SUSPICIOUS_DATES);
  }
  const repairRanges = buildContiguousDateRanges(repairDates);
  const queuedWarehouseRepairs = queueWarehouseRepairs
    ? await Promise.all(
        repairRanges.map((range) =>
          syncMetaRepairRange({
            businessId,
            startDate: range.startDate,
            endDate: range.endDate,
            triggerSource:
              range.startDate === range.endDate ? "repair_recent_day" : "priority_window",
          }).catch(() => null),
        ),
      )
    : [];
  const enqueueResult = enqueueScheduledWork
    ? await enqueueMetaScheduledWork(businessId)
    : null;
  const blocked =
    cleanupError != null ||
    ((queueHealthBeforeEnqueue?.deadLetterPartitions ?? 0) > 0 &&
      (replayedDeadLetters?.changedCount ?? 0) <= 0) ||
    ((queueHealthBeforeEnqueue?.retryableFailedPartitions ?? 0) > 0 && requeuedFailed.length <= 0);

  const blockingReasons = compactBlockingReasons([
    cleanupError
      ? buildBlockingReason(
          "cleanup_error",
          `Meta stale cleanup failed before repair could reclaim stale work: ${cleanupError}`,
          { repairable: true }
        )
      : null,
    (queueHealthBeforeEnqueue?.deadLetterPartitions ?? 0) > 0 &&
    (replayedDeadLetters?.changedCount ?? 0) <= 0
      ? buildBlockingReason(
          "required_dead_letter_partitions",
          `${queueHealthBeforeEnqueue?.deadLetterPartitions ?? 0} Meta partition(s) remain dead-lettered after repair.`,
          { repairable: true }
        )
      : null,
    (queueHealthBeforeEnqueue?.retryableFailedPartitions ?? 0) > 0 && requeuedFailed.length <= 0
      ? buildBlockingReason(
          "retryable_failed_partitions",
          `${queueHealthBeforeEnqueue?.retryableFailedPartitions ?? 0} Meta failed partition(s) still need retry.`,
          { repairable: true }
        )
      : null,
  ]);
  const repairableActions = compactRepairableActions([
    buildRepairableAction(
      "replay_dead_letters",
      "Replay dead-lettered Meta partitions.",
      { available: (queueHealthBeforeEnqueue?.deadLetterPartitions ?? 0) > 0 }
    ),
    buildRepairableAction(
      "retry_failed_partitions",
      "Requeue retryable failed Meta partitions.",
      { available: (queueHealthBeforeEnqueue?.retryableFailedPartitions ?? 0) > 0 }
    ),
    buildRepairableAction(
      "repair_integrity_windows",
      "Queue authoritative repair windows for integrity incidents.",
      { available: repairRanges.length > 0 }
    ),
  ]);

  return {
    enqueueResult,
    repair: {
      reclaimed: cleanup?.stalePartitionCount ?? 0,
      replayed: replayedDeadLetters?.changedCount ?? 0,
      requeued: requeuedFailed.length,
      blocked,
      blockingReasons,
      repairableActions,
      meta: {
        cleanupSummary: cleanup,
        cleanupError,
        deadLetters: replayedDeadLetters,
        retryableFailed: requeuedFailed.length,
        integrityIncidentCount: integrityIncidents.length,
        integrityRepairRanges: repairRanges,
        queuedWarehouseRepairs: queuedWarehouseRepairs.filter(Boolean).length,
        enqueueScheduledWork,
      },
    } satisfies ProviderAutoHealResult,
  };
}
