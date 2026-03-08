import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import { getDb } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ businessId: string }> }
) {
  const { businessId } = await context.params;
  if (!businessId) {
    return NextResponse.json(
      { error: "missing_business_id", message: "businessId path parameter is required." },
      { status: 400 }
    );
  }
  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "admin",
  });
  if ("error" in access) return access.error;

  await runMigrations().catch(() => null);
  const sql = getDb();

  await sql`DELETE FROM memberships WHERE business_id = ${businessId}`;
  await sql`DELETE FROM invites WHERE business_id = ${businessId}`;
  await sql`DELETE FROM provider_account_assignments WHERE business_id = ${businessId}`;
  await sql`DELETE FROM integrations WHERE business_id = ${businessId}`;
  await sql`
    DELETE FROM creative_share_snapshots
    WHERE payload->>'businessId' = ${businessId}
  `;
  await sql`DELETE FROM businesses WHERE id = ${businessId}`;
  await sql`
    UPDATE sessions
    SET active_business_id = NULL
    WHERE active_business_id = ${businessId}
  `;

  return NextResponse.json({ status: "ok" });
}
