import type {
  MetaPageReadiness,
  MetaPageReadinessState,
  MetaPageSelectedRangeMode,
  MetaPageSurfaceKey,
  MetaSurfaceReadiness,
  MetaStatusResponse,
} from "@/lib/meta/status-types";
import { META_PAGE_REQUIRED_SURFACE_ORDER } from "@/lib/meta/page-contract";

function buildSurface(input: MetaSurfaceReadiness): MetaSurfaceReadiness {
  return input;
}

export function rollupMetaPageReadiness(input: {
  connected: boolean;
  hasAssignedAccounts: boolean;
  selectedRangeMode: MetaPageSelectedRangeMode;
  requiredSurfaces: MetaPageReadiness["requiredSurfaces"];
  optionalSurfaces: MetaPageReadiness["optionalSurfaces"];
}): MetaPageReadiness {
  const orderedRequired = META_PAGE_REQUIRED_SURFACE_ORDER.map((key) => [
    key,
    input.requiredSurfaces[key],
  ] as [MetaPageSurfaceKey, MetaSurfaceReadiness]);
  const missingRequiredSurfaces = orderedRequired
    .filter(([, surface]) => surface.countsForPageCompleteness && surface.state !== "ready")
    .map(([key]) => key) as MetaPageSurfaceKey[];
  const usable =
    input.requiredSurfaces.summary.state === "ready" &&
    input.requiredSurfaces.campaigns.state === "ready";
  const complete = missingRequiredSurfaces.length === 0;
  const firstMissingReason =
    missingRequiredSurfaces
      .map((key) => input.requiredSurfaces[key as keyof MetaPageReadiness["requiredSurfaces"]].reason)
      .find((reason): reason is string => Boolean(reason)) ?? null;

  let state: MetaPageReadinessState;
  let reason: string | null;

  if (!input.connected || !input.hasAssignedAccounts) {
    state = "not_connected";
    reason = !input.connected
      ? "Meta integration is not connected."
      : "No Meta ad account is assigned to this workspace.";
  } else if (usable && complete) {
    state = "ready";
    reason = null;
  } else if (usable) {
    state = "partial";
    reason = firstMissingReason;
  } else {
    const blockedRequired = orderedRequired.filter(([, surface]) => surface.state === "blocked");
    const syncingRequired = orderedRequired.filter(([, surface]) => surface.state === "syncing");
    if (blockedRequired.length > 0) {
      state = "blocked";
      reason =
        blockedRequired.find(([, surface]) => surface.reason)?.[1].reason ?? firstMissingReason;
    } else if (syncingRequired.length > 0) {
      state = "syncing";
      reason =
        syncingRequired.find(([, surface]) => surface.reason)?.[1].reason ?? firstMissingReason;
    } else {
      state = "blocked";
      reason = firstMissingReason;
    }
  }

  return {
    state,
    usable,
    complete,
    selectedRangeMode: input.selectedRangeMode,
    reason,
    missingRequiredSurfaces,
    requiredSurfaces: input.requiredSurfaces,
    optionalSurfaces: input.optionalSurfaces,
  };
}

export function getMetaPageReadiness(status: MetaStatusResponse | undefined | null) {
  return status?.pageReadiness ?? null;
}

export function getMetaPageStatusReason(status: MetaStatusResponse | undefined | null) {
  return getMetaPageReadiness(status)?.reason ?? null;
}

export function isMetaPageCurrentDayPreparing(status: MetaStatusResponse | undefined | null) {
  const readiness = getMetaPageReadiness(status);
  return (
    readiness?.selectedRangeMode === "current_day_live" &&
    readiness.state !== "ready" &&
    readiness.state !== "not_connected" &&
    readiness.state !== "blocked"
  );
}

export function shouldMaskMetaKpisAsPreparing(input: {
  status: MetaStatusResponse | undefined | null;
  hasCampaignSpend: boolean;
  summaryLoading: boolean;
}) {
  const readiness = getMetaPageReadiness(input.status);
  if (!readiness) return false;
  return (
    readiness.selectedRangeMode === "current_day_live" &&
    readiness.state !== "ready" &&
    !input.summaryLoading &&
    !input.hasCampaignSpend
  );
}

export function getMetaRequiredPageSurfaceKeys() {
  return [...META_PAGE_REQUIRED_SURFACE_ORDER];
}
