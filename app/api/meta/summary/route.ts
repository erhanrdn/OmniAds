import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import { getProviderAccountAssignments } from "@/lib/provider-account-assignments";
import { getMetaPartialReason, getMetaRangePreparationContext } from "@/lib/meta/readiness";
import { getMetaWarehouseSummary } from "@/lib/meta/serving";
import { isDemoBusinessId, getDemoMetaSummary } from "@/lib/demo-business";
import { getMetaLiveSummaryTotals } from "@/lib/meta/live";
import { getIntegration } from "@/lib/integrations";

export interface MetaSummaryRouteResponse extends Awaited<ReturnType<typeof getMetaWarehouseSummary>> {
  isPartial: boolean;
  notReadyReason?: string | null;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const businessId = url.searchParams.get("businessId");
  const startDate = url.searchParams.get("startDate");
  const endDate = url.searchParams.get("endDate");

  const access = await requireBusinessAccess({ request, businessId });
  if ("error" in access) return access.error;

  if (isDemoBusinessId(businessId)) {
    return NextResponse.json({ ...getDemoMetaSummary(), isPartial: false, notReadyReason: null });
  }

  if (!startDate || !endDate) {
    return NextResponse.json(
      { error: "missing_date_range", message: "startDate and endDate are required." },
      { status: 400 }
    );
  }

  const assignment = await getProviderAccountAssignments(businessId!, "meta").catch(() => null);
  const providerAccountIds = assignment?.account_ids ?? [];
  const [rangeContext, integration] = await Promise.all([
    getMetaRangePreparationContext({ businessId: businessId!, startDate, endDate }),
    getIntegration(businessId!, "meta").catch(() => null),
  ]);
  const connected = integration?.status === "connected";

  const payload = await getMetaWarehouseSummary({
    businessId: businessId!,
    startDate,
    endDate,
    providerAccountIds,
  });

  // For today, override KPI totals with live Meta API data
  if (rangeContext.isSelectedCurrentDay && connected) {
    try {
      const liveTotals = await getMetaLiveSummaryTotals({
        businessId: businessId!,
        startDate,
        endDate,
        providerAccountIds,
      });
      if (liveTotals.spend > 0 || liveTotals.impressions > 0) {
        return NextResponse.json(
          {
            ...payload,
            totals: liveTotals,
            isPartial: false,
            notReadyReason: null,
          } satisfies MetaSummaryRouteResponse,
          { headers: { "Cache-Control": "no-store" } }
        );
      }
    } catch (error) {
      console.warn("[meta-summary] live_totals_failed", {
        businessId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return NextResponse.json(
    {
      ...payload,
      isPartial: Boolean(payload.isPartial),
      notReadyReason: payload.isPartial
        ? getMetaPartialReason({
            isSelectedCurrentDay: rangeContext.isSelectedCurrentDay,
            currentDateInTimezone: rangeContext.currentDateInTimezone,
            primaryAccountTimezone: rangeContext.primaryAccountTimezone,
            defaultReason: "Warehouse data is still being prepared for the requested range.",
          })
        : null,
    } satisfies MetaSummaryRouteResponse,
    {
      headers: { "Cache-Control": "no-store" },
    }
  );
}
