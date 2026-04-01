import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import {
  buildShopifyOverviewCanaryKey,
  buildShopifyOverviewOverrideKey,
  SHOPIFY_OVERVIEW_CANARY_TIMEZONE_BASIS,
} from "@/lib/shopify/serving";
import { getShopifyStatus } from "@/lib/shopify/status";
import {
  getShopifyServingOverride,
  getShopifyServingState,
  listShopifyServingStateHistory,
  upsertShopifyServingOverride,
} from "@/lib/shopify/warehouse";
import { getShopifyRevenueLedgerAggregate } from "@/lib/shopify/revenue-ledger";
import { getShopifyWarehouseOverviewAggregate } from "@/lib/shopify/warehouse-overview";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const businessId = request.nextUrl.searchParams.get("businessId")?.trim();
    const startDate = request.nextUrl.searchParams.get("startDate")?.trim();
    const endDate = request.nextUrl.searchParams.get("endDate")?.trim();

    if (!businessId) {
      return NextResponse.json(
        { error: "businessId is required." },
        { status: 400 }
      );
    }

    const status = await getShopifyStatus({
      businessId,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });

    const serving =
      status.shopId && startDate && endDate
        ? await getShopifyServingState({
            businessId,
            providerAccountId: status.shopId,
            canaryKey: buildShopifyOverviewCanaryKey({
              startDate,
              endDate,
              timeZoneBasis: SHOPIFY_OVERVIEW_CANARY_TIMEZONE_BASIS,
            }),
          }).catch(() => null)
        : null;
    const override =
      status.shopId && startDate && endDate
        ? await getShopifyServingOverride({
            businessId,
            providerAccountId: status.shopId,
            overrideKey: buildShopifyOverviewOverrideKey({
              startDate,
              endDate,
              timeZoneBasis: SHOPIFY_OVERVIEW_CANARY_TIMEZONE_BASIS,
            }),
          }).catch(() => null)
        : null;
    const history =
      status.shopId && startDate && endDate
        ? await listShopifyServingStateHistory({
            businessId,
            providerAccountId: status.shopId,
            canaryKey: buildShopifyOverviewCanaryKey({
              startDate,
              endDate,
              timeZoneBasis: SHOPIFY_OVERVIEW_CANARY_TIMEZONE_BASIS,
            }),
            startDate,
            endDate,
            limit: 5,
          }).catch(() => [])
        : [];
    const [warehouseAggregate, ledgerAggregate] =
      status.shopId && startDate && endDate
        ? await Promise.all([
            getShopifyWarehouseOverviewAggregate({
              businessId,
              providerAccountId: status.shopId,
              startDate,
              endDate,
            }).catch(() => null),
            getShopifyRevenueLedgerAggregate({
              businessId,
              providerAccountId: status.shopId,
              startDate,
              endDate,
            }).catch(() => null),
          ])
        : [null, null];

    return NextResponse.json({
      businessId,
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      canaryKey:
        startDate && endDate
          ? buildShopifyOverviewCanaryKey({
              startDate,
              endDate,
              timeZoneBasis: SHOPIFY_OVERVIEW_CANARY_TIMEZONE_BASIS,
            })
          : null,
      status,
      serving,
      override,
      history,
      warehouseAggregate,
      ledgerAggregate,
    });
  } catch (err) {
    console.error("[admin/integrations/health/shopify GET]", err);
    return NextResponse.json(
      { error: "internal_error", message: String(err) },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const body = await request.json().catch(() => ({}));
    const businessId = typeof body?.businessId === "string" ? body.businessId.trim() : "";
    const providerAccountId =
      typeof body?.providerAccountId === "string" ? body.providerAccountId.trim() : "";
    const startDate = typeof body?.startDate === "string" ? body.startDate.trim() : "";
    const endDate = typeof body?.endDate === "string" ? body.endDate.trim() : "";
    const mode = typeof body?.mode === "string" ? body.mode.trim() : "";
    const reason = typeof body?.reason === "string" ? body.reason.trim() : null;

    if (!businessId || !providerAccountId || !startDate || !endDate) {
      return NextResponse.json({ error: "businessId, providerAccountId, startDate, endDate are required." }, { status: 400 });
    }
    if (!["auto", "force_live", "force_warehouse"].includes(mode)) {
      return NextResponse.json({ error: "mode must be one of auto, force_live, force_warehouse." }, { status: 400 });
    }

    await upsertShopifyServingOverride({
      businessId,
      providerAccountId,
      overrideKey: buildShopifyOverviewOverrideKey({
        startDate,
        endDate,
        timeZoneBasis: SHOPIFY_OVERVIEW_CANARY_TIMEZONE_BASIS,
      }),
      startDate,
      endDate,
      mode: mode as "auto" | "force_live" | "force_warehouse",
      reason,
      updatedBy: auth.session?.user?.id ?? null,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/integrations/health/shopify PATCH]", err);
    return NextResponse.json(
      { error: "internal_error", message: String(err) },
      { status: 500 }
    );
  }
}
