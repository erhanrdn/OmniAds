import { NextRequest } from "next/server";
import { getIntegration } from "@/lib/integrations";
import { fetchAssignedAccountIds, fetchCreativeDetailPreviewHtml } from "@/lib/meta/creatives-fetchers";
import { buildCreativesResponse } from "@/lib/meta/creatives-service";
import type { FormatFilter, GroupBy, SortKey } from "@/lib/meta/creatives-types";

export interface MetaCreativesApiInput {
  request: NextRequest;
  requestStartedAt: number;
  businessId: string;
  detailPreviewCreativeId?: string;
  mediaMode: "metadata" | "full";
  groupBy: GroupBy;
  format: FormatFilter;
  sort: SortKey;
  start: string;
  end: string;
  debugPreview: boolean;
  debugThumbnail: boolean;
  debugPerf: boolean;
  snapshotBypass: boolean;
  snapshotWarm: boolean;
  enableCreativeBasicsFallback: boolean;
  enableCreativeDetails: boolean;
  enableThumbnailBackfill: boolean;
  enableCardThumbnailBackfill: boolean;
  enableImageHashLookup: boolean;
  enableMediaRecovery: boolean;
  enableMediaCache: boolean;
  enableDeepAudit: boolean;
  perAccountSampleLimit: number;
}

export async function getMetaCreativesApiPayload(input: MetaCreativesApiInput) {
  const {
    request,
    requestStartedAt,
    businessId,
    detailPreviewCreativeId = "",
    mediaMode,
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
  } = input;
  const enableFullMediaHydration = mediaMode === "full";

  const integration = await getIntegration(businessId, "meta").catch(() => null);
  if (!integration || integration.status !== "connected") {
    return { status: "no_connection", rows: [] };
  }
  if (!integration.access_token) {
    return { status: "no_access_token", rows: [] };
  }
  const accessToken = integration.access_token;

  if (detailPreviewCreativeId) {
    const preview = await fetchCreativeDetailPreviewHtml(detailPreviewCreativeId, accessToken);
    return {
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
    };
  }

  const assignedAccountIds = await fetchAssignedAccountIds(businessId);
  if (assignedAccountIds.length === 0) {
    return { status: "no_accounts_assigned", rows: [] };
  }

  return buildCreativesResponse(
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
}
