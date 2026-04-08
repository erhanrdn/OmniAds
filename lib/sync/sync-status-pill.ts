import type { GoogleAdsStatusResponse } from "@/lib/google-ads/status-types";
import { resolveGoogleAdsSyncProgress } from "@/lib/google-ads/sync-progress-ux";
import { getMetaPageReadiness } from "@/lib/meta/page-readiness";
import type { MetaStatusResponse } from "@/lib/meta/status-types";
import { getMetaPageStatusMessaging } from "@/lib/meta/ui-status";

export interface SyncStatusPillState {
  visible: boolean;
  label: string;
  tone: "info" | "success" | "warning";
  percent: number | null;
  state: "syncing" | "active" | "needs_attention";
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function percentFromCoverage(
  completedDays: number | null | undefined,
  totalDays: number | null | undefined
) {
  if (!Number.isFinite(completedDays) || !Number.isFinite(totalDays) || (totalDays ?? 0) <= 0) {
    return null;
  }
  return clampPercent(((completedDays ?? 0) / (totalDays ?? 0)) * 100);
}

function resolveMetaPercent(status: MetaStatusResponse) {
  const latestPercent = status.latestSync?.progressPercent;
  if (typeof latestPercent === "number" && Number.isFinite(latestPercent)) {
    return clampPercent(latestPercent);
  }

  const selectedRangeCoverage = status.warehouse?.coverage?.selectedRange;
  const selectedRangePercent = percentFromCoverage(
    selectedRangeCoverage?.completedDays,
    selectedRangeCoverage?.totalDays
  );
  if (selectedRangePercent !== null) return selectedRangePercent;

  const historicalCoverage = status.warehouse?.coverage?.historical;
  const historicalPercent = percentFromCoverage(
    historicalCoverage?.completedDays,
    historicalCoverage?.totalDays
  );
  if (historicalPercent !== null) return historicalPercent;

  const creativesCoverage = status.warehouse?.coverage?.creatives;
  return percentFromCoverage(creativesCoverage?.completedDays, creativesCoverage?.totalDays);
}

function buildSyncingPill(percent: number, label = "Syncing"): SyncStatusPillState {
  return {
    visible: true,
    label: `${percent}% ${label}`,
    tone: "info",
    percent,
    state: "syncing",
  };
}

function buildInfoPill(label: string): SyncStatusPillState {
  return {
    visible: true,
    label,
    tone: "info",
    percent: null,
    state: "syncing",
  };
}

function buildActivePill(label = "Active"): SyncStatusPillState {
  return {
    visible: true,
    label,
    tone: "success",
    percent: 100,
    state: "active",
  };
}

function buildAttentionPill(label = "Needs attention"): SyncStatusPillState {
  return {
    visible: true,
    label,
    tone: "warning",
    percent: null,
    state: "needs_attention",
  };
}

export function resolveMetaSyncStatusPill(
  status: MetaStatusResponse | undefined | null
): SyncStatusPillState | null {
  if (!status?.connected) return null;
  if ((status.assignedAccountIds?.length ?? 0) === 0) return null;

  const pageReadiness = getMetaPageReadiness(status);
  const pageMessages = getMetaPageStatusMessaging(status, "en");
  const percent = resolveMetaPercent(status);
  const isAttentionState =
    pageReadiness?.state === "blocked" ||
    status.state === "action_required" ||
    status.state === "paused" ||
    status.state === "stale" ||
    status.operations?.progressState === "blocked";
  const isPreparingCoverageState =
    pageReadiness?.state === "syncing" ||
    pageReadiness?.state === "partial" ||
    status.state === "syncing" ||
    status.state === "partial";
  const attentionLabel =
    pageReadiness?.state === "blocked" ? pageMessages.pill.label : "Needs attention";

  if (isAttentionState && isPreparingCoverageState && pageReadiness?.state !== "blocked") {
    return buildInfoPill("Preparing data");
  }

  if (isAttentionState) {
    return buildAttentionPill(attentionLabel);
  }

  if (pageReadiness?.state === "ready") {
    return buildActivePill(pageMessages.pill.label);
  }

  if ((pageReadiness?.state === "syncing" || pageReadiness?.state === "partial") && typeof percent === "number") {
    return buildSyncingPill(percent, pageMessages.pill.label);
  }

  if (typeof percent === "number" && percent < 100) {
    return buildSyncingPill(percent, pageMessages.pill.label);
  }

  if (status.state === "ready" || percent === 100) {
    return buildActivePill(pageMessages.pill.label);
  }

  if ((status.state === "syncing" || status.state === "partial") && typeof percent === "number") {
    return buildSyncingPill(percent, pageMessages.pill.label);
  }

  if (
    pageReadiness?.state === "syncing" ||
    pageReadiness?.state === "partial" ||
    status.state === "syncing" ||
    status.state === "partial"
  ) {
    return buildAttentionPill(pageMessages.pill.label);
  }

  return buildActivePill(pageMessages.pill.label);
}

function resolveGooglePercent(status: GoogleAdsStatusResponse) {
  const resolvedProgress = resolveGoogleAdsSyncProgress(status, "inline");
  if (resolvedProgress) {
    return clampPercent(resolvedProgress.percent);
  }

  const selectedRangeCoverage = status.warehouse?.coverage?.selectedRange;
  const selectedRangePercent = percentFromCoverage(
    selectedRangeCoverage?.completedDays,
    selectedRangeCoverage?.totalDays
  );
  if (selectedRangePercent !== null) return selectedRangePercent;

  const historicalCoverage = status.warehouse?.coverage?.historical;
  return percentFromCoverage(historicalCoverage?.completedDays, historicalCoverage?.totalDays);
}

function resolveGoogleProgressLabel(
  status: GoogleAdsStatusResponse,
  percent: number | null,
) {
  const resolvedProgress = resolveGoogleAdsSyncProgress(status, "inline");
  if (!resolvedProgress || typeof percent !== "number" || percent >= 100) return null;
  if (resolvedProgress.kind === "advisor") return "Analysis preparing";
  if (status.panel?.coreUsable) return "Extended sync";
  return "Syncing";
}

export function resolveGoogleAdsSyncStatusPill(
  status: GoogleAdsStatusResponse | undefined | null
): SyncStatusPillState | null {
  if (!status?.connected) return null;
  if ((status.assignedAccountIds?.length ?? 0) === 0) return null;

  const percent = resolveGooglePercent(status);
  const progressLabel = resolveGoogleProgressLabel(status, percent);
  const isAttentionState =
    status.state === "action_required" ||
    status.state === "paused" ||
    status.state === "stale" ||
    status.operations?.progressState === "blocked";

  if (isAttentionState) {
    return buildAttentionPill();
  }

  if (status.state === "ready") {
    return buildActivePill();
  }

  if (status.state === "advisor_not_ready") {
    if (typeof percent === "number" && percent < 100 && progressLabel) {
      return buildSyncingPill(percent, progressLabel);
    }
    return buildInfoPill("Core live");
  }

  if (status.state === "partial") {
    if (typeof percent === "number" && percent < 100) {
      return buildSyncingPill(percent, "Partially ready");
    }
    return buildInfoPill("Partially ready");
  }

  if (status.panel?.coreUsable) {
    if (typeof percent === "number" && percent < 100 && progressLabel) {
      return buildSyncingPill(percent, progressLabel);
    }
    return buildInfoPill("Core live");
  }

  if (typeof percent === "number" && percent < 100) {
    return buildSyncingPill(percent);
  }

  if (percent === 100) {
    return buildActivePill();
  }

  if (status.state === "syncing" && typeof percent === "number") {
    return buildSyncingPill(percent);
  }

  if (status.state === "syncing") {
    return buildAttentionPill();
  }

  return buildActivePill();
}

export function resolveProviderSyncStatusPill(params: {
  provider: string;
  metaStatus?: MetaStatusResponse | null;
  googleAdsStatus?: GoogleAdsStatusResponse | null;
}) {
  if (params.provider === "meta") {
    return resolveMetaSyncStatusPill(params.metaStatus ?? null);
  }
  if (params.provider === "google" || params.provider === "google_ads") {
    return resolveGoogleAdsSyncStatusPill(params.googleAdsStatus ?? null);
  }
  return null;
}
