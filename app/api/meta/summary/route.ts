import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import { getProviderAccountAssignments } from "@/lib/provider-account-assignments";
import { getMetaWarehouseSummary } from "@/lib/meta/serving";
import { ensureMetaWarehouseRangeFilled } from "@/lib/sync/meta-sync";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const businessId = url.searchParams.get("businessId");
  const startDate = url.searchParams.get("startDate");
  const endDate = url.searchParams.get("endDate");

  const access = await requireBusinessAccess({ request, businessId });
  if ("error" in access) return access.error;

  if (!startDate || !endDate) {
    return NextResponse.json(
      { error: "missing_date_range", message: "startDate and endDate are required." },
      { status: 400 }
    );
  }

  const assignment = await getProviderAccountAssignments(businessId!, "meta").catch(() => null);
  const providerAccountIds = assignment?.account_ids ?? [];

  await ensureMetaWarehouseRangeFilled({
    businessId: businessId!,
    startDate,
    endDate,
  }).catch((error) => {
    console.warn("[meta-summary] ensure_range_failed", {
      businessId,
      startDate,
      endDate,
      message: error instanceof Error ? error.message : String(error),
    });
  });

  const payload = await getMetaWarehouseSummary({
    businessId: businessId!,
    startDate,
    endDate,
    providerAccountIds,
  });

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "no-store" },
  });
}
