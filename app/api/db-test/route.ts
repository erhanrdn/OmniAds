import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

/**
 * GET /api/db-test
 *
 * Validates Neon Postgres connectivity and basic CRUD in sequence:
 *   1. SELECT 1                     — connection alive
 *   2. CREATE TABLE _db_test        — DDL works
 *   3. INSERT INTO _db_test         — write works
 *   4. SELECT FROM _db_test         — read works
 *   5. DROP TABLE _db_test          — cleanup
 *
 * Returns a JSON report of each step.
 */
export async function GET() {
  const report: Record<string, string> = {};

  try {
    const sql = getDb();

    // 1. connection test
    const ping = (await sql`SELECT 1 AS ok`) as Array<{ ok: number }>;
    report["1_connection"] = ping[0]?.ok === 1 ? "OK" : "UNEXPECTED";

    // 2. create test table
    await sql`
      CREATE TABLE IF NOT EXISTS _db_test (
        id SERIAL PRIMARY KEY,
        value TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `;
    report["2_create_table"] = "OK";

    // 3. insert
    const inserted = (await sql`
      INSERT INTO _db_test (value) VALUES ('hello from Adsecute')
      RETURNING id, value
    `) as Array<{ id: number; value: string }>;
    report["3_insert"] =
      inserted[0]?.value === "hello from Adsecute" ? "OK" : "UNEXPECTED";

    // 4. read back
    const rows =
      (await sql`SELECT id, value FROM _db_test ORDER BY id DESC LIMIT 1`) as Array<{ id: number; value: string }>;
    report["4_read"] =
      rows[0]?.value === "hello from Adsecute" ? "OK" : "UNEXPECTED";

    // 5. cleanup
    await sql`DROP TABLE IF EXISTS _db_test`;
    report["5_cleanup"] = "OK";

    // 6. verify integrations table exists
    const tableCheck = (await sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'integrations'
      ORDER BY ordinal_position
    `) as Array<{ column_name: string; data_type: string }>;
    report["6_integrations_table"] =
      tableCheck.length > 0 ? `OK (${tableCheck.length} columns)` : "NOT_FOUND";

    return NextResponse.json({
      status: "ALL_PASSED",
      report,
      integrations_schema: tableCheck,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    report["error"] = message;
    return NextResponse.json({ status: "FAILED", report }, { status: 500 });
  }
}
