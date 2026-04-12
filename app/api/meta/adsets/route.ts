import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import type { CurrentDayWarehouseSnapshotFields } from "@/lib/current-day-snapshot";
import { getMetaAdSetsForRange } from "@/lib/meta/adsets-source";

// ── Route ─────────────────────────────────────────────────────────────────────

export interface MetaAdSetsResponse extends CurrentDayWarehouseSnapshotFields {
  status?: "ok" | "not_connected";
  rows: Awaited<ReturnType<typeof getMetaAdSetsForRange>>["rows"];
  isPartial?: boolean;
  notReadyReason?: string | null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const businessId = searchParams.get("businessId");
  const campaignId = searchParams.get("campaignId");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const includePrev = searchParams.get("includePrev") === "1";

  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "guest",
  });
  if ("error" in access) return access.error;
  const payload = await getMetaAdSetsForRange({
    businessId: businessId!,
    campaignId,
    startDate,
    endDate,
    includePrev,
  });
  return NextResponse.json(payload satisfies MetaAdSetsResponse);
}
