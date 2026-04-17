import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { configureOperationalScriptRuntime } from "./_operational-runtime";
import { getDb } from "@/lib/db";
import { getAdminOperationsHealth } from "@/lib/admin-operations-health";
import { getIntegration } from "@/lib/integrations";
import {
  refreshGoogleAccessToken,
} from "@/lib/google-ads-accounts";
import { GOOGLE_CONFIG } from "@/lib/oauth/google-config";
import {
  getGoogleAdsReclaimClassificationSummary,
  getGoogleAdsWarehouseIntegrityIncidents,
} from "@/lib/google-ads/warehouse";
import {
  fetchMetaAdAccounts,
  getMetaApiErrorMessage,
} from "@/lib/meta-ad-accounts";
import {
  getMetaAuthoritativeBusinessOpsSnapshot,
  getMetaReclaimClassificationSummary,
  getMetaWarehouseIntegrityIncidents,
} from "@/lib/meta/warehouse";

const TARGET_BUSINESS_NAMES = [
  "Grandmix",
  "IwaStore",
  "TheSwaf",
  "Bilsem Zeka",
  "Tiles Workshop",
  "Halıcızade",
] as const;

type ParsedArgs = {
  stage: string;
  outDir: string;
};

type ProviderAssignmentCandidates = {
  meta: Map<string, string[]>;
  googleAds: Map<string, string[]>;
};

function parseArgs(argv: string[]): ParsedArgs {
  let stage = "snapshot";
  let outDir = "";

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if ((current === "--stage" || current === "-s") && argv[index + 1]) {
      stage = argv[index + 1] ?? stage;
      index += 1;
      continue;
    }
    if ((current === "--out-dir" || current === "-o") && argv[index + 1]) {
      outDir = argv[index + 1] ?? outDir;
      index += 1;
      continue;
    }
  }

  if (!outDir) {
    throw new Error("--out-dir is required");
  }

  return { stage, outDir };
}

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
}

function normalizeDate(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  if (Number.isFinite(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return text;
}

function normalizeTimestamp(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : String(value);
}

function normalizeAccountId(value: string | null | undefined) {
  if (!value) return null;
  return value.replace(/\D/g, "");
}

function uniqueNormalizedAccountIds(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => normalizeAccountId(value))
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

async function writeJson(baseDir: string, relativePath: string, payload: unknown) {
  const fullPath = path.join(baseDir, relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, JSON.stringify(payload, null, 2));
}

async function fetchAccessibleGoogleAdsCustomers(accessToken: string) {
  const response = await fetch(`${GOOGLE_CONFIG.adsApiBase}/customers:listAccessibleCustomers`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": GOOGLE_CONFIG.developerToken,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const rawBody = await response.text();
  let payload: { resourceNames?: string[]; error?: { message?: string } } | null = null;
  try {
    payload = rawBody ? JSON.parse(rawBody) as { resourceNames?: string[]; error?: { message?: string } } : null;
  } catch {
    payload = null;
  }
  const customerIds = Array.isArray(payload?.resourceNames)
    ? payload.resourceNames
        .map((resourceName) => resourceName.split("/").at(-1) ?? null)
        .filter((value): value is string => Boolean(value))
    : [];
  return {
    ok: response.ok && !payload?.error,
    status: response.status,
    customerIds,
    error: payload?.error?.message ?? (!response.ok ? rawBody : null),
  };
}

async function captureProviderDiscovery(input: {
  businessId: string;
  businessName: string;
  assignmentCandidates: ProviderAssignmentCandidates;
}) {
  const [metaIntegration, googleIntegration] = await Promise.all([
    getIntegration(input.businessId, "meta").catch(() => null),
    getIntegration(input.businessId, "google").catch(() => null),
  ]);

  const expectedMetaAccountIds = uniqueNormalizedAccountIds([
    ...(input.assignmentCandidates.meta.get(input.businessId) ?? []),
    metaIntegration?.provider_account_id ?? null,
  ]);
  const expectedGoogleAccountIds = uniqueNormalizedAccountIds([
    ...(input.assignmentCandidates.googleAds.get(input.businessId) ?? []),
    googleIntegration?.provider_account_id ?? null,
  ]);

  const metaAudit = !metaIntegration || metaIntegration.status !== "connected"
    ? {
        provider: "meta" as const,
        status: metaIntegration?.status ?? "missing",
        healthy: false,
        reason: "integration_not_connected",
      }
    : await (async () => {
        const result = await fetchMetaAdAccounts(metaIntegration.access_token ?? "");
        const discoveredAccountIds = uniqueNormalizedAccountIds(
          result.normalized.flatMap((account) => [account.id, account.raw_id]),
        );
        const assignedAccountPresent =
          expectedMetaAccountIds.length === 0
            ? discoveredAccountIds.length > 0
            : expectedMetaAccountIds.some((assignedId) => discoveredAccountIds.includes(assignedId));
        return {
          provider: "meta" as const,
          status: metaIntegration.status,
          healthy: result.ok && assignedAccountPresent,
          httpStatus: result.status,
          assignedAccountId: metaIntegration.provider_account_id,
          assignmentCandidates: expectedMetaAccountIds,
          assignedAccountPresent,
          discoveredAccountCount: result.normalized.length,
          reason:
            result.ok && assignedAccountPresent
              ? "ok"
              : assignedAccountPresent
                ? "api_failed"
                : "assigned_account_missing",
          error: result.ok ? null : getMetaApiErrorMessage(result),
        };
      })().catch((error: unknown) => ({
        provider: "meta" as const,
        status: metaIntegration.status,
        healthy: false,
        reason: "request_failed",
        error: error instanceof Error ? error.message : String(error),
      }));

  const googleAudit = !googleIntegration || googleIntegration.status !== "connected"
    ? {
        provider: "google_ads" as const,
        status: googleIntegration?.status ?? "missing",
        healthy: false,
        reason: "integration_not_connected",
      }
    : await (async () => {
        const expiresAtMs = googleIntegration.token_expires_at
          ? new Date(googleIntegration.token_expires_at).getTime()
          : Number.NaN;
        const accessToken =
          Number.isFinite(expiresAtMs) &&
          expiresAtMs <= Date.now() &&
          googleIntegration.refresh_token
            ? (
                await refreshGoogleAccessToken(googleIntegration.refresh_token)
              ).accessToken
            : (googleIntegration.access_token ?? "");
        const scopePresent = (googleIntegration.scopes ?? "")
          .split(/\s+/)
          .includes("https://www.googleapis.com/auth/adwords");
        const result = await fetchAccessibleGoogleAdsCustomers(accessToken);
        const discoveredCustomerIds = uniqueNormalizedAccountIds(result.customerIds);
        const assignedAccountPresent =
          expectedGoogleAccountIds.length === 0
            ? discoveredCustomerIds.length > 0
            : expectedGoogleAccountIds.some((assignedId) => discoveredCustomerIds.includes(assignedId));
        return {
          provider: "google_ads" as const,
          status: googleIntegration.status,
          healthy: result.ok && assignedAccountPresent,
          httpStatus: result.status,
          assignedAccountId: googleIntegration.provider_account_id,
          assignmentCandidates: expectedGoogleAccountIds,
          assignedAccountPresent,
          discoveredAccountCount: result.customerIds.length,
          quotaExhausted: result.status === 429,
          reason:
            result.ok && assignedAccountPresent
              ? "ok"
              : assignedAccountPresent
                ? "api_failed"
                : "assigned_account_missing",
          error: result.error ?? null,
          scopePresent,
        };
      })().catch((error: unknown) => ({
        provider: "google_ads" as const,
        status: googleIntegration.status,
        healthy: false,
        reason: "request_failed",
        error: error instanceof Error ? error.message : String(error),
      }));

  return {
    businessId: input.businessId,
    businessName: input.businessName,
    meta: metaAudit,
    googleAds: googleAudit,
  };
}

async function main() {
  configureOperationalScriptRuntime({
    lane: "read_only_observation",
  });
  const args = parseArgs(process.argv.slice(2));

  const sql = getDb();
  await mkdir(args.outDir, { recursive: true });

  const businessRows = (await sql`
    SELECT id::text AS business_id, name AS business_name
    FROM businesses
    WHERE name = ANY(${Array.from(TARGET_BUSINESS_NAMES)}::text[])
    ORDER BY name
  `) as Array<{ business_id: string; business_name: string }>;

  const targetBusinessIds = businessRows.map((row) => row.business_id);
  const [metaAssignmentRows, googleAssignmentRows] = await Promise.all([
    sql`
      SELECT
        business_id::text AS business_id,
        ARRAY_AGG(DISTINCT provider_account_id ORDER BY provider_account_id)
          FILTER (WHERE provider_account_id IS NOT NULL) AS account_ids
      FROM meta_sync_state
      WHERE business_id::text = ANY(${targetBusinessIds}::text[])
      GROUP BY business_id::text
    `,
    sql`
      SELECT
        business_id::text AS business_id,
        ARRAY_AGG(DISTINCT provider_account_id ORDER BY provider_account_id)
          FILTER (WHERE provider_account_id IS NOT NULL) AS account_ids
      FROM google_ads_sync_state
      WHERE business_id::text = ANY(${targetBusinessIds}::text[])
      GROUP BY business_id::text
    `,
  ]);
  const assignmentCandidates: ProviderAssignmentCandidates = {
    meta: new Map(
      (metaAssignmentRows as Array<{ business_id: string; account_ids: string[] | null }>).map((row) => [
        row.business_id,
        row.account_ids ?? [],
      ]),
    ),
    googleAds: new Map(
      (googleAssignmentRows as Array<{ business_id: string; account_ids: string[] | null }>).map((row) => [
        row.business_id,
        row.account_ids ?? [],
      ]),
    ),
  };
  const today = new Date().toISOString().slice(0, 10);
  const d1 = new Date(`${today}T00:00:00Z`);
  d1.setUTCDate(d1.getUTCDate() - 1);
  const d1Date = d1.toISOString().slice(0, 10);
  const integrityStartDate = (() => {
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - 45);
    return date.toISOString().slice(0, 10);
  })();

  const [
    adminHealth,
    workerHeartbeats,
    runnerLeases,
    metaDeadLetters,
    googleDeadLetters,
    metaD1Rows,
    googleMismatchRows,
    googleOverviewSnapshots,
    metaTotalsMismatchRows,
    googleActiveCheckpointRows,
  ] = await Promise.all([
    getAdminOperationsHealth(),
    sql`
      SELECT
        worker_id,
        provider_scope,
        status,
        last_heartbeat_at,
        EXTRACT(EPOCH FROM (now() - last_heartbeat_at)) AS heartbeat_age_seconds,
        COALESCE(meta_json ->> 'currentBusinessId', last_business_id) AS current_business_id,
        COALESCE(meta_json ->> 'workerStartedAt', created_at::text) AS started_at
      FROM sync_worker_heartbeats
      WHERE last_heartbeat_at > now() - interval '10 minutes'
      ORDER BY last_heartbeat_at DESC
    `,
    sql`
      SELECT
        business_id,
        provider_scope,
        lease_owner,
        lease_expires_at,
        CASE WHEN lease_expires_at < now() THEN 'EXPIRED' ELSE 'ACTIVE' END AS lease_status,
        updated_at
      FROM sync_runner_leases
      WHERE provider_scope IN ('meta', 'google_ads')
      ORDER BY provider_scope, updated_at DESC
    `,
    sql`
      SELECT
        p.id,
        b.name AS business_name,
        p.provider_account_id,
        p.partition_date::date::text AS partition_date,
        p.scope,
        p.status,
        p.attempt_count,
        p.last_error,
        p.updated_at
      FROM meta_sync_partitions p
      JOIN businesses b ON b.id::text = p.business_id::text
      WHERE p.business_id::text = ANY(${targetBusinessIds}::text[])
        AND p.status = 'dead_letter'
      ORDER BY p.updated_at DESC
    `,
    sql`
      SELECT
        p.id,
        b.name AS business_name,
        p.provider_account_id,
        p.partition_date::date::text AS partition_date,
        p.scope,
        p.status,
        p.attempt_count,
        p.last_error,
        p.updated_at
      FROM google_ads_sync_partitions p
      JOIN businesses b ON b.id::text = p.business_id::text
      WHERE p.business_id::text = ANY(${targetBusinessIds}::text[])
        AND p.status = 'dead_letter'
      ORDER BY p.updated_at DESC
    `,
    sql`
      SELECT
        b.name AS business_name,
        p.business_id,
        p.provider_account_id,
        p.partition_date::date::text AS partition_date,
        p.source,
        p.status,
        p.attempt_count,
        p.updated_at,
        p.lease_owner,
        p.lease_expires_at
      FROM meta_sync_partitions p
      JOIN businesses b ON b.id::text = p.business_id::text
      WHERE p.business_id::text = ANY(${targetBusinessIds}::text[])
        AND p.partition_date = ${d1Date}
        AND p.lane = 'maintenance'
        AND p.scope = 'account_daily'
      ORDER BY b.name, p.provider_account_id
    `,
    sql`
      WITH account_rows AS (
        SELECT
          business_id,
          provider_account_id,
          date::date::text AS date,
          SUM(spend)::numeric AS account_spend,
          SUM(impressions)::numeric AS account_impressions,
          SUM(clicks)::numeric AS account_clicks
        FROM google_ads_account_daily
        WHERE business_id::text = ANY(${targetBusinessIds}::text[])
          AND date >= ${integrityStartDate}
          AND date <= ${today}
        GROUP BY business_id, provider_account_id, date::date::text
      ),
      campaign_rows AS (
        SELECT
          business_id,
          provider_account_id,
          date::date::text AS date,
          SUM(spend)::numeric AS campaign_spend,
          SUM(impressions)::numeric AS campaign_impressions,
          SUM(clicks)::numeric AS campaign_clicks
        FROM google_ads_campaign_daily
        WHERE business_id::text = ANY(${targetBusinessIds}::text[])
          AND date >= ${integrityStartDate}
          AND date <= ${today}
        GROUP BY business_id, provider_account_id, date::date::text
      )
      SELECT
        b.name AS business_name,
        COALESCE(a.business_id, c.business_id) AS business_id,
        COALESCE(a.provider_account_id, c.provider_account_id) AS provider_account_id,
        COALESCE(a.date, c.date) AS date,
        COALESCE(a.account_spend, 0)::float8 AS account_spend,
        COALESCE(c.campaign_spend, 0)::float8 AS campaign_spend,
        COALESCE(a.account_impressions, 0)::float8 AS account_impressions,
        COALESCE(c.campaign_impressions, 0)::float8 AS campaign_impressions,
        COALESCE(a.account_clicks, 0)::float8 AS account_clicks,
        COALESCE(c.campaign_clicks, 0)::float8 AS campaign_clicks
      FROM account_rows a
      FULL OUTER JOIN campaign_rows c
        ON c.business_id = a.business_id
       AND c.provider_account_id = a.provider_account_id
       AND c.date = a.date
      JOIN businesses b
        ON b.id::text = COALESCE(a.business_id, c.business_id)::text
      WHERE ABS(COALESCE(a.account_spend, 0) - COALESCE(c.campaign_spend, 0))
            > GREATEST(0.01, ABS(COALESCE(c.campaign_spend, 0)) * 0.001)
      ORDER BY b.name, COALESCE(a.date, c.date)
    `,
    sql`
      SELECT
        b.name AS business_name,
        snapshot.business_id,
        snapshot.provider_account_id,
        snapshot.start_date::date::text AS start_date,
        snapshot.endpoint_name,
        snapshot.status,
        snapshot.created_at
      FROM google_ads_raw_snapshots snapshot
      JOIN businesses b ON b.id::text = snapshot.business_id
      WHERE snapshot.business_id::text = ANY(${targetBusinessIds}::text[])
        AND snapshot.endpoint_name = 'overview'
        AND snapshot.created_at > now() - interval '7 days'
      ORDER BY snapshot.created_at DESC
    `,
    sql`
      WITH manifest_accounts AS (
        SELECT DISTINCT ON (business_id, provider_account_id)
          business_id::text AS business_id,
          provider_account_id,
          COALESCE(NULLIF(account_timezone, ''), 'UTC') AS account_timezone
        FROM meta_authoritative_source_manifests
        WHERE business_id::text = ANY(${targetBusinessIds}::text[])
        ORDER BY business_id, provider_account_id, updated_at DESC
      ),
      warehouse_accounts AS (
        SELECT DISTINCT ON (business_id, provider_account_id)
          business_id::text AS business_id,
          provider_account_id,
          COALESCE(NULLIF(account_timezone, ''), 'UTC') AS account_timezone
        FROM meta_account_daily
        WHERE business_id::text = ANY(${targetBusinessIds}::text[])
        ORDER BY business_id, provider_account_id, date DESC, updated_at DESC
      ),
      account_timezones AS (
        SELECT
          COALESCE(manifest_accounts.business_id, warehouse_accounts.business_id) AS business_id,
          COALESCE(manifest_accounts.provider_account_id, warehouse_accounts.provider_account_id) AS provider_account_id,
          COALESCE(manifest_accounts.account_timezone, warehouse_accounts.account_timezone, 'UTC') AS account_timezone
        FROM manifest_accounts
        FULL OUTER JOIN warehouse_accounts
          ON warehouse_accounts.business_id = manifest_accounts.business_id
          AND warehouse_accounts.provider_account_id = manifest_accounts.provider_account_id
        WHERE COALESCE(manifest_accounts.business_id, warehouse_accounts.business_id) IS NOT NULL
      )
      SELECT
        b.name AS business_name,
        event.business_id,
        event.provider_account_id,
        event.day::date::text AS day,
        event.event_kind,
        event.result,
        event.created_at,
        event.details_json
      FROM meta_authoritative_reconciliation_events event
      JOIN businesses b ON b.id::text = event.business_id
      LEFT JOIN account_timezones account_timezones
        ON account_timezones.business_id = event.business_id::text
        AND account_timezones.provider_account_id = event.provider_account_id
      WHERE event.business_id::text = ANY(${targetBusinessIds}::text[])
        AND event.event_kind = 'totals_mismatch'
        AND event.day::date < (now() AT TIME ZONE COALESCE(account_timezones.account_timezone, 'UTC'))::date
        AND event.created_at > now() - interval '24 hours'
      ORDER BY event.created_at DESC
    `,
    sql`
      WITH active_partitions AS (
        SELECT
          p.id::text AS partition_id,
          p.business_id::text AS business_id,
          p.provider_account_id,
          p.scope,
          p.partition_date::date::text AS partition_date,
          p.status AS partition_status,
          p.updated_at AS partition_updated_at
        FROM google_ads_sync_partitions p
        WHERE p.business_id::text = ANY(${targetBusinessIds}::text[])
          AND p.status IN ('queued', 'leased', 'running', 'dead_letter')
      ),
      latest_checkpoints AS (
        SELECT DISTINCT ON (checkpoint.partition_id)
          checkpoint.partition_id::text AS partition_id,
          checkpoint.checkpoint_scope,
          checkpoint.phase,
          checkpoint.status AS checkpoint_status,
          COALESCE(checkpoint.progress_heartbeat_at, checkpoint.updated_at) AS checkpoint_updated_at,
          checkpoint.poisoned_at,
          checkpoint.poison_reason,
          checkpoint.attempt_count
        FROM google_ads_sync_checkpoints checkpoint
        JOIN active_partitions partition ON partition.partition_id = checkpoint.partition_id::text
        ORDER BY checkpoint.partition_id, checkpoint.updated_at DESC
      )
      SELECT
        b.name AS business_name,
        partition.business_id,
        partition.partition_id,
        partition.provider_account_id,
        partition.scope,
        partition.partition_date,
        partition.partition_status,
        partition.partition_updated_at,
        checkpoint.checkpoint_scope,
        checkpoint.phase,
        checkpoint.checkpoint_status,
        checkpoint.checkpoint_updated_at,
        checkpoint.poisoned_at,
        checkpoint.poison_reason,
        checkpoint.attempt_count
      FROM active_partitions partition
      JOIN businesses b ON b.id::text = partition.business_id
      LEFT JOIN latest_checkpoints checkpoint ON checkpoint.partition_id = partition.partition_id
      WHERE checkpoint.poisoned_at IS NOT NULL
         OR (
           checkpoint.checkpoint_updated_at IS NOT NULL
           AND checkpoint.checkpoint_updated_at < now() - interval '20 minutes'
         )
      ORDER BY b.name, partition.partition_updated_at DESC
    `,
  ]);

  const providerDiscovery = await Promise.all(
    businessRows.map((row) =>
      captureProviderDiscovery({
        businessId: row.business_id,
        businessName: row.business_name,
        assignmentCandidates,
      }),
    ),
  );

  const googleSnapshots = Object.fromEntries(
    await Promise.all(
      businessRows.map(async (row) => {
        const [reclaimSummary, integrityIncidents, stateRows] = await Promise.all([
          getGoogleAdsReclaimClassificationSummary({ businessId: row.business_id }).catch(() => null),
          getGoogleAdsWarehouseIntegrityIncidents({
            businessId: row.business_id,
            startDate: integrityStartDate,
            endDate: today,
          }).catch(() => []),
          sql`
            SELECT
              scope,
              provider_account_id,
              ready_through_date,
              completed_days,
              dead_letter_count,
              latest_background_activity_at,
              latest_successful_sync_at
            FROM google_ads_sync_state
            WHERE business_id = ${row.business_id}
            ORDER BY scope, provider_account_id
          `,
        ]);
        return [
          row.business_name,
          {
            businessId: row.business_id,
            businessName: row.business_name,
            reclaimSummary,
            integrityIncidents,
            stateRows,
          },
        ] as const;
      }),
    ),
  );

  const metaSnapshots = Object.fromEntries(
    await Promise.all(
      businessRows.map(async (row) => {
        const [authoritative, reclaimSummary, integrityIncidents] = await Promise.all([
          getMetaAuthoritativeBusinessOpsSnapshot({ businessId: row.business_id }).catch(() => null),
          getMetaReclaimClassificationSummary({ businessId: row.business_id }).catch(() => null),
          getMetaWarehouseIntegrityIncidents({
            businessId: row.business_id,
            startDate: integrityStartDate,
            endDate: today,
            persistReconciliationEvents: false,
          }).catch(() => []),
        ]);
        return [
          row.business_name,
          {
            businessId: row.business_id,
            businessName: row.business_name,
            authoritative,
            reclaimSummary,
            integrityIncidents,
          },
        ] as const;
      }),
    ),
  );

  const normalizedWorkerHeartbeats = (workerHeartbeats as Array<Record<string, unknown>>).map((row) => ({
    ...row,
    last_heartbeat_at: normalizeTimestamp(row.last_heartbeat_at),
    started_at: normalizeTimestamp(row.started_at),
  }));
  const normalizedRunnerLeases = (runnerLeases as Array<Record<string, unknown>>).map((row) => ({
    ...row,
    lease_expires_at: normalizeTimestamp(row.lease_expires_at),
    updated_at: normalizeTimestamp(row.updated_at),
  })) as Array<Record<string, unknown> & { lease_status?: string }>;

  const summary = {
    stage: args.stage,
    capturedAt: new Date().toISOString(),
    targetBusinesses: businessRows,
    workerHeartbeatCount: normalizedWorkerHeartbeats.length,
    activeRunnerLeaseCount: normalizedRunnerLeases.filter(
      (row) => row.lease_status === "ACTIVE",
    ).length,
    metaDeadLetterCount: (metaDeadLetters as Array<unknown>).length,
    googleDeadLetterCount: (googleDeadLetters as Array<unknown>).length,
    metaD1NonTerminalCount: (metaD1Rows as Array<Record<string, unknown>>).filter(
      (row) => !["succeeded", "failed", "cancelled", "dead_letter"].includes(String(row.status)),
    ).length,
    googleMismatchCount: (googleMismatchRows as Array<unknown>).length,
    googleOverviewSnapshotCount: (googleOverviewSnapshots as Array<unknown>).length,
    metaTotalsMismatch24hCount: (metaTotalsMismatchRows as Array<unknown>).length,
    providerHealthyCount: providerDiscovery.filter(
      (row) => row.meta.healthy || row.googleAds.healthy,
    ).length,
  };
  const metaBlockedIncidents = Object.values(metaSnapshots)
    .flatMap((snapshot) => snapshot.integrityIncidents ?? [])
    .filter((incident) => incident.severity === "error" && incident.repairRecommended)
    .map((incident) => ({
      businessId: incident.businessId,
      providerAccountId: incident.providerAccountId,
      date: incident.date,
      suspectedCause: incident.suspectedCause,
      metricsCompared: incident.metricsCompared,
      details: incident.details ?? null,
    }));
  const metaBlockedByCause = Object.entries(
    metaBlockedIncidents.reduce<Record<string, number>>((acc, incident) => {
      const key = String(incident.suspectedCause ?? "unknown");
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .sort((left, right) => right[1] - left[1])
    .map(([suspectedCause, count]) => ({ suspectedCause, count }));
  const syncHealthPayload = adminHealth.syncHealth ?? null;

  let diffReport: Record<string, unknown> | null = null;
  const siblingBeforeSummaryPath = path.join(path.dirname(args.outDir), "before", "summary.json");
  if (args.stage === "after") {
    try {
      const beforeSummary = JSON.parse(await readFile(siblingBeforeSummaryPath, "utf8")) as Record<string, unknown>;
      diffReport = {
        beforeSummary,
        afterSummary: summary,
        deltas: {
          metaDeadLetterCount:
            Number(summary.metaDeadLetterCount ?? 0) -
            Number(beforeSummary.metaDeadLetterCount ?? 0),
          googleDeadLetterCount:
            Number(summary.googleDeadLetterCount ?? 0) -
            Number(beforeSummary.googleDeadLetterCount ?? 0),
          metaD1NonTerminalCount:
            Number(summary.metaD1NonTerminalCount ?? 0) -
            Number(beforeSummary.metaD1NonTerminalCount ?? 0),
          googleMismatchCount:
            Number(summary.googleMismatchCount ?? 0) -
            Number(beforeSummary.googleMismatchCount ?? 0),
          providerHealthyCount:
            Number(summary.providerHealthyCount ?? 0) -
            Number(beforeSummary.providerHealthyCount ?? 0),
        },
        metaBlockedByCause,
      };
    } catch {
      diffReport = null;
    }
  }

  await Promise.all([
    writeJson(args.outDir, "summary.json", summary),
    writeJson(args.outDir, "admin-operations-health.json", adminHealth),
    writeJson(args.outDir, "sync-health.json", syncHealthPayload),
    writeJson(args.outDir, "worker-heartbeats.json", normalizedWorkerHeartbeats),
    writeJson(args.outDir, "runner-leases.json", normalizedRunnerLeases),
    writeJson(args.outDir, "meta-dead-letters.json", metaDeadLetters),
    writeJson(args.outDir, "google-dead-letters.json", googleDeadLetters),
    writeJson(args.outDir, "meta-d1-status.json", metaD1Rows),
    writeJson(args.outDir, "google-mismatch-rows.json", googleMismatchRows),
    writeJson(args.outDir, "google-active-checkpoint-rows.json", googleActiveCheckpointRows),
    writeJson(args.outDir, "google-overview-snapshots.json", googleOverviewSnapshots),
    writeJson(args.outDir, "meta-totals-mismatch-24h.json", metaTotalsMismatchRows),
    writeJson(args.outDir, "meta-blocked-incidents.json", metaBlockedIncidents),
    writeJson(args.outDir, "meta-blocked-by-cause.json", metaBlockedByCause),
    writeJson(args.outDir, "provider-discovery.json", providerDiscovery),
    writeJson(args.outDir, "diff-report.json", diffReport),
  ]);

  await Promise.all(
    businessRows.map(async (row) => {
      const slug = slugify(row.business_name);
      await Promise.all([
        writeJson(args.outDir, `google/${slug}.json`, googleSnapshots[row.business_name] ?? null),
        writeJson(args.outDir, `meta/${slug}.json`, metaSnapshots[row.business_name] ?? null),
      ]);
    }),
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        stage: args.stage,
        outDir: args.outDir,
        summary,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
