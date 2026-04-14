import type {
  MetaCoreReadiness,
  MetaCoreSurfaceKey,
  MetaExtendedCompleteness,
  MetaExtendedSurfaceKey,
  MetaPageReadiness,
  MetaPageReadinessState,
  MetaPageSelectedRangeMode,
  MetaPageSurfaceKey,
  MetaSurfaceReadiness,
  MetaStatusResponse,
} from "@/lib/meta/status-types";
import { META_PAGE_REQUIRED_SURFACE_ORDER } from "@/lib/meta/page-contract";

interface MetaSurfaceCollectionRollup<TSurfaceKey extends string> {
  state: MetaPageReadinessState;
  usable: boolean;
  complete: boolean;
  reason: string | null;
  missingSurfaces: TSurfaceKey[];
  blockedSurfaces: TSurfaceKey[];
}

export function rollupMetaSurfaceCollection<TSurfaceKey extends string>(input: {
  connected: boolean;
  hasAssignedAccounts: boolean;
  surfaces: Record<TSurfaceKey, MetaSurfaceReadiness>;
  orderedKeys: readonly TSurfaceKey[];
  usableKeys?: readonly TSurfaceKey[];
}): MetaSurfaceCollectionRollup<TSurfaceKey> {
  const orderedSurfaces = input.orderedKeys.map((key) => [
    key,
    input.surfaces[key],
  ] as [TSurfaceKey, MetaSurfaceReadiness]);
  const usableKeys = input.usableKeys ?? input.orderedKeys;
  const missingSurfaces = orderedSurfaces
    .filter(([, surface]) => surface.countsForPageCompleteness && surface.state !== "ready")
    .map(([key]) => key);
  const blockedSurfaces = orderedSurfaces
    .filter(([, surface]) => surface.state === "blocked")
    .map(([key]) => key);
  const usable = usableKeys.every((key) => input.surfaces[key].state === "ready");
  const complete = missingSurfaces.length === 0;
  const firstMissingReason =
    missingSurfaces
      .map((key) => input.surfaces[key].reason)
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
    const syncingSurfaces = orderedSurfaces.filter(([, surface]) => surface.state === "syncing");
    if (blockedSurfaces.length > 0) {
      state = "blocked";
      reason =
        orderedSurfaces.find(([, surface]) => surface.state === "blocked" && surface.reason)?.[1].reason ??
        firstMissingReason;
    } else if (syncingSurfaces.length > 0) {
      state = "syncing";
      reason =
        syncingSurfaces.find(([, surface]) => surface.reason)?.[1].reason ?? firstMissingReason;
    } else {
      state = "partial";
      reason = firstMissingReason;
    }
  }

  return {
    state,
    usable,
    complete,
    reason,
    missingSurfaces,
    blockedSurfaces,
  };
}

export function rollupMetaPageReadiness(input: {
  connected: boolean;
  hasAssignedAccounts: boolean;
  selectedRangeMode: MetaPageSelectedRangeMode;
  requiredSurfaces: MetaPageReadiness["requiredSurfaces"];
  optionalSurfaces: MetaPageReadiness["optionalSurfaces"];
}): MetaPageReadiness {
  const rolledUp = rollupMetaSurfaceCollection({
    connected: input.connected,
    hasAssignedAccounts: input.hasAssignedAccounts,
    surfaces: input.requiredSurfaces,
    orderedKeys: META_PAGE_REQUIRED_SURFACE_ORDER,
    usableKeys: ["summary", "campaigns"] satisfies readonly MetaPageSurfaceKey[],
  });

  return {
    state: rolledUp.state,
    usable: rolledUp.usable,
    complete: rolledUp.complete,
    selectedRangeMode: input.selectedRangeMode,
    reason: rolledUp.reason,
    missingRequiredSurfaces: rolledUp.missingSurfaces as MetaPageSurfaceKey[],
    requiredSurfaces: input.requiredSurfaces,
    optionalSurfaces: input.optionalSurfaces,
  };
}

export function getMetaPageReadiness(status: MetaStatusResponse | undefined | null) {
  return status?.pageReadiness ?? null;
}

export function getMetaCoreReadiness(status: MetaStatusResponse | undefined | null) {
  return status?.coreReadiness ?? null;
}

export function getMetaExtendedCompleteness(status: MetaStatusResponse | undefined | null) {
  return status?.extendedCompleteness ?? null;
}

export function hasMetaExtendedCompletenessLag(status: MetaStatusResponse | undefined | null) {
  const coreReadiness = getMetaCoreReadiness(status);
  const extendedCompleteness = getMetaExtendedCompleteness(status);
  if (!coreReadiness?.usable || !extendedCompleteness) return false;
  return !extendedCompleteness.complete;
}

export function buildMetaCoreReadiness(input: {
  connected: boolean;
  hasAssignedAccounts: boolean;
  percent: number;
  summary: string | null;
  surfaces: Record<MetaCoreSurfaceKey, MetaSurfaceReadiness>;
}): MetaCoreReadiness {
  const rolledUp = rollupMetaSurfaceCollection({
    connected: input.connected,
    hasAssignedAccounts: input.hasAssignedAccounts,
    surfaces: input.surfaces,
    orderedKeys: ["summary", "campaigns"],
    usableKeys: ["summary", "campaigns"],
  });

  return {
    state: rolledUp.state,
    usable: rolledUp.usable,
    complete: rolledUp.complete,
    percent: input.percent,
    reason: rolledUp.reason,
    summary: input.summary,
    missingSurfaces: rolledUp.missingSurfaces as MetaCoreSurfaceKey[],
    blockedSurfaces: rolledUp.blockedSurfaces as MetaCoreSurfaceKey[],
    surfaces: input.surfaces,
  };
}

export function buildMetaExtendedCompleteness(input: {
  connected: boolean;
  hasAssignedAccounts: boolean;
  percent: number | null;
  summary: string | null;
  surfaces: Record<MetaExtendedSurfaceKey, MetaSurfaceReadiness>;
}): MetaExtendedCompleteness {
  const rolledUp = rollupMetaSurfaceCollection({
    connected: input.connected,
    hasAssignedAccounts: input.hasAssignedAccounts,
    surfaces: input.surfaces,
    orderedKeys: ["breakdowns.age", "breakdowns.location", "breakdowns.placement"],
  });

  return {
    state: rolledUp.state,
    complete: rolledUp.complete,
    percent: input.percent,
    reason: rolledUp.reason,
    summary: input.summary,
    missingSurfaces: rolledUp.missingSurfaces as MetaExtendedSurfaceKey[],
    blockedSurfaces: rolledUp.blockedSurfaces as MetaExtendedSurfaceKey[],
    surfaces: input.surfaces,
  };
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
