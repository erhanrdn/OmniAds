import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ businessId: string }> }
) {
  const { businessId } = await context.params;
  if (!businessId) {
    return NextResponse.json(
      { error: "missing_business_id", message: "businessId path parameter is required." },
      { status: 400 }
    );
  }

  await runMigrations().catch(() => null);
  const sql = getDb();

  await sql`DELETE FROM provider_account_assignments WHERE business_id = ${businessId}`;
  await sql`DELETE FROM integrations WHERE business_id = ${businessId}`;
  await sql`
    DELETE FROM creative_share_snapshots
    WHERE payload->>'businessId' = ${businessId}
  `;

  return NextResponse.json({ status: "ok" });
}
