import { NextRequest, NextResponse } from "next/server";
import { isDemoBusiness } from "@/lib/business-mode.server";
import { requireBusinessAccess } from "@/lib/access";
import { getMetaCreativeHydrationPayload } from "@/lib/meta/creatives-api";

export interface MetaCreativeHydrationApiRow {
  rowId: string;
  creative_id: string | null;
  thumbnail_url: string | null;
  table_thumbnail_url: string | null;
  card_preview_url: string | null;
  preview_url: string | null;
  image_url: string | null;
  cached_thumbnail_url: string | null;
  preview: {
    render_mode: "video" | "image" | "unavailable";
    image_url: string | null;
    video_url: string | null;
    poster_url: string | null;
    source: "preview_url" | "thumbnail_url" | "image_url" | "image_hash" | null;
    is_catalog: boolean;
  };
}

function isHydrationItem(
  value: unknown
): value is { rowId: string; creativeId?: string | null } {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { rowId?: unknown; creativeId?: unknown };
  return (
    typeof candidate.rowId === "string" &&
    (candidate.creativeId === undefined ||
      candidate.creativeId === null ||
      typeof candidate.creativeId === "string")
  );
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as
    | { businessId?: unknown; items?: unknown }
    | null;
  const businessId =
    typeof payload?.businessId === "string" ? payload.businessId.trim() : "";
  const items = Array.isArray(payload?.items)
    ? payload.items.filter(isHydrationItem)
    : [];

  if (!businessId) {
    return NextResponse.json(
      { error: "missing_business_id", message: "businessId is required." },
      { status: 400 }
    );
  }

  if (items.length === 0) {
    return NextResponse.json(
      { error: "missing_items", message: "At least one hydration item is required." },
      { status: 400 }
    );
  }

  if (items.length > 10) {
    return NextResponse.json(
      { error: "too_many_items", message: "Hydration is limited to 10 rows per request." },
      { status: 400 }
    );
  }

  const access = await requireBusinessAccess({ request, businessId, minRole: "guest" });
  if ("error" in access) return access.error;

  if (await isDemoBusiness(businessId)) {
    return NextResponse.json({ status: "ok", rows: [] as MetaCreativeHydrationApiRow[] });
  }

  const result = await getMetaCreativeHydrationPayload({
    businessId,
    items,
  });

  return NextResponse.json(result);
}
