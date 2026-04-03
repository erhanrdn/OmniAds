import { NextRequest } from "next/server";
import { getIntegration } from "@/lib/integrations";
import {
  fetchAssignedAccountIds,
  fetchCreativeDetailPreviewHtml,
} from "@/lib/meta/creatives-fetchers";
import { buildCreativesResponse } from "@/lib/meta/creatives-service";
import type { FormatFilter, GroupBy, SortKey } from "@/lib/meta/creatives-types";
import {
  getMetaCreativesWarehousePayload,
} from "@/lib/meta/creatives-warehouse";

export interface MetaCreativesLivePayloadInput {
  request: NextRequest;
  requestStartedAt: number;
  businessId: string;
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
  enableCopyRecovery: boolean;
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

export interface MetaCreativeDetailPayloadInput {
  businessId: string;
  creativeId: string;
}

export interface MetaCreativesWarehousePayloadInput {
  businessId: string;
  mediaMode: "metadata" | "full";
  groupBy: GroupBy;
  format: FormatFilter;
  sort: SortKey;
  start: string;
  end: string;
}

export async function getMetaCreativesApiPayload(input: MetaCreativesLivePayloadInput) {
  const {
    request,
    requestStartedAt,
    businessId,
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
    enableCopyRecovery,
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
      enableCopyRecovery,
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

export async function getMetaCreativeDetailPayload(input: MetaCreativeDetailPayloadInput) {
  const integration = await getIntegration(input.businessId, "meta").catch(() => null);
  if (!integration || integration.status !== "connected") {
    return {
      status: "no_connection",
      detail_preview: {
        creative_id: input.creativeId,
        mode: "unavailable",
        source: null,
        ad_format: null,
        html: null,
      },
    };
  }
  if (!integration.access_token) {
    return {
      status: "no_access_token",
      detail_preview: {
        creative_id: input.creativeId,
        mode: "unavailable",
        source: null,
        ad_format: null,
        html: null,
      },
    };
  }

  const preview = await fetchCreativeDetailPreviewHtml(input.creativeId, integration.access_token);
  return {
    status: "ok",
    detail_preview: {
      creative_id: input.creativeId,
      mode: preview ? "html" : "unavailable",
      source: preview?.source ?? null,
      ad_format: preview?.adFormat ?? null,
      html: preview?.html ?? null,
    },
  };
}

export async function getMetaCreativesDbPayload(input: MetaCreativesWarehousePayloadInput) {
  const {
    businessId,
    mediaMode,
    groupBy,
    format,
    sort,
    start,
    end,
  } = input;

  const integration = await getIntegration(businessId, "meta").catch(() => null);
  if (!integration || integration.status !== "connected") {
    return { status: "no_connection", rows: [] };
  }
  if (!integration.access_token) {
    return { status: "no_access_token", rows: [] };
  }

  const assignedAccountIds = await fetchAssignedAccountIds(businessId);
  if (assignedAccountIds.length === 0) {
    return { status: "no_accounts_assigned", rows: [] };
  }

  return getMetaCreativesWarehousePayload({
    businessId,
    start,
    end,
    groupBy,
    format,
    sort,
    mediaMode,
  });
}
