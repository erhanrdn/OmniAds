export type CreativeCanonicalResolverFlag = "legacy" | "v1";

export interface CreativeDecisionFeatureFlagInput {
  searchParams?: URLSearchParams | ReadonlyURLSearchParamsLike | null;
  cookieHeader?: string | null;
  businessId?: string | null;
  serverRolloutPercent?: number | null;
  killSwitch?: boolean | null;
  adminAllowlist?: Iterable<string> | null;
  adminBlocklist?: Iterable<string> | null;
  stickyAssignment?: CreativeCanonicalResolverFlag | null;
}

export interface CreativeCanonicalResolverServerFlagRecord {
  businessId: string;
  assignment: CreativeCanonicalResolverFlag;
  assignedAt: string;
  source: "sticky_cohort" | "admin_allowlist" | "admin_blocklist" | "kill_switch";
}

interface ReadonlyURLSearchParamsLike {
  get(name: string): string | null;
}

const CANONICAL_RESOLVER_COOKIE = "canonicalResolver";

function normalizeFlagValue(value: string | null | undefined): CreativeCanonicalResolverFlag | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "v1" || normalized === "1" || normalized === "true" || normalized === "canonical") {
    return "v1";
  }
  if (normalized === "legacy" || normalized === "0" || normalized === "false" || normalized === "off") {
    return "legacy";
  }
  return null;
}

function readCookie(cookieHeader: string | null | undefined, name: string) {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey !== name) continue;
    return decodeURIComponent(rawValue.join("="));
  }
  return null;
}

function hashToBucket(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % 100;
}

export function resolveCreativeCanonicalResolverFlag(
  input: CreativeDecisionFeatureFlagInput = {},
): CreativeCanonicalResolverFlag {
  if (input.killSwitch) return "legacy";

  const businessId = input.businessId ?? null;
  const blocklist = new Set(input.adminBlocklist ?? []);
  if (businessId && blocklist.has(businessId)) return "legacy";

  const allowlist = new Set(input.adminAllowlist ?? []);
  if (businessId && allowlist.has(businessId)) return "v1";

  const fromQuery = normalizeFlagValue(input.searchParams?.get("canonicalResolver"));
  if (fromQuery) return fromQuery;

  const fromCookie = normalizeFlagValue(readCookie(input.cookieHeader, CANONICAL_RESOLVER_COOKIE));
  if (fromCookie) return fromCookie;

  if (input.stickyAssignment) return input.stickyAssignment;

  const rolloutPercent = input.serverRolloutPercent ?? 0;
  if (rolloutPercent > 0 && businessId) {
    return hashToBucket(businessId) < Math.min(100, Math.max(0, rolloutPercent))
      ? "v1"
      : "legacy";
  }

  return "legacy";
}

export function isCreativeCanonicalResolverEnabled(
  input: CreativeDecisionFeatureFlagInput = {},
) {
  return resolveCreativeCanonicalResolverFlag(input) === "v1";
}

export function persistCreativeCanonicalResolverFlag(value: CreativeCanonicalResolverFlag) {
  if (typeof document === "undefined") return;
  document.cookie = `${CANONICAL_RESOLVER_COOKIE}=${encodeURIComponent(value)}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
}

export function resolveCreativeCanonicalResolverFlagFromBrowser(
  searchParams: ReadonlyURLSearchParamsLike | null | undefined,
) {
  const queryValue = normalizeFlagValue(searchParams?.get("canonicalResolver"));
  if (queryValue) {
    persistCreativeCanonicalResolverFlag(queryValue);
    return queryValue;
  }
  const cookieHeader = typeof document === "undefined" ? null : document.cookie;
  return resolveCreativeCanonicalResolverFlag({ searchParams, cookieHeader });
}

export function assignStickyCreativeCanonicalResolverFlag(input: {
  businessId: string;
  rolloutPercent: number;
  existingAssignment?: CreativeCanonicalResolverFlag | null;
  killSwitch?: boolean | null;
  adminAllowlist?: Iterable<string> | null;
  adminBlocklist?: Iterable<string> | null;
}): CreativeCanonicalResolverServerFlagRecord {
  const assignment = resolveCreativeCanonicalResolverFlag({
    businessId: input.businessId,
    serverRolloutPercent: input.rolloutPercent,
    stickyAssignment: input.existingAssignment ?? null,
    killSwitch: input.killSwitch,
    adminAllowlist: input.adminAllowlist,
    adminBlocklist: input.adminBlocklist,
  });
  const source: CreativeCanonicalResolverServerFlagRecord["source"] =
    input.killSwitch
      ? "kill_switch"
      : new Set(input.adminBlocklist ?? []).has(input.businessId)
        ? "admin_blocklist"
        : new Set(input.adminAllowlist ?? []).has(input.businessId)
          ? "admin_allowlist"
          : "sticky_cohort";
  return {
    businessId: input.businessId,
    assignment,
    assignedAt: new Date().toISOString(),
    source,
  };
}
