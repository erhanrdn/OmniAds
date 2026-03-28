export type ProviderReadinessLevel = "usable" | "partial" | "ready";

export interface ProviderSurfaceSummary {
  required: string[];
  available: string[];
  missing: string[];
}

export interface ProviderCheckpointHealth {
  latestCheckpointScope: string | null;
  latestCheckpointPhase: string | null;
  latestCheckpointStatus: string | null;
  latestCheckpointUpdatedAt: string | null;
  checkpointLagMinutes: number | null;
  lastSuccessfulPageIndex: number | null;
  resumeCapable: boolean;
  checkpointFailures: number;
}

export interface ProviderDomainReadiness {
  coreSurfacesReady: string[];
  deepSurfacesPending: string[];
  blockingSurfaces: string[];
  summary: string | null;
}

export function buildProviderSurfaces(input: {
  required: string[];
  available: string[];
}) : ProviderSurfaceSummary {
  const required = Array.from(new Set(input.required.filter(Boolean)));
  const availableSet = new Set(input.available.filter(Boolean));
  return {
    required,
    available: required.filter((surface) => availableSet.has(surface)),
    missing: required.filter((surface) => !availableSet.has(surface)),
  };
}

export function decideProviderReadinessLevel(input: {
  required: string[];
  available: string[];
  usable: string[];
}) : ProviderReadinessLevel {
  const required = new Set(input.required.filter(Boolean));
  const available = new Set(input.available.filter(Boolean));
  const usable = input.usable.filter(Boolean);
  const requiredReady =
    required.size > 0 && Array.from(required).every((surface) => available.has(surface));
  if (requiredReady) return "ready";
  const usableReady = usable.every((surface) => available.has(surface));
  return usableReady ? "usable" : "partial";
}

export function computeCheckpointLagMinutes(updatedAt: string | null) {
  if (!updatedAt) return null;
  const updatedMs = new Date(updatedAt).getTime();
  if (!Number.isFinite(updatedMs)) return null;
  return Math.max(0, Math.round((Date.now() - updatedMs) / 60_000));
}
