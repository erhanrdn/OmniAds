import type {
  MetaPageReadiness,
  MetaPageReadinessState,
  MetaPageSelectedRangeMode,
  MetaPageSurfaceKey,
  MetaSurfaceReadiness,
  MetaStatusResponse,
} from "@/lib/meta/status-types";

const REQUIRED_SURFACE_ORDER: Array<
  keyof MetaPageReadiness["requiredSurfaces"]
> = [
  "summary",
  "campaigns",
  "breakdowns.age",
  "breakdowns.location",
  "breakdowns.placement",
];

function buildSurface(input: MetaSurfaceReadiness): MetaSurfaceReadiness {
  return input;
}

function firstReason(
  surfaces: Array<[MetaPageSurfaceKey, MetaSurfaceReadiness]>,
): string | null {
  return surfaces.find(([, surface]) => surface.reason)?.[1].reason ?? null;
}

export function rollupMetaPageReadiness(input: {
  connected: boolean;
  hasAssignedAccounts: boolean;
  selectedRangeMode: MetaPageSelectedRangeMode;
  requiredSurfaces: MetaPageReadiness["requiredSurfaces"];
  optionalSurfaces: MetaPageReadiness["optionalSurfaces"];
}): MetaPageReadiness {
  const allRequired = Object.entries(input.requiredSurfaces) as Array<
    [MetaPageSurfaceKey, MetaSurfaceReadiness]
  >;
  const readyRequired = allRequired.filter(([, surface]) => surface.state === "ready");
  const missingRequiredSurfaces = allRequired
    .filter(([, surface]) => surface.countsForPageCompleteness && surface.state !== "ready")
    .map(([key]) => key);
  const usable =
    input.requiredSurfaces.summary.state === "ready" &&
    input.requiredSurfaces.campaigns.state === "ready";
  const complete = missingRequiredSurfaces.length === 0;

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
    reason = firstReason(allRequired.filter(([, surface]) => surface.state !== "ready"));
  } else {
    const blockedRequired = allRequired.filter(([, surface]) => surface.state === "blocked");
    const syncingRequired = allRequired.filter(([, surface]) => surface.state === "syncing");
    if (blockedRequired.length > 0) {
      state = "blocked";
      reason = firstReason(blockedRequired);
    } else if (syncingRequired.length > 0) {
      state = "syncing";
      reason = firstReason(syncingRequired);
    } else {
      state = "blocked";
      reason = firstReason(allRequired.filter(([, surface]) => surface.state !== "ready"));
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
  return [...REQUIRED_SURFACE_ORDER];
}
