import { getDb } from "@/lib/db";
import { getDbSchemaReadiness } from "@/lib/db-schema-readiness";
import type { BusinessTimezoneSource } from "@/lib/business-timezone-types";

type IntegrationTimezoneCandidateRow = {
  provider: "shopify" | "ga4";
  status: string;
  metadata: Record<string, unknown> | null;
};

export interface DerivedBusinessTimezone {
  timezone: string | null;
  timezoneSource: BusinessTimezoneSource;
}

function normalizeTimezoneValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function deriveBusinessTimezoneFromIntegrations(
  rows: IntegrationTimezoneCandidateRow[],
): DerivedBusinessTimezone {
  const shopify = rows.find(
    (row) => row.provider === "shopify" && row.status === "connected",
  );
  const shopifyTimezone = normalizeTimezoneValue(shopify?.metadata?.iana_timezone);
  if (shopifyTimezone) {
    return { timezone: shopifyTimezone, timezoneSource: "shopify" };
  }

  const ga4 = rows.find(
    (row) => row.provider === "ga4" && row.status === "connected",
  );
  const ga4Timezone = normalizeTimezoneValue(ga4?.metadata?.ga4PropertyTimeZone);
  if (ga4Timezone) {
    return { timezone: ga4Timezone, timezoneSource: "ga4" };
  }

  return { timezone: null, timezoneSource: null };
}

export async function resolveDerivedBusinessTimezone(
  businessId: string,
): Promise<DerivedBusinessTimezone> {
  const readiness = await getDbSchemaReadiness({
    tables: ["integrations"],
  });
  if (!readiness.ready) {
    return { timezone: null, timezoneSource: null };
  }
  const sql = getDb();
  const rows = (await sql`
    SELECT provider, status, metadata
    FROM integrations
    WHERE business_id = ${businessId}
      AND provider IN ('shopify', 'ga4')
  `) as IntegrationTimezoneCandidateRow[];

  return deriveBusinessTimezoneFromIntegrations(rows);
}

export async function recomputeBusinessDerivedTimezone(
  businessId: string,
): Promise<DerivedBusinessTimezone> {
  const derived = await resolveDerivedBusinessTimezone(businessId);
  const sql = getDb();
  await sql`
    UPDATE businesses
    SET
      timezone = ${derived.timezone},
      timezone_source = ${derived.timezoneSource}
    WHERE id = ${businessId}
  `;
  console.info("[business-timezone] recomputed", {
    businessId,
    timezone: derived.timezone,
    timezoneSource: derived.timezoneSource ?? "unset",
  });
  return derived;
}

export async function getBusinessTimezoneSnapshot(
  businessId: string,
): Promise<DerivedBusinessTimezone> {
  const readiness = await getDbSchemaReadiness({
    tables: ["businesses"],
  });
  if (!readiness.ready) {
    return { timezone: null, timezoneSource: null };
  }
  const sql = getDb();
  const rows = (await sql`
    SELECT timezone, timezone_source
    FROM businesses
    WHERE id = ${businessId}
    LIMIT 1
  `) as Array<{
    timezone: string | null;
    timezone_source: string | null;
  }>;

  return {
    timezone: normalizeTimezoneValue(rows[0]?.timezone),
    timezoneSource:
      rows[0]?.timezone_source === "shopify" || rows[0]?.timezone_source === "ga4"
        ? rows[0].timezone_source
        : null,
  };
}
