import { NextRequest, NextResponse } from "next/server";
import { updateBusinessSettings } from "@/lib/account-store";
import { requireBusinessAccess } from "@/lib/access";
import { getDb } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";
import { isDemoBusinessId } from "@/lib/demo-business";
import { resolveRequestLanguage } from "@/lib/request-language";

interface UpdateBusinessBody {
  name?: string;
  timezone?: string;
  currency?: string;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ businessId: string }> }
) {
  const language = await resolveRequestLanguage(request);
  const { businessId } = await context.params;
  if (!businessId) {
    return NextResponse.json(
      { error: "missing_business_id", message: language === "tr" ? "businessId path parametresi zorunludur." : "businessId path parameter is required." },
      { status: 400 }
    );
  }
  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "admin",
  });
  if ("error" in access) return access.error;
  if (isDemoBusinessId(businessId)) {
    return NextResponse.json(
      { error: "forbidden", message: language === "tr" ? "Demo business ayarlari degistirilemez." : "Demo business settings cannot be changed." },
      { status: 403 }
    );
  }

  const body = (await request.json().catch(() => null)) as UpdateBusinessBody | null;
  const name = body?.name?.trim() ?? "";
  const currency = body?.currency?.trim().toUpperCase() ?? "";
  if (typeof body?.timezone === "string" && body.timezone.trim().length > 0) {
    console.warn("[businesses] deprecated_timezone_input_ignored", {
      route: "update_business",
      businessId,
    });
  }

  if (name.length < 2 || !currency) {
    return NextResponse.json(
      { error: "invalid_payload", message: language === "tr" ? "Ad ve currency zorunludur." : "Name and currency are required." },
      { status: 400 }
    );
  }

  const business = await updateBusinessSettings({
    businessId,
    name,
    currency,
  });
  return NextResponse.json({ business });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ businessId: string }> }
) {
  const language = await resolveRequestLanguage(request);
  const { businessId } = await context.params;
  if (!businessId) {
    return NextResponse.json(
      { error: "missing_business_id", message: language === "tr" ? "businessId path parametresi zorunludur." : "businessId path parameter is required." },
      { status: 400 }
    );
  }
  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "admin",
  });
  if ("error" in access) return access.error;
  if (isDemoBusinessId(businessId)) {
    return NextResponse.json(
      { error: "forbidden", message: language === "tr" ? "Demo business silinemez." : "Demo business cannot be deleted." },
      { status: 403 }
    );
  }

  await runMigrations().catch(() => null);
  const sql = getDb();

  await sql`DELETE FROM memberships WHERE business_id = ${businessId}`;
  await sql`DELETE FROM invites WHERE business_id = ${businessId}`;
  await sql`DELETE FROM business_cost_models WHERE business_id = ${businessId}`;
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
