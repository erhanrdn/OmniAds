import {
  createCustomReportId,
  type CustomReportDocument,
  type CustomReportRecord,
  type CustomReportSharePayload,
  ensureReportDefinition,
} from "@/lib/custom-reports";
import { getDb } from "@/lib/db";
import { assertDbSchemaReady, getDbSchemaReadiness } from "@/lib/db-schema-readiness";

interface CustomReportRow {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  template_id: string | null;
  definition: unknown;
  created_at: string;
  updated_at: string;
}

async function ensureCustomReportTables() {
  await assertDbSchemaReady({
    tables: ["custom_reports", "custom_report_share_snapshots"],
    context: "custom_report_store",
  });
}

function mapRow(row: CustomReportRow): CustomReportRecord {
  return {
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    description: row.description,
    templateId: row.template_id,
    definition: ensureReportDefinition(row.definition as Partial<CustomReportDocument>),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listCustomReportsByBusiness(
  businessId: string
): Promise<CustomReportRecord[]> {
  const readiness = await getDbSchemaReadiness({
    tables: ["custom_reports"],
  });
  if (!readiness.ready) {
    return [];
  }
  const sql = getDb();
  const rows = (await sql`
    SELECT *
    FROM custom_reports
    WHERE business_id = ${businessId}
    ORDER BY updated_at DESC
  `) as CustomReportRow[];
  return rows.map(mapRow);
}

export async function getCustomReportById(reportId: string): Promise<CustomReportRecord | null> {
  const readiness = await getDbSchemaReadiness({
    tables: ["custom_reports"],
  });
  if (!readiness.ready) {
    return null;
  }
  const sql = getDb();
  const rows = (await sql`
    SELECT *
    FROM custom_reports
    WHERE id = ${reportId}
    LIMIT 1
  `) as CustomReportRow[];
  const row = rows[0];
  return row ? mapRow(row) : null;
}

export async function createCustomReport(input: {
  businessId: string;
  name: string;
  description?: string | null;
  templateId?: string | null;
  definition: CustomReportDocument;
}): Promise<CustomReportRecord> {
  await ensureCustomReportTables();
  const sql = getDb();
  const rows = (await sql`
    INSERT INTO custom_reports (
      business_id,
      name,
      description,
      template_id,
      definition,
      updated_at
    )
    VALUES (
      ${input.businessId},
      ${input.name},
      ${input.description ?? null},
      ${input.templateId ?? null},
      ${JSON.stringify(input.definition)}::jsonb,
      now()
    )
    RETURNING *
  `) as CustomReportRow[];
  return mapRow(rows[0] as CustomReportRow);
}

export async function updateCustomReport(input: {
  reportId: string;
  name: string;
  description?: string | null;
  templateId?: string | null;
  definition: CustomReportDocument;
}): Promise<CustomReportRecord | null> {
  await ensureCustomReportTables();
  const sql = getDb();
  const rows = (await sql`
    UPDATE custom_reports
    SET
      name = ${input.name},
      description = ${input.description ?? null},
      template_id = ${input.templateId ?? null},
      definition = ${JSON.stringify(input.definition)}::jsonb,
      updated_at = now()
    WHERE id = ${input.reportId}
    RETURNING *
  `) as CustomReportRow[];
  const row = rows[0];
  return row ? mapRow(row) : null;
}

export async function deleteCustomReport(reportId: string): Promise<void> {
  await ensureCustomReportTables();
  const sql = getDb();
  await sql`DELETE FROM custom_reports WHERE id = ${reportId}`;
}

export async function createCustomReportShareSnapshot(
  reportId: string | null,
  payload: Omit<CustomReportSharePayload, "token" | "createdAt">
): Promise<CustomReportSharePayload> {
  await ensureCustomReportTables();
  const sql = getDb();
  const token = createCustomReportId().replace(/[^a-z0-9]/gi, "");
  const snapshot: CustomReportSharePayload = {
    ...payload,
    token,
    createdAt: new Date().toISOString(),
  };
  await sql`
    INSERT INTO custom_report_share_snapshots (token, report_id, payload, expires_at)
    VALUES (${token}, ${reportId}, ${JSON.stringify(snapshot)}::jsonb, ${snapshot.expiresAt})
  `;
  return snapshot;
}

export async function getCustomReportShareSnapshot(
  token: string
): Promise<CustomReportSharePayload | null> {
  const readiness = await getDbSchemaReadiness({
    tables: ["custom_report_share_snapshots"],
  });
  if (!readiness.ready) {
    return null;
  }
  const sql = getDb();
  const rows = (await sql`
    SELECT payload, expires_at
    FROM custom_report_share_snapshots
    WHERE token = ${token}
    LIMIT 1
  `) as Array<{ payload?: unknown; expires_at?: string }>;
  const row = rows[0];
  if (!row?.payload || !row.expires_at) return null;

  if (new Date(row.expires_at).getTime() < Date.now()) {
    await sql`DELETE FROM custom_report_share_snapshots WHERE token = ${token}`;
    return null;
  }

  if (typeof row.payload === "string") {
    try {
      return JSON.parse(row.payload) as CustomReportSharePayload;
    } catch {
      return null;
    }
  }
  return row.payload as CustomReportSharePayload;
}
