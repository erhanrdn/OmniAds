import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import { consumeShopifyInstallContext } from "@/lib/shopify/install-context";
import { upsertIntegration } from "@/lib/integrations";
import { updateBusinessCurrency } from "@/lib/account-store";
import { setSessionActiveBusiness } from "@/lib/auth";
import { sanitizeNextPath } from "@/lib/auth-routing";

interface FinalizeBody {
  token?: string;
  businessId?: string;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as FinalizeBody | null;
  const token = body?.token?.trim() ?? "";
  const businessId = body?.businessId?.trim() ?? "";

  if (!token || !businessId) {
    return NextResponse.json(
      { error: "invalid_payload", message: "token and businessId are required." },
      { status: 400 },
    );
  }

  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "collaborator",
  });
  if ("error" in access) return access.error;

  const context = await consumeShopifyInstallContext(token);
  if (!context) {
    return NextResponse.json(
      { error: "context_not_found", message: "Shopify install context not found or expired." },
      { status: 404 },
    );
  }

  const integration = await upsertIntegration({
    businessId,
    provider: "shopify",
    status: "connected",
    providerAccountId: context.shop_domain,
    providerAccountName: context.shop_name ?? context.shop_domain,
    accessToken: context.access_token,
    scopes: context.scopes ?? undefined,
    metadata: context.metadata,
  });

  const currency =
    context.metadata && typeof context.metadata.currency === "string"
      ? context.metadata.currency
      : null;
  if (currency) {
    await updateBusinessCurrency(businessId, currency).catch(() => {});
  }

  await setSessionActiveBusiness(access.session.sessionId, businessId);

  return NextResponse.json({
    status: "success",
    integration: {
      id: integration.id,
      provider: integration.provider,
      providerAccountId: integration.provider_account_id,
      providerAccountName: integration.provider_account_name,
      connectedAt: integration.connected_at,
    },
    businessId,
    returnTo: sanitizeNextPath(context.return_to) ?? "/integrations",
  });
}
