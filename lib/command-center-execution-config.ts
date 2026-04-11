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

export function isCommandCenterExecutionV1Enabled() {
  return envBoolean("COMMAND_CENTER_EXECUTION_V1", true);
}

export function isMetaExecutionApplyEnabled() {
  return envBoolean("META_EXECUTION_APPLY_ENABLED", false);
}

export function getMetaExecutionCanaryBusinesses() {
  return parseEnvList("META_EXECUTION_CANARY_BUSINESSES");
}

export function isMetaExecutionCanaryBusiness(
  businessId: string | null | undefined,
) {
  if (!businessId) return false;
  const canaries = getMetaExecutionCanaryBusinesses();
  if (canaries.length === 0) return false;
  return canaries.includes(businessId);
}

export function canApplyMetaExecutionForBusiness(
  businessId: string | null | undefined,
) {
  return isMetaExecutionApplyEnabled() && isMetaExecutionCanaryBusiness(businessId);
}
