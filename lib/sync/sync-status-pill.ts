import type { GoogleAdsStatusResponse } from "@/lib/google-ads/status-types";
import { resolveGoogleAdsSyncProgress } from "@/lib/google-ads/sync-progress-ux";
import type { MetaStatusResponse } from "@/lib/meta/status-types";

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

function buildSyncingPill(percent: number): SyncStatusPillState {
  return {
    visible: true,
    label: `${percent}% Syncing`,
    tone: "info",
    percent,
    state: "syncing",
  };
}

function buildActivePill(): SyncStatusPillState {
  return {
    visible: true,
    label: "Active",
    tone: "success",
    percent: 100,
    state: "active",
  };
}

function buildAttentionPill(): SyncStatusPillState {
  return {
    visible: true,
    label: "Needs attention",
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

  const percent = resolveMetaPercent(status);
  const isAttentionState =
    status.state === "action_required" ||
    status.state === "paused" ||
    status.state === "stale" ||
    status.operations?.progressState === "blocked";

  if (isAttentionState) {
    return buildAttentionPill();
  }

  if (status.currentCoreUsable) {
    return buildActivePill();
  }

  if (typeof percent === "number" && percent < 100) {
    return buildSyncingPill(percent);
  }

  if (status.state === "ready" || percent === 100) {
    return buildActivePill();
  }

  if ((status.state === "syncing" || status.state === "partial") && typeof percent === "number") {
    return buildSyncingPill(percent);
  }

  if (status.state === "syncing" || status.state === "partial") {
    return buildAttentionPill();
  }

  return buildActivePill();
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

export function resolveGoogleAdsSyncStatusPill(
  status: GoogleAdsStatusResponse | undefined | null
): SyncStatusPillState | null {
  if (!status?.connected) return null;
  if ((status.assignedAccountIds?.length ?? 0) === 0) return null;

  const percent = resolveGooglePercent(status);
  const isAttentionState =
    status.state === "action_required" ||
    status.state === "paused" ||
    status.state === "stale" ||
    status.state === "advisor_not_ready" ||
    status.operations?.progressState === "blocked";

  if (isAttentionState) {
    return buildAttentionPill();
  }

  if (status.panel?.coreUsable) {
    return buildActivePill();
  }

  if (typeof percent === "number" && percent < 100) {
    return buildSyncingPill(percent);
  }

  if (status.state === "ready" || percent === 100) {
    return buildActivePill();
  }

  if ((status.state === "syncing" || status.state === "partial") && typeof percent === "number") {
    return buildSyncingPill(percent);
  }

  if (status.state === "syncing" || status.state === "partial") {
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
