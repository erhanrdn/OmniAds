import { NextRequest, NextResponse } from "next/server";
import { getIntegration } from "@/lib/integrations";
import { getProviderAccountAssignments } from "@/lib/provider-account-assignments";
import { runMigrations } from "@/lib/migrations";

// ── Meta API types ────────────────────────────────────────────────────────────

interface MetaActionValue {
  action_type: string;
  value: string;
}

interface MetaAdInsightRecord {
  ad_id?: string;
  ad_name?: string;
  spend?: string;
  ctr?: string;
  actions?: MetaActionValue[];
  action_values?: MetaActionValue[];
  purchase_roas?: MetaActionValue[];
}

interface MetaAdRecord {
  id: string;
  creative?: {
    id?: string;
    thumbnail_url?: string | null;
    image_url?: string | null;
    // "DYNAMIC" = DPA / catalog ad; "PHOTO" | "VIDEO" | "SHARE" = standard
    object_type?: string | null;
    object_story_spec?: {
      link_data?: { picture?: string | null } | null;
      video_data?: { image_url?: string | null; thumbnail_url?: string | null } | null;
    } | null;
  } | null;
}

// ── Public response shape ─────────────────────────────────────────────────────

export type CreativePreviewState = "preview" | "catalog" | "unavailable";

export interface MetaCreativeRow {
  creative_id: string;
  name: string;
  /** Best available static preview URL (image_url → thumbnail_url → null). Null for catalog ads. */
  preview_url: string | null;
  image_url: string | null;
  thumbnail_url: string | null;
  /**
   * true when creative.object_type === "DYNAMIC" (DPA / catalog ad).
   * These ads dynamically render products from a catalog and have no
   * meaningful static preview.
   */
  is_catalog: boolean;
  /**
   * Normalized preview state:
   *   "catalog"     — is_catalog=true (DPA/dynamic product ad)
   *   "preview"     — static image/thumbnail available
   *   "unavailable" — no preview URL and not a catalog ad
   */
  preview_state: CreativePreviewState;
  spend: number;
  revenue: number;
  roas: number;
  ctr: number;
  purchases: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseAction(arr: MetaActionValue[] | undefined, type: string): number {
  if (!Array.isArray(arr)) return 0;
  const found = arr.find((a) => a.action_type === type);
  return found ? parseFloat(found.value) || 0 : 0;
}

function r2(n: number) {
  return Math.round(n * 100) / 100;
}

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function nDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function fetchAssignedAccountIds(businessId: string): Promise<string[]> {
  try {
    const row = await getProviderAccountAssignments(businessId, "meta");
    return row?.account_ids ?? [];
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("does not exist") || msg.includes("relation")) {
      try {
        await runMigrations();
        const row = await getProviderAccountAssignments(businessId, "meta");
        return row?.account_ids ?? [];
      } catch {
        return [];
      }
    }
    return [];
  }
}

/**
 * Fetch ad-level insights for an account.
 * Returns ad_id, spend, ctr, actions, action_values, purchase_roas.
 */
async function fetchAdInsights(
  accountId: string,
  since: string,
  until: string,
  accessToken: string
): Promise<MetaAdInsightRecord[]> {
  const url = new URL(`https://graph.facebook.com/v25.0/${accountId}/insights`);
  url.searchParams.set("level", "ad");
  url.searchParams.set(
    "fields",
    "ad_id,ad_name,spend,ctr,actions,action_values,purchase_roas"
  );
  url.searchParams.set("time_range", JSON.stringify({ since, until }));
  url.searchParams.set("sort", "spend_descending");
  url.searchParams.set("limit", "100");
  url.searchParams.set("access_token", accessToken);

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      const raw = await res.text().catch(() => "");
      console.warn("[meta-top-creatives] insights non-ok", {
        accountId,
        status: res.status,
        raw: raw.slice(0, 300),
      });
      return [];
    }
    const json = (await res.json()) as { data?: MetaAdInsightRecord[] };
    return json.data ?? [];
  } catch (e: unknown) {
    console.warn("[meta-top-creatives] insights threw", {
      accountId,
      message: e instanceof Error ? e.message : String(e),
    });
    return [];
  }
}

/**
 * Fetch all ads for an account with creative thumbnail/image fields.
 * Returns a map of ad_id → creative info.
 *
 * We request thumbnail_url, image_url, and object_type so we can:
 *   1. Determine if the ad is a catalog/DPA ad (object_type === "DYNAMIC")
 *   2. Get the best available preview URL
 */
async function fetchAdCreativeMap(
  accountId: string,
  accessToken: string
): Promise<Map<string, MetaAdRecord["creative"]>> {
  const url = new URL(`https://graph.facebook.com/v25.0/${accountId}/ads`);
  url.searchParams.set(
    "fields",
    "id,creative{id,thumbnail_url,image_url,object_type,object_story_spec{link_data{picture},video_data{image_url,thumbnail_url}}}"
  );
  url.searchParams.set("limit", "200");
  url.searchParams.set("access_token", accessToken);

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      const raw = await res.text().catch(() => "");
      console.warn("[meta-top-creatives] ads non-ok", {
        accountId,
        status: res.status,
        raw: raw.slice(0, 300),
      });
      return new Map();
    }
    const json = (await res.json()) as { data?: MetaAdRecord[] };
    const map = new Map<string, MetaAdRecord["creative"]>();
    for (const ad of json.data ?? []) {
      map.set(ad.id, ad.creative ?? null);
    }
    return map;
  } catch (e: unknown) {
    console.warn("[meta-top-creatives] ads threw", {
      accountId,
      message: e instanceof Error ? e.message : String(e),
    });
    return new Map();
  }
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const businessId = searchParams.get("businessId");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "6", 10), 20);

  console.log("[meta-top-creatives] request", { businessId, startDate, endDate, limit });

  if (!businessId) {
    return NextResponse.json(
      { error: "missing_business_id", message: "businessId is required." },
      { status: 400 }
    );
  }

  const resolvedStart = startDate ?? toISODate(nDaysAgo(29));
  const resolvedEnd = endDate ?? toISODate(new Date());

  // Step 1: Assigned accounts
  const assignedAccountIds = await fetchAssignedAccountIds(businessId);
  console.log("[meta-top-creatives] assigned accounts", {
    businessId,
    count: assignedAccountIds.length,
  });

  if (assignedAccountIds.length === 0) {
    return NextResponse.json({ status: "no_accounts_assigned", rows: [] });
  }

  // Step 2: Access token
  const integration = await getIntegration(businessId, "meta").catch(() => null);
  const accessToken = integration?.access_token ?? null;

  if (!accessToken) {
    return NextResponse.json({ status: "no_access_token", rows: [] });
  }

  // Step 3: Per account — fetch insights + ad creative info in parallel, then merge
  const allRows: MetaCreativeRow[] = [];

  for (const accountId of assignedAccountIds) {
    try {
      const [insightData, creativeMap] = await Promise.all([
        fetchAdInsights(accountId, resolvedStart, resolvedEnd, accessToken),
        fetchAdCreativeMap(accountId, accessToken),
      ]);

      for (const insight of insightData) {
        const spend = parseFloat(insight.spend ?? "0") || 0;
        if (spend === 0) continue;

        const adId = insight.ad_id ?? "";
        const creative = creativeMap.get(adId) ?? null;

        // Catalog detection: Meta uses object_type "DYNAMIC" for DPA/catalog ads
        const isCatalog = creative?.object_type === "DYNAMIC";

        // Preview fallback pipeline: thumbnail_url → image_url → link_data.picture → video_data urls
        const thumbnailUrl = creative?.thumbnail_url ?? null;
        const imageUrl = creative?.image_url ?? null;
        const previewUrl =
          thumbnailUrl ??
          imageUrl ??
          creative?.object_story_spec?.link_data?.picture ??
          creative?.object_story_spec?.video_data?.image_url ??
          creative?.object_story_spec?.video_data?.thumbnail_url ??
          null;

        const purchases = parseAction(insight.actions, "purchase");
        const revenueFromValues = parseAction(insight.action_values, "purchase");
        const purchaseRoasVal = parseAction(insight.purchase_roas, "omni_purchase");
        const revenue = revenueFromValues > 0 ? revenueFromValues : spend * purchaseRoasVal;
        const roas = spend > 0 ? revenue / spend : 0;
        const ctr = parseFloat(insight.ctr ?? "0") || 0;

        const previewState: CreativePreviewState = isCatalog
          ? "catalog"
          : previewUrl
          ? "preview"
          : "unavailable";

        allRows.push({
          creative_id: adId,
          name: insight.ad_name ?? "Unknown Ad",
          preview_url: isCatalog ? null : previewUrl,
          image_url: imageUrl,
          thumbnail_url: thumbnailUrl,
          is_catalog: isCatalog,
          preview_state: previewState,
          spend: r2(spend),
          revenue: r2(revenue),
          roas: r2(roas),
          ctr: r2(ctr),
          purchases: Math.round(purchases),
        });
      }
    } catch (e: unknown) {
      console.warn("[meta-top-creatives] account processing failed", {
        businessId,
        accountId,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Sort by ROAS desc, then spend desc; return top N
  allRows.sort((a, b) => b.roas - a.roas || b.spend - a.spend);
  const rows = allRows.slice(0, limit);

  console.log("[meta-top-creatives] response", {
    businessId,
    rowCount: rows.length,
    catalogCount: rows.filter((r) => r.is_catalog).length,
    withPreviewCount: rows.filter((r) => r.preview_url !== null).length,
  });

  return NextResponse.json({ rows });
}
