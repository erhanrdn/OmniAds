import { NextRequest, NextResponse } from "next/server";
import { isDemoBusiness } from "@/lib/business-mode.server";
import { requireBusinessAccess } from "@/lib/access";
import { getDemoMetaCreatives } from "@/lib/demo-business";
import type { FormatFilter, GroupBy, SortKey } from "@/lib/meta/creatives-types";
import { toISODate, nDaysAgo } from "@/lib/meta/creatives-row-mappers";
import { getMetaCreativesDbPayload } from "@/lib/meta/creatives-api";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const businessId = params.get("businessId");
  const mediaMode = params.get("mediaMode") === "full" ? "full" : "metadata";
  const groupBy = (params.get("groupBy") as GroupBy | null) ?? "creative";
  const format = (params.get("format") as FormatFilter | null) ?? "all";
  const sort = (params.get("sort") as SortKey | null) ?? "roas";
  const start = params.get("start") ?? toISODate(nDaysAgo(29));
  const end = params.get("end") ?? toISODate(new Date());

  if (!businessId) {
    return NextResponse.json(
      { error: "missing_business_id", message: "businessId is required." },
      { status: 400 }
    );
  }

  const access = await requireBusinessAccess({ request, businessId, minRole: "guest" });
  if ("error" in access) return access.error;

  if (await isDemoBusiness(businessId)) {
    return NextResponse.json(getDemoMetaCreatives());
  }

  const result = await getMetaCreativesDbPayload({
    businessId,
    mediaMode,
    groupBy,
    format,
    sort,
    start,
    end,
  });

  return NextResponse.json(result);
}
