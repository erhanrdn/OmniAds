import { getDb } from "@/lib/db";

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
  status: "failed" | "running" | "cooldown";
  detail: string;
  triggeredAt: string | null;
  completedAt: string | null;
}

export interface AdminSyncHealthPayload {
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
  };
  issues: AdminSyncIssueRow[];
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
  }>;
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
  today_account_rows: number | string;
  today_adset_rows: number | string;
  account_completed_days: number | string | null;
  adset_completed_days: number | string | null;
  creative_completed_days: number | string | null;
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
  metaHealth?: RawMetaHealthRow[];
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
  const googleAdsBusinesses: NonNullable<AdminSyncHealthPayload["googleAdsBusinesses"]> = [];
  const metaBusinesses: NonNullable<AdminSyncHealthPayload["metaBusinesses"]> = [];

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
    });

    googleAdsQueueDepth += queueDepth;
    googleAdsLeasedPartitions += leasedPartitions;
    googleAdsDeadLetterPartitions += deadLetterPartitions;
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
    });

    metaQueueDepth += queueDepth;
    metaLeasedPartitions += leasedPartitions;
    metaDeadLetterPartitions += deadLetterPartitions;
    if (
      row.oldest_queued_partition &&
      (!metaOldestQueuedPartition ||
        new Date(row.oldest_queued_partition).getTime() <
          new Date(metaOldestQueuedPartition).getTime())
    ) {
      metaOldestQueuedPartition = row.oldest_queued_partition;
    }

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
  }

  return {
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
    },
    issues: issues.sort((a, b) => {
      const left = a.triggeredAt ? new Date(a.triggeredAt).getTime() : 0;
      const right = b.triggeredAt ? new Date(b.triggeredAt).getTime() : 0;
      return right - left;
    }),
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
      c.provider,
      c.request_type,
      c.error_message,
      c.cooldown_until,
      c.updated_at
    FROM provider_cooldown_state c
    JOIN businesses b ON b.id::text = c.business_id
    WHERE c.provider IN ('google_ads', 'ga4', 'search_console')
      AND c.cooldown_until > now()
  `) as RawCooldownRow[];
}

async function readGoogleAdsHealthRows() {
  const sql = getDb();
  return (await sql`
    SELECT
      partition.business_id,
      b.name AS business_name,
      COUNT(*) FILTER (WHERE partition.status = 'queued') AS queue_depth,
      COUNT(*) FILTER (WHERE partition.status IN ('leased', 'running')) AS leased_partitions,
      COUNT(*) FILTER (
        WHERE partition.status IN ('leased', 'running')
          AND partition.updated_at < now() - interval '15 minutes'
      ) AS stale_lease_partitions,
      COUNT(*) FILTER (WHERE partition.status = 'dead_letter') AS dead_letter_partitions,
      COUNT(DISTINCT CONCAT(state.provider_account_id, ':', state.scope)) AS state_row_count,
      MIN(partition.partition_date) FILTER (WHERE partition.status = 'queued') AS oldest_queued_partition,
      MAX(partition.updated_at) AS latest_partition_activity_at,
      MAX(state.completed_days) FILTER (WHERE state.scope = 'campaign_daily') AS campaign_completed_days,
      MAX(state.dead_letter_count) FILTER (WHERE state.scope = 'campaign_daily') AS campaign_dead_letter_count,
      MAX(state.completed_days) FILTER (WHERE state.scope = 'search_term_daily') AS search_term_completed_days,
      MAX(state.completed_days) FILTER (WHERE state.scope = 'product_daily') AS product_completed_days
    FROM google_ads_sync_partitions partition
    JOIN businesses b ON b.id::text = partition.business_id
    LEFT JOIN google_ads_sync_state state
      ON state.business_id = partition.business_id
      AND state.provider_account_id = partition.provider_account_id
    GROUP BY partition.business_id, b.name
    HAVING COUNT(*) > 0
    ORDER BY dead_letter_partitions DESC, queue_depth DESC, latest_partition_activity_at DESC
  `) as RawGoogleAdsHealthRow[];
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
      MAX(state.completed_days) FILTER (WHERE state.scope = 'creative_daily') AS creative_completed_days
    FROM meta_sync_partitions partition
    JOIN businesses b ON b.id::text = partition.business_id
    LEFT JOIN meta_sync_state state
      ON state.business_id = partition.business_id
      AND state.provider_account_id = partition.provider_account_id
    GROUP BY partition.business_id, b.name
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
  const [authRows, syncJobs, cooldowns, googleAdsHealth, metaHealth, revenueWorkspaces, revenueSubscriptions] =
    await Promise.all([
      readAuthRows().catch(() => []),
      readSyncJobs().catch(() => []),
      readActiveCooldowns().catch(() => []),
      readGoogleAdsHealthRows().catch(() => []),
      readMetaHealthRows().catch(() => []),
      readRevenueWorkspaces().catch(() => []),
      readRevenueSubscriptions().catch(() => []),
    ]);

  const authHealth = buildAdminAuthHealth(authRows);
  const syncHealth = buildAdminSyncHealth({
    jobs: syncJobs,
    cooldowns,
    googleAdsHealth,
    metaHealth,
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
