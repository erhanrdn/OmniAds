import { getDb } from "@/lib/db";
import { assertDbSchemaReady, getDbSchemaReadiness } from "@/lib/db-schema-readiness";
import { resolveBusinessReferenceIds } from "@/lib/provider-account-reference-store";
import {
  getNormalizedSearchParamsKey,
  shouldBypassRouteCachePayload,
} from "@/lib/route-report-cache";

const REPORTING_CACHE_TABLES = ["provider_reporting_snapshots"] as const;

function sanitizeForJson(value: unknown): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeForJson(entry));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        sanitizeForJson(entry),
      ]),
    );
  }
  return String(value);
}

/**
 * Explicit owner for user-facing durable snapshots in provider_reporting_snapshots.
 * Shared read helpers must stay on reporting-cache.ts / route-report-cache.ts.
 */
export async function writeCachedReportSnapshot<TPayload>(input: {
  businessId: string;
  provider: string;
  reportType: string;
  dateRangeKey: string;
  payload: TPayload;
}): Promise<void> {
  const readiness = await getDbSchemaReadiness({
    tables: [...REPORTING_CACHE_TABLES],
  }).catch(() => null);
  if (!readiness?.ready) {
    return;
  }
  const sql = getDb();
  const payloadJson = JSON.stringify(sanitizeForJson(input.payload));
  const businessRefId = (await resolveBusinessReferenceIds([input.businessId])).get(
    input.businessId,
  ) ?? null;

  await sql`
    INSERT INTO provider_reporting_snapshots (
      business_id,
      business_ref_id,
      provider,
      report_type,
      date_range_key,
      payload,
      updated_at
    )
    VALUES (
      ${input.businessId},
      ${businessRefId},
      ${input.provider},
      ${input.reportType},
      ${input.dateRangeKey},
      ${payloadJson}::jsonb,
      now()
    )
    ON CONFLICT (business_id, provider, report_type, date_range_key) DO UPDATE SET
      business_ref_id = COALESCE(EXCLUDED.business_ref_id, provider_reporting_snapshots.business_ref_id),
      payload = EXCLUDED.payload,
      updated_at = now()
  `;
}

export async function writeCachedRouteReport<TPayload>(input: {
  businessId: string;
  provider: string;
  reportType: string;
  searchParams: URLSearchParams;
  payload: TPayload;
}): Promise<void> {
  if (shouldBypassRouteCachePayload(input.provider, input.payload)) {
    return;
  }
  try {
    await writeCachedReportSnapshot({
      businessId: input.businessId,
      provider: input.provider,
      reportType: input.reportType,
      dateRangeKey: getNormalizedSearchParamsKey(input.searchParams),
      payload: input.payload,
    });
  } catch (error) {
    console.warn("[route-report-cache-writer] write_failed", {
      businessId: input.businessId,
      provider: input.provider,
      reportType: input.reportType,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function clearCachedReportSnapshots(input: {
  provider: string;
  businessId?: string | null;
  reportTypePrefix?: string | null;
}) {
  await assertDbSchemaReady({
    tables: [...REPORTING_CACHE_TABLES],
    context: "reporting_cache_clear",
  });
  const sql = getDb();
  const rows = await sql`
    WITH deleted AS (
      DELETE FROM provider_reporting_snapshots
      WHERE provider = ${input.provider}
        AND (${input.businessId ?? null}::text IS NULL OR business_id = ${input.businessId ?? null})
        AND (
          ${input.reportTypePrefix ?? null}::text IS NULL
          OR report_type LIKE ${`${input.reportTypePrefix ?? ""}%`}
        )
      RETURNING 1
    )
    SELECT COUNT(*)::int AS count FROM deleted
  ` as Array<{ count: number }>;
  return Number(rows[0]?.count ?? 0);
}
