import { NextRequest, NextResponse } from "next/server";
import { getIntegration } from "@/lib/integrations";
import { fetchMetaAdAccounts, getMetaApiErrorMessage } from "@/lib/meta-ad-accounts";
import { getProviderAccountAssignments } from "@/lib/provider-account-assignments";

export async function GET(request: NextRequest) {
  const businessId = request.nextUrl.searchParams.get("businessId");

  console.log("[meta-ad-accounts] request", { businessId });

  if (!businessId) {
    return NextResponse.json(
      {
        error: "missing_business_id",
        message: "businessId query parameter is required.",
      },
      { status: 400 }
    );
  }

  const integration = await getIntegration(businessId, "meta");
  console.log("[meta-ad-accounts] integration lookup", {
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

  const accessToken = integration.access_token;
  console.log("[meta-ad-accounts] token check", {
    businessId,
    hasToken: Boolean(accessToken),
  });

  if (!accessToken) {
    return NextResponse.json(
      {
        error: "missing_access_token",
        message: "Meta access token is missing for this business integration.",
      },
      { status: 401 }
    );
  }

  if (integration.token_expires_at) {
    const isExpired = new Date(integration.token_expires_at).getTime() <= Date.now();
    if (isExpired) {
      return NextResponse.json(
        {
          error: "token_expired",
          message: "Meta access token has expired. Please reconnect Meta integration.",
        },
        { status: 401 }
      );
    }
  }

  try {
    const metaResult = await fetchMetaAdAccounts(accessToken);
    const assignmentRow = await getProviderAccountAssignments(businessId, "meta");
    const assignedSet = new Set(assignmentRow?.account_ids ?? []);

    console.log("[meta-ad-accounts] meta response", {
      businessId,
      status: metaResult.status,
      rawBody: metaResult.rawBody,
    });

    if (!metaResult.ok || metaResult.body?.error) {
      const message = getMetaApiErrorMessage(metaResult);
      return NextResponse.json(
        {
          error: "meta_api_error",
          message,
          meta: metaResult.body ?? metaResult.rawBody,
        },
        { status: 502 }
      );
    }

    console.log("[meta-ad-accounts] normalized", {
      businessId,
      count: metaResult.normalized.length,
      assignedCount: assignedSet.size,
    });

    return NextResponse.json({
      data: metaResult.normalized.map((account) => ({
        ...account,
        assigned: assignedSet.has(account.id),
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";

    console.error("[meta-ad-accounts] unexpected_error", {
      businessId,
      message,
    });

    return NextResponse.json(
      {
        error: "meta_api_error",
        message,
      },
      { status: 500 }
    );
  }
}
