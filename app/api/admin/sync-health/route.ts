import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import {
  cleanupGoogleAdsPartitionOrchestration,
  replayGoogleAdsDeadLetterPartitions,
} from "@/lib/google-ads/warehouse";
import { getAdminOperationsHealth } from "@/lib/admin-operations-health";
import { refreshGoogleAdsSyncStateForBusiness, scheduleGoogleAdsBackgroundSync, syncGoogleAdsReports } from "@/lib/sync/google-ads-sync";
import type { GoogleAdsWarehouseScope } from "@/lib/google-ads/warehouse-types";
import { cleanupMetaPartitionOrchestration, replayMetaDeadLetterPartitions } from "@/lib/meta/warehouse";
import { refreshMetaSyncStateForBusiness, syncMetaReports } from "@/lib/sync/meta-sync";
import type { MetaWarehouseScope } from "@/lib/meta/warehouse-types";

const GOOGLE_ADS_RECOVERY_SCOPES: GoogleAdsWarehouseScope[] = [
  "account_daily",
  "campaign_daily",
  "ad_group_daily",
  "ad_daily",
  "keyword_daily",
  "search_term_daily",
  "asset_group_daily",
  "asset_daily",
  "audience_daily",
  "geo_daily",
  "device_daily",
  "product_daily",
];

const META_RECOVERY_SCOPES: MetaWarehouseScope[] = [
  "account_daily",
  "adset_daily",
  "creative_daily",
  "ad_daily",
];

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const data = await getAdminOperationsHealth();
    return NextResponse.json(data.syncHealth);
  } catch (err) {
    console.error("[admin/sync-health GET]", err);
    return NextResponse.json(
      { error: "internal_error", message: String(err) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const body = (await request.json().catch(() => null)) as
      | {
          provider?: string;
          action?: "cleanup" | "replay_dead_letter" | "reschedule" | "refresh_state";
          businessId?: string;
          scope?: string | null;
        }
      | null;

    if (!body?.provider || !body?.action || !body?.businessId) {
      return NextResponse.json(
        { error: "provider, action and businessId are required." },
        { status: 400 }
      );
    }

    if (body.provider !== "google_ads" && body.provider !== "meta") {
      return NextResponse.json(
        { error: "Only google_ads and meta recovery actions are supported in this endpoint." },
        { status: 400 }
      );
    }

    if (body.provider === "meta") {
      if (body.action === "cleanup") {
        const result = await cleanupMetaPartitionOrchestration({
          businessId: body.businessId,
        });
        return NextResponse.json({ ok: true, action: body.action, provider: body.provider, result });
      }

      if (body.action === "replay_dead_letter") {
        const scope =
          body.scope && META_RECOVERY_SCOPES.includes(body.scope as MetaWarehouseScope)
            ? (body.scope as MetaWarehouseScope)
            : null;
        const result = await replayMetaDeadLetterPartitions({
          businessId: body.businessId,
          scope,
        });
        const syncResult = await syncMetaReports(body.businessId);
        return NextResponse.json({
          ok: true,
          action: body.action,
          provider: body.provider,
          replayedCount: result.length,
          result,
          syncResult,
        });
      }

      if (body.action === "refresh_state") {
        await refreshMetaSyncStateForBusiness({ businessId: body.businessId });
        return NextResponse.json({ ok: true, action: body.action, provider: body.provider });
      }

      if (body.action === "reschedule") {
        const result = await syncMetaReports(body.businessId);
        return NextResponse.json({ ok: true, action: body.action, provider: body.provider, result });
      }
    }

    if (body.action === "cleanup") {
      const result = await cleanupGoogleAdsPartitionOrchestration({
        businessId: body.businessId,
      });
      return NextResponse.json({ ok: true, action: body.action, provider: body.provider, result });
    }

    if (body.action === "replay_dead_letter") {
      const scope =
        body.scope && GOOGLE_ADS_RECOVERY_SCOPES.includes(body.scope as GoogleAdsWarehouseScope)
          ? (body.scope as GoogleAdsWarehouseScope)
          : null;
      const result = await replayGoogleAdsDeadLetterPartitions({
        businessId: body.businessId,
        scope,
      });
      return NextResponse.json({
        ok: true,
        action: body.action,
        provider: body.provider,
        replayedCount: result.length,
        result,
      });
    }

    if (body.action === "refresh_state") {
      await refreshGoogleAdsSyncStateForBusiness({ businessId: body.businessId });
      return NextResponse.json({ ok: true, action: body.action, provider: body.provider });
    }

    if (body.action === "reschedule") {
      scheduleGoogleAdsBackgroundSync({ businessId: body.businessId, delayMs: 0 });
      const result = await syncGoogleAdsReports(body.businessId);
      return NextResponse.json({ ok: true, action: body.action, provider: body.provider, result });
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (err) {
    console.error("[admin/sync-health POST]", err);
    return NextResponse.json(
      { error: "internal_error", message: String(err) },
      { status: 500 }
    );
  }
}
