import { NextRequest, NextResponse } from "next/server";
import { getIntegration } from "@/lib/integrations";
import { upsertProviderAccountAssignments } from "@/lib/provider-account-assignments";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ businessId: string }> }
) {
  const { businessId } = await params;

  if (!businessId) {
    return NextResponse.json(
      {
        error: "missing_business_id",
        message: "businessId path parameter is required.",
      },
      { status: 400 }
    );
  }

  const integration = await getIntegration(businessId, "meta");
  if (!integration) {
    return NextResponse.json(
      {
        error: "integration_not_found",
        message: "Meta integration not found for this business.",
      },
      { status: 404 }
    );
  }

  const body = await request.json().catch(() => null);
  const accountIds = body?.account_ids;

  if (!Array.isArray(accountIds) || accountIds.some((id) => typeof id !== "string")) {
    return NextResponse.json(
      {
        error: "invalid_payload",
        message: "account_ids must be an array of strings.",
      },
      { status: 400 }
    );
  }

  const cleaned = Array.from(new Set(accountIds.map((id) => id.trim()).filter(Boolean)));

  await upsertProviderAccountAssignments({
    businessId,
    provider: "meta",
    accountIds: cleaned,
  });

  return NextResponse.json({
    success: true,
    assigned_accounts: cleaned,
  });
}
