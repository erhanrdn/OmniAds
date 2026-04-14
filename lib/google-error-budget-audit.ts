import { getDb } from "@/lib/db";
import { getDbSchemaReadiness } from "@/lib/db-schema-readiness";
import type { GoogleRequestAuditSource } from "@/lib/google-request-audit";

type GoogleAuditProviderKey = "google" | "ga4" | "search_console";
export type GoogleAuditProvider = "google_ads" | "ga4" | "search_console";

export interface GoogleErrorBudgetAuditSourceRow {
  source: GoogleRequestAuditSource;
  requestCount: number;
  errorCount: number;
  cooldownHitCount: number;
  dedupedCount: number;
}

export interface GoogleErrorBudgetAuditPatternRow {
  requestType: string;
  source: GoogleRequestAuditSource;
  path: string | null;
  requestCount: number;
  errorCount: number;
  cooldownHitCount: number;
  dedupedCount: number;
  dominantFailureClass: "quota" | "auth" | "permission" | "generic" | "mixed" | "unknown";
  activeCooldown: boolean;
  activeCircuitBreaker: boolean;
  cooldownUntil: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
}

export interface GoogleErrorBudgetAuditProviderRow {
  provider: GoogleAuditProvider;
  label: string;
  requestCount: number;
  errorCount: number;
  cooldownHitCount: number;
  dedupedCount: number;
  errorRate: number;
  activeCooldowns: number;
  activeCircuitBreakers: number;
  errorClassBreakdown: {
    quota: number;
    auth: number;
    permission: number;
    generic: number;
  };
  sourceBreakdown: GoogleErrorBudgetAuditSourceRow[];
  repeatedFailurePatterns: GoogleErrorBudgetAuditPatternRow[];
}

export interface GoogleErrorBudgetAudit {
  generatedAt: string;
  auditDate: string;
  summary: {
    requestCount: number;
    errorCount: number;
    cooldownHitCount: number;
    dedupedCount: number;
    activeCooldowns: number;
    activeCircuitBreakers: number;
    topErrorProvider: GoogleAuditProvider | null;
  };
  providers: GoogleErrorBudgetAuditProviderRow[];
}

interface RawAuditRow {
  provider: GoogleAuditProviderKey;
  request_type: string;
  audit_source: GoogleRequestAuditSource;
  audit_path: string;
  request_count: number;
  error_count: number;
  quota_error_count: number;
  auth_error_count: number;
  permission_error_count: number;
  generic_error_count: number;
  cooldown_hit_count: number;
  deduped_count: number;
  last_error_at: string | null;
  last_error_message: string | null;
}

interface RawCooldownRow {
  provider: GoogleAuditProviderKey;
  request_type: string;
  cooldown_until: string;
}

const PROVIDER_LABELS: Record<GoogleAuditProviderKey, { provider: GoogleAuditProvider; label: string }> =
  {
    google: { provider: "google_ads", label: "Google Ads" },
    ga4: { provider: "ga4", label: "GA4" },
    search_console: { provider: "search_console", label: "Search Console" },
  };

function toProviderLabel(provider: GoogleAuditProviderKey) {
  return PROVIDER_LABELS[provider];
}

function getDominantFailureClass(row: RawAuditRow) {
  const entries = [
    ["quota", row.quota_error_count],
    ["auth", row.auth_error_count],
    ["permission", row.permission_error_count],
    ["generic", row.generic_error_count],
  ] as const;
  const activeEntries = entries.filter(([, count]) => count > 0);
  if (activeEntries.length === 0) return "unknown" as const;
  if (activeEntries.length > 1) return "mixed" as const;
  return activeEntries[0][0];
}

function sumCounts(rows: RawAuditRow[], key: keyof RawAuditRow) {
  return rows.reduce((sum, row) => sum + Number(row[key] ?? 0), 0);
}

export async function buildGoogleErrorBudgetAudit(): Promise<GoogleErrorBudgetAudit> {
  const readiness = await getDbSchemaReadiness({
    tables: ["provider_request_audit_daily", "provider_cooldown_state"],
  }).catch(() => null);

  const generatedAt = new Date().toISOString();
  const auditDate = generatedAt.slice(0, 10);
  if (!readiness?.ready) {
    return {
      generatedAt,
      auditDate,
      summary: {
        requestCount: 0,
        errorCount: 0,
        cooldownHitCount: 0,
        dedupedCount: 0,
        activeCooldowns: 0,
        activeCircuitBreakers: 0,
        topErrorProvider: null,
      },
      providers: [],
    };
  }

  const sql = getDb();
  const [auditRows, cooldownRows] = await Promise.all([
    (sql`
      SELECT
        provider,
        request_type,
        audit_source,
        audit_path,
        request_count,
        error_count,
        quota_error_count,
        auth_error_count,
        permission_error_count,
        generic_error_count,
        cooldown_hit_count,
        deduped_count,
        last_error_at,
        last_error_message
      FROM provider_request_audit_daily
      WHERE audit_date = CURRENT_DATE
        AND provider IN ('google', 'ga4', 'search_console')
    `) as Promise<RawAuditRow[]>,
    (sql`
      SELECT provider, request_type, cooldown_until
      FROM provider_cooldown_state
      WHERE cooldown_until > now()
        AND provider IN ('google', 'ga4', 'search_console')
    `) as Promise<RawCooldownRow[]>,
  ]);

  const cooldownByKey = new Map(
    cooldownRows.map((row) => [`${row.provider}:${row.request_type}`, row]),
  );

  const providers = (["google", "ga4", "search_console"] as const)
    .map((providerKey) => {
      const providerRows = auditRows.filter((row) => row.provider === providerKey);
      if (providerRows.length === 0 && !cooldownRows.some((row) => row.provider === providerKey)) {
        return null;
      }
      const providerMeta = toProviderLabel(providerKey);
      const sourceBreakdown = ([
        "cron_sync",
        "background_refresh",
        "live_report",
        "discovery",
        "unknown",
      ] as const)
        .map((source) => {
          const sourceRows = providerRows.filter((row) => row.audit_source === source);
          const requestCount = sumCounts(sourceRows, "request_count");
          const errorCount = sumCounts(sourceRows, "error_count");
          const cooldownHitCount = sumCounts(sourceRows, "cooldown_hit_count");
          const dedupedCount = sumCounts(sourceRows, "deduped_count");
          if (
            requestCount <= 0 &&
            errorCount <= 0 &&
            cooldownHitCount <= 0 &&
            dedupedCount <= 0
          ) {
            return null;
          }
          return {
            source,
            requestCount,
            errorCount,
            cooldownHitCount,
            dedupedCount,
          } satisfies GoogleErrorBudgetAuditSourceRow;
        })
        .filter((row): row is GoogleErrorBudgetAuditSourceRow => Boolean(row))
        .sort((a, b) => b.errorCount - a.errorCount || b.requestCount - a.requestCount);

      const repeatedFailurePatterns = providerRows
        .filter((row) => row.error_count > 0 || row.cooldown_hit_count > 0 || row.deduped_count > 0)
        .map((row) => {
          const cooldown = cooldownByKey.get(`${row.provider}:${row.request_type}`) ?? null;
          return {
            requestType: row.request_type,
            source: row.audit_source,
            path: row.audit_path || null,
            requestCount: row.request_count,
            errorCount: row.error_count,
            cooldownHitCount: row.cooldown_hit_count,
            dedupedCount: row.deduped_count,
            dominantFailureClass: getDominantFailureClass(row),
            activeCooldown: Boolean(cooldown),
            activeCircuitBreaker:
              row.request_type === "__global_circuit_breaker__" ||
              row.request_type === "__global_circuit_breaker_recovery__",
            cooldownUntil: cooldown?.cooldown_until ?? null,
            lastErrorAt: row.last_error_at,
            lastErrorMessage: row.last_error_message,
          } satisfies GoogleErrorBudgetAuditPatternRow;
        })
        .sort(
          (a, b) =>
            b.errorCount - a.errorCount ||
            b.cooldownHitCount - a.cooldownHitCount ||
            b.requestCount - a.requestCount,
        )
        .slice(0, 8);

      const requestCount = sumCounts(providerRows, "request_count");
      const errorCount = sumCounts(providerRows, "error_count");
      const cooldownHitCount = sumCounts(providerRows, "cooldown_hit_count");
      const dedupedCount = sumCounts(providerRows, "deduped_count");
      const activeProviderCooldowns = cooldownRows.filter(
        (row) => row.provider === providerKey,
      );

      return {
        provider: providerMeta.provider,
        label: providerMeta.label,
        requestCount,
        errorCount,
        cooldownHitCount,
        dedupedCount,
        errorRate: requestCount > 0 ? errorCount / requestCount : 0,
        activeCooldowns: activeProviderCooldowns.length,
        activeCircuitBreakers: activeProviderCooldowns.filter(
          (row) =>
            row.request_type === "__global_circuit_breaker__" ||
            row.request_type === "__global_circuit_breaker_recovery__",
        ).length,
        errorClassBreakdown: {
          quota: sumCounts(providerRows, "quota_error_count"),
          auth: sumCounts(providerRows, "auth_error_count"),
          permission: sumCounts(providerRows, "permission_error_count"),
          generic: sumCounts(providerRows, "generic_error_count"),
        },
        sourceBreakdown,
        repeatedFailurePatterns,
      } satisfies GoogleErrorBudgetAuditProviderRow;
    })
    .filter((row): row is GoogleErrorBudgetAuditProviderRow => Boolean(row))
    .sort((a, b) => b.errorCount - a.errorCount || b.requestCount - a.requestCount);

  return {
    generatedAt,
    auditDate,
    summary: {
      requestCount: providers.reduce((sum, row) => sum + row.requestCount, 0),
      errorCount: providers.reduce((sum, row) => sum + row.errorCount, 0),
      cooldownHitCount: providers.reduce((sum, row) => sum + row.cooldownHitCount, 0),
      dedupedCount: providers.reduce((sum, row) => sum + row.dedupedCount, 0),
      activeCooldowns: providers.reduce((sum, row) => sum + row.activeCooldowns, 0),
      activeCircuitBreakers: providers.reduce((sum, row) => sum + row.activeCircuitBreakers, 0),
      topErrorProvider: providers[0]?.provider ?? null,
    },
    providers,
  };
}
