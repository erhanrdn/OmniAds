import { NextRequest, NextResponse } from "next/server";
import { isDemoBusiness } from "@/lib/business-mode.server";
import { getDbSchemaReadiness, isMissingRelationError } from "@/lib/db-schema-readiness";
import { getIntegration } from "@/lib/integrations";
import { upsertProviderAccountAssignments } from "@/lib/provider-account-assignments";

const META_ASSIGNMENT_REQUIRED_TABLES = ["provider_account_assignments"] as const;

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

  if (await isDemoBusiness(businessId)) {
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
    return NextResponse.json({
      success: true,
      assigned_accounts: cleaned,
    });
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
  const readiness = await getDbSchemaReadiness({
    tables: [...META_ASSIGNMENT_REQUIRED_TABLES],
  }).catch(() => null);
  if (!readiness?.ready) {
    return NextResponse.json(
      {
        error: "schema_not_ready",
        message:
          "Meta account assignments are unavailable until request-external migrations are applied.",
        missingTables: readiness?.missingTables ?? [],
        checkedAt: readiness?.checkedAt ?? null,
      },
      { status: 503 },
    );
  }

  async function doUpsert() {
    return upsertProviderAccountAssignments({
      businessId,
      provider: "meta",
      accountIds: cleaned,
    });
  }

  let row;
  try {
    row = await doUpsert();
  } catch (firstError: unknown) {
    const firstMessage = firstError instanceof Error ? firstError.message : String(firstError);
    console.warn("[meta-assign-accounts] db write failed", {
      businessId,
      message: firstMessage,
    });

    if (isMissingRelationError(firstError, [...META_ASSIGNMENT_REQUIRED_TABLES])) {
      return NextResponse.json(
        {
          error: "schema_not_ready",
          message:
            "Meta account assignments are unavailable until request-external migrations are applied.",
          missingTables: [...META_ASSIGNMENT_REQUIRED_TABLES],
          checkedAt: new Date().toISOString(),
        },
        { status: 503 },
      );
    }

    console.error("[meta-assign-accounts] db write failed", {
      businessId,
      message: firstMessage,
    });
    return NextResponse.json(
      {
        error: "assignment_save_failed",
        message: "Could not save Meta account assignments.",
      },
      { status: 500 }
    );
  }

  console.log("[meta-assign-accounts] db write success", {
    businessId,
    provider: "meta",
    returnedAccountIds: row.account_ids,
    updatedAt: row.updated_at,
  });

  console.log("[meta-assign-accounts] response", {
    businessId,
    assigned_accounts: cleaned,
  });

  return NextResponse.json({
    success: true,
    assigned_accounts: cleaned,
  });
}
