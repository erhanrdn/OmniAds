import { getDb, getDbWithTimeout } from "@/lib/db";
import { getMetaAuthoritativeBusinessOpsSnapshot } from "@/lib/meta/warehouse";
import { getSyncWorkerHealthSummary } from "@/lib/sync/worker-health";
import { isGoogleAdsExtendedCanaryBusiness } from "@/lib/sync/google-ads-sync";
import {
  buildProviderProgressEvidence,
  deriveProviderStallFingerprints,
  deriveProviderProgressState,
  type ProviderProgressState,
  type ProviderStallFingerprint,
} from "@/lib/sync/provider-status-truth";
import type { MetaAuthoritativeBusinessOpsSnapshot } from "@/lib/meta/warehouse-types";

type AuthProvider = "meta" | "google" | "search_console" | "ga4" | "shopify";
type SyncProvider = "google_ads" | "meta" | "ga4" | "search_console";

export interface AdminAuthIssueRow {
  businessId: string;
  businessName: string;
  provider: AuthProvider;
  issueType: string;
  detail: string;
  tokenExpiresAt: string | null;
  updatedAt: string;
}

export interface AdminAuthHealthPayload {
  summary: {
    affectedBusinesses: number;
    connectedIntegrations: number;
    expiredTokens: number;
    expiringSoon: number;
    missingRefreshTokens: number;
    missingScopes: number;
    integrationErrors: number;
    topIssue: string | null;
  };
  issues: AdminAuthIssueRow[];
}

export interface AdminSyncIssueRow {
  businessId: string;
  businessName: string;
  provider: SyncProvider;
  reportType: string;
  severity?: "critical" | "high" | "medium";
  runbookKey?: string | null;
  status: "failed" | "running" | "cooldown";
  detail: string;
  triggeredAt: string | null;
  completedAt: string | null;
}

export interface AdminSyncHealthPayload {
  googleAdsHealthStatus?: "ok" | "degraded" | "failed";
  googleAdsHealthError?: string | null;
  summary: {
    impactedBusinesses: number;
    runningJobs: number;
    stuckJobs: number;
    failedJobs24h: number;
    activeCooldowns: number;
    successJobs24h: number;
    topIssue: string | null;
    googleAdsQueueDepth?: number;
    googleAdsLeasedPartitions?: number;
    googleAdsDeadLetterPartitions?: number;
    googleAdsOldestQueuedPartition?: string | null;
    metaQueueDepth?: number;
    metaLeasedPartitions?: number;
    metaDeadLetterPartitions?: number;
    metaOldestQueuedPartition?: string | null;
    metaSourceManifestCount?: number;
    metaPublishedProgression?: number;
    metaValidationFailures24h?: number;
    metaRepairBacklog?: number;
    metaStaleLeasePartitions?: number;
    metaLastSuccessfulPublishAt?: string | null;
    metaD1FinalizeSlaBreaches?: number;
    workerOnline?: boolean;
    workerInstances?: number;
    workerLastHeartbeatAt?: string | null;
    workerLastProgressHeartbeatAt?: string | null;
    googleAdsSafeModeActive?: boolean;
    googleAdsCircuitBreakerBusinesses?: number;
    googleAdsCompactedPartitions?: number;
    googleAdsBudgetPressureMax?: number;
    googleAdsRecoveryBusinesses?: number;
    googleAdsCanaryBusinesses?: number;
    googleAdsSkippedActiveLeaseRecoveries?: number;
    googleAdsLeaseConflictRuns24h?: number;
    metaSkippedActiveLeaseRecoveries?: number;
    metaStaleRunCount24h?: number;
  };
  issues: AdminSyncIssueRow[];
  workerHealth?: {
    onlineWorkers: number;
    workerInstances: number;
    lastHeartbeatAt: string | null;
    lastProgressHeartbeatAt?: string | null;
    workers: Array<{
      workerId: string;
      instanceType: string;
      providerScope: string;
      workerFreshnessState?: "online" | "stale" | "stopped";
      status: string;
      lastHeartbeatAt: string | null;
      lastBusinessId: string | null;
      lastPartitionId: string | null;
      metaJson?: Record<string, unknown> | null;
    }>;
  };
  googleAdsBusinesses?: Array<{
    businessId: string;
    businessName: string;
    queueDepth: number;
    leasedPartitions: number;
    deadLetterPartitions: number;
    oldestQueuedPartition: string | null;
    latestPartitionActivityAt: string | null;
    campaignCompletedDays: number;
    searchTermCompletedDays: number;
    productCompletedDays: number;
    assetCompletedDays?: number;
    latestCheckpointPhase?: string | null;
    latestCheckpointUpdatedAt?: string | null;
    lastProgressHeartbeatAt?: string | null;
    checkpointLagMinutes?: number | null;
    lastSuccessfulPageIndex?: number | null;
    resumeCapable?: boolean;
    checkpointFailures?: number;
    poisonedCheckpointCount?: number;
    reclaimCandidateCount?: number;
    lastReclaimReason?: string | null;
    skippedActiveLeaseRecoveries?: number;
    leaseConflictRuns24h?: number;
    latestPoisonReason?: string | null;
    latestPoisonedAt?: string | null;
    safeModeActive?: boolean;
    circuitBreakerOpen?: boolean;
    compactedPartitions?: number;
    quotaCallCount?: number;
    quotaErrorCount?: number;
    quotaBudget?: number;
    quotaPressure?: number;
    recoveryMode?: "open" | "half_open" | "closed";
    canaryEnabled?: boolean;
    effectiveMode?: "safe_mode" | "canary_reopen" | "general_reopen";
    recentSearchTermCompletedDays?: number;
    recentProductCompletedDays?: number;
    recentAssetCompletedDays?: number;
    recentRangeTotalDays?: number;
    recentExtendedReady?: boolean;
    historicalExtendedReady?: boolean;
    extendedRecentQueueDepth?: number;
    extendedRecentLeasedPartitions?: number;
    extendedHistoricalQueueDepth?: number;
    extendedHistoricalLeasedPartitions?: number;
    extendedRecoveryBlockReason?: string | null;
    extendedRecentReadyThroughDate?: string | null;
    googleWorkerHealthy?: boolean;
    googleHeartbeatAgeMs?: number | null;
    googleRunnerLeaseActive?: boolean;
    staleRunPressure?: number;
    progressState?: "ready" | "syncing" | "partial_progressing" | "partial_stuck" | "blocked";
    stallFingerprints?: ProviderStallFingerprint[];
  }>;
  metaBusinesses?: Array<{
    businessId: string;
    businessName: string;
    queueDepth: number;
    leasedPartitions: number;
    retryableFailedPartitions: number;
    staleLeasePartitions: number;
    deadLetterPartitions: number;
    stateRowCount: number;
    todayAccountRows: number;
    todayAdsetRows: number;
    currentDayReference: string | null;
    oldestQueuedPartition: string | null;
    latestPartitionActivityAt: string | null;
    accountCompletedDays: number;
    adsetCompletedDays: number;
    creativeCompletedDays: number;
    latestCheckpointScope?: string | null;
    latestCheckpointPhase?: string | null;
    latestCheckpointUpdatedAt?: string | null;
    lastProgressHeartbeatAt?: string | null;
    checkpointLagMinutes?: number | null;
    lastSuccessfulPageIndex?: number | null;
    resumeCapable?: boolean;
    checkpointFailures?: number;
    reclaimCandidateCount?: number;
    lastReclaimReason?: string | null;
    skippedActiveLeaseRecoveries?: number;
    staleRunCount24h?: number;
    effectiveMode?: "core_only" | "extended_recovery" | "extended_normal";
    recentAccountCompletedDays?: number;
    recentAdsetCompletedDays?: number;
    recentCreativeCompletedDays?: number;
    recentAdCompletedDays?: number;
    recentRangeTotalDays?: number;
    recentExtendedReady?: boolean;
    historicalExtendedReady?: boolean;
    progressState?: "ready" | "syncing" | "partial_progressing" | "partial_stuck" | "blocked";
    stallFingerprints?: ProviderStallFingerprint[];
    sourceManifestCounts?: MetaAuthoritativeBusinessOpsSnapshot["manifestCounts"];
    latestAuthoritativePublishes?: MetaAuthoritativeBusinessOpsSnapshot["latestPublishes"];
    d1FinalizeSla?: MetaAuthoritativeBusinessOpsSnapshot["d1FinalizeSla"];
    validationFailures24h?: number;
    recentFailures?: MetaAuthoritativeBusinessOpsSnapshot["recentFailures"];
    repairBacklog?: number;
    queuedVsLeasedVsPublished?: MetaAuthoritativeBusinessOpsSnapshot["progression"];
    lastSuccessfulPublishAt?: string | null;
  }>;
}

interface GoogleAdsHealthSummaryRow {
  queueDepth: number;
  leasedPartitions: number;
  deadLetterPartitions: number;
  oldestQueuedPartition: string | null;
}

export interface AdminRevenueRiskWorkspaceRow {
  businessId: string;
  businessName: string;
  ownerName: string | null;
  ownerEmail: string | null;
  createdAt: string;
  connectedIntegrations: number;
  reason: string;
}

export interface AdminRevenueRiskSubscriptionRow {
  businessId: string | null;
  businessName: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  planId: string;
  status: string;
  updatedAt: string;
}

export interface AdminRevenueRiskPayload {
  summary: {
    atRiskBusinesses: number;
    activeSubscriptions: number;
    nonActiveSubscriptions: number;
    unsubscribedBusinesses: number;
    topIssue: string | null;
  };
  unsubscribedBusinesses: AdminRevenueRiskWorkspaceRow[];
  subscriptionIssues: AdminRevenueRiskSubscriptionRow[];
  statusBreakdown: Array<{ status: string; count: number }>;
}

export interface AdminOperationsSummary {
  authHealth: AdminAuthHealthPayload["summary"];
  syncHealth: AdminSyncHealthPayload["summary"];
  revenueRisk: AdminRevenueRiskPayload["summary"];
}

interface RawAuthIntegrationRow {
  business_id: string;
  business_name: string;
  provider: AuthProvider;
  status: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  scopes: string | null;
  error_message: string | null;
  updated_at: string;
}

interface RawSyncJobRow {
  business_id: string;
  business_name: string;
  provider: SyncProvider;
  report_type: string;
  status: string;
  error_message: string | null;
  triggered_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface RawCooldownRow {
  business_id: string;
  business_name: string;
  provider: SyncProvider;
  request_type: string;
  error_message: string | null;
  cooldown_until: string;
  updated_at: string;
}

function classifyGoogleAdsProgressState(input: {
  queueDepth: number;
  leasedPartitions: number;
  deadLetterPartitions: number;
  checkpointLagMinutes: number | null;
  latestCheckpointUpdatedAt: string | null;
  reclaimCandidateCount: number;
  leaseConflictRuns24h: number;
  poisonedCheckpointCount: number;
  staleRunPressure: number;
  recentExtendedReady: boolean;
  historicalExtendedReady: boolean;
  latestPartitionActivityAt: string | null;
}) : ProviderProgressState {
  return deriveProviderProgressState({
    queueDepth: input.queueDepth,
    leasedPartitions: input.leasedPartitions,
    checkpointLagMinutes: input.checkpointLagMinutes,
    latestPartitionActivityAt: input.latestPartitionActivityAt,
    blocked:
      input.deadLetterPartitions > 0 ||
      input.reclaimCandidateCount > 0 ||
      input.leaseConflictRuns24h > 0 ||
      input.poisonedCheckpointCount > 0,
    fullyReady: input.recentExtendedReady && input.historicalExtendedReady,
    staleRunPressure: input.staleRunPressure,
    progressEvidence: buildProviderProgressEvidence({
      checkpointUpdatedAt: input.latestCheckpointUpdatedAt,
      recentActivityWindowMinutes: 20,
      aggregation: "latest",
    }),
  });
}

function classifyMetaProgressState(input: {
  queueDepth: number;
  leasedPartitions: number;
  deadLetterPartitions: number;
  retryableFailedPartitions: number;
  staleLeasePartitions: number;
  checkpointLagMinutes: number | null;
  latestCheckpointUpdatedAt: string | null;
  reclaimCandidateCount: number;
  staleRunCount24h: number;
  recentExtendedReady: boolean;
  historicalExtendedReady: boolean;
  latestPartitionActivityAt: string | null;
}) : ProviderProgressState {
  return deriveProviderProgressState({
    queueDepth: input.queueDepth,
    leasedPartitions: input.leasedPartitions,
    checkpointLagMinutes: input.checkpointLagMinutes,
    latestPartitionActivityAt: input.latestPartitionActivityAt,
    blocked:
      input.deadLetterPartitions > 0 ||
      input.staleLeasePartitions > 0 ||
      input.reclaimCandidateCount > 0 ||
      input.staleRunCount24h > 0,
    fullyReady:
      input.recentExtendedReady &&
      input.historicalExtendedReady &&
      input.retryableFailedPartitions === 0,
    hasRepairableBacklog: input.retryableFailedPartitions > 0,
    staleRunPressure: input.staleRunCount24h,
    progressEvidence: buildProviderProgressEvidence({
      checkpointUpdatedAt: input.latestCheckpointUpdatedAt,
      recentActivityWindowMinutes: 20,
      aggregation: "latest",
    }),
  });
}

interface RawGoogleAdsHealthRow {
  business_id: string;
  business_name: string;
  queue_depth: number | string;
  leased_partitions: number | string;
  dead_letter_partitions: number | string;
  oldest_queued_partition: string | null;
  latest_partition_activity_at: string | null;
  campaign_completed_days: number | string | null;
  campaign_dead_letter_count: number | string | null;
  search_term_completed_days: number | string | null;
  product_completed_days: number | string | null;
  asset_completed_days?: number | string | null;
  latest_checkpoint_phase?: string | null;
  latest_checkpoint_updated_at?: string | null;
  latest_progress_heartbeat_at?: string | null;
  last_successful_page_index?: number | string | null;
  checkpoint_failures?: number | string | null;
  poisoned_checkpoint_count?: number | string | null;
  reclaim_candidate_count?: number | string | null;
  last_reclaim_reason?: string | null;
  skipped_active_lease_recoveries?: number | string | null;
  lease_conflict_runs_24h?: number | string | null;
  latest_poison_reason?: string | null;
  latest_poisoned_at?: string | null;
  active_circuit_breakers?: number | string | null;
  compacted_partitions?: number | string | null;
  quota_call_count?: number | string | null;
  quota_error_count?: number | string | null;
  quota_budget?: number | string | null;
  quota_pressure?: number | string | null;
  recovery_half_open?: number | string | null;
  canary_enabled?: boolean | null;
  recent_search_term_completed_days?: number | string | null;
  recent_product_completed_days?: number | string | null;
  recent_asset_completed_days?: number | string | null;
  recent_range_total_days?: number | string | null;
  extended_recent_queue_depth?: number | string | null;
  extended_recent_leased_partitions?: number | string | null;
  extended_historical_queue_depth?: number | string | null;
  extended_historical_leased_partitions?: number | string | null;
  extended_recent_ready_through_date?: string | null;
  google_worker_healthy?: boolean | null;
  google_heartbeat_age_ms?: number | string | null;
  google_runner_lease_active?: boolean | null;
  stale_run_pressure?: number | string | null;
}

interface RawMetaHealthRow {
  business_id: string;
  business_name: string;
  queue_depth: number | string;
  leased_partitions: number | string;
  retryable_failed_partitions: number | string;
  stale_lease_partitions: number | string;
  dead_letter_partitions: number | string;
  state_row_count: number | string;
  current_day_reference: string | null;
  oldest_queued_partition: string | null;
  latest_partition_activity_at: string | null;
  latest_checkpoint_scope: string | null;
  latest_checkpoint_phase: string | null;
  latest_checkpoint_updated_at: string | null;
  latest_progress_heartbeat_at: string | null;
  last_successful_page_index: number | string | null;
  checkpoint_failures: number | string | null;
  reclaim_candidate_count?: number | string | null;
  last_reclaim_reason?: string | null;
  skipped_active_lease_recoveries?: number | string | null;
  stale_run_count_24h?: number | string | null;
  today_account_rows: number | string;
  today_adset_rows: number | string;
  account_completed_days: number | string | null;
  adset_completed_days: number | string | null;
  creative_completed_days: number | string | null;
  ad_completed_days?: number | string | null;
  recent_account_completed_days?: number | string | null;
  recent_adset_completed_days?: number | string | null;
  recent_creative_completed_days?: number | string | null;
  recent_ad_completed_days?: number | string | null;
  recent_range_total_days?: number | string | null;
}

interface RawRevenueWorkspaceRow {
  business_id: string;
  business_name: string;
  owner_name: string | null;
  owner_email: string | null;
  created_at: string;
  connected_integrations: number | string;
  has_active_subscription: boolean;
}

interface RawRevenueSubscriptionRow {
  business_id: string | null;
  business_name: string | null;
  owner_name: string | null;
  owner_email: string | null;
  plan_id: string;
  status: string;
  updated_at: string;
}

function getTopIssue(entries: string[]) {
  if (entries.length === 0) return null;
  const counts = new Map<string, number>();
  for (const entry of entries) {
    counts.set(entry, (counts.get(entry) ?? 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function getSyncIssueSeverity(issue: Pick<AdminSyncIssueRow, "reportType" | "status">) {
  if (
    issue.reportType === "worker_offline_with_leased_partitions" ||
    issue.reportType === "queue_dead_letter" ||
    issue.reportType === "lease_conflict_runs" ||
    issue.reportType === "stale_runs"
  ) {
    return "critical" as const;
  }
  if (
    issue.reportType === "stale_checkpoint" ||
    issue.reportType === "stalled_reclaimable" ||
    issue.reportType === "stale_lease" ||
    issue.reportType === "queue_waiting_worker" ||
    issue.reportType === "state_missing" ||
    issue.reportType === "poisoned_checkpoint"
  ) {
    return "high" as const;
  }
  return "medium" as const;
}

function getSyncIssueRunbookKey(issue: Pick<AdminSyncIssueRow, "provider" | "reportType">) {
  switch (issue.reportType) {
    case "queue_dead_letter":
      return `${issue.provider}:dead_letter_recovery`;
    case "stale_checkpoint":
      return `${issue.provider}:checkpoint_stall`;
    case "stalled_reclaimable":
      return `${issue.provider}:stale_reclaim`;
    case "skipped_active_lease":
      return `${issue.provider}:active_lease_recovery_skip`;
    case "lease_conflict_runs":
      return "google_ads:lease_conflict";
    case "stale_runs":
      return "meta:stale_run";
    case "worker_offline_with_leased_partitions":
      return `${issue.provider}:worker_recovery`;
    case "queue_waiting_worker":
      return `${issue.provider}:worker_backlog`;
    case "stale_lease":
      return "meta:stale_lease";
    default:
      return null;
  }
}

function computeLagMinutes(value: string | null) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.round((Date.now() - ms) / 60_000));
}

function parseScopes(value: string | null) {
  return new Set((value ?? "").split(/\s+/).filter(Boolean));
}

function providerRequiresRefreshToken(provider: AuthProvider) {
  return provider === "google" || provider === "search_console" || provider === "ga4";
}

function providerCanAutoRefresh(provider: AuthProvider, refreshToken: string | null) {
  return providerRequiresRefreshToken(provider) && Boolean(refreshToken);
}

function hasRequiredScope(provider: AuthProvider, scopes: Set<string>) {
  if (provider === "google") {
    return scopes.has("https://www.googleapis.com/auth/adwords");
  }
  if (provider === "search_console") {
    return (
      scopes.has("https://www.googleapis.com/auth/webmasters.readonly") ||
      scopes.has("https://www.googleapis.com/auth/webmasters")
    );
  }
  if (provider === "ga4") {
    return (
      scopes.has("https://www.googleapis.com/auth/analytics.readonly") ||
      scopes.has("https://www.googleapis.com/auth/analytics")
    );
  }
  return true;
}

export function buildAdminAuthHealth(rows: RawAuthIntegrationRow[]): AdminAuthHealthPayload {
  const issues: AdminAuthIssueRow[] = [];
  const affectedBusinesses = new Set<string>();
  let connectedIntegrations = 0;
  let expiredTokens = 0;
  let expiringSoon = 0;
  let missingRefreshTokens = 0;
  let missingScopes = 0;
  let integrationErrors = 0;
  const issueTypes: string[] = [];

  for (const row of rows) {
    const scopes = parseScopes(row.scopes);
    const isConnected = row.status === "connected";
    const expiresAtMs = row.token_expires_at ? new Date(row.token_expires_at).getTime() : NaN;

    if (isConnected) connectedIntegrations++;

    if (row.status === "error" || row.error_message) {
      integrationErrors++;
      issueTypes.push("Integration error");
      affectedBusinesses.add(row.business_id);
      issues.push({
        businessId: row.business_id,
        businessName: row.business_name,
        provider: row.provider,
        issueType: "Integration error",
        detail: row.error_message ?? "The integration is in an error state.",
        tokenExpiresAt: row.token_expires_at,
        updatedAt: row.updated_at,
      });
    }

    if (isConnected && Number.isFinite(expiresAtMs)) {
      if (expiresAtMs <= Date.now()) {
        if (!providerCanAutoRefresh(row.provider, row.refresh_token)) {
          expiredTokens++;
          issueTypes.push("Token expired");
          affectedBusinesses.add(row.business_id);
          issues.push({
            businessId: row.business_id,
            businessName: row.business_name,
            provider: row.provider,
            issueType: "Token expired",
            detail: "The stored access token has already expired and this connection cannot auto-refresh itself.",
            tokenExpiresAt: row.token_expires_at,
            updatedAt: row.updated_at,
          });
        }
      } else if (expiresAtMs - Date.now() <= 72 * 60 * 60_000) {
        expiringSoon++;
      }
    }

    if (isConnected && providerRequiresRefreshToken(row.provider) && !row.refresh_token) {
      missingRefreshTokens++;
    }

    if (isConnected && !hasRequiredScope(row.provider, scopes)) {
      missingScopes++;
      issueTypes.push("Missing required scope");
      affectedBusinesses.add(row.business_id);
      issues.push({
        businessId: row.business_id,
        businessName: row.business_name,
        provider: row.provider,
        issueType: "Missing required scope",
        detail: "The connected integration is missing one or more required OAuth scopes.",
        tokenExpiresAt: row.token_expires_at,
        updatedAt: row.updated_at,
      });
    }
  }

  return {
    summary: {
      affectedBusinesses: affectedBusinesses.size,
      connectedIntegrations,
      expiredTokens,
      expiringSoon,
      missingRefreshTokens,
      missingScopes,
      integrationErrors,
      topIssue: getTopIssue(issueTypes),
    },
    issues: issues.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
  };
}

export function buildAdminSyncHealth(input: {
  jobs: RawSyncJobRow[];
  cooldowns: RawCooldownRow[];
  googleAdsHealth?: RawGoogleAdsHealthRow[];
  googleAdsHealthStatus?: "ok" | "degraded" | "failed";
  googleAdsHealthError?: string | null;
  googleAdsHealthSummary?: GoogleAdsHealthSummaryRow | null;
  metaHealth?: RawMetaHealthRow[];
  metaAuthoritativeSnapshots?: MetaAuthoritativeBusinessOpsSnapshot[];
  workerHealth?: Awaited<ReturnType<typeof getSyncWorkerHealthSummary>>;
}): AdminSyncHealthPayload {
  const issues: AdminSyncIssueRow[] = [];
  const impactedBusinesses = new Set<string>();
  let runningJobs = 0;
  let stuckJobs = 0;
  let failedJobs24h = 0;
  let activeCooldowns = input.cooldowns.length;
  let successJobs24h = 0;
  const issueTypes: string[] = [];
  let googleAdsQueueDepth = 0;
  let googleAdsLeasedPartitions = 0;
  let googleAdsDeadLetterPartitions = 0;
  let googleAdsOldestQueuedPartition: string | null = null;
  let metaQueueDepth = 0;
  let metaLeasedPartitions = 0;
  let metaDeadLetterPartitions = 0;
  let metaOldestQueuedPartition: string | null = null;
  let metaSourceManifestCount = 0;
  let metaPublishedProgression = 0;
  let metaValidationFailures24h = 0;
  let metaRepairBacklog = 0;
  let metaStaleLeasePartitions = 0;
  let metaLastSuccessfulPublishAt: string | null = null;
  let metaD1FinalizeSlaBreaches = 0;
  let googleAdsCircuitBreakerBusinesses = 0;
  let googleAdsCompactedPartitions = 0;
  let googleAdsBudgetPressureMax = 0;
  let googleAdsRecoveryBusinesses = 0;
  let googleAdsCanaryBusinesses = 0;
  let googleAdsSkippedActiveLeaseRecoveries = 0;
  let googleAdsLeaseConflictRuns24h = 0;
  let metaSkippedActiveLeaseRecoveries = 0;
  let metaStaleRunCount24h = 0;
  const googleAdsBusinesses: NonNullable<AdminSyncHealthPayload["googleAdsBusinesses"]> = [];
  const metaBusinesses: NonNullable<AdminSyncHealthPayload["metaBusinesses"]> = [];
  let latestProgressHeartbeatAt: string | null = null;
  const metaSnapshotsByBusiness = new Map(
    (input.metaAuthoritativeSnapshots ?? [])
      .filter((snapshot): snapshot is MetaAuthoritativeBusinessOpsSnapshot => Boolean(snapshot))
      .map((snapshot) => [snapshot.businessId, snapshot]),
  );

  for (const row of input.jobs) {
    const triggeredMs = new Date(row.triggered_at).getTime();
    const within24h = Number.isFinite(triggeredMs) && Date.now() - triggeredMs <= 24 * 60 * 60_000;
    const isRunning = row.status === "running";
    const isStuck = isRunning && Date.now() - triggeredMs > 15 * 60_000;
    const isFailed = row.status === "failed" && within24h;
    const isDone = row.status === "done" && within24h;

    if (isRunning) runningJobs++;
    if (isStuck) {
      stuckJobs++;
      impactedBusinesses.add(row.business_id);
      issueTypes.push("Stuck sync jobs");
      issues.push({
        businessId: row.business_id,
        businessName: row.business_name,
        provider: row.provider,
        reportType: row.report_type,
        status: "running",
        detail: "This sync job has been running for more than 15 minutes.",
        triggeredAt: row.triggered_at,
        completedAt: row.completed_at,
      });
    }
    if (isFailed) {
      failedJobs24h++;
      impactedBusinesses.add(row.business_id);
      issueTypes.push("Failed sync jobs");
      issues.push({
        businessId: row.business_id,
        businessName: row.business_name,
        provider: row.provider,
        reportType: row.report_type,
        status: "failed",
        detail: row.error_message ?? "The sync job failed without a persisted error message.",
        triggeredAt: row.triggered_at,
        completedAt: row.completed_at,
      });
    }
    if (isDone) successJobs24h++;
  }

  for (const row of input.cooldowns) {
    impactedBusinesses.add(row.business_id);
    issueTypes.push("Active cooldowns");
    issues.push({
      businessId: row.business_id,
      businessName: row.business_name,
      provider: row.provider,
      reportType: row.request_type,
      status: "cooldown",
      detail: row.error_message ?? "Provider request is currently in cooldown.",
      triggeredAt: row.updated_at,
      completedAt: row.cooldown_until,
    });
  }

  for (const row of input.googleAdsHealth ?? []) {
    const queueDepth = Number(row.queue_depth ?? 0);
    const leasedPartitions = Number(row.leased_partitions ?? 0);
    const deadLetterPartitions = Number(row.dead_letter_partitions ?? 0);
    const campaignCompletedDays = Number(row.campaign_completed_days ?? 0);
    const searchTermCompletedDays = Number(row.search_term_completed_days ?? 0);
    const productCompletedDays = Number(row.product_completed_days ?? 0);
    const assetCompletedDays = Number(row.asset_completed_days ?? 0);
    const circuitBreakerOpen = Number(row.active_circuit_breakers ?? 0) > 0;
    const compactedPartitions = Number(row.compacted_partitions ?? 0);
    const quotaCallCount = Number(row.quota_call_count ?? 0);
    const quotaErrorCount = Number(row.quota_error_count ?? 0);
    const quotaBudget = Number(row.quota_budget ?? 0);
    const quotaPressure = Number(row.quota_pressure ?? 0);
    const recentRangeTotalDays = Math.max(1, Number(row.recent_range_total_days ?? 14));
    const recentSearchTermCompletedDays = Number(row.recent_search_term_completed_days ?? 0);
    const recentProductCompletedDays = Number(row.recent_product_completed_days ?? 0);
    const recentAssetCompletedDays = Number(row.recent_asset_completed_days ?? 0);
    const extendedRecentQueueDepth = Number(row.extended_recent_queue_depth ?? 0);
    const extendedRecentLeasedPartitions = Number(row.extended_recent_leased_partitions ?? 0);
    const extendedHistoricalQueueDepth = Number(row.extended_historical_queue_depth ?? 0);
    const extendedHistoricalLeasedPartitions = Number(row.extended_historical_leased_partitions ?? 0);
    const googleWorkerHealthy = Boolean(row.google_worker_healthy);
    const googleHeartbeatAgeMs =
      row.google_heartbeat_age_ms == null ? null : Number(row.google_heartbeat_age_ms);
    const googleRunnerLeaseActive = Boolean(row.google_runner_lease_active);
    const staleRunPressure = Number(row.stale_run_pressure ?? 0);
    const recoveryMode =
      circuitBreakerOpen
        ? "open"
        : Number(row.recovery_half_open ?? 0) > 0
        ? "half_open"
        : "closed";
    const canaryEnabled = isGoogleAdsExtendedCanaryBusiness(row.business_id);
    const safeModeActive =
      (process.env.GOOGLE_ADS_INCIDENT_SAFE_MODE?.trim().toLowerCase() ?? "") === "1" ||
      (process.env.GOOGLE_ADS_INCIDENT_SAFE_MODE?.trim().toLowerCase() ?? "") === "true";
    const effectiveMode =
      safeModeActive
        ? "safe_mode"
        : process.env.GOOGLE_ADS_EXTENDED_GENERAL_REOPEN?.trim().toLowerCase() === "1" ||
            process.env.GOOGLE_ADS_EXTENDED_GENERAL_REOPEN?.trim().toLowerCase() === "true"
          ? "general_reopen"
          : "canary_reopen";
    const recentExtendedReady =
      recentSearchTermCompletedDays >= recentRangeTotalDays &&
      recentProductCompletedDays >= recentRangeTotalDays &&
      recentAssetCompletedDays >= recentRangeTotalDays;
    const historicalExtendedReady =
      searchTermCompletedDays >= 365 &&
      productCompletedDays >= 365 &&
      assetCompletedDays >= 365;
    const googleProgressHeartbeat =
      row.latest_progress_heartbeat_at ?? row.latest_checkpoint_updated_at ?? null;
    const extendedRecoveryBlockReason =
      circuitBreakerOpen
        ? "circuit_breaker_open"
        : extendedRecentQueueDepth > 0 && extendedRecentLeasedPartitions === 0 && queueDepth > 0
          ? "recent_extended_not_leasing"
          : extendedHistoricalQueueDepth > 0 && recoveryMode !== "closed"
            ? "historical_recovery_suspended"
            : null;
    const googleProgressEvidence = buildProviderProgressEvidence({
      checkpointUpdatedAt: row.latest_checkpoint_updated_at ?? null,
      recentActivityWindowMinutes: 20,
      aggregation: "latest",
    });

    const progressState = classifyGoogleAdsProgressState({
      queueDepth,
      leasedPartitions,
      deadLetterPartitions,
      checkpointLagMinutes: computeLagMinutes(googleProgressHeartbeat),
      latestCheckpointUpdatedAt: row.latest_checkpoint_updated_at ?? null,
      reclaimCandidateCount: Number(row.reclaim_candidate_count ?? 0),
      leaseConflictRuns24h: Number(row.lease_conflict_runs_24h ?? 0),
      poisonedCheckpointCount: Number(row.poisoned_checkpoint_count ?? 0),
      staleRunPressure,
      recentExtendedReady,
      historicalExtendedReady,
      latestPartitionActivityAt: row.latest_partition_activity_at ?? null,
    });
    const stallFingerprints = deriveProviderStallFingerprints({
      queueDepth,
      leasedPartitions,
      checkpointLagMinutes: computeLagMinutes(googleProgressHeartbeat),
      latestPartitionActivityAt: row.latest_partition_activity_at ?? null,
      blocked:
        deadLetterPartitions > 0 ||
        Number(row.reclaim_candidate_count ?? 0) > 0 ||
        Number(row.lease_conflict_runs_24h ?? 0) > 0 ||
        Number(row.poisoned_checkpoint_count ?? 0) > 0,
      staleRunPressure,
      progressEvidence: googleProgressEvidence,
      blockedReasonCodes: deadLetterPartitions > 0 ? ["required_dead_letter_partitions"] : [],
      historicalBacklogDepth:
        extendedHistoricalQueueDepth + extendedHistoricalLeasedPartitions,
    });

    googleAdsBusinesses.push({
      businessId: row.business_id,
      businessName: row.business_name,
      queueDepth,
      leasedPartitions,
      deadLetterPartitions,
      oldestQueuedPartition: row.oldest_queued_partition,
      latestPartitionActivityAt: row.latest_partition_activity_at,
      campaignCompletedDays,
      searchTermCompletedDays,
      productCompletedDays,
      assetCompletedDays,
      latestCheckpointPhase: row.latest_checkpoint_phase ?? null,
      latestCheckpointUpdatedAt: row.latest_checkpoint_updated_at ?? null,
      lastProgressHeartbeatAt: row.latest_progress_heartbeat_at ?? row.latest_checkpoint_updated_at ?? null,
      checkpointLagMinutes: computeLagMinutes(googleProgressHeartbeat),
      lastSuccessfulPageIndex:
        row.last_successful_page_index == null ? null : Number(row.last_successful_page_index),
      resumeCapable:
        Boolean(row.latest_checkpoint_updated_at) &&
        Number(row.poisoned_checkpoint_count ?? 0) === 0,
      checkpointFailures: Number(row.checkpoint_failures ?? 0),
      poisonedCheckpointCount: Number(row.poisoned_checkpoint_count ?? 0),
      reclaimCandidateCount: Number(row.reclaim_candidate_count ?? 0),
      skippedActiveLeaseRecoveries: Number(row.skipped_active_lease_recoveries ?? 0),
      lastReclaimReason: row.last_reclaim_reason ?? null,
      leaseConflictRuns24h: Number(row.lease_conflict_runs_24h ?? 0),
      latestPoisonReason: row.latest_poison_reason ?? null,
      latestPoisonedAt: row.latest_poisoned_at ?? null,
      safeModeActive,
      circuitBreakerOpen,
      compactedPartitions,
      quotaCallCount,
      quotaErrorCount,
      quotaBudget,
      quotaPressure,
      recoveryMode,
      canaryEnabled,
      effectiveMode,
      recentSearchTermCompletedDays,
      recentProductCompletedDays,
      recentAssetCompletedDays,
      recentRangeTotalDays,
      recentExtendedReady,
      historicalExtendedReady,
      extendedRecentQueueDepth,
      extendedRecentLeasedPartitions,
      extendedHistoricalQueueDepth,
      extendedHistoricalLeasedPartitions,
      extendedRecoveryBlockReason,
      extendedRecentReadyThroughDate: row.extended_recent_ready_through_date ?? null,
      googleWorkerHealthy,
      googleHeartbeatAgeMs,
      googleRunnerLeaseActive,
      staleRunPressure,
      progressState,
      stallFingerprints,
    });

    if (
      (row.latest_progress_heartbeat_at ?? row.latest_checkpoint_updated_at) &&
      (!latestProgressHeartbeatAt ||
        new Date(String(row.latest_progress_heartbeat_at ?? row.latest_checkpoint_updated_at)).getTime() >
          new Date(latestProgressHeartbeatAt).getTime())
    ) {
      latestProgressHeartbeatAt = String(
        row.latest_progress_heartbeat_at ?? row.latest_checkpoint_updated_at
      );
    }

    googleAdsQueueDepth += queueDepth;
    googleAdsLeasedPartitions += leasedPartitions;
    googleAdsDeadLetterPartitions += deadLetterPartitions;
    googleAdsCompactedPartitions += compactedPartitions;
    googleAdsSkippedActiveLeaseRecoveries += Number(row.skipped_active_lease_recoveries ?? 0);
    googleAdsLeaseConflictRuns24h += Number(row.lease_conflict_runs_24h ?? 0);
    if (circuitBreakerOpen) googleAdsCircuitBreakerBusinesses += 1;
    if (recoveryMode === "half_open") googleAdsRecoveryBusinesses += 1;
    if (canaryEnabled) googleAdsCanaryBusinesses += 1;
    googleAdsBudgetPressureMax = Math.max(googleAdsBudgetPressureMax, quotaPressure);
    if (
      row.oldest_queued_partition &&
      (!googleAdsOldestQueuedPartition ||
        new Date(row.oldest_queued_partition).getTime() <
          new Date(googleAdsOldestQueuedPartition).getTime())
    ) {
      googleAdsOldestQueuedPartition = row.oldest_queued_partition;
    }

    if (deadLetterPartitions > 0) {
      impactedBusinesses.add(row.business_id);
      issueTypes.push("Google Ads dead-letter partitions");
      issues.push({
        businessId: row.business_id,
        businessName: row.business_name,
        provider: "google_ads",
        reportType: "queue_dead_letter",
        status: "failed",
        detail: `${deadLetterPartitions} Google Ads partition dead-letter durumunda.`,
        triggeredAt: row.latest_partition_activity_at,
        completedAt: row.oldest_queued_partition,
      });
    }

    if (queueDepth > 0 && leasedPartitions === 0) {
      impactedBusinesses.add(row.business_id);
      issueTypes.push("Google Ads queue backlog");
      issues.push({
        businessId: row.business_id,
        businessName: row.business_name,
        provider: "google_ads",
        reportType: "queue_backlog",
        status: "running",
        detail: `Google Ads queue backlog aktif. queued=${queueDepth}, campaign=${campaignCompletedDays}, search_terms=${searchTermCompletedDays}, products=${productCompletedDays}`,
        triggeredAt: row.latest_partition_activity_at,
        completedAt: row.oldest_queued_partition,
      });
    }

    if (
      googleProgressHeartbeat &&
      computeLagMinutes(googleProgressHeartbeat) != null &&
      (computeLagMinutes(googleProgressHeartbeat) ?? 0) > 20
    ) {
      impactedBusinesses.add(row.business_id);
      issueTypes.push("Google Ads stale checkpoints");
      issues.push({
        businessId: row.business_id,
        businessName: row.business_name,
        provider: "google_ads",
        reportType: "stale_checkpoint",
        status: leasedPartitions > 0 ? "running" : "failed",
        detail: `Google Ads checkpoint progress has not moved recently. phase=${row.latest_checkpoint_phase ?? "unknown"}, lag=${computeLagMinutes(googleProgressHeartbeat)}m, page=${Number(row.last_successful_page_index ?? 0)}`,
        triggeredAt: googleProgressHeartbeat,
        completedAt: row.oldest_queued_partition,
      });
    }

    if (
      leasedPartitions > 0 &&
      googleProgressHeartbeat &&
      (computeLagMinutes(googleProgressHeartbeat) ?? 0) > 8 &&
      (computeLagMinutes(googleProgressHeartbeat) ?? 0) <= 20
    ) {
      impactedBusinesses.add(row.business_id);
      issueTypes.push("Google Ads alive-slow partitions");
      issues.push({
        businessId: row.business_id,
        businessName: row.business_name,
        provider: "google_ads",
        reportType: "alive_slow",
        status: "running",
        detail: `Google Ads sync is still leased but progressing slowly. phase=${row.latest_checkpoint_phase ?? "unknown"}, lag=${computeLagMinutes(googleProgressHeartbeat)}m.`,
        triggeredAt: googleProgressHeartbeat,
        completedAt: row.oldest_queued_partition,
      });
    }

    if (Number(row.poisoned_checkpoint_count ?? 0) > 0) {
      impactedBusinesses.add(row.business_id);
      issueTypes.push("Google Ads poisoned checkpoints");
      issues.push({
        businessId: row.business_id,
        businessName: row.business_name,
        provider: "google_ads",
        reportType: "poisoned_checkpoint",
        status: "failed",
        detail: `${Number(row.poisoned_checkpoint_count ?? 0)} Google Ads checkpoints are marked as poison candidates and need review.`,
        triggeredAt:
          row.latest_poisoned_at ??
          row.latest_checkpoint_updated_at ??
          row.latest_partition_activity_at,
        completedAt: row.oldest_queued_partition,
      });
    }

    if (Number(row.reclaim_candidate_count ?? 0) > 0) {
      impactedBusinesses.add(row.business_id);
      issueTypes.push("Google Ads stalled reclaim candidates");
      issues.push({
        businessId: row.business_id,
        businessName: row.business_name,
        provider: "google_ads",
        reportType: "stalled_reclaimable",
        status: "failed",
        detail: `Recent reclaim activity detected. Last reason: ${row.last_reclaim_reason ?? "unknown"}.`,
        triggeredAt: row.latest_checkpoint_updated_at ?? row.latest_partition_activity_at,
        completedAt: row.oldest_queued_partition,
      });
    }

    if (Number(row.skipped_active_lease_recoveries ?? 0) > 0) {
      impactedBusinesses.add(row.business_id);
      issueTypes.push("Google Ads active-lease recovery skips");
      issues.push({
        businessId: row.business_id,
        businessName: row.business_name,
        provider: "google_ads",
        reportType: "skipped_active_lease",
        status: "running",
        detail: `${Number(row.skipped_active_lease_recoveries ?? 0)} Google Ads recovery attempts were skipped because work was still actively leased in the last 24 hours.`,
        triggeredAt: row.latest_partition_activity_at ?? row.latest_checkpoint_updated_at ?? null,
        completedAt: row.oldest_queued_partition,
      });
    }

    if (Number(row.lease_conflict_runs_24h ?? 0) > 0) {
      impactedBusinesses.add(row.business_id);
      issueTypes.push("Google Ads lease conflicts");
      issues.push({
        businessId: row.business_id,
        businessName: row.business_name,
        provider: "google_ads",
        reportType: "lease_conflict_runs",
        status: "failed",
        detail: `${Number(row.lease_conflict_runs_24h ?? 0)} Google Ads runs lost partition ownership in the last 24 hours.`,
        triggeredAt: row.latest_partition_activity_at ?? row.latest_checkpoint_updated_at ?? null,
        completedAt: row.oldest_queued_partition,
      });
    }

    if (circuitBreakerOpen) {
      impactedBusinesses.add(row.business_id);
      issueTypes.push("Google Ads circuit breaker");
      issues.push({
        businessId: row.business_id,
        businessName: row.business_name,
        provider: "google_ads",
        reportType: "google_ads_circuit_breaker",
        status: "cooldown",
        detail: "Google Ads circuit breaker is open; extended sync is suppressed for this business.",
        triggeredAt: row.latest_partition_activity_at,
        completedAt: null,
      });
    }
  }

  if ((input.googleAdsHealthStatus ?? "ok") !== "ok") {
    issueTypes.push("Google Ads health unavailable");
    if ((input.googleAdsHealth?.length ?? 0) === 0) {
      googleAdsQueueDepth =
        input.googleAdsHealthSummary?.queueDepth ?? googleAdsQueueDepth;
      googleAdsLeasedPartitions =
        input.googleAdsHealthSummary?.leasedPartitions ?? googleAdsLeasedPartitions;
      googleAdsDeadLetterPartitions =
        input.googleAdsHealthSummary?.deadLetterPartitions ?? googleAdsDeadLetterPartitions;
      googleAdsOldestQueuedPartition =
        input.googleAdsHealthSummary?.oldestQueuedPartition ?? googleAdsOldestQueuedPartition;
    }
  }

  for (const row of input.metaHealth ?? []) {
    const queueDepth = Number(row.queue_depth ?? 0);
    const leasedPartitions = Number(row.leased_partitions ?? 0);
    const retryableFailedPartitions = Number(row.retryable_failed_partitions ?? 0);
    const staleLeasePartitions = Number(row.stale_lease_partitions ?? 0);
    const deadLetterPartitions = Number(row.dead_letter_partitions ?? 0);
    const stateRowCount = Number(row.state_row_count ?? 0);
    const todayAccountRows = Number(row.today_account_rows ?? 0);
    const todayAdsetRows = Number(row.today_adset_rows ?? 0);
    const accountCompletedDays = Number(row.account_completed_days ?? 0);
    const adsetCompletedDays = Number(row.adset_completed_days ?? 0);
    const creativeCompletedDays = Number(row.creative_completed_days ?? 0);
    const adCompletedDays = Number(row.ad_completed_days ?? 0);
    const recentRangeTotalDays = Math.max(1, Number(row.recent_range_total_days ?? 14));
    const recentAccountCompletedDays = Number(row.recent_account_completed_days ?? 0);
    const recentAdsetCompletedDays = Number(row.recent_adset_completed_days ?? 0);
    const recentCreativeCompletedDays = Number(row.recent_creative_completed_days ?? 0);
    const recentAdCompletedDays = Number(row.recent_ad_completed_days ?? 0);
    const recentExtendedReady =
      recentCreativeCompletedDays >= recentRangeTotalDays &&
      recentAdCompletedDays >= recentRangeTotalDays;
    const historicalExtendedReady =
      creativeCompletedDays >= 365 && adCompletedDays >= 365;
    const metaProgressHeartbeat =
      row.latest_progress_heartbeat_at ?? row.latest_checkpoint_updated_at ?? null;
    const effectiveMode =
      !recentExtendedReady ? "core_only" : historicalExtendedReady ? "extended_normal" : "extended_recovery";
    const metaProgressEvidence = buildProviderProgressEvidence({
      checkpointUpdatedAt: row.latest_checkpoint_updated_at ?? null,
      recentActivityWindowMinutes: 20,
      aggregation: "latest",
    });
    const progressState = classifyMetaProgressState({
      queueDepth,
      leasedPartitions,
      deadLetterPartitions,
      retryableFailedPartitions,
      staleLeasePartitions,
      checkpointLagMinutes: computeLagMinutes(metaProgressHeartbeat),
      latestCheckpointUpdatedAt: row.latest_checkpoint_updated_at ?? null,
      reclaimCandidateCount: Number(row.reclaim_candidate_count ?? 0),
      staleRunCount24h: Number(row.stale_run_count_24h ?? 0),
      recentExtendedReady,
      historicalExtendedReady,
      latestPartitionActivityAt: row.latest_partition_activity_at ?? null,
    });
    const stallFingerprints = deriveProviderStallFingerprints({
      queueDepth,
      leasedPartitions,
      checkpointLagMinutes: computeLagMinutes(metaProgressHeartbeat),
      latestPartitionActivityAt: row.latest_partition_activity_at ?? null,
      blocked:
        deadLetterPartitions > 0 ||
        staleLeasePartitions > 0 ||
        Number(row.reclaim_candidate_count ?? 0) > 0 ||
        Number(row.stale_run_count_24h ?? 0) > 0,
      hasRepairableBacklog: retryableFailedPartitions > 0,
      staleRunPressure: Number(row.stale_run_count_24h ?? 0),
      progressEvidence: metaProgressEvidence,
      blockedReasonCodes: deadLetterPartitions > 0 ? ["required_dead_letter_partitions"] : [],
      historicalBacklogDepth: queueDepth,
    });

    metaBusinesses.push({
      businessId: row.business_id,
      businessName: row.business_name,
      queueDepth,
      leasedPartitions,
      retryableFailedPartitions,
      staleLeasePartitions,
      deadLetterPartitions,
      stateRowCount,
      todayAccountRows,
      todayAdsetRows,
      currentDayReference: row.current_day_reference,
      oldestQueuedPartition: row.oldest_queued_partition,
      latestPartitionActivityAt: row.latest_partition_activity_at,
      accountCompletedDays,
      adsetCompletedDays,
      creativeCompletedDays,
      effectiveMode,
      latestCheckpointScope: row.latest_checkpoint_scope,
      latestCheckpointPhase: row.latest_checkpoint_phase,
      latestCheckpointUpdatedAt: row.latest_checkpoint_updated_at,
      lastProgressHeartbeatAt: row.latest_progress_heartbeat_at ?? row.latest_checkpoint_updated_at,
      checkpointLagMinutes: computeLagMinutes(metaProgressHeartbeat),
      lastSuccessfulPageIndex:
        row.last_successful_page_index == null ? null : Number(row.last_successful_page_index),
      resumeCapable: Boolean(row.latest_checkpoint_updated_at),
      checkpointFailures: Number(row.checkpoint_failures ?? 0),
      reclaimCandidateCount: Number(row.reclaim_candidate_count ?? 0),
      skippedActiveLeaseRecoveries: Number(row.skipped_active_lease_recoveries ?? 0),
      lastReclaimReason: row.last_reclaim_reason ?? null,
      staleRunCount24h: Number(row.stale_run_count_24h ?? 0),
      recentAccountCompletedDays,
      recentAdsetCompletedDays,
      recentCreativeCompletedDays,
      recentAdCompletedDays,
      recentRangeTotalDays,
      recentExtendedReady,
      historicalExtendedReady,
      progressState,
      stallFingerprints,
      sourceManifestCounts: metaSnapshotsByBusiness.get(row.business_id)?.manifestCounts,
      latestAuthoritativePublishes: metaSnapshotsByBusiness.get(row.business_id)?.latestPublishes ?? [],
      d1FinalizeSla: metaSnapshotsByBusiness.get(row.business_id)?.d1FinalizeSla,
      validationFailures24h: metaSnapshotsByBusiness.get(row.business_id)?.validationFailures24h ?? 0,
      recentFailures: metaSnapshotsByBusiness.get(row.business_id)?.recentFailures ?? [],
      repairBacklog: metaSnapshotsByBusiness.get(row.business_id)?.progression.repairBacklog ?? 0,
      queuedVsLeasedVsPublished: metaSnapshotsByBusiness.get(row.business_id)?.progression,
      lastSuccessfulPublishAt:
        metaSnapshotsByBusiness.get(row.business_id)?.lastSuccessfulPublishAt ?? null,
    });

    if (
      (row.latest_progress_heartbeat_at ?? row.latest_checkpoint_updated_at) &&
      (!latestProgressHeartbeatAt ||
        new Date(String(row.latest_progress_heartbeat_at ?? row.latest_checkpoint_updated_at)).getTime() >
          new Date(latestProgressHeartbeatAt).getTime())
    ) {
      latestProgressHeartbeatAt = String(
        row.latest_progress_heartbeat_at ?? row.latest_checkpoint_updated_at
      );
    }

    metaQueueDepth += queueDepth;
    metaLeasedPartitions += leasedPartitions;
    metaDeadLetterPartitions += deadLetterPartitions;
    metaSourceManifestCount += metaSnapshotsByBusiness.get(row.business_id)?.manifestCounts.total ?? 0;
    metaPublishedProgression += metaSnapshotsByBusiness.get(row.business_id)?.progression.published ?? 0;
    metaValidationFailures24h += metaSnapshotsByBusiness.get(row.business_id)?.validationFailures24h ?? 0;
    metaRepairBacklog += metaSnapshotsByBusiness.get(row.business_id)?.progression.repairBacklog ?? 0;
    metaStaleLeasePartitions += metaSnapshotsByBusiness.get(row.business_id)?.progression.staleLeases ?? 0;
    metaD1FinalizeSlaBreaches += metaSnapshotsByBusiness.get(row.business_id)?.d1FinalizeSla.breachedAccounts ?? 0;
    const snapshotPublishAt = metaSnapshotsByBusiness.get(row.business_id)?.lastSuccessfulPublishAt ?? null;
    if (
      snapshotPublishAt &&
      (!metaLastSuccessfulPublishAt ||
        snapshotPublishAt.localeCompare(metaLastSuccessfulPublishAt) > 0)
    ) {
      metaLastSuccessfulPublishAt = snapshotPublishAt;
    }
    if (
      row.oldest_queued_partition &&
      (!metaOldestQueuedPartition ||
        new Date(row.oldest_queued_partition).getTime() <
          new Date(metaOldestQueuedPartition).getTime())
    ) {
      metaOldestQueuedPartition = row.oldest_queued_partition;
    }
    metaSkippedActiveLeaseRecoveries += Number(row.skipped_active_lease_recoveries ?? 0);
    metaStaleRunCount24h += Number(row.stale_run_count_24h ?? 0);

    if (deadLetterPartitions > 0) {
      impactedBusinesses.add(row.business_id);
      issueTypes.push("Meta dead-letter partitions");
      issues.push({
        businessId: row.business_id,
        businessName: row.business_name,
        provider: "meta",
        reportType: "queue_dead_letter",
        status: "failed",
        detail: `${deadLetterPartitions} Meta partition dead-letter durumunda.`,
        triggeredAt: row.latest_partition_activity_at,
        completedAt: row.oldest_queued_partition,
      });
    }

    if (stateRowCount === 0 && (queueDepth > 0 || leasedPartitions > 0 || deadLetterPartitions > 0)) {
      impactedBusinesses.add(row.business_id);
      issueTypes.push("Meta state missing");
      issues.push({
        businessId: row.business_id,
        businessName: row.business_name,
        provider: "meta",
        reportType: "state_missing",
        status: "failed",
        detail: `Meta sync state rows are missing. queue=${queueDepth}, leased=${leasedPartitions}, dead=${deadLetterPartitions}`,
        triggeredAt: row.latest_partition_activity_at,
        completedAt: row.oldest_queued_partition,
      });
    }

    if (staleLeasePartitions > 0) {
      impactedBusinesses.add(row.business_id);
      issueTypes.push("Meta stale leases");
      issues.push({
        businessId: row.business_id,
        businessName: row.business_name,
        provider: "meta",
        reportType: "stale_lease",
        status: "running",
        detail: `${staleLeasePartitions} Meta partitions look stuck in leased/running state and may need cleanup.`,
        triggeredAt: row.latest_partition_activity_at,
        completedAt: row.oldest_queued_partition,
      });
    }

    if (row.latest_checkpoint_updated_at && computeLagMinutes(row.latest_checkpoint_updated_at) != null && (computeLagMinutes(row.latest_checkpoint_updated_at) ?? 0) > 20) {
      impactedBusinesses.add(row.business_id);
      issueTypes.push("Meta stale checkpoints");
      issues.push({
        businessId: row.business_id,
        businessName: row.business_name,
        provider: "meta",
        reportType: "stale_checkpoint",
        status: leasedPartitions > 0 ? "running" : "failed",
        detail: `Meta checkpoint progress has not moved recently. phase=${row.latest_checkpoint_phase ?? "unknown"}, lag=${computeLagMinutes(row.latest_checkpoint_updated_at)}m, page=${Number(row.last_successful_page_index ?? 0)}`,
        triggeredAt: row.latest_checkpoint_updated_at,
        completedAt: row.oldest_queued_partition,
      });
    }

    if (retryableFailedPartitions > 0) {
      impactedBusinesses.add(row.business_id);
      issueTypes.push("Meta retryable failed backlog");
      issues.push({
        businessId: row.business_id,
        businessName: row.business_name,
        provider: "meta",
        reportType: "retryable_failed_backlog",
        status: leasedPartitions > 0 ? "running" : "failed",
        detail: `${retryableFailedPartitions} Meta partitions failed but are still retryable and should be re-queued automatically.`,
        triggeredAt: row.latest_partition_activity_at,
        completedAt: row.oldest_queued_partition,
      });
    }

    if (queueDepth > 0 && leasedPartitions === 0) {
      impactedBusinesses.add(row.business_id);
      issueTypes.push("Meta queue backlog");
      issues.push({
        businessId: row.business_id,
        businessName: row.business_name,
        provider: "meta",
        reportType: "queue_backlog",
        status: "running",
        detail: `Meta queue backlog aktif. queued=${queueDepth}, account=${accountCompletedDays}, adsets=${adsetCompletedDays}, creatives=${creativeCompletedDays}`,
        triggeredAt: row.latest_partition_activity_at,
        completedAt: row.oldest_queued_partition,
      });
      if (!row.latest_partition_activity_at || Date.now() - new Date(row.latest_partition_activity_at).getTime() > 15 * 60 * 1000) {
        issueTypes.push("Meta queue waiting for worker");
        issues.push({
          businessId: row.business_id,
          businessName: row.business_name,
          provider: "meta",
          reportType: "queue_waiting_worker",
          status: "running",
          detail: `Meta queue has items but no active worker. queued=${queueDepth}, leased=${leasedPartitions}, latest_activity=${row.latest_partition_activity_at ?? "none"}`,
          triggeredAt: row.latest_partition_activity_at,
          completedAt: row.oldest_queued_partition,
        });
      }
    }

    if ((todayAccountRows === 0 || todayAdsetRows === 0) && queueDepth > 0) {
      impactedBusinesses.add(row.business_id);
      issueTypes.push("Meta current day missing");
      issues.push({
        businessId: row.business_id,
        businessName: row.business_name,
        provider: "meta",
        reportType: "current_day_missing",
        status: leasedPartitions > 0 ? "running" : "failed",
        detail: `Meta current-day warehouse rows are missing. reference_day=${row.current_day_reference ?? "unknown"}, today_account_rows=${todayAccountRows}, today_adset_rows=${todayAdsetRows}, queue=${queueDepth}, leased=${leasedPartitions}`,
        triggeredAt: row.latest_partition_activity_at,
        completedAt: row.oldest_queued_partition,
      });
    }

    if (
      leasedPartitions > 0 &&
      metaProgressHeartbeat &&
      (computeLagMinutes(metaProgressHeartbeat) ?? 0) > 8 &&
      (computeLagMinutes(metaProgressHeartbeat) ?? 0) <= 20
    ) {
      impactedBusinesses.add(row.business_id);
      issueTypes.push("Meta alive-slow partitions");
      issues.push({
        businessId: row.business_id,
        businessName: row.business_name,
        provider: "meta",
        reportType: "alive_slow",
        status: "running",
        detail: `Meta sync is still leased but progressing slowly. phase=${row.latest_checkpoint_phase ?? "unknown"}, lag=${computeLagMinutes(metaProgressHeartbeat)}m.`,
        triggeredAt: metaProgressHeartbeat,
        completedAt: row.oldest_queued_partition,
      });
    }

    if (Number(row.reclaim_candidate_count ?? 0) > 0) {
      impactedBusinesses.add(row.business_id);
      issueTypes.push("Meta stalled reclaim candidates");
      issues.push({
        businessId: row.business_id,
        businessName: row.business_name,
        provider: "meta",
        reportType: "stalled_reclaimable",
        status: "failed",
        detail: `Recent reclaim activity detected. Last reason: ${row.last_reclaim_reason ?? "unknown"}.`,
        triggeredAt: row.latest_checkpoint_updated_at ?? row.latest_partition_activity_at,
        completedAt: row.oldest_queued_partition,
      });
    }

    if (Number(row.skipped_active_lease_recoveries ?? 0) > 0) {
      impactedBusinesses.add(row.business_id);
      issueTypes.push("Meta active-lease recovery skips");
      issues.push({
        businessId: row.business_id,
        businessName: row.business_name,
        provider: "meta",
        reportType: "skipped_active_lease",
        status: "running",
        detail: `${Number(row.skipped_active_lease_recoveries ?? 0)} Meta recovery attempts were skipped because work was still actively leased in the last 24 hours.`,
        triggeredAt: row.latest_partition_activity_at ?? row.latest_checkpoint_updated_at ?? null,
        completedAt: row.oldest_queued_partition,
      });
    }

    if (Number(row.stale_run_count_24h ?? 0) > 0) {
      impactedBusinesses.add(row.business_id);
      issueTypes.push("Meta stale runs");
      issues.push({
        businessId: row.business_id,
        businessName: row.business_name,
        provider: "meta",
        reportType: "stale_runs",
        status: "failed",
        detail: `${Number(row.stale_run_count_24h ?? 0)} Meta runs were auto-closed as stale in the last 24 hours.`,
        triggeredAt: row.latest_partition_activity_at ?? row.latest_checkpoint_updated_at ?? null,
        completedAt: row.oldest_queued_partition,
      });
    }
  }

  if ((input.workerHealth?.onlineWorkers ?? 0) === 0) {
    for (const row of [...googleAdsBusinesses, ...metaBusinesses]) {
      if ((row.leasedPartitions ?? 0) > 0) {
        impactedBusinesses.add(row.businessId);
        issueTypes.push("Worker offline with leased partitions");
        issues.push({
          businessId: row.businessId,
          businessName: row.businessName,
          provider: "latestCheckpointScope" in row ? "meta" : "google_ads",
          reportType: "worker_offline_with_leased_partitions",
          status: "failed",
          detail: "No worker heartbeat is active while partitions remain leased.",
          triggeredAt: row.latestPartitionActivityAt,
          completedAt: row.oldestQueuedPartition,
        });
      }
    }
  }

  const normalizedIssues = issues
    .map((issue) => ({
      ...issue,
      severity: getSyncIssueSeverity(issue),
      runbookKey: getSyncIssueRunbookKey(issue),
    }))
    .sort((a, b) => {
      const severityRank = { critical: 3, high: 2, medium: 1 } as const;
      const severityDiff = severityRank[b.severity] - severityRank[a.severity];
      if (severityDiff !== 0) return severityDiff;
      const left = a.triggeredAt ? new Date(a.triggeredAt).getTime() : 0;
      const right = b.triggeredAt ? new Date(b.triggeredAt).getTime() : 0;
      return right - left;
    });

  return {
    googleAdsHealthStatus: input.googleAdsHealthStatus ?? "ok",
    googleAdsHealthError: input.googleAdsHealthError ?? null,
    summary: {
      impactedBusinesses: impactedBusinesses.size,
      runningJobs,
      stuckJobs,
      failedJobs24h,
      activeCooldowns,
      successJobs24h,
      topIssue: getTopIssue(issueTypes),
      googleAdsQueueDepth,
      googleAdsLeasedPartitions,
      googleAdsDeadLetterPartitions,
      googleAdsOldestQueuedPartition,
      metaQueueDepth,
      metaLeasedPartitions,
      metaDeadLetterPartitions,
      metaOldestQueuedPartition,
      metaSourceManifestCount,
      metaPublishedProgression,
      metaValidationFailures24h,
      metaRepairBacklog,
      metaStaleLeasePartitions,
      metaLastSuccessfulPublishAt,
      metaD1FinalizeSlaBreaches,
      workerOnline: (input.workerHealth?.onlineWorkers ?? 0) > 0,
      workerInstances: input.workerHealth?.workerInstances ?? 0,
      workerLastHeartbeatAt: input.workerHealth?.lastHeartbeatAt ?? null,
      workerLastProgressHeartbeatAt: latestProgressHeartbeatAt,
      googleAdsSafeModeActive:
        (process.env.GOOGLE_ADS_INCIDENT_SAFE_MODE?.trim().toLowerCase() ?? "") === "1" ||
        (process.env.GOOGLE_ADS_INCIDENT_SAFE_MODE?.trim().toLowerCase() ?? "") === "true",
      googleAdsCircuitBreakerBusinesses,
      googleAdsCompactedPartitions,
      googleAdsBudgetPressureMax,
      googleAdsRecoveryBusinesses,
      googleAdsCanaryBusinesses,
      googleAdsSkippedActiveLeaseRecoveries,
      googleAdsLeaseConflictRuns24h,
      metaSkippedActiveLeaseRecoveries,
      metaStaleRunCount24h,
    },
    issues: normalizedIssues,
    workerHealth: input.workerHealth,
    googleAdsBusinesses: googleAdsBusinesses.sort((a, b) => {
      if (b.deadLetterPartitions !== a.deadLetterPartitions) {
        return b.deadLetterPartitions - a.deadLetterPartitions;
      }
      if (b.queueDepth !== a.queueDepth) {
        return b.queueDepth - a.queueDepth;
      }
      return a.businessName.localeCompare(b.businessName);
    }),
    metaBusinesses: metaBusinesses.sort((a, b) => {
      if (b.deadLetterPartitions !== a.deadLetterPartitions) {
        return b.deadLetterPartitions - a.deadLetterPartitions;
      }
      if (b.queueDepth !== a.queueDepth) {
        return b.queueDepth - a.queueDepth;
      }
      return a.businessName.localeCompare(b.businessName);
    }),
  };
}

export function buildAdminRevenueRisk(input: {
  workspaces: RawRevenueWorkspaceRow[];
  subscriptions: RawRevenueSubscriptionRow[];
}): AdminRevenueRiskPayload {
  const unsubscribedBusinesses = input.workspaces
    .filter((row) => {
      const createdAtMs = new Date(row.created_at).getTime();
      return Number.isFinite(createdAtMs) &&
        createdAtMs <= Date.now() - 7 * 24 * 60 * 60_000 &&
        !row.has_active_subscription;
    })
    .map((row) => ({
      businessId: row.business_id,
      businessName: row.business_name,
      ownerName: row.owner_name,
      ownerEmail: row.owner_email,
      createdAt: row.created_at,
      connectedIntegrations: Number(row.connected_integrations ?? 0),
      reason: "No active subscription",
    }));

  const subscriptionIssues = input.subscriptions
    .filter((row) => row.status !== "active")
    .map((row) => ({
      businessId: row.business_id,
      businessName: row.business_name,
      ownerName: row.owner_name,
      ownerEmail: row.owner_email,
      planId: row.plan_id,
      status: row.status,
      updatedAt: row.updated_at,
    }));

  const statusCounts = new Map<string, number>();
  let activeSubscriptions = 0;
  for (const row of input.subscriptions) {
    statusCounts.set(row.status, (statusCounts.get(row.status) ?? 0) + 1);
    if (row.status === "active") activeSubscriptions++;
  }

  const nonActiveSubscriptions = subscriptionIssues.length;
  const atRiskBusinesses = new Set([
    ...unsubscribedBusinesses.map((row) => row.businessId),
    ...subscriptionIssues.map((row) => row.businessId).filter(Boolean) as string[],
  ]).size;

  const issueTypes = [
    ...unsubscribedBusinesses.map(() => "No active subscription"),
    ...subscriptionIssues.map((row) => `Subscription ${row.status}`),
  ];

  return {
    summary: {
      atRiskBusinesses,
      activeSubscriptions,
      nonActiveSubscriptions,
      unsubscribedBusinesses: unsubscribedBusinesses.length,
      topIssue: getTopIssue(issueTypes),
    },
    unsubscribedBusinesses: unsubscribedBusinesses.sort(
      (a, b) => b.connectedIntegrations - a.connectedIntegrations
    ),
    subscriptionIssues: subscriptionIssues.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    ),
    statusBreakdown: Array.from(statusCounts.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count),
  };
}

async function readAuthRows() {
  const sql = getDb();
  return (await sql`
    SELECT
      i.business_id,
      b.name AS business_name,
      i.provider,
      i.status,
      i.refresh_token,
      i.token_expires_at,
      i.scopes,
      i.error_message,
      i.updated_at
    FROM integrations i
    JOIN businesses b ON b.id::text = i.business_id
    WHERE i.provider IN ('meta', 'google', 'search_console', 'ga4', 'shopify')
      AND i.status <> 'disconnected'
  `) as RawAuthIntegrationRow[];
}

async function readSyncJobs() {
  const sql = getDb();
  return (await sql`
    SELECT
      j.business_id,
      b.name AS business_name,
      j.provider,
      j.report_type,
      j.status,
      j.error_message,
      j.triggered_at,
      j.started_at,
      j.completed_at
    FROM provider_sync_jobs j
    JOIN businesses b ON b.id::text = j.business_id
    WHERE j.provider IN ('google_ads', 'ga4', 'search_console')
      AND j.triggered_at > now() - interval '7 days'
  `) as RawSyncJobRow[];
}

async function readActiveCooldowns() {
  const sql = getDb();
  return (await sql`
    SELECT
      c.business_id,
      b.name AS business_name,
      CASE WHEN c.provider = 'google' THEN 'google_ads' ELSE c.provider END AS provider,
      c.request_type,
      c.error_message,
      c.cooldown_until,
      c.updated_at
    FROM provider_cooldown_state c
    JOIN businesses b ON b.id::text = c.business_id
    WHERE c.provider IN ('google', 'google_ads', 'ga4', 'search_console')
      AND c.cooldown_until > now()
  `) as RawCooldownRow[];
}

async function readGoogleAdsHealthRows() {
  const sql = getDbWithTimeout(30_000);
  return (await sql`
    WITH partition_stats AS (
      SELECT
        business_id,
        COUNT(*) FILTER (WHERE status = 'queued') AS queue_depth,
        COUNT(*) FILTER (WHERE status IN ('leased', 'running')) AS leased_partitions,
        COUNT(*) FILTER (
          WHERE status IN ('leased', 'running')
            AND updated_at < now() - interval '15 minutes'
        ) AS stale_lease_partitions,
        COUNT(*) FILTER (WHERE status = 'dead_letter') AS dead_letter_partitions,
        MIN(partition_date) FILTER (WHERE status = 'queued') AS oldest_queued_partition,
        MAX(updated_at) AS latest_partition_activity_at,
        COUNT(*) FILTER (
          WHERE lane = 'extended'
            AND status = 'cancelled'
            AND last_error LIKE 'google_ads_incident_suppressed:%'
        ) AS compacted_partitions,
        COUNT(*) FILTER (
          WHERE lane = 'extended'
            AND source IN ('selected_range', 'today', 'recent', 'core_success', 'recent_recovery')
            AND status = 'queued'
        ) AS extended_recent_queue_depth,
        COUNT(*) FILTER (
          WHERE lane = 'extended'
            AND source IN ('selected_range', 'today', 'recent', 'core_success', 'recent_recovery')
            AND status IN ('leased', 'running')
        ) AS extended_recent_leased_partitions,
        COUNT(*) FILTER (
          WHERE lane = 'extended'
            AND source IN ('historical', 'historical_recovery')
            AND status = 'queued'
        ) AS extended_historical_queue_depth,
        COUNT(*) FILTER (
          WHERE lane = 'extended'
            AND source IN ('historical', 'historical_recovery')
            AND status IN ('leased', 'running')
        ) AS extended_historical_leased_partitions
      FROM google_ads_sync_partitions
      GROUP BY business_id
    ),
    state_stats AS (
      SELECT
        business_id,
        COUNT(DISTINCT CONCAT(provider_account_id, ':', scope)) AS state_row_count,
        MAX(completed_days) FILTER (WHERE scope = 'campaign_daily') AS campaign_completed_days,
        MAX(dead_letter_count) FILTER (WHERE scope = 'campaign_daily') AS campaign_dead_letter_count,
        MAX(completed_days) FILTER (WHERE scope = 'search_term_daily') AS search_term_completed_days,
        MAX(completed_days) FILTER (WHERE scope = 'product_daily') AS product_completed_days,
        MAX(completed_days) FILTER (WHERE scope = 'asset_daily') AS asset_completed_days
      FROM google_ads_sync_state
      GROUP BY business_id
    ),
    recent_search AS (
      SELECT business_id, COUNT(DISTINCT date) AS recent_search_term_completed_days
      FROM google_ads_search_term_daily
      WHERE date >= CURRENT_DATE - interval '13 days'
      GROUP BY business_id
    ),
    recent_product AS (
      SELECT business_id, COUNT(DISTINCT date) AS recent_product_completed_days
      FROM google_ads_product_daily
      WHERE date >= CURRENT_DATE - interval '13 days'
      GROUP BY business_id
    ),
    recent_asset AS (
      SELECT business_id, COUNT(DISTINCT date) AS recent_asset_completed_days
      FROM google_ads_asset_daily
      WHERE date >= CURRENT_DATE - interval '13 days'
      GROUP BY business_id
    ),
    recent_ready AS (
      SELECT business_id, MIN(date)::text AS extended_recent_ready_through_date
      FROM (
        SELECT business_id, date
        FROM google_ads_search_term_daily
        WHERE date >= CURRENT_DATE - interval '13 days'
        UNION ALL
        SELECT business_id, date
        FROM google_ads_product_daily
        WHERE date >= CURRENT_DATE - interval '13 days'
        UNION ALL
        SELECT business_id, date
        FROM google_ads_asset_daily
        WHERE date >= CURRENT_DATE - interval '13 days'
      ) recent_rows
      GROUP BY business_id
    ),
    checkpoint_latest AS (
      SELECT DISTINCT ON (business_id)
        business_id,
        phase AS latest_checkpoint_phase,
        COALESCE(progress_heartbeat_at, updated_at) AS latest_checkpoint_updated_at,
        COALESCE(progress_heartbeat_at, updated_at) AS latest_progress_heartbeat_at,
        page_index AS last_successful_page_index
      FROM google_ads_sync_checkpoints
      ORDER BY business_id, updated_at DESC
    ),
    checkpoint_rollup AS (
      SELECT
        business_id,
        COUNT(*) FILTER (WHERE status = 'failed') AS checkpoint_failures,
        COUNT(*) FILTER (WHERE poisoned_at IS NOT NULL) AS poisoned_checkpoint_count
      FROM google_ads_sync_checkpoints
      GROUP BY business_id
    ),
    checkpoint_poison AS (
      SELECT DISTINCT ON (business_id)
        business_id,
        poison_reason AS latest_poison_reason,
        poisoned_at AS latest_poisoned_at
      FROM google_ads_sync_checkpoints
      WHERE poisoned_at IS NOT NULL
      ORDER BY business_id, poisoned_at DESC
    ),
    breaker_stats AS (
      SELECT
        business_id,
        COUNT(*) FILTER (
          WHERE provider = 'google'
            AND request_type = '__global_circuit_breaker__'
            AND cooldown_until > now()
        ) AS active_circuit_breakers,
        COUNT(*) FILTER (
          WHERE provider = 'google'
            AND request_type = '__global_circuit_breaker_recovery__'
            AND cooldown_until > now()
        ) AS recovery_half_open
      FROM provider_cooldown_state
      GROUP BY business_id
    ),
    quota_stats AS (
      SELECT business_id, call_count, error_count
      FROM provider_quota_usage
      WHERE provider = 'google'
        AND quota_date = CURRENT_DATE
    ),
    runner_lease_stats AS (
      SELECT business_id, TRUE AS google_runner_lease_active
      FROM google_ads_runner_leases
      WHERE lease_expires_at > now()
      GROUP BY business_id
    ),
    stale_run_stats AS (
      SELECT
        business_id,
        COUNT(*) FILTER (WHERE error_class = 'stale_run') AS stale_run_pressure,
        COUNT(*) FILTER (
          WHERE error_class = 'lease_conflict'
            AND updated_at > now() - interval '24 hours'
        ) AS lease_conflict_runs_24h
      FROM google_ads_sync_runs
      WHERE error_class IN ('stale_run', 'lease_conflict')
        AND updated_at > now() - interval '24 hours'
      GROUP BY business_id
    ),
    reclaim_stats AS (
      SELECT
        business_id,
        COUNT(*) FILTER (
          WHERE event_type = 'reclaimed'
            AND created_at > now() - interval '24 hours'
        ) AS reclaim_candidate_count,
        COUNT(*) FILTER (
          WHERE event_type = 'skipped_active_lease'
            AND created_at > now() - interval '24 hours'
        ) AS skipped_active_lease_recoveries
      FROM sync_reclaim_events
      WHERE provider_scope = 'google_ads'
      GROUP BY business_id
    ),
    reclaim_reason AS (
      SELECT DISTINCT ON (business_id)
        business_id,
        reason_code AS last_reclaim_reason
      FROM sync_reclaim_events
      WHERE provider_scope = 'google_ads'
      ORDER BY business_id, created_at DESC
    ),
    worker_stats AS (
      SELECT
        (
          COUNT(*) FILTER (
            WHERE provider_scope IN ('google_ads', 'all')
              AND last_heartbeat_at > now() - interval '5 minutes'
          ) > 0
        ) AS google_worker_healthy,
        MIN(
          GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - last_heartbeat_at)) * 1000))::bigint
        ) FILTER (WHERE provider_scope IN ('google_ads', 'all')) AS google_heartbeat_age_ms
      FROM sync_worker_heartbeats
    )
    SELECT
      partition.business_id,
      b.name AS business_name,
      partition.queue_depth,
      partition.leased_partitions,
      partition.stale_lease_partitions,
      partition.dead_letter_partitions,
      COALESCE(state.state_row_count, 0) AS state_row_count,
      partition.oldest_queued_partition,
      partition.latest_partition_activity_at,
      COALESCE(state.campaign_completed_days, 0) AS campaign_completed_days,
      COALESCE(state.campaign_dead_letter_count, 0) AS campaign_dead_letter_count,
      COALESCE(state.search_term_completed_days, 0) AS search_term_completed_days,
      COALESCE(state.product_completed_days, 0) AS product_completed_days,
      COALESCE(state.asset_completed_days, 0) AS asset_completed_days,
      checkpoint_latest.latest_checkpoint_phase,
      checkpoint_latest.latest_checkpoint_updated_at,
      checkpoint_latest.latest_progress_heartbeat_at,
      checkpoint_latest.last_successful_page_index,
      COALESCE(checkpoint_rollup.checkpoint_failures, 0) AS checkpoint_failures,
      COALESCE(checkpoint_rollup.poisoned_checkpoint_count, 0) AS poisoned_checkpoint_count,
      checkpoint_poison.latest_poison_reason,
      checkpoint_poison.latest_poisoned_at,
      COALESCE(breaker_stats.active_circuit_breakers, 0) AS active_circuit_breakers,
      COALESCE(breaker_stats.recovery_half_open, 0) AS recovery_half_open,
      partition.compacted_partitions,
      COALESCE(quota_stats.call_count, 0) AS quota_call_count,
      COALESCE(quota_stats.error_count, 0) AS quota_error_count,
      ${Math.max(1, Number(process.env.GOOGLE_ADS_DAILY_REQUEST_BUDGET_PER_BUSINESS) || 5000)}::int AS quota_budget,
      CASE
        WHEN ${Math.max(1, Number(process.env.GOOGLE_ADS_DAILY_REQUEST_BUDGET_PER_BUSINESS) || 5000)}::numeric > 0
          THEN COALESCE(quota_stats.call_count, 0)::numeric / ${Math.max(1, Number(process.env.GOOGLE_ADS_DAILY_REQUEST_BUDGET_PER_BUSINESS) || 5000)}::numeric
        ELSE 0
      END AS quota_pressure,
      COALESCE(recent_search.recent_search_term_completed_days, 0) AS recent_search_term_completed_days,
      COALESCE(recent_product.recent_product_completed_days, 0) AS recent_product_completed_days,
      COALESCE(recent_asset.recent_asset_completed_days, 0) AS recent_asset_completed_days,
      14::int AS recent_range_total_days,
      partition.extended_recent_queue_depth,
      partition.extended_recent_leased_partitions,
      partition.extended_historical_queue_depth,
      partition.extended_historical_leased_partitions,
      recent_ready.extended_recent_ready_through_date,
      worker_stats.google_worker_healthy,
      worker_stats.google_heartbeat_age_ms,
      COALESCE(runner_lease_stats.google_runner_lease_active, FALSE) AS google_runner_lease_active,
      COALESCE(stale_run_stats.stale_run_pressure, 0) AS stale_run_pressure,
      COALESCE(stale_run_stats.lease_conflict_runs_24h, 0) AS lease_conflict_runs_24h,
      COALESCE(reclaim_stats.reclaim_candidate_count, 0) AS reclaim_candidate_count,
      COALESCE(reclaim_stats.skipped_active_lease_recoveries, 0) AS skipped_active_lease_recoveries,
      reclaim_reason.last_reclaim_reason
    FROM partition_stats partition
    JOIN businesses b ON b.id::text = partition.business_id
    LEFT JOIN state_stats state ON state.business_id = partition.business_id
    LEFT JOIN recent_search ON recent_search.business_id = partition.business_id
    LEFT JOIN recent_product ON recent_product.business_id = partition.business_id
    LEFT JOIN recent_asset ON recent_asset.business_id = partition.business_id
    LEFT JOIN recent_ready ON recent_ready.business_id = partition.business_id
    LEFT JOIN checkpoint_latest ON checkpoint_latest.business_id = partition.business_id
    LEFT JOIN checkpoint_rollup ON checkpoint_rollup.business_id = partition.business_id
    LEFT JOIN checkpoint_poison ON checkpoint_poison.business_id = partition.business_id
    LEFT JOIN breaker_stats ON breaker_stats.business_id = partition.business_id
    LEFT JOIN quota_stats ON quota_stats.business_id = partition.business_id
    LEFT JOIN runner_lease_stats ON runner_lease_stats.business_id = partition.business_id
    LEFT JOIN stale_run_stats ON stale_run_stats.business_id = partition.business_id
    LEFT JOIN reclaim_stats ON reclaim_stats.business_id = partition.business_id
    LEFT JOIN reclaim_reason ON reclaim_reason.business_id = partition.business_id
    CROSS JOIN worker_stats
    ORDER BY partition.dead_letter_partitions DESC, partition.queue_depth DESC, partition.latest_partition_activity_at DESC
  `) as RawGoogleAdsHealthRow[];
}

async function readGoogleAdsHealthSummaryRow() {
  const sql = getDb();
  const rows = (await sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'queued') AS queue_depth,
      COUNT(*) FILTER (WHERE status IN ('leased', 'running')) AS leased_partitions,
      COUNT(*) FILTER (WHERE status = 'dead_letter') AS dead_letter_partitions,
      MIN(partition_date) FILTER (WHERE status = 'queued') AS oldest_queued_partition
    FROM google_ads_sync_partitions
  `) as Array<Record<string, unknown>>;
  const row = rows[0] ?? {};
  return {
    queueDepth: Number(row.queue_depth ?? 0),
    leasedPartitions: Number(row.leased_partitions ?? 0),
    deadLetterPartitions: Number(row.dead_letter_partitions ?? 0),
    oldestQueuedPartition:
      typeof row.oldest_queued_partition === "string"
        ? row.oldest_queued_partition
        : row.oldest_queued_partition instanceof Date
          ? row.oldest_queued_partition.toISOString()
          : null,
  } satisfies GoogleAdsHealthSummaryRow;
}

async function readMetaHealthRows() {
  const sql = getDb();
  return (await sql`
    SELECT
      partition.business_id,
      b.name AS business_name,
      COUNT(*) FILTER (WHERE partition.status = 'queued') AS queue_depth,
      COUNT(*) FILTER (WHERE partition.status IN ('leased', 'running')) AS leased_partitions,
      COUNT(*) FILTER (WHERE partition.status = 'failed') AS retryable_failed_partitions,
      COUNT(*) FILTER (
        WHERE partition.status IN ('leased', 'running')
          AND partition.updated_at < now() - interval '15 minutes'
      ) AS stale_lease_partitions,
      COUNT(*) FILTER (WHERE partition.status = 'dead_letter') AS dead_letter_partitions,
      COUNT(DISTINCT CONCAT(state.provider_account_id, ':', state.scope)) AS state_row_count,
      MIN(partition.partition_date) FILTER (WHERE partition.status = 'queued') AS oldest_queued_partition,
      MAX(partition.updated_at) AS latest_partition_activity_at,
      checkpoint.latest_checkpoint_scope,
      checkpoint.latest_checkpoint_phase,
      checkpoint.latest_checkpoint_updated_at,
      checkpoint.latest_progress_heartbeat_at,
      checkpoint.last_successful_page_index,
      checkpoint.checkpoint_failures,
      reclaim.reclaim_candidate_count,
      reclaim.last_reclaim_reason,
      (
        SELECT MAX(today_partition.partition_date)
        FROM meta_sync_partitions today_partition
        WHERE today_partition.business_id = partition.business_id
          AND today_partition.source = 'today'
      ) AS current_day_reference,
      (
        SELECT COUNT(*)::int
        FROM meta_account_daily account_daily
        WHERE account_daily.business_id = partition.business_id
          AND account_daily.date = (
            SELECT MAX(today_partition.partition_date)
            FROM meta_sync_partitions today_partition
            WHERE today_partition.business_id = partition.business_id
              AND today_partition.source = 'today'
          )
      ) AS today_account_rows,
      (
        SELECT COUNT(*)::int
        FROM meta_adset_daily adset_daily
        WHERE adset_daily.business_id = partition.business_id
          AND adset_daily.date = (
            SELECT MAX(today_partition.partition_date)
            FROM meta_sync_partitions today_partition
            WHERE today_partition.business_id = partition.business_id
              AND today_partition.source = 'today'
          )
      ) AS today_adset_rows,
      MAX(state.completed_days) FILTER (WHERE state.scope = 'account_daily') AS account_completed_days,
      MAX(state.completed_days) FILTER (WHERE state.scope = 'adset_daily') AS adset_completed_days,
      MAX(state.completed_days) FILTER (WHERE state.scope = 'creative_daily') AS creative_completed_days,
      MAX(state.completed_days) FILTER (WHERE state.scope = 'ad_daily') AS ad_completed_days,
      COALESCE(recent.recent_account_completed_days, 0) AS recent_account_completed_days,
      COALESCE(recent.recent_adset_completed_days, 0) AS recent_adset_completed_days,
      COALESCE(recent.recent_creative_completed_days, 0) AS recent_creative_completed_days,
      COALESCE(recent.recent_ad_completed_days, 0) AS recent_ad_completed_days,
      COALESCE(recent.recent_range_total_days, 14) AS recent_range_total_days
    FROM meta_sync_partitions partition
    JOIN businesses b ON b.id::text = partition.business_id
    LEFT JOIN meta_sync_state state
      ON state.business_id = partition.business_id
      AND state.provider_account_id = partition.provider_account_id
    LEFT JOIN LATERAL (
      SELECT
        latest.checkpoint_scope AS latest_checkpoint_scope,
        latest.phase AS latest_checkpoint_phase,
        latest.updated_at AS latest_checkpoint_updated_at,
        latest.updated_at AS latest_progress_heartbeat_at,
        latest.page_index AS last_successful_page_index,
        (
          SELECT COUNT(*)::int
          FROM meta_sync_checkpoints failures
          WHERE failures.business_id = partition.business_id
            AND failures.status = 'failed'
        ) AS checkpoint_failures
      FROM meta_sync_checkpoints latest
      WHERE latest.business_id = partition.business_id
      ORDER BY latest.updated_at DESC
      LIMIT 1
    ) checkpoint ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        COUNT(DISTINCT date) FILTER (WHERE scope = 'account_daily') AS recent_account_completed_days,
        COUNT(DISTINCT date) FILTER (WHERE scope = 'adset_daily') AS recent_adset_completed_days,
        COUNT(DISTINCT date) FILTER (WHERE scope = 'creative_daily') AS recent_creative_completed_days,
        COUNT(DISTINCT date) FILTER (WHERE scope = 'ad_daily') AS recent_ad_completed_days,
        14::int AS recent_range_total_days
      FROM (
        SELECT 'account_daily'::text AS scope, date
        FROM meta_account_daily
        WHERE business_id = partition.business_id
          AND date >= CURRENT_DATE - interval '13 days'
        UNION ALL
        SELECT 'adset_daily'::text AS scope, date
        FROM meta_adset_daily
        WHERE business_id = partition.business_id
          AND date >= CURRENT_DATE - interval '13 days'
        UNION ALL
        SELECT 'creative_daily'::text AS scope, date
        FROM meta_creative_daily
        WHERE business_id = partition.business_id
          AND date >= CURRENT_DATE - interval '13 days'
        UNION ALL
        SELECT 'ad_daily'::text AS scope, date
        FROM meta_ad_daily
        WHERE business_id = partition.business_id
          AND date >= CURRENT_DATE - interval '13 days'
      ) recent_rows
    ) recent ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        (
          SELECT COUNT(*)::int
          FROM sync_reclaim_events reclaim_count
          WHERE reclaim_count.provider_scope = 'meta'
            AND reclaim_count.business_id = partition.business_id
            AND reclaim_count.event_type = 'reclaimed'
            AND reclaim_count.created_at > now() - interval '24 hours'
        ) AS reclaim_candidate_count,
        (
          SELECT COUNT(*)::int
          FROM sync_reclaim_events reclaim_skip
          WHERE reclaim_skip.provider_scope = 'meta'
            AND reclaim_skip.business_id = partition.business_id
            AND reclaim_skip.event_type = 'skipped_active_lease'
            AND reclaim_skip.created_at > now() - interval '24 hours'
        ) AS skipped_active_lease_recoveries,
        (
          SELECT latest_reclaim.reason_code
          FROM sync_reclaim_events latest_reclaim
          WHERE latest_reclaim.provider_scope = 'meta'
            AND latest_reclaim.business_id = partition.business_id
          ORDER BY latest_reclaim.created_at DESC
          LIMIT 1
        ) AS last_reclaim_reason,
        (
          SELECT COUNT(*)::int
          FROM meta_sync_runs stale_runs
          WHERE stale_runs.business_id = partition.business_id
            AND stale_runs.error_class = 'stale_run'
            AND stale_runs.updated_at > now() - interval '24 hours'
        ) AS stale_run_count_24h
    ) reclaim ON TRUE
    GROUP BY
      partition.business_id,
      b.name,
      checkpoint.latest_checkpoint_scope,
      checkpoint.latest_checkpoint_phase,
      checkpoint.latest_checkpoint_updated_at,
      checkpoint.latest_progress_heartbeat_at,
      checkpoint.last_successful_page_index,
      checkpoint.checkpoint_failures,
      reclaim.reclaim_candidate_count,
      reclaim.skipped_active_lease_recoveries,
      reclaim.last_reclaim_reason,
      reclaim.stale_run_count_24h,
      recent.recent_account_completed_days,
      recent.recent_adset_completed_days,
      recent.recent_creative_completed_days,
      recent.recent_ad_completed_days,
      recent.recent_range_total_days
    HAVING COUNT(*) > 0
    ORDER BY dead_letter_partitions DESC, queue_depth DESC, latest_partition_activity_at DESC
  `) as RawMetaHealthRow[];
}

async function readRevenueWorkspaces() {
  const sql = getDb();
  return (await sql`
    SELECT
      b.id::text AS business_id,
      b.name AS business_name,
      u.name AS owner_name,
      u.email AS owner_email,
      b.created_at,
      COUNT(DISTINCT i.id) FILTER (WHERE i.status = 'connected') AS connected_integrations,
      BOOL_OR(ss.status = 'active') AS has_active_subscription
    FROM businesses b
    JOIN users u ON u.id = b.owner_id
    LEFT JOIN integrations i ON i.business_id = b.id::text
    LEFT JOIN shopify_subscriptions ss ON ss.business_id = b.id
    WHERE COALESCE(b.is_demo_business, false) = false
    GROUP BY b.id, u.id
  `) as RawRevenueWorkspaceRow[];
}

async function readRevenueSubscriptions() {
  const sql = getDb();
  return (await sql`
    SELECT
      ss.business_id::text AS business_id,
      b.name AS business_name,
      u.name AS owner_name,
      u.email AS owner_email,
      ss.plan_id,
      ss.status,
      ss.updated_at
    FROM shopify_subscriptions ss
    LEFT JOIN businesses b ON b.id = ss.business_id
    LEFT JOIN users u ON u.id = ss.user_id
  `) as RawRevenueSubscriptionRow[];
}

export async function getAdminOperationsHealth() {
  const [authRows, syncJobs, cooldowns, googleAdsHealthResult, metaHealth, revenueWorkspaces, revenueSubscriptions, workerHealth] =
    await Promise.all([
      readAuthRows().catch(() => []),
      readSyncJobs().catch(() => []),
      readActiveCooldowns().catch(() => []),
      (async () => {
        try {
          const rows = await readGoogleAdsHealthRows();
          return {
            status: "ok" as const,
            error: null,
            rows,
            summary: null,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const summary = await readGoogleAdsHealthSummaryRow().catch(() => null);
          return {
            status: summary ? ("degraded" as const) : ("failed" as const),
            error: message,
            rows: [] as RawGoogleAdsHealthRow[],
            summary,
          };
        }
      })(),
      readMetaHealthRows().catch(() => []),
      readRevenueWorkspaces().catch(() => []),
      readRevenueSubscriptions().catch(() => []),
      getSyncWorkerHealthSummary().catch(() => ({
        onlineWorkers: 0,
        workerInstances: 0,
        lastHeartbeatAt: null,
        lastProgressHeartbeatAt: null,
        workers: [],
      })),
    ]);
  const metaAuthoritativeSnapshots = await Promise.all(
    metaHealth.map((row) =>
      getMetaAuthoritativeBusinessOpsSnapshot({ businessId: row.business_id }).catch(() => null),
    ),
  );

  const authHealth = buildAdminAuthHealth(authRows);
  const syncHealth = buildAdminSyncHealth({
    jobs: syncJobs,
    cooldowns,
    googleAdsHealth: googleAdsHealthResult.rows,
    googleAdsHealthStatus: googleAdsHealthResult.status,
    googleAdsHealthError: googleAdsHealthResult.error,
    googleAdsHealthSummary: googleAdsHealthResult.summary,
    metaHealth,
    metaAuthoritativeSnapshots: metaAuthoritativeSnapshots.filter(
      (snapshot): snapshot is MetaAuthoritativeBusinessOpsSnapshot => Boolean(snapshot),
    ),
    workerHealth,
  });
  const revenueRisk = buildAdminRevenueRisk({
    workspaces: revenueWorkspaces,
    subscriptions: revenueSubscriptions,
  });

  return {
    authHealth,
    syncHealth,
    revenueRisk,
  };
}
