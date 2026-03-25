import { NextRequest, NextResponse } from "next/server";
import { isDemoBusiness } from "@/lib/business-mode.server";
import { getIntegration } from "@/lib/integrations";
import { upsertProviderAccountAssignments } from "@/lib/provider-account-assignments";
import { runMigrations } from "@/lib/migrations";
import { readProviderAccountSnapshot } from "@/lib/provider-account-snapshots";

const GOOGLE_ACCOUNT_SNAPSHOT_FRESHNESS_MS = 60 * 60_000;

/**
 * POST /businesses/:businessId/google/assign-accounts
 *
 * Saves the selected Google Ads customer account assignments for a business.
 * Body: { account_ids: string[] }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ businessId: string }> },
) {
  const { businessId } = await params;
  console.log("[google-assign-accounts] request", { businessId });

  if (!businessId) {
    return NextResponse.json(
      {
        error: "missing_business_id",
        message: "businessId path parameter is required.",
      },
      { status: 400 },
    );
  }

  if (await isDemoBusiness(businessId)) {
    const body = await request.json().catch(() => null);
    const accountIds = body?.account_ids;
    if (
      !Array.isArray(accountIds) ||
      accountIds.some((id) => typeof id !== "string")
    ) {
      return NextResponse.json(
        {
          error: "invalid_payload",
          message: "account_ids must be an array of strings.",
        },
        { status: 400 },
      );
    }

    const cleaned = Array.from(
      new Set(accountIds.map((id) => id.trim()).filter(Boolean)),
    );
    return NextResponse.json({
      success: true,
      assigned_accounts: cleaned,
    });
  }

  const integration = await getIntegration(businessId, "google");
  console.log("[google-assign-accounts] integration lookup", {
    businessId,
    found: Boolean(integration),
  });
  if (!integration) {
    return NextResponse.json(
      {
        error: "integration_not_found",
        message: "Google integration not found for this business.",
      },
      { status: 404 },
    );
  }

  const body = await request.json().catch(() => null);
  const accountIds = body?.account_ids;
  console.log("[google-assign-accounts] payload", {
    businessId,
    accountIds,
    isArray: Array.isArray(accountIds),
  });

  if (
    !Array.isArray(accountIds) ||
    accountIds.some((id) => typeof id !== "string")
  ) {
    return NextResponse.json(
      {
        error: "invalid_payload",
        message: "account_ids must be an array of strings.",
      },
      { status: 400 },
    );
  }

  const cleaned = Array.from(
    new Set(accountIds.map((id) => id.trim()).filter(Boolean)),
  );

  const snapshot = await readProviderAccountSnapshot({
    businessId,
    provider: "google",
    freshnessMs: GOOGLE_ACCOUNT_SNAPSHOT_FRESHNESS_MS,
  });

  if (!snapshot) {
    return NextResponse.json(
      {
        error: "google_accounts_not_loaded",
        message:
          "Google Ads accounts must be loaded before assignments can be saved. Refresh the account list and try again.",
      },
      { status: 409 }
    );
  }

  const validAccountIds = new Set(snapshot.accounts.map((account) => account.id));
  const invalidIds = cleaned.filter((id) => !validAccountIds.has(id));
  if (invalidIds.length > 0) {
    console.warn("[google-assign-accounts] rejected unknown account ids", {
      businessId,
      invalidIds,
      snapshotCount: snapshot.accounts.length,
    });
    return NextResponse.json(
      {
        error: "invalid_google_account_selection",
        message:
          "One or more selected Google Ads accounts are no longer available. Refresh the account list and try again.",
      },
      { status: 400 }
    );
  }

  async function doUpsert() {
    return upsertProviderAccountAssignments({
      businessId,
      provider: "google",
      accountIds: cleaned,
    });
  }

  let row;
  try {
    row = await doUpsert();
  } catch (firstError: unknown) {
    const firstMessage =
      firstError instanceof Error ? firstError.message : String(firstError);
    console.warn("[google-assign-accounts] db write failed (first attempt)", {
      businessId,
      message: firstMessage,
    });

    // If the table is missing, auto-run migrations and retry once.
    const isMissingTable =
      firstMessage.includes("does not exist") ||
      firstMessage.includes("relation");
    if (isMissingTable) {
      try {
        console.log(
          "[google-assign-accounts] running migrations to create missing table",
        );
        await runMigrations();
        row = await doUpsert();
      } catch (retryError: unknown) {
        const retryMessage =
          retryError instanceof Error ? retryError.message : String(retryError);
        console.error(
          "[google-assign-accounts] db write failed after migration",
          { businessId, message: retryMessage },
        );
        return NextResponse.json(
          {
            error: "assignment_save_failed",
            message: "Could not save Google Ads account assignments.",
          },
          { status: 500 },
        );
      }
    } else {
      console.error("[google-assign-accounts] db write failed", {
        businessId,
        message: firstMessage,
      });
      return NextResponse.json(
        {
          error: "assignment_save_failed",
          message: "Could not save Google Ads account assignments.",
        },
        { status: 500 },
      );
    }
  }

  console.log("[google-assign-accounts] db write success", {
    businessId,
    provider: "google",
    returnedAccountIds: row!.account_ids,
    updatedAt: row!.updated_at,
  });

  return NextResponse.json({
    success: true,
    assigned_accounts: cleaned,
  });
}
