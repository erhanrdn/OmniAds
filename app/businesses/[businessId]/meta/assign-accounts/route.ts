import { NextRequest, NextResponse } from "next/server";
import { getIntegration } from "@/lib/integrations";
import { upsertProviderAccountAssignments } from "@/lib/provider-account-assignments";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ businessId: string }> }
) {
  const { businessId } = await params;
  console.log("[meta-assign-accounts] request", { businessId });

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
  console.log("[meta-assign-accounts] integration lookup", {
    businessId,
    found: Boolean(integration),
  });
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
  console.log("[meta-assign-accounts] payload", {
    businessId,
    accountIds,
    isArray: Array.isArray(accountIds),
  });

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

  try {
    const row = await upsertProviderAccountAssignments({
      businessId,
      provider: "meta",
      accountIds: cleaned,
    });

    console.log("[meta-assign-accounts] db write success", {
      businessId,
      provider: "meta",
      returnedAccountIds: row.account_ids,
      updatedAt: row.updated_at,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[meta-assign-accounts] db write failed", {
      businessId,
      message,
    });
    return NextResponse.json(
      {
        error: "assignment_save_failed",
        message: "Could not save Meta account assignments.",
      },
      { status: 500 }
    );
  }

  console.log("[meta-assign-accounts] response", {
    businessId,
    assigned_accounts: cleaned,
  });

  return NextResponse.json({
    success: true,
    assigned_accounts: cleaned,
  });
}
