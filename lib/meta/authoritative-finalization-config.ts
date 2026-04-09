function envBoolean(name: string, fallback = false) {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function envNumber(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function isMetaAuthoritativeFinalizationV2Enabled() {
  return envBoolean("META_AUTHORITATIVE_FINALIZATION_V2", true);
}

export function getMetaAuthoritativeFinalizationCanaryBusinessIds() {
  return (process.env.META_AUTHORITATIVE_FINALIZATION_CANARY_BUSINESSES ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export const META_AUTHORITATIVE_FINALIZATION_RECENT_WINDOW_DAYS = envNumber(
  "META_AUTHORITATIVE_FINALIZATION_RECENT_WINDOW_DAYS",
  7,
);

export const META_AUTHORITATIVE_FINALIZATION_VALIDATION_TOLERANCE_BPS = envNumber(
  "META_AUTHORITATIVE_FINALIZATION_VALIDATION_TOLERANCE_BPS",
  10,
);

export const META_AUTHORITATIVE_FINALIZATION_TARGET_STATES = [
  "live",
  "pending_finalization",
  "finalizing",
  "finalized_verified",
  "failed",
  "repair_required",
  "superseded",
] as const;

export type MetaAuthoritativeFinalizationState =
  (typeof META_AUTHORITATIVE_FINALIZATION_TARGET_STATES)[number];

export function isMetaAuthoritativeFinalizationV2EnabledForBusiness(
  businessId: string | null | undefined,
) {
  if (!isMetaAuthoritativeFinalizationV2Enabled()) return false;
  const canaryBusinessIds = getMetaAuthoritativeFinalizationCanaryBusinessIds();
  if (canaryBusinessIds.length === 0) {
    return true;
  }
  if (!businessId) return false;
  return canaryBusinessIds.includes(businessId);
}
