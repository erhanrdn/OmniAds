import type { GoogleAdsStatusResponse } from "@/lib/google-ads/status-types";
import type { MetaStatusResponse } from "@/lib/meta/status-types";

export type UserVisibleSyncStateKind =
  | "healthy"
  | "refreshing_in_background"
  | "using_latest_available_data"
  | "setup_required"
  | "reconnect_required"
  | "data_unavailable";

export interface UserVisibleSyncState {
  kind: UserVisibleSyncStateKind;
  label: string;
  suppressRecoverableAttention: boolean;
  degradedServing: boolean;
}

type DeriveUserVisibleSyncStateInput = {
  connected: boolean;
  hasAssignment: boolean;
  hasUsableSnapshot: boolean;
  controlPlaneExact: boolean;
  releaseGateVerdict: string | null;
  blockerClass: string | null;
  syncTruthState: string | null;
  recommendations:
    | Array<{
        safetyClassification?: string | null;
      }>
    | null
    | undefined;
};

function hasOnlyRecoverableRecommendations(
  recommendations:
    | Array<{
        safetyClassification?: string | null;
      }>
    | null
    | undefined,
) {
  const rows = recommendations ?? [];
  return (
    rows.length > 0 &&
    rows.every(
      (row) =>
        typeof row.safetyClassification === "string" &&
        row.safetyClassification !== "blocked",
    )
  );
}

function isControlPlaneClosed(input: DeriveUserVisibleSyncStateInput) {
  return (
    input.controlPlaneExact &&
    input.releaseGateVerdict === "pass" &&
    (input.recommendations?.length ?? 0) === 0 &&
    (input.blockerClass == null || input.blockerClass === "none")
  );
}

export function deriveUserVisibleSyncState(
  input: DeriveUserVisibleSyncStateInput,
): UserVisibleSyncState {
  if (!input.connected) {
    return {
      kind: "reconnect_required",
      label: "Reconnect required",
      suppressRecoverableAttention: false,
      degradedServing: false,
    };
  }

  if (!input.hasAssignment) {
    return {
      kind: "setup_required",
      label: "Setup required",
      suppressRecoverableAttention: false,
      degradedServing: false,
    };
  }

  if (isControlPlaneClosed(input)) {
    return {
      kind: "healthy",
      label: "Active",
      suppressRecoverableAttention: true,
      degradedServing: false,
    };
  }

  const recoverable =
    input.hasUsableSnapshot &&
    hasOnlyRecoverableRecommendations(input.recommendations) &&
    input.blockerClass !== "queue_blocked" &&
    input.blockerClass !== "stalled" &&
    input.blockerClass !== "not_release_ready";

  if (recoverable) {
    const isActivelyRefreshing =
      input.syncTruthState === "syncing" ||
      input.syncTruthState === "blocked" ||
      input.syncTruthState === "repairing" ||
      input.syncTruthState === "partial" ||
      input.releaseGateVerdict === "blocked" ||
      input.releaseGateVerdict === "measure_only" ||
      input.releaseGateVerdict === "warn_only";

    return {
      kind: isActivelyRefreshing
        ? "refreshing_in_background"
        : "using_latest_available_data",
      label: isActivelyRefreshing
        ? "Refreshing in background"
        : "Using latest available data",
      suppressRecoverableAttention: true,
      degradedServing: true,
    };
  }

  if (input.hasUsableSnapshot) {
    return {
      kind: "using_latest_available_data",
      label: "Using latest available data",
      suppressRecoverableAttention: false,
      degradedServing: true,
    };
  }

  return {
    kind: "data_unavailable",
    label: "Data unavailable",
    suppressRecoverableAttention: false,
    degradedServing: false,
  };
}

export function deriveMetaUserVisibleSyncState(
  status: MetaStatusResponse | null | undefined,
) {
  return deriveUserVisibleSyncState({
    connected: Boolean(status?.connected),
    hasAssignment: (status?.assignedAccountIds?.length ?? 0) > 0,
    hasUsableSnapshot:
      status?.coreReadiness?.usable === true ||
      status?.pageReadiness?.state === "ready" ||
      status?.pageReadiness?.state === "partial",
    controlPlaneExact: status?.controlPlanePersistence?.exactRowsPresent === true,
    releaseGateVerdict:
      typeof status?.releaseGate?.verdict === "string"
        ? status.releaseGate.verdict
        : null,
    blockerClass:
      typeof status?.blockerClass === "string" ? status.blockerClass : null,
    syncTruthState:
      typeof status?.syncTruthState === "string" ? status.syncTruthState : null,
    recommendations: status?.repairPlan?.recommendations,
  });
}

export function deriveGoogleUserVisibleSyncState(
  status: GoogleAdsStatusResponse | null | undefined,
) {
  return deriveUserVisibleSyncState({
    connected: Boolean(status?.connected),
    hasAssignment: (status?.assignedAccountIds?.length ?? 0) > 0,
    hasUsableSnapshot:
      status?.panel?.coreUsable === true ||
      status?.domains?.core?.state === "ready",
    controlPlaneExact: status?.controlPlanePersistence?.exactRowsPresent === true,
    releaseGateVerdict:
      typeof status?.releaseGate?.verdict === "string"
        ? status.releaseGate.verdict
        : null,
    blockerClass:
      typeof status?.blockerClass === "string" ? status.blockerClass : null,
    syncTruthState:
      typeof status?.syncTruthState === "string" ? status.syncTruthState : null,
    recommendations: status?.repairPlan?.recommendations,
  });
}

export function shouldSuppressRecoverableMetaSyncIssue(
  status: MetaStatusResponse | null | undefined,
) {
  return deriveMetaUserVisibleSyncState(status).suppressRecoverableAttention;
}

export function shouldSuppressRecoverableGoogleSyncIssue(
  status: GoogleAdsStatusResponse | null | undefined,
) {
  return deriveGoogleUserVisibleSyncState(status).suppressRecoverableAttention;
}
