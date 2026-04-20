import type { GoogleAdsStatusResponse } from "@/lib/google-ads/status-types";
import type { MetaStatusResponse } from "@/lib/meta/status-types";

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

export function shouldSuppressRecoverableMetaSyncIssue(
  status: MetaStatusResponse | null | undefined,
) {
  if (!status?.connected) return false;
  if ((status.assignedAccountIds?.length ?? 0) === 0) return false;
  if (!hasOnlyRecoverableRecommendations(status.repairPlan?.recommendations)) return false;
  return (
    status.coreReadiness?.usable === true ||
    status.pageReadiness?.state === "ready" ||
    status.pageReadiness?.state === "partial"
  );
}

export function shouldSuppressRecoverableGoogleSyncIssue(
  status: GoogleAdsStatusResponse | null | undefined,
) {
  if (!status?.connected) return false;
  if ((status.assignedAccountIds?.length ?? 0) === 0) return false;
  if (status.controlPlanePersistence?.exactRowsPresent !== true) return false;
  if (status.releaseGate?.verdict === "pass" && (status.repairPlan?.recommendations?.length ?? 0) === 0) {
    return true;
  }
  if (!hasOnlyRecoverableRecommendations(status.repairPlan?.recommendations)) return false;
  return status.panel?.coreUsable === true || status.domains?.core?.state === "ready";
}
