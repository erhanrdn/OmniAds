import { enqueueGoogleAdsScheduledWork } from "@/lib/sync/google-ads-sync";
import { enqueueMetaScheduledWork } from "@/lib/sync/meta-sync";
import * as metaWarehouse from "@/lib/meta/warehouse";
import * as googleAdsWarehouse from "@/lib/google-ads/warehouse";
import {
  buildBlockingReason,
  buildRepairableAction,
  compactBlockingReasons,
  compactRepairableActions,
  type ProviderBlockingReason,
  type ProviderRepairableAction,
} from "@/lib/sync/provider-status-truth";

export interface ProviderRepairResult {
  reclaimed: number;
  replayed: number;
  requeued: number;
  blocked: boolean;
  blockingReasons: ProviderBlockingReason[];
  repairableActions: ProviderRepairableAction[];
  meta?: Record<string, unknown>;
}

export async function runGoogleAdsRepairCycle(businessId: string) {
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
  const enqueueResult = await enqueueGoogleAdsScheduledWork(businessId);
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
      },
    } satisfies ProviderRepairResult,
  };
}

export async function runMetaRepairCycle(businessId: string) {
  const cleanup = await metaWarehouse
    .cleanupMetaPartitionOrchestration({ businessId })
    .catch(() => null);
  const replayedDeadLetters = await metaWarehouse
    .replayMetaDeadLetterPartitions({ businessId })
    .catch(() => null);
  const requeuedFailed = await metaWarehouse
    .requeueMetaRetryableFailedPartitions({ businessId })
    .catch(() => []);
  const queueHealthBeforeEnqueue = await metaWarehouse.getMetaQueueHealth({ businessId }).catch(() => null);
  const enqueueResult = await enqueueMetaScheduledWork(businessId);
  const blocked =
    ((queueHealthBeforeEnqueue?.deadLetterPartitions ?? 0) > 0 &&
      (replayedDeadLetters?.changedCount ?? 0) <= 0) ||
    ((queueHealthBeforeEnqueue?.retryableFailedPartitions ?? 0) > 0 && requeuedFailed.length <= 0);

  const blockingReasons = compactBlockingReasons([
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
        deadLetters: replayedDeadLetters,
        retryableFailed: requeuedFailed.length,
      },
    } satisfies ProviderRepairResult,
  };
}
