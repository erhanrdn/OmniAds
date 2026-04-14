import { formatMetaReadyThroughDate } from "@/lib/meta/ui";
import { getMetaSyncDescription } from "@/lib/meta/ui";
import type { MetaStatusResponse } from "@/lib/meta/status-types";

export type MetaIntegrationProgressStageState =
  | "ready"
  | "working"
  | "waiting"
  | "blocked";

export type MetaIntegrationProgressStageKey =
  | "connection"
  | "queue_worker"
  | "core_data"
  | "priority_window"
  | "extended_surfaces"
  | "attention";

export interface MetaIntegrationProgressStage {
  key: MetaIntegrationProgressStageKey;
  title: string;
  state: MetaIntegrationProgressStageState;
  label: string;
  detail: string;
  percent: number | null;
  evidence: string | null;
}

export interface MetaIntegrationProgressModel {
  stages: MetaIntegrationProgressStage[];
  attentionNeeded: boolean;
}

function clampPercent(value: number | null | undefined) {
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value ?? 0)));
}

function percentFromCounts(
  completed: number | null | undefined,
  total: number | null | undefined
) {
  if (!Number.isFinite(completed) || !Number.isFinite(total) || (total ?? 0) <= 0) {
    return null;
  }
  return clampPercent(((completed ?? 0) / (total ?? 1)) * 100);
}

function earliestDate(values: Array<string | null | undefined>) {
  return (
    values
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => left.localeCompare(right))[0] ?? null
  );
}

function minCount(values: Array<number | null | undefined>) {
  const numeric = values.filter((value): value is number => Number.isFinite(value));
  if (numeric.length === 0) return null;
  return Math.min(...numeric);
}

function buildEvidence(parts: Array<string | null | undefined>) {
  const rows = parts.filter((value): value is string => Boolean(value));
  return rows.length > 0 ? rows.join(" • ") : null;
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function humanizePendingSurface(scope: string) {
  switch (scope) {
    case "account_daily":
      return "summary";
    case "campaign_daily":
      return "campaigns";
    case "adset_daily":
      return "ad sets";
    case "ad_daily":
      return "ads";
    case "creative_daily":
      return "creatives";
    case "breakdowns":
      return "breakdowns";
    default:
      return scope.replace(/_/g, " ");
  }
}

function summarizePendingSurfaces(scopes: string[] | null | undefined) {
  const labels = Array.from(new Set((scopes ?? []).map((scope) => humanizePendingSurface(scope))));
  if (labels.length === 0) return null;
  const preview = labels.slice(0, 3).join(", ");
  return labels.length > 3 ? `Pending ${preview}, and more` : `Pending ${preview}`;
}

function summarizeRepairAction(kind: string) {
  switch (kind) {
    case "replay_dead_letters":
      return "Replay dead letters";
    case "requeue_failed":
      return "Retry failed partitions";
    case "retry_authoritative_refresh":
      return "Retry published truth";
    case "inspect_blocked_publication_mismatch":
      return "Review blocked published truth";
    case "inspect_stale_leases":
      return "Review stale leases";
    case "refresh_queue":
      return "Refresh queue";
    default:
      return kind.replace(/_/g, " ");
  }
}

function summarizeRepairableActions(status: MetaStatusResponse) {
  const actions = (status.operations?.repairableActions ?? [])
    .filter((action) => action.available)
    .map((action) => summarizeRepairAction(action.kind));
  if (actions.length === 0) return null;
  const preview = Array.from(new Set(actions)).slice(0, 2).join(", ");
  return `Recovery available: ${preview}`;
}

function summarizeStallFingerprint(fingerprint: string) {
  switch (fingerprint) {
    case "historical_starvation":
      return "Historical catch-up stalled";
    case "dead_letter_blocking_completion":
      return "Dead letter blocking completion";
    case "checkpoint_not_advancing":
      return "Checkpoint not advancing";
    case "activity_without_coverage_progress":
      return "Activity without new coverage";
    case "repair_loop_without_progress":
      return "Repair loop without progress";
    default:
      return fingerprint.replace(/_/g, " ");
  }
}

function summarizeStallFingerprints(status: MetaStatusResponse) {
  const fingerprints = (status.operations?.stallFingerprints ?? []).map((fingerprint) =>
    summarizeStallFingerprint(fingerprint)
  );
  if (fingerprints.length === 0) return null;
  return fingerprints.slice(0, 2).join(" • ");
}

function summarizeBlockingReasonCode(code: string) {
  switch (code) {
    case "required_dead_letter_partitions":
      return "Dead letter present";
    case "retryable_failed_partitions":
      return "Retry backlog";
    case "operations_worker_offline":
      return "Worker offline";
    case "operations_lease_denied":
      return "Lease waiting";
    case "operations_queue_backlogged":
      return "Queue backlogged";
    case "blocked_publication_mismatch":
      return "Published truth blocked";
    case "repair_required_authoritative_retry":
      return "Published truth needs retry";
    case "historical_verification_failed":
      return "Historical truth not ready";
    default:
      return code.replace(/_/g, " ");
  }
}

function summarizeBlockingReasons(status: MetaStatusResponse) {
  const reasons = status.operations?.blockingReasons ?? [];
  if (reasons.length === 0) return null;
  const preview = reasons
    .slice(0, 2)
    .map((reason) => summarizeBlockingReasonCode(reason.code))
    .join(" • ");
  return preview || null;
}

function getCurrentTopReason(status: MetaStatusResponse) {
  return (
    status.operations?.blockingReasons?.[0]?.detail ??
    status.coreReadiness?.reason ??
    status.extendedCompleteness?.reason ??
    status.pageReadiness?.reason ??
    null
  );
}

function getCoreReadyThroughDate(status: MetaStatusResponse) {
  return earliestDate([
    status.warehouse?.coverage?.selectedRange?.readyThroughDate ?? null,
    status.rangeCompletionBySurface?.account_daily?.readyThroughDate ?? null,
    status.rangeCompletionBySurface?.campaign_daily?.readyThroughDate ?? null,
    status.latestSync?.readyThroughDate ?? null,
  ]);
}

function getPriorityWindowMetrics(status: MetaStatusResponse) {
  if (status.priorityWindow) {
    return {
      kind: "priority" as const,
      completedDays: status.priorityWindow.completedDays,
      totalDays: status.priorityWindow.totalDays,
      percent: percentFromCounts(
        status.priorityWindow.completedDays,
        status.priorityWindow.totalDays
      ),
      readyThroughDate:
        status.selectedRangeTruth?.truthReady
          ? status.priorityWindow.endDate
          : status.warehouse?.coverage?.selectedRange?.readyThroughDate ??
            status.latestSync?.readyThroughDate ??
            null,
      active: status.priorityWindow.isActive,
    };
  }

  const account = status.rangeCompletionBySurface?.account_daily;
  const campaign = status.rangeCompletionBySurface?.campaign_daily;
  const totalDays = Math.max(account?.recentTotalDays ?? 0, campaign?.recentTotalDays ?? 0);
  const completedDays = minCount([
    account?.recentCompletedDays ?? 0,
    campaign?.recentCompletedDays ?? 0,
  ]) ?? 0;

  return {
    kind: "recent" as const,
    completedDays,
    totalDays,
    percent: percentFromCounts(completedDays, totalDays),
    readyThroughDate: earliestDate([
      account?.readyThroughDate ?? null,
      campaign?.readyThroughDate ?? null,
      status.latestSync?.readyThroughDate ?? null,
    ]),
    active:
      Boolean(status.latestSync?.status === "running") ||
      Boolean(status.latestSync?.status === "pending") ||
      (status.jobHealth?.leasedPartitions ?? 0) > 0,
  };
}

function getExtendedMetrics(status: MetaStatusResponse) {
  const creative = status.rangeCompletionBySurface?.creative_daily;
  const ad = status.rangeCompletionBySurface?.ad_daily;
  const recentTotal = Math.max(creative?.recentTotalDays ?? 0, ad?.recentTotalDays ?? 0);
  const recentCompleted =
    minCount([creative?.recentCompletedDays ?? 0, ad?.recentCompletedDays ?? 0]) ?? 0;
  const historicalTotal = Math.max(
    creative?.historicalTotalDays ?? 0,
    ad?.historicalTotalDays ?? 0
  );
  const historicalCompleted =
    minCount([
      creative?.historicalCompletedDays ?? 0,
      ad?.historicalCompletedDays ?? 0,
    ]) ?? 0;

  return {
    recentTotal,
    recentCompleted,
    recentPercent: percentFromCounts(recentCompleted, recentTotal),
    historicalTotal,
    historicalCompleted,
    historicalPercent: percentFromCounts(historicalCompleted, historicalTotal),
    readyThroughDate: earliestDate([
      creative?.readyThroughDate ?? null,
      ad?.readyThroughDate ?? null,
    ]),
  };
}

function buildConnectionStage(status: MetaStatusResponse): MetaIntegrationProgressStage {
  const assignedCount = status.assignedAccountIds?.length ?? 0;
  return {
    key: "connection",
    title: "Connection",
    state: "ready",
    label: "connected",
    detail:
      assignedCount > 1
        ? `${pluralize(assignedCount, "Meta account")} assigned to this workspace.`
        : "Meta account assigned to this workspace.",
    percent: null,
    evidence: status.primaryAccountTimezone
      ? `Primary timezone ${status.primaryAccountTimezone}`
      : null,
  };
}

function buildQueueStage(status: MetaStatusResponse): MetaIntegrationProgressStage {
  const queueDepth = status.jobHealth?.queueDepth ?? 0;
  const leasedPartitions = status.jobHealth?.leasedPartitions ?? 0;
  const retryableFailedPartitions = status.jobHealth?.retryableFailedPartitions ?? 0;
  const deadLetterPartitions = status.jobHealth?.deadLetterPartitions ?? 0;
  const operationsState = status.operations?.progressState ?? null;
  const hasQueuedWork =
    queueDepth > 0 ||
    leasedPartitions > 0 ||
    retryableFailedPartitions > 0 ||
    deadLetterPartitions > 0;

  const evidence = buildEvidence([
    queueDepth > 0 ? `Queue ${queueDepth}` : null,
    leasedPartitions > 0 ? `Leased ${leasedPartitions}` : null,
    retryableFailedPartitions > 0 ? `Retry ${retryableFailedPartitions}` : null,
    deadLetterPartitions > 0 ? `Dead ${deadLetterPartitions}` : null,
  ]);

  if (
    status.state === "action_required" ||
    status.state === "stale" ||
    operationsState === "blocked" ||
    deadLetterPartitions > 0
  ) {
    return {
      key: "queue_worker",
      title: "Queue / worker",
      state: "blocked",
      label: status.state === "stale" ? "progress stale" : "attention needed",
      detail:
        status.state === "stale"
          ? "Background progress cannot be verified right now."
          : "Queue health needs recovery before it can finish cleanly.",
      percent: null,
      evidence: buildEvidence([summarizeBlockingReasons(status), evidence]),
    };
  }

  if (
    status.state === "paused" ||
    operationsState === "partial_stuck" ||
    (queueDepth > 0 && leasedPartitions === 0)
  ) {
    return {
      key: "queue_worker",
      title: "Queue / worker",
      state: "waiting",
      label: "queue waiting",
      detail: "Queued Meta work is waiting for the worker to continue.",
      percent: null,
      evidence,
    };
  }

  if (
    leasedPartitions > 0 ||
    operationsState === "syncing" ||
    operationsState === "partial_progressing" ||
    status.latestSync?.status === "running" ||
    status.latestSync?.status === "pending" ||
    hasQueuedWork
  ) {
    return {
      key: "queue_worker",
      title: "Queue / worker",
      state: "working",
      label: "worker active",
      detail:
        queueDepth > 0
          ? "Meta sync is actively processing queued work."
          : "Background Meta work is active.",
      percent: null,
      evidence,
    };
  }

  return {
    key: "queue_worker",
    title: "Queue / worker",
    state: "ready",
    label: "queue clear",
    detail: "No queued Meta work is waiting right now.",
    percent: null,
    evidence: null,
  };
}

function buildCoreStage(status: MetaStatusResponse): MetaIntegrationProgressStage {
  const coreReadiness = status.coreReadiness;
  const readyThrough = formatMetaReadyThroughDate(getCoreReadyThroughDate(status), "en");
  const percent =
    coreReadiness && !coreReadiness.complete ? clampPercent(coreReadiness.percent) : null;

  if (
    coreReadiness?.state === "blocked" ||
    (status.state === "action_required" && !coreReadiness?.usable)
  ) {
    return {
      key: "core_data",
      title: "Core data",
      state: "blocked",
      label: "core blocked",
      detail:
        coreReadiness?.summary ??
        coreReadiness?.reason ??
        "Summary and campaign data are blocked for the current contract.",
      percent,
      evidence: readyThrough,
    };
  }

  if (coreReadiness?.usable) {
    return {
      key: "core_data",
      title: "Core data",
      state: "ready",
      label: "core ready",
      detail:
        coreReadiness.summary ??
        "Summary and campaign data are ready for the workspace.",
      percent: null,
      evidence: readyThrough,
    };
  }

  const waiting =
    status.state === "paused" ||
    status.operations?.progressState === "partial_stuck";

  return {
    key: "core_data",
    title: "Core data",
    state: waiting ? "waiting" : "working",
    label: waiting ? "core waiting" : "core preparing",
    detail:
      coreReadiness?.summary ??
      coreReadiness?.reason ??
      "Summary and campaign data are still preparing.",
    percent,
    evidence: readyThrough,
  };
}

function buildPriorityStage(status: MetaStatusResponse): MetaIntegrationProgressStage {
  const metrics = getPriorityWindowMetrics(status);
  const countEvidence =
    metrics.totalDays > 0
      ? `${metrics.completedDays}/${metrics.totalDays} days`
      : null;
  const readyThrough = formatMetaReadyThroughDate(metrics.readyThroughDate, "en");
  const evidence = buildEvidence([countEvidence, readyThrough]);
  const selectedRangeState = status.selectedRangeTruth?.verificationState ?? status.selectedRangeTruth?.state ?? null;
  const selectedRangeBlocked =
    selectedRangeState === "blocked" ||
    selectedRangeState === "failed" ||
    selectedRangeState === "repair_required";

  if (metrics.kind === "priority" && selectedRangeBlocked) {
    return {
      key: "priority_window",
      title: "Priority range / recent window",
      state: "blocked",
      label: "priority blocked",
      detail:
        getCurrentTopReason(status) ??
        "Published truth for the priority range still needs recovery.",
      percent: metrics.percent,
      evidence: buildEvidence([
        summarizeBlockingReasons(status),
        evidence,
      ]),
    };
  }

  const ready = metrics.totalDays > 0 && metrics.completedDays >= metrics.totalDays;
  if (ready) {
    return {
      key: "priority_window",
      title: "Priority range / recent window",
      state: "ready",
      label: metrics.kind === "priority" ? "priority ready" : "recent window ready",
      detail:
        metrics.kind === "priority"
          ? "Priority range data is ready."
          : "Recent summary and campaign days are ready.",
      percent: null,
      evidence,
    };
  }

  const waiting =
    status.state === "paused" ||
    status.operations?.progressState === "partial_stuck";

  return {
    key: "priority_window",
    title: "Priority range / recent window",
    state: waiting ? "waiting" : "working",
    label:
      metrics.kind === "priority"
        ? waiting
          ? "priority waiting"
          : "priority preparing"
        : waiting
          ? "recent window waiting"
          : "recent window preparing",
    detail:
      metrics.kind === "priority"
        ? "Priority dates are being prepared first."
        : "Recent summary and campaign days are being prepared first.",
    percent: metrics.percent,
    evidence,
  };
}

function buildExtendedStage(status: MetaStatusResponse): MetaIntegrationProgressStage {
  const extended = status.extendedCompleteness;
  const metrics = getExtendedMetrics(status);
  const pendingSurfaces = summarizePendingSurfaces(status.warehouse?.coverage?.pendingSurfaces);
  const readyThrough = formatMetaReadyThroughDate(metrics.readyThroughDate, "en");

  const recentLag = status.recentExtendedReady === false;
  const historicalLag = status.historicalExtendedReady === false;
  const percent =
    extended && !extended.complete && extended.percent != null
      ? clampPercent(extended.percent)
      : recentLag
        ? metrics.recentPercent
        : historicalLag
          ? metrics.historicalPercent
          : null;

  const evidence = buildEvidence([
    pendingSurfaces,
    readyThrough,
  ]);

  if (extended?.state === "blocked") {
    return {
      key: "extended_surfaces",
      title: "Extended surfaces",
      state: "blocked",
      label: "extended blocked",
      detail:
        extended.summary ??
        extended.reason ??
        "Some extended Meta surfaces are blocked for this contract.",
      percent,
      evidence,
    };
  }

  if (
    extended?.complete &&
    status.recentExtendedReady !== false &&
    status.historicalExtendedReady !== false &&
    !pendingSurfaces
  ) {
    return {
      key: "extended_surfaces",
      title: "Extended surfaces",
      state: "ready",
      label: "extended ready",
      detail: "Breakdowns, ads, and creatives are ready.",
      percent: null,
      evidence: readyThrough,
    };
  }

  const waiting =
    status.state === "paused" ||
    status.operations?.progressState === "partial_stuck";
  const label =
    !extended?.complete
      ? waiting
        ? "breakdowns waiting"
        : "breakdowns preparing"
      : recentLag
        ? waiting
          ? "recent surfaces waiting"
          : "recent surfaces preparing"
        : historicalLag
          ? "history continuing"
          : waiting
            ? "extended waiting"
            : "extended preparing";
  const detail =
    !extended?.complete
      ? extended?.summary ??
        extended?.reason ??
        "Breakdown surfaces are still preparing."
      : recentLag
        ? "Ads and creatives for the recent window are still preparing."
        : historicalLag
          ? "Ads and creatives continue backfilling in the background."
          : "Extended reporting surfaces are still preparing.";

  return {
    key: "extended_surfaces",
    title: "Extended surfaces",
    state: waiting ? "waiting" : "working",
    label,
    detail,
    percent,
    evidence,
  };
}

function shouldRenderAttentionStage(status: MetaStatusResponse) {
  return (
    status.state === "action_required" ||
    status.state === "paused" ||
    status.state === "stale" ||
    status.operations?.progressState === "blocked" ||
    (status.operations?.blockingReasons?.length ?? 0) > 0 ||
    (status.operations?.stallFingerprints?.length ?? 0) > 0 ||
    (status.jobHealth?.retryableFailedPartitions ?? 0) > 0 ||
    (status.jobHealth?.deadLetterPartitions ?? 0) > 0 ||
    status.d1FinalizeState === "blocked"
  );
}

function buildAttentionStage(status: MetaStatusResponse): MetaIntegrationProgressStage {
  const paused = status.state === "paused";
  const blocked =
    status.state === "action_required" ||
    status.state === "stale" ||
    status.operations?.progressState === "blocked" ||
    (status.operations?.blockingReasons?.length ?? 0) > 0 ||
    (status.jobHealth?.deadLetterPartitions ?? 0) > 0 ||
    status.d1FinalizeState === "blocked";
  const progressingRepair =
    !blocked &&
    (status.jobHealth?.retryableFailedPartitions ?? 0) > 0 &&
    status.operations?.progressState === "partial_progressing";

  const evidence = buildEvidence([
    summarizeBlockingReasons(status),
    summarizeRepairableActions(status),
    summarizeStallFingerprints(status),
  ]);

  return {
    key: "attention",
    title: "Attention / recovery",
    state: blocked ? "blocked" : paused ? "waiting" : progressingRepair ? "working" : "waiting",
    label:
      blocked
        ? status.state === "stale"
          ? "progress stale"
          : "attention needed"
        : paused
          ? "queue waiting"
          : progressingRepair
            ? "recovery running"
            : "recovery available",
    detail:
      blocked || paused
        ? getMetaSyncDescription(status, "en")
        : (status.jobHealth?.retryableFailedPartitions ?? 0) > 0
          ? "Meta is clearing retryable work in the background."
          : "Recovery signals are present for the Meta pipeline.",
    percent: null,
    evidence,
  };
}

export function resolveMetaIntegrationProgress(
  status: MetaStatusResponse | undefined | null
): MetaIntegrationProgressModel | null {
  if (!status?.connected) return null;
  if ((status.assignedAccountIds?.length ?? 0) === 0) return null;

  const stages: MetaIntegrationProgressStage[] = [
    buildConnectionStage(status),
    buildQueueStage(status),
    buildCoreStage(status),
    buildPriorityStage(status),
    buildExtendedStage(status),
  ];

  if (shouldRenderAttentionStage(status)) {
    stages.push(buildAttentionStage(status));
  }

  return {
    stages,
    attentionNeeded: stages.some((stage) => stage.key === "attention"),
  };
}
