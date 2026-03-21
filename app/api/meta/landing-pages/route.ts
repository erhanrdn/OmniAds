import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import { isDemoBusiness } from "@/lib/business-mode.server";
import { getIntegration } from "@/lib/integrations";
import { fetchAssignedAccountIds } from "@/lib/meta/creatives-fetchers";
import {
  fetchMetaLandingPageAdsMap,
  META_LANDING_PAGE_BLOCKED_FIELDS,
  META_LANDING_PAGE_FIELDSET_VERSION,
  type MetaLandingPageAdRecord,
  type MetaLandingPageFetchMeta,
} from "@/lib/meta/landing-pages-fetchers";
import { buildEmptyMetaLandingPageSummary, summarizeMetaLandingPageRows } from "@/lib/meta/landing-pages-summary";
import { resolveMetaLandingUrl } from "@/lib/meta/landing-url-resolver";

export async function GET(request: NextRequest) {
  const businessId = request.nextUrl.searchParams.get("businessId");
  const accountFilter = request.nextUrl.searchParams.get("accountId")?.trim() ?? "";
  const limitRaw = Number(request.nextUrl.searchParams.get("limit") ?? "100");
  const limit = Number.isFinite(limitRaw) ? Math.min(500, Math.max(1, Math.floor(limitRaw))) : 100;

  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "guest",
  });
  if ("error" in access) return access.error;

  if (await isDemoBusiness(businessId)) {
    return NextResponse.json({
      status: "demo_not_supported",
      rows: [],
      summary: buildEmptyMetaLandingPageSummary(limit),
      diagnostics: {
        requestProfile: {
          fieldSetVersion: META_LANDING_PAGE_FIELDSET_VERSION,
          blockedFields: META_LANDING_PAGE_BLOCKED_FIELDS,
          accountCount: 0,
          adsScanned: 0,
          integrationScopes: [],
        },
        fetchAccounts: [] as MetaLandingPageFetchMeta[],
      },
    });
  }

  const integration = await getIntegration(businessId!, "meta").catch(() => null);
  if (!integration || integration.status !== "connected") {
    return NextResponse.json({
      status: "no_connection",
      rows: [],
      summary: buildEmptyMetaLandingPageSummary(limit),
    });
  }
  if (!integration.access_token) {
    return NextResponse.json({
      status: "no_access_token",
      rows: [],
      summary: buildEmptyMetaLandingPageSummary(limit),
    });
  }

  const assignedAccountIds = await fetchAssignedAccountIds(businessId!);
  const selectedAccountIds = accountFilter
    ? assignedAccountIds.filter((accountId) => accountId === accountFilter)
    : assignedAccountIds;
  const integrationScopes = typeof integration.scopes === "string"
    ? integration.scopes.split(/[,\s]+/).map((scope) => scope.trim()).filter(Boolean)
    : [];

  if (selectedAccountIds.length === 0) {
    return NextResponse.json({
      status: "no_accounts_assigned",
      rows: [],
      summary: buildEmptyMetaLandingPageSummary(limit),
    });
  }

  const rows: Array<{
    accountId: string;
    adId: string;
    adName: string | null;
    creativeId: string | null;
    creativeName: string | null;
    rawUrl: string | null;
    canonicalUrl: string | null;
    urlSource: string;
    confidence: string;
    objectType: string | null;
  }> = [];
  const fetchAccounts: MetaLandingPageFetchMeta[] = [];
  const adsByAccountId = new Map<string, Map<string, MetaLandingPageAdRecord>>();

  for (const accountId of selectedAccountIds) {
    const { adsMap, meta } = await fetchMetaLandingPageAdsMap(accountId, integration.access_token);
    fetchAccounts.push(meta);
    adsByAccountId.set(accountId, adsMap);
    for (const ad of adsMap.values()) {
      const resolved = resolveMetaLandingUrl(ad.creative);
      rows.push({
        accountId,
        adId: typeof ad.id === "string" ? ad.id : "unknown",
        adName: typeof ad.name === "string" ? ad.name : null,
        creativeId: typeof ad.creative?.id === "string" ? ad.creative.id : null,
        creativeName: typeof ad.creative?.name === "string" ? ad.creative.name : null,
        rawUrl: resolved.rawUrl,
        canonicalUrl: resolved.canonicalUrl,
        urlSource: resolved.source,
        confidence: resolved.confidence,
        objectType: typeof ad.creative?.object_type === "string" ? ad.creative.object_type : null,
      });
    }
  }

  const limitedRows = rows.slice(0, limit);
  const summary = summarizeMetaLandingPageRows({
    rows: limitedRows,
    adsByAccountId,
    limit,
    totalAvailableRows: rows.length,
  });

  return NextResponse.json({
    status: "ok",
    summary,
    rows: limitedRows,
    diagnostics: {
      requestProfile: {
        fieldSetVersion: META_LANDING_PAGE_FIELDSET_VERSION,
        blockedFields: META_LANDING_PAGE_BLOCKED_FIELDS,
        accountCount: selectedAccountIds.length,
        adsScanned: summary.adsScanned,
        integrationScopes,
      },
      fetchAccounts,
    },
  });
}
