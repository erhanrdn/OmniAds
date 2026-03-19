import { NextRequest, NextResponse } from "next/server";
import { isDemoBusiness } from "@/lib/business-mode.server";
import { getIntegration } from "@/lib/integrations";
import { requireBusinessAccess } from "@/lib/access";
import { getDemoMetaCreatives } from "@/lib/demo-business";
import type { FormatFilter, GroupBy, SortKey } from "@/lib/meta/creatives-types";
export type { MetaCreativeApiRow } from "@/lib/meta/creatives-types";
import { toISODate, nDaysAgo } from "@/lib/meta/creatives-row-mappers";
import { fetchAssignedAccountIds, fetchCreativeDetailPreviewHtml } from "@/lib/meta/creatives-fetchers";
import { buildCreativesResponse } from "@/lib/meta/creatives-service";

export async function GET(request: NextRequest) {
  const requestStartedAt = Date.now();
  const params = request.nextUrl.searchParams;
  const businessId = params.get("businessId");
  const detailPreviewCreativeId = params.get("detailPreviewCreativeId")?.trim() ?? "";
  const mediaMode = params.get("mediaMode") === "metadata" ? "metadata" : "full";
  const enableFullMediaHydration = mediaMode === "full";
  const groupBy = (params.get("groupBy") as GroupBy | null) ?? "creative";
  const format = (params.get("format") as FormatFilter | null) ?? "all";
  const sort = (params.get("sort") as SortKey | null) ?? "roas";
  const start = params.get("start") ?? toISODate(nDaysAgo(29));
  const end = params.get("end") ?? toISODate(new Date());
  const debugPreview = params.get("debugPreview") === "1";
  const debugThumbnail = params.get("debugThumbnail") === "1";
  const debugPerf = params.get("debugPerf") === "1";
  const snapshotBypass = params.get("snapshotBypass") === "1";
  const snapshotWarm = params.get("snapshotWarm") === "1";
  const enableCreativeBasicsFallback = enableFullMediaHydration && params.get("creativeBasicsFallback") !== "0";
  const enableCreativeDetails = enableFullMediaHydration && params.get("creativeDetails") !== "0";
  const enableThumbnailBackfill = enableFullMediaHydration && params.get("thumbnailBackfill") !== "0";
  const enableCardThumbnailBackfill = enableFullMediaHydration && params.get("cardThumbnailBackfill") !== "0";
  const enableImageHashLookup =
    enableFullMediaHydration && (debugPreview || debugThumbnail || params.get("imageHashLookup") === "1");
  const enableMediaRecovery =
    enableFullMediaHydration && (debugPreview || debugThumbnail || params.get("recoverMedia") === "1");
  const enableMediaCache = params.get("mediaCache") !== "0";
  const enableDeepAudit = enableFullMediaHydration && (debugPreview || debugPerf);
  const previewSampleLimit = Number(params.get("previewSampleLimit") ?? "5");
  const perAccountSampleLimit =
    Number.isFinite(previewSampleLimit) && previewSampleLimit > 0
      ? Math.min(25, Math.max(1, Math.floor(previewSampleLimit)))
      : 10;

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

  const integration = await getIntegration(businessId, "meta").catch(() => null);
  if (!integration || integration.status !== "connected") {
    return NextResponse.json({ status: "no_connection", rows: [] });
  }
  if (!integration.access_token) {
    return NextResponse.json({ status: "no_access_token", rows: [] });
  }
  const accessToken = integration.access_token;

  if (detailPreviewCreativeId) {
    const preview = await fetchCreativeDetailPreviewHtml(detailPreviewCreativeId, accessToken);
    return NextResponse.json({
      status: "ok",
      detail_preview: preview
        ? {
            creative_id: detailPreviewCreativeId,
            mode: "html",
            source: preview.source,
            ad_format: preview.adFormat,
            html: preview.html,
          }
        : {
            creative_id: detailPreviewCreativeId,
            mode: "unavailable",
            source: null,
            ad_format: null,
            html: null,
          },
    });
  }

  const assignedAccountIds = await fetchAssignedAccountIds(businessId);
  if (assignedAccountIds.length === 0) {
    return NextResponse.json({ status: "no_accounts_assigned", rows: [] });
  }

  const result = await buildCreativesResponse(
    {
      businessId,
      assignedAccountIds,
      accessToken,
      mediaMode,
      enableFullMediaHydration,
      groupBy,
      format,
      sort,
      start,
      end,
      debugPreview,
      debugThumbnail,
      debugPerf,
      snapshotBypass,
      snapshotWarm,
      enableCreativeBasicsFallback,
      enableCreativeDetails,
      enableThumbnailBackfill,
      enableCardThumbnailBackfill,
      enableImageHashLookup,
      enableMediaRecovery,
      enableMediaCache,
      enableDeepAudit,
      perAccountSampleLimit,
      requestStartedAt,
    },
    request
  );
  return NextResponse.json(result);
}
