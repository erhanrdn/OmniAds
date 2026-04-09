import {
  enqueueGoogleAdsScheduledWork,
  refreshGoogleAdsSyncStateForBusiness,
  syncGoogleAdsRange,
} from "@/lib/sync/google-ads-sync";
import {
  enqueueMetaScheduledWork,
  recoverMetaD1FinalizePartitions,
  refreshMetaSyncStateForBusiness,
  syncMetaRepairRange,
} from "@/lib/sync/meta-sync";
import * as metaWarehouse from "@/lib/meta/warehouse";
import * as googleAdsWarehouse from "@/lib/google-ads/warehouse";
import { getDb } from "@/lib/db";
import { getDbSchemaReadiness } from "@/lib/db-schema-readiness";
import { getProviderPlatformPreviousDate } from "@/lib/provider-platform-date";
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

function enumerateUtcDays(startDate: string, endDate: string) {
  const dates: string[] = [];
  let cursor = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function buildIntegritySignature(
  incidents: Array<{ providerAccountId: string; date: string }>,
) {
  const normalized = Array.from(
    new Set(
      incidents.map(
        (incident) => `${incident.providerAccountId}:${incident.date}`,
      ),
    ),
  ).sort();
  return normalized.length > 0 ? normalized.join("|") : null;
}

async function countRecentRepairAttempts(input: {
  businessId: string;
  provider: "meta" | "google_ads";
  integritySignature: string | null;
}) {
  if (!input.integritySignature) return 0;
  const readiness = await getDbSchemaReadiness({
    tables: ["admin_audit_logs"],
  }).catch(() => null);
  if (!readiness?.ready) {
    return 0;
  }
  const sql = getDb();
  const rows = await sql`
    SELECT COUNT(*)::int AS count
    FROM admin_audit_logs
    WHERE action = 'sync.recovery'
      AND target_type = 'business'
      AND target_id = ${input.businessId}
      AND created_at >= now() - interval '24 hours'
      AND COALESCE(meta ->> 'provider', '') = ${input.provider}
      AND COALESCE(meta ->> 'requestedAction', '') = ANY(${[
        "repair_cycle",
        "repair_integrity_windows",
      ]}::text[])
      AND COALESCE(meta ->> 'outcome', '') = 'completed'
      AND COALESCE(
        meta -> 'result' -> 'repair' -> 'meta' ->> 'integritySignature',
        ''
      ) = ${input.integritySignature}
  ` as Array<{ count: number | string }>;
  return Number(rows[0]?.count ?? 0);
}

async function buildGoogleAdvisorRecentGapRepairs(input: {
  businessId: string;
}) {
  const advisorWindowEnd = await getProviderPlatformPreviousDate({
    provider: "google",
    businessId: input.businessId,
  }).catch(() => addUtcDays(new Date().toISOString().slice(0, 10), -1));
  const advisorWindowStart = addUtcDays(advisorWindowEnd, -89);
  const scopes = ["search_term_daily", "product_daily"] as const;

  const repairs = await Promise.all(
    scopes.map(async (scope) => {
      const coveredDates = new Set(
        await googleAdsWarehouse
          .getGoogleAdsCoveredDates({
            scope,
            businessId: input.businessId,
            providerAccountId: null,
            startDate: advisorWindowStart,
            endDate: advisorWindowEnd,
          })
          .catch(() => []),
      );
      const missingDates = enumerateUtcDays(
        advisorWindowStart,
        advisorWindowEnd,
      ).filter((date) => !coveredDates.has(date));
      return {
        scope,
        missingDates,
        ranges: buildContiguousDateRanges(missingDates),
      };
    }),
  );

  return {
    advisorWindowStart,
    advisorWindowEnd,
    repairs: repairs.filter((entry) => entry.ranges.length > 0),
  };
}

export async function runGoogleAdsRepairCycle(
  businessId: string,
  options?: ProviderRepairCycleOptions
) {
  const enqueueScheduledWork = options?.enqueueScheduledWork ?? true;
  const queueWarehouseRepairs = options?.queueWarehouseRepairs ?? true;
  const cleanup = await googleAdsWarehouse
    .cleanupGoogleAdsPartitionOrchestration({ businessId })
    .catch(() => null);
  const replayedDeadLetters = await googleAdsWarehouse
    .replayGoogleAdsDeadLetterPartitions({ businessId })
    .catch(() => null);
  const replayedPoisoned = await googleAdsWarehouse
    .forceReplayGoogleAdsPoisonedPartitions({ businessId })
    .catch(() => null);
  const integrityEndDate = new Date().toISOString().slice(0, 10);
  const integrityStartDate = addUtcDays(integrityEndDate, -45);
  const integrityIncidentsBefore = await googleAdsWarehouse
    .getGoogleAdsWarehouseIntegrityIncidents({
      businessId,
      startDate: integrityStartDate,
      endDate: integrityEndDate,
    })
    .catch(() => []);
  const integrityRepairRanges = buildContiguousDateRanges(
    integrityIncidentsBefore
      .filter((incident) => incident.repairRecommended)
      .map((incident) => incident.date),
  );
  const advisorRecentGapRepairs = await buildGoogleAdvisorRecentGapRepairs({
    businessId,
  }).catch(() => ({
    advisorWindowStart: integrityStartDate,
    advisorWindowEnd: integrityEndDate,
    repairs: [],
  }));
  const queuedWarehouseRepairs = queueWarehouseRepairs
    ? await Promise.all(
        integrityRepairRanges.map((range) =>
          syncGoogleAdsRange({
            businessId,
            startDate: range.startDate,
            endDate: range.endDate,
            syncType: "repair_window",
            triggerSource:
              range.startDate === range.endDate
                ? "repair_recent_day"
                : "priority_window",
            scopes: ["account_daily", "campaign_daily"],
          }).catch(() => null),
        ),
      )
    : [];
  const queuedRecentGapRepairs = queueWarehouseRepairs
    ? await Promise.all(
        advisorRecentGapRepairs.repairs.flatMap((repair) =>
          repair.ranges.map((range) =>
            syncGoogleAdsRange({
              businessId,
              startDate: range.startDate,
              endDate: range.endDate,
              syncType: "repair_window",
              triggerSource:
                range.startDate === range.endDate
                  ? `repair_recent_day:${repair.scope}`
                  : `repair_recent_window:${repair.scope}`,
              scopes: [repair.scope],
            }).catch(() => null),
          ),
        ),
      )
    : [];
  await refreshGoogleAdsSyncStateForBusiness({
    businessId,
    scopes: ["account_daily", "campaign_daily", "search_term_daily", "product_daily"],
  }).catch(() => null);
  const integrityIncidentsAfter = await googleAdsWarehouse
    .getGoogleAdsWarehouseIntegrityIncidents({
      businessId,
      startDate: integrityStartDate,
      endDate: integrityEndDate,
    })
    .catch(() => []);
  const integritySignature = buildIntegritySignature(
    integrityIncidentsAfter
      .filter((incident) => incident.repairRecommended)
      .map((incident) => ({
      providerAccountId: incident.providerAccountId,
      date: incident.date,
    })),
  );
  const previousIntegrityAttempts = await countRecentRepairAttempts({
    businessId,
    provider: "google_ads",
    integritySignature,
  }).catch(() => 0);
  const integrityAttemptCount =
    integrityIncidentsAfter.length > 0 ? previousIntegrityAttempts + 1 : 0;
  const persistentIntegrityMismatch =
    integrityIncidentsAfter.length > 0 && previousIntegrityAttempts >= 1;
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
    (checkpointHealth?.checkpointFailures ?? 0) > 0 ||
    advisorRecentGapRepairs.repairs.length > 0 ||
    persistentIntegrityMismatch;

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
    persistentIntegrityMismatch
      ? buildBlockingReason(
          "integrity_mismatch_persistent",
          `${integrityIncidentsAfter.length} Google Ads integrity incident(s) remained unchanged after ${integrityAttemptCount} repair attempts.`,
          { repairable: false }
        )
      : null,
    advisorRecentGapRepairs.repairs.length > 0
      ? buildBlockingReason(
          "missing_recent_required_surfaces",
          `Google Ads advisor is still missing recent 90-day coverage for ${advisorRecentGapRepairs.repairs
            .map((entry) => entry.scope)
            .join(", ")}.`,
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
    buildRepairableAction(
      "repair_integrity_windows",
      "Repair Google Ads account/campaign integrity windows.",
      { available: integrityRepairRanges.length > 0 }
    ),
    buildRepairableAction(
      "repair_recent_required_surfaces",
      "Repair recent 90-day Google Ads advisor surfaces.",
      { available: advisorRecentGapRepairs.repairs.length > 0 }
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
        integrityIncidentCount: integrityIncidentsBefore.length,
        integrityRepairRanges,
        queuedWarehouseRepairs: queuedWarehouseRepairs.filter(Boolean).length,
        advisorWindowStart: advisorRecentGapRepairs.advisorWindowStart,
        advisorWindowEnd: advisorRecentGapRepairs.advisorWindowEnd,
        recentGapRepairScopes: advisorRecentGapRepairs.repairs.map((entry) => ({
          scope: entry.scope,
          missingDates: entry.missingDates,
          ranges: entry.ranges,
        })),
        queuedRecentGapRepairs: queuedRecentGapRepairs.filter(Boolean).length,
        remainingIntegrityIncidentCount: integrityIncidentsAfter.length,
        integritySignature,
        integrityAttemptCount,
        staleCheckpointCount: cleanup?.staleRunCount ?? 0,
        poisonCandidateCount: cleanup?.poisonCandidateCount ?? 0,
        checkpointRecoveryQueuedCount:
          (cleanup?.stalePartitionCount ?? 0) +
          (replayedPoisoned?.changedCount ?? 0),
        checkpointBlockedCount:
          (cleanup?.poisonCandidateCount ?? 0) > 0 ||
          (checkpointHealth?.checkpointFailures ?? 0) > 0
            ? 1
            : 0,
        remainingMismatchDates: Array.from(
          new Set(integrityIncidentsAfter.map((incident) => incident.date)),
        ).sort(),
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
  const d1Recovery = await recoverMetaD1FinalizePartitions({
    businessId,
  }).catch(() => null);
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
  await refreshMetaSyncStateForBusiness({ businessId }).catch(() => null);
  const canonicalDriftIncidents = await metaWarehouse
    .getMetaCanonicalDriftIncidents({
      businessId,
      sinceHours: 24,
    })
    .catch(() => []);
  const repeatedCanonicalDriftIncidents = canonicalDriftIncidents.filter(
    (incident) => incident.occurrenceCount >= 2,
  );
  const integritySignature = buildIntegritySignature(
    integrityIncidents
      .filter((incident) => incident.repairRecommended)
      .map((incident) => ({
      providerAccountId: incident.providerAccountId,
      date: incident.date,
    })),
  );
  const previousIntegrityAttempts = await countRecentRepairAttempts({
    businessId,
    provider: "meta",
    integritySignature,
  }).catch(() => 0);
  const persistentIntegrityMismatch =
    integrityIncidents.length > 0 && previousIntegrityAttempts >= 1;
  const integrityAttemptCount =
    repeatedCanonicalDriftIncidents.length > 0
      ? Math.max(
          ...repeatedCanonicalDriftIncidents.map(
            (incident) => incident.occurrenceCount,
          ),
        )
      : integrityIncidents.length > 0
        ? previousIntegrityAttempts + 1
        : 0;
  const enqueueResult = enqueueScheduledWork
    ? await enqueueMetaScheduledWork(businessId)
    : null;
  const blocked =
    cleanupError != null ||
    (replayedDeadLetters?.manualTruthDefectCount ?? 0) > 0 ||
    repeatedCanonicalDriftIncidents.length > 0 ||
    persistentIntegrityMismatch ||
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
    (replayedDeadLetters?.manualTruthDefectCount ?? 0) > 0
      ? buildBlockingReason(
          "manual_truth_defect",
          `${replayedDeadLetters?.manualTruthDefectCount ?? 0} Meta partition(s) require manual truth repair after finalized validation failures.`,
          { repairable: false }
        )
      : null,
    repeatedCanonicalDriftIncidents.length > 0
      ? buildBlockingReason(
          "manual_truth_defect",
          `${repeatedCanonicalDriftIncidents.length} Meta canonical drift incident(s) repeated with the same finalized totals within 24 hours.`,
          { repairable: false }
        )
      : null,
    persistentIntegrityMismatch
      ? buildBlockingReason(
          "integrity_mismatch_persistent",
          `${integrityIncidents.length} Meta integrity incident(s) remained unchanged after ${integrityAttemptCount} repair attempts.`,
          { repairable: false }
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
        integritySignature,
        integrityAttemptCount,
        integrityRepairRanges: repairRanges,
        queuedWarehouseRepairs: queuedWarehouseRepairs.filter(Boolean).length,
        manualTruthDefectCount: replayedDeadLetters?.manualTruthDefectCount ?? 0,
        manualTruthDefectPartitions:
          replayedDeadLetters?.manualTruthDefectPartitions ?? [],
        canonicalDriftIncidents,
        canonicalDriftIncidentCount: canonicalDriftIncidents.length,
        canonicalDriftBlockedCount: 0,
        d1FinalizeRecoveryQueued: Boolean(
          d1Recovery?.d1FinalizeRecoveryQueued,
        ),
        d1FinalizeRecovery: d1Recovery,
        d1FinalizeRecoveredCount:
          d1Recovery?.reclaimedPartitionIds?.length ?? 0,
        d1FinalizeForceReclaimedCount:
          d1Recovery?.reclaimedPartitionIds?.length ?? 0,
        enqueueScheduledWork,
      },
    } satisfies ProviderAutoHealResult,
  };
}
