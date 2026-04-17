import { getDb } from "@/lib/db";

export interface AdminIntegrationProviderDetail {
  provider: "meta" | "google";
  issueType: string;
  lastError: string | null;
  displayDetail: string;
  fetchedAt: string | null;
  nextRefreshAfter: string | null;
  refreshInProgress: boolean;
}

export interface AdminIntegrationWorkspaceNode {
  businessId: string;
  businessName: string;
  providerCount: number;
  providers: Array<"meta" | "google">;
  worstStatus: string;
  latestFetchedAt: string | null;
  nextRefreshAfter: string | null;
  providerDetails: AdminIntegrationProviderDetail[];
}

export interface AdminIntegrationProviderNode {
  provider: "meta" | "google";
  affectedWorkspaces: number;
  connectedBusinesses: number;
  failedSnapshots: number;
  staleSnapshots: number;
  missingSnapshots: number;
  refreshInProgress: number;
  workspaces: AdminIntegrationWorkspaceNode[];
}

export interface AdminIntegrationIssueGroup {
  issueType: string;
  affectedWorkspaces: number;
  criticality: "healthy" | "warning" | "critical";
  oldestFetchedAt: string | null;
  latestRetryAfter: string | null;
  providers: AdminIntegrationProviderNode[];
}

export interface AdminIntegrationDashboardSummaryRow {
  provider: "meta" | "google";
  connectedBusinesses: number;
  affectedBusinesses: number;
  staleSnapshots: number;
  failedSnapshots: number;
  missingSnapshots: number;
  refreshInProgress: number;
  topIssue: string | null;
}

export interface AdminIntegrationHealthPayload {
  issueGroups: AdminIntegrationIssueGroup[];
  summary: {
    totalAffectedWorkspaces: number;
    topIssue: string | null;
    providers: AdminIntegrationDashboardSummaryRow[];
  };
}

export interface RawAdminIntegrationHealthRow {
  provider: "meta" | "google";
  business_id: string;
  business_name: string;
  fetched_at: string | null;
  refresh_failed: boolean | null;
  last_error: string | null;
  next_refresh_after: string | null;
  refresh_in_progress: boolean | null;
  snapshot_account_count: number;
}

function formatRelativeDuration(targetAt: string | null) {
  if (!targetAt) return null;
  const diffMs = new Date(targetAt).getTime() - Date.now();
  if (!Number.isFinite(diffMs)) return null;
  if (diffMs <= 0) return "now";

  const totalMinutes = Math.ceil(diffMs / 60_000);
  if (totalMinutes < 60) return `${totalMinutes} min`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

function classifyIntegrationIssue(message: string | null) {
  const normalized = (message ?? "").toLowerCase();
  if (!normalized) return "Provider/API error";
  if (
    normalized.includes("quota") ||
    normalized.includes("resource_exhausted") ||
    normalized.includes("rate")
  ) {
    return "Quota / rate limit";
  }
  if (normalized.includes("developer token")) {
    return "Provider/API error";
  }
  if (normalized.includes("scope")) {
    return "Missing scope";
  }
  if (normalized.includes("expired") || normalized.includes("refresh token")) {
    return "Token / refresh";
  }
  if (normalized.includes("permission") || normalized.includes("denied")) {
    return "Permissions";
  }
  if (normalized.includes("refresh in progress")) {
    return "Refresh in progress";
  }
  return "Provider/API error";
}

function getIssueType(row: RawAdminIntegrationHealthRow) {
  const hasSnapshot = Boolean(row.fetched_at);
  const fetchedAtMs = row.fetched_at ? new Date(row.fetched_at).getTime() : NaN;
  const isStale =
    !Number.isFinite(fetchedAtMs) ||
    Date.now() - fetchedAtMs > 6 * 60 * 60_000;
  const isFailed = row.refresh_failed === true;
  const isMissing = !hasSnapshot || row.snapshot_account_count <= 0;
  const classifiedFailure = isFailed ? classifyIntegrationIssue(row.last_error) : null;

  if (row.refresh_in_progress) return "Refresh in progress";
  if (isMissing) return "Missing snapshot";
  if (
    classifiedFailure &&
    classifiedFailure !== "Provider/API error" &&
    classifiedFailure !== "Refresh in progress"
  ) {
    return classifiedFailure;
  }
  if (isStale && hasSnapshot && isFailed) return "Stale snapshot";
  if (isFailed) return classifiedFailure;
  return null;
}

function deriveDisplayDetail(row: RawAdminIntegrationHealthRow, issueType: string) {
  if (row.last_error?.trim()) {
    return row.last_error;
  }

  if (issueType === "Refresh in progress") {
    return "A background refresh is currently running for this provider snapshot.";
  }

  if (issueType === "Missing snapshot") {
    if (row.next_refresh_after) {
      const retryIn = formatRelativeDuration(row.next_refresh_after);
      return retryIn
        ? `No provider snapshot is stored yet, and the latest refresh did not complete successfully. The next refresh attempt is scheduled in ${retryIn}.`
        : "No provider snapshot is stored yet, and the latest refresh did not complete successfully. A retry has already been scheduled.";
    }
    return "No provider snapshot is stored yet for this workspace, and the latest refresh did not complete successfully.";
  }

  if (issueType === "Stale snapshot") {
    if (row.fetched_at) {
      return "The last saved provider snapshot is older than the 6-hour freshness window, and the latest refresh did not complete successfully. The system is serving the stale DB snapshot until a refresh succeeds.";
    }
    return "The provider snapshot is stale, and the latest refresh did not complete successfully.";
  }

  if (issueType === "Quota / rate limit") {
    return "The provider refresh is being blocked by a quota or rate-limit response, but the exact upstream message was not persisted.";
  }

  if (issueType === "Missing scope") {
    return "The connected account is missing a required provider scope, but the exact upstream message was not persisted.";
  }

  if (issueType === "Token / refresh") {
    return "The provider token or token refresh flow failed, but the exact upstream message was not persisted.";
  }

  if (issueType === "Permissions") {
    return "The connected account does not currently have the required provider permissions, but the exact upstream message was not persisted.";
  }

  return "The latest refresh failed without a persisted technical error detail. This usually points to an upstream/API failure outside a classified quota, scope, token, or permission error.";
}

function compareIssuePriority(issueType: string) {
  switch (issueType) {
    case "Quota / rate limit":
      return 6;
    case "Missing scope":
    case "Permissions":
    case "Token / refresh":
      return 5;
    case "Provider/API error":
      return 4;
    case "Missing snapshot":
      return 3;
    case "Refresh in progress":
      return 2;
    case "Stale snapshot":
      return 1;
    default:
      return 0;
  }
}

function criticalityForIssue(issueType: string): "healthy" | "warning" | "critical" {
  if (
    issueType === "Quota / rate limit" ||
    issueType === "Missing scope" ||
    issueType === "Permissions" ||
    issueType === "Token / refresh" ||
    issueType === "Provider/API error"
  ) {
    return "critical";
  }
  if (issueType === "Stale snapshot" || issueType === "Missing snapshot") {
    return "warning";
  }
  return "healthy";
}

function pickLaterDate(current: string | null, candidate: string | null) {
  if (!candidate) return current;
  if (!current) return candidate;
  return new Date(candidate).getTime() > new Date(current).getTime() ? candidate : current;
}

function pickEarlierDate(current: string | null, candidate: string | null) {
  if (!candidate) return current;
  if (!current) return candidate;
  return new Date(candidate).getTime() < new Date(current).getTime() ? candidate : current;
}

async function readIntegrationHealthRows(): Promise<RawAdminIntegrationHealthRow[]> {
  const sql = getDb();
  try {
    return (await sql`
      SELECT
        pc.provider,
        pc.business_id,
        b.name AS business_name,
        s.fetched_at,
        s.refresh_failed,
        s.last_error,
        s.next_refresh_after,
        s.refresh_in_progress,
        COALESCE(items.snapshot_account_count, 0)::int AS snapshot_account_count
      FROM provider_connections pc
      JOIN businesses b ON b.id::text = pc.business_id
      LEFT JOIN provider_account_snapshot_runs s
        ON s.business_id = pc.business_id
       AND s.provider = pc.provider
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS snapshot_account_count
        FROM provider_account_snapshot_items
        WHERE snapshot_run_id = s.id
      ) items ON TRUE
      WHERE pc.status = 'connected'
        AND pc.provider IN ('meta', 'google')
    `) as RawAdminIntegrationHealthRow[];
  } catch (error) {
    console.error("[admin integration health]", error);
    return [];
  }
}

export function buildAdminIntegrationHealthPayload(
  rows: RawAdminIntegrationHealthRow[]
): AdminIntegrationHealthPayload {
  const providerConnectedCounts = new Map<"meta" | "google", number>();
  const providerSummaryMap = new Map<"meta" | "google", AdminIntegrationDashboardSummaryRow>();
  const issueGroupMap = new Map<
    string,
    {
      issueType: string;
      providerMaps: Map<
        "meta" | "google",
        {
          provider: "meta" | "google";
          workspaceMap: Map<string, AdminIntegrationWorkspaceNode>;
          affectedWorkspaces: number;
          connectedBusinesses: number;
          failedSnapshots: number;
          staleSnapshots: number;
          missingSnapshots: number;
          refreshInProgress: number;
        }
      >;
      workspaceIds: Set<string>;
      oldestFetchedAt: string | null;
      latestRetryAfter: string | null;
      criticality: "healthy" | "warning" | "critical";
    }
  >();

  for (const row of rows) {
    providerConnectedCounts.set(
      row.provider,
      (providerConnectedCounts.get(row.provider) ?? 0) + 1
    );
    const issueType = getIssueType(row);
    if (!issueType) continue;

    const fetchedAtMs = row.fetched_at ? new Date(row.fetched_at).getTime() : NaN;
    const isStale = issueType === "Stale snapshot";
    const isMissing = issueType === "Missing snapshot";
    const isFailed =
      issueType === "Quota / rate limit" ||
      issueType === "Missing scope" ||
      issueType === "Token / refresh" ||
      issueType === "Permissions" ||
      issueType === "Provider/API error";

    const providerSummary = providerSummaryMap.get(row.provider) ?? {
      provider: row.provider,
      connectedBusinesses: 0,
      affectedBusinesses: 0,
      staleSnapshots: 0,
      failedSnapshots: 0,
      missingSnapshots: 0,
      refreshInProgress: 0,
      topIssue: null,
    };
    providerSummary.affectedBusinesses += 1;
    if (isStale) providerSummary.staleSnapshots += 1;
    if (isFailed) providerSummary.failedSnapshots += 1;
    if (isMissing) providerSummary.missingSnapshots += 1;
    if (row.refresh_in_progress) providerSummary.refreshInProgress += 1;
    if (
      !providerSummary.topIssue ||
      compareIssuePriority(issueType) > compareIssuePriority(providerSummary.topIssue)
    ) {
      providerSummary.topIssue = issueType;
    }
    providerSummaryMap.set(row.provider, providerSummary);

    const issueGroup = issueGroupMap.get(issueType) ?? {
      issueType,
      providerMaps: new Map(),
      workspaceIds: new Set<string>(),
      oldestFetchedAt: null,
      latestRetryAfter: null,
      criticality: criticalityForIssue(issueType),
    };
    issueGroup.workspaceIds.add(row.business_id);
    issueGroup.oldestFetchedAt = pickEarlierDate(issueGroup.oldestFetchedAt, row.fetched_at);
    issueGroup.latestRetryAfter = pickLaterDate(
      issueGroup.latestRetryAfter,
      row.next_refresh_after
    );

    const providerNode = issueGroup.providerMaps.get(row.provider) ?? {
      provider: row.provider,
      workspaceMap: new Map<string, AdminIntegrationWorkspaceNode>(),
      affectedWorkspaces: 0,
      connectedBusinesses: 0,
      failedSnapshots: 0,
      staleSnapshots: 0,
      missingSnapshots: 0,
      refreshInProgress: 0,
    };
    providerNode.affectedWorkspaces += 1;
    if (isFailed) providerNode.failedSnapshots += 1;
    if (isStale) providerNode.staleSnapshots += 1;
    if (isMissing) providerNode.missingSnapshots += 1;
    if (row.refresh_in_progress) providerNode.refreshInProgress += 1;

    const existingWorkspace = providerNode.workspaceMap.get(row.business_id);
    const providerDetail: AdminIntegrationProviderDetail = {
      provider: row.provider,
      issueType,
      lastError: row.last_error,
      displayDetail: deriveDisplayDetail(row, issueType),
      fetchedAt: row.fetched_at,
      nextRefreshAfter: row.next_refresh_after,
      refreshInProgress: row.refresh_in_progress === true,
    };
    if (existingWorkspace) {
      existingWorkspace.providers = Array.from(
        new Set([...existingWorkspace.providers, row.provider])
      );
      existingWorkspace.providerCount = existingWorkspace.providers.length;
      existingWorkspace.providerDetails = [...existingWorkspace.providerDetails, providerDetail];
      existingWorkspace.latestFetchedAt = pickLaterDate(
        existingWorkspace.latestFetchedAt,
        row.fetched_at
      );
      existingWorkspace.nextRefreshAfter = pickLaterDate(
        existingWorkspace.nextRefreshAfter,
        row.next_refresh_after
      );
      if (compareIssuePriority(issueType) > compareIssuePriority(existingWorkspace.worstStatus)) {
        existingWorkspace.worstStatus = issueType;
      }
    } else {
      providerNode.workspaceMap.set(row.business_id, {
        businessId: row.business_id,
        businessName: row.business_name,
        providerCount: 1,
        providers: [row.provider],
        worstStatus: issueType,
        latestFetchedAt: row.fetched_at,
        nextRefreshAfter: row.next_refresh_after,
        providerDetails: [providerDetail],
      });
    }

    issueGroup.providerMaps.set(row.provider, providerNode);
    issueGroupMap.set(issueType, issueGroup);
  }

  const issueGroups: AdminIntegrationIssueGroup[] = Array.from(issueGroupMap.values())
    .map((group) => ({
      issueType: group.issueType,
      affectedWorkspaces: group.workspaceIds.size,
      criticality: group.criticality,
      oldestFetchedAt: group.oldestFetchedAt,
      latestRetryAfter: group.latestRetryAfter,
      providers: Array.from(group.providerMaps.values())
        .map((providerNode) => ({
          provider: providerNode.provider,
          affectedWorkspaces: providerNode.workspaceMap.size,
          connectedBusinesses: providerConnectedCounts.get(providerNode.provider) ?? 0,
          failedSnapshots: providerNode.failedSnapshots,
          staleSnapshots: providerNode.staleSnapshots,
          missingSnapshots: providerNode.missingSnapshots,
          refreshInProgress: providerNode.refreshInProgress,
          workspaces: Array.from(providerNode.workspaceMap.values()).sort((a, b) =>
            a.businessName.localeCompare(b.businessName)
          ),
        }))
        .sort((a, b) => b.affectedWorkspaces - a.affectedWorkspaces),
    }))
    .sort((a, b) => {
      const criticalityScore = { critical: 3, warning: 2, healthy: 1 };
      const diff = criticalityScore[b.criticality] - criticalityScore[a.criticality];
      if (diff !== 0) return diff;
      return b.affectedWorkspaces - a.affectedWorkspaces;
    });

  const summaryProviders = (["meta", "google"] as const).map((provider) => {
    const summary = providerSummaryMap.get(provider) ?? {
      provider,
      connectedBusinesses: 0,
      affectedBusinesses: 0,
      staleSnapshots: 0,
      failedSnapshots: 0,
      missingSnapshots: 0,
      refreshInProgress: 0,
      topIssue: null,
    };
    return {
      ...summary,
      connectedBusinesses: providerConnectedCounts.get(provider) ?? 0,
    };
  });

  const totalAffectedWorkspaces = new Set(
    issueGroups.flatMap((group) =>
      group.providers.flatMap((provider) => provider.workspaces.map((workspace) => workspace.businessId))
    )
  ).size;

  const topIssue =
    [...issueGroups].sort((a, b) => {
      const criticalityScore = { critical: 3, warning: 2, healthy: 1 };
      const diff = criticalityScore[b.criticality] - criticalityScore[a.criticality];
      if (diff !== 0) return diff;
      return b.affectedWorkspaces - a.affectedWorkspaces;
    })[0]?.issueType ?? null;

  return {
    issueGroups,
    summary: {
      totalAffectedWorkspaces,
      topIssue,
      providers: summaryProviders,
    },
  };
}

export async function getAdminIntegrationHealth(): Promise<AdminIntegrationHealthPayload> {
  const rows = await readIntegrationHealthRows();
  return buildAdminIntegrationHealthPayload(rows);
}
