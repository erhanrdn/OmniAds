function envBoolean(name: string, fallback = false) {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function parseEnvList(name: string) {
  return (process.env[name] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function isCreativeDecisionOsV1Enabled() {
  return envBoolean("CREATIVE_DECISION_OS_V1", true);
}

export function getCreativeDecisionOsCanaryBusinesses() {
  return parseEnvList("CREATIVE_DECISION_OS_CANARY_BUSINESSES");
}

export function isCreativeDecisionOsV1EnabledForBusiness(
  businessId: string | null | undefined,
) {
  if (!isCreativeDecisionOsV1Enabled()) return false;
  const canaryBusinesses = getCreativeDecisionOsCanaryBusinesses();
  if (canaryBusinesses.length === 0) return true;
  if (!businessId) return false;
  return canaryBusinesses.includes(businessId);
}
