export type CreativeCanonicalResolverFlag = "legacy" | "v1";
export type CreativeCanonicalCohort = "legacy" | "canonical-v1";
export type CreativeCanonicalCohortAssignmentSource =
  | "kill_switch"
  | "blocklist"
  | "allowlist"
  | "sticky_assigned"
  | "rollout_percent_assigned"
  | "default_legacy";

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

export interface CreativeCanonicalCohortAssignment {
  businessId: string;
  cohort: CreativeCanonicalCohort;
  source: CreativeCanonicalCohortAssignmentSource;
  assignedAt?: string;
  killSwitchActiveAt?: string | null;
}

export interface CreativeCanonicalCohortAssignmentInput {
  businessId: string;
  rolloutPercent?: number | null;
  existingAssignment?: CreativeCanonicalCohort | null;
  existingAssignedAt?: string | null;
  killSwitch?: boolean | null;
  killSwitchActiveAt?: string | null;
  env?: NodeJS.ProcessEnv;
  adminAllowlist?: Iterable<string> | null;
  adminBlocklist?: Iterable<string> | null;
  now?: Date;
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

function envKillSwitch(env: NodeJS.ProcessEnv = process.env) {
  const value = env.CANONICAL_RESOLVER_KILL_SWITCH?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "on";
}

function flagToCohort(flag: CreativeCanonicalResolverFlag): CreativeCanonicalCohort {
  return flag === "v1" ? "canonical-v1" : "legacy";
}

function cohortToFlag(cohort: CreativeCanonicalCohort): CreativeCanonicalResolverFlag {
  return cohort === "canonical-v1" ? "v1" : "legacy";
}

export function resolveCreativeCanonicalResolverFlag(
  input: CreativeDecisionFeatureFlagInput = {},
): CreativeCanonicalResolverFlag {
  if (input.killSwitch || envKillSwitch()) return "legacy";

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

export function resolveCanonicalCohortAssignment(
  input: CreativeCanonicalCohortAssignmentInput,
): CreativeCanonicalCohortAssignment {
  const businessId = input.businessId;
  const now = (input.now ?? new Date()).toISOString();
  if (input.killSwitch || envKillSwitch(input.env)) {
    return {
      businessId,
      cohort: "legacy",
      source: "kill_switch",
      assignedAt: input.existingAssignedAt ?? now,
      killSwitchActiveAt: input.killSwitchActiveAt ?? now,
    };
  }

  const blocklist = new Set(input.adminBlocklist ?? []);
  if (blocklist.has(businessId)) {
    return { businessId, cohort: "legacy", source: "blocklist", assignedAt: input.existingAssignedAt ?? now };
  }

  const allowlist = new Set(input.adminAllowlist ?? []);
  if (allowlist.has(businessId)) {
    return { businessId, cohort: "canonical-v1", source: "allowlist", assignedAt: input.existingAssignedAt ?? now };
  }

  if (input.existingAssignment) {
    return {
      businessId,
      cohort: input.existingAssignment,
      source: "sticky_assigned",
      assignedAt: input.existingAssignedAt ?? now,
    };
  }

  const rolloutPercent = Math.min(100, Math.max(0, input.rolloutPercent ?? 0));
  if (rolloutPercent > 0 && hashToBucket(businessId) < rolloutPercent) {
    return { businessId, cohort: "canonical-v1", source: "rollout_percent_assigned", assignedAt: now };
  }

  return { businessId, cohort: "legacy", source: "default_legacy", assignedAt: now };
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
  const cohortAssignment = resolveCanonicalCohortAssignment({
    businessId: input.businessId,
    rolloutPercent: input.rolloutPercent,
    existingAssignment: input.existingAssignment ? flagToCohort(input.existingAssignment) : null,
    killSwitch: input.killSwitch,
    adminAllowlist: input.adminAllowlist,
    adminBlocklist: input.adminBlocklist,
  });
  const assignment = cohortToFlag(cohortAssignment.cohort);
  const source: CreativeCanonicalResolverServerFlagRecord["source"] =
    cohortAssignment.source === "kill_switch"
      ? "kill_switch"
      : cohortAssignment.source === "blocklist"
        ? "admin_blocklist"
        : cohortAssignment.source === "allowlist"
          ? "admin_allowlist"
          : "sticky_cohort";
  return {
    businessId: input.businessId,
    assignment,
    assignedAt: cohortAssignment.assignedAt ?? new Date().toISOString(),
    source,
  };
}
