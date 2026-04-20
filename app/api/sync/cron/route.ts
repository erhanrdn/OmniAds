import { NextRequest, NextResponse } from "next/server";
import { getActiveBusinesses } from "@/lib/sync/active-businesses";
import { evaluateAndPersistGoogleAdsControlPlane } from "@/lib/google-ads/control-plane-runtime";
import { enqueueMetaScheduledWork } from "@/lib/sync/meta-sync";
import { enqueueGoogleAdsScheduledWork } from "@/lib/sync/google-ads-sync";
import { syncGA4Reports } from "@/lib/sync/ga4-sync";
import { syncSearchConsoleReports } from "@/lib/sync/search-console-sync";
import { syncShopifyCommerceReports } from "@/lib/sync/shopify-sync";
import { runSyncSoakGate } from "@/lib/sync/soak-gate";
import {
  evaluateAndPersistSyncGates,
  shouldEnforceSyncGateFailure,
} from "@/lib/sync/release-gates";
import { evaluateAndPersistSyncRepairPlan } from "@/lib/sync/repair-planner";
import { logRuntimeInfo } from "@/lib/runtime-logging";

/**
 * POST /api/sync/cron
 *
 * Proactively syncs Google Ads, GA4, Search Console, and Meta data for all
 * active (non-demo) businesses. Should be called every 10 minutes via
 * Any external scheduler or system cron.
 *
 * Protected by CRON_SECRET bearer token.
 */

function shopifySyncEnabled() {
  const raw = process.env.SHOPIFY_SYNC_ENABLED?.trim().toLowerCase();
  return raw === "1" || raw === "true";
}

function isTruthyQueryParam(value: string | null) {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

function normalizeProviderScope(value: string | null) {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : "meta";
}

function isSupportedControlPlaneProviderScope(
  value: string,
): value is "meta" | "google_ads" {
  return value === "meta" || value === "google_ads";
}

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (token !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const controlPlaneOnly = isTruthyQueryParam(url.searchParams.get("controlPlaneOnly"));
  const requestedBuildId = url.searchParams.get("buildId")?.trim() || undefined;
  const providerScope = normalizeProviderScope(url.searchParams.get("providerScope"));
  const breakGlass = isTruthyQueryParam(url.searchParams.get("breakGlass"));
  const enforceDeployGate = isTruthyQueryParam(url.searchParams.get("enforceDeployGate"));
  const overrideReason = url.searchParams.get("overrideReason")?.trim() || null;

  if (controlPlaneOnly) {
    if (!isSupportedControlPlaneProviderScope(providerScope)) {
      return NextResponse.json(
        {
          ok: false,
          controlPlaneOnly: true,
          providerScope,
          error: "unsupported_provider_scope",
        },
        { status: 400 },
      );
    }

    const gateVerdicts = await (
      providerScope === "google_ads"
        ? evaluateAndPersistGoogleAdsControlPlane({
            buildId: requestedBuildId,
            breakGlass,
            overrideReason,
          })
        : evaluateAndPersistSyncGates({
            buildId: requestedBuildId,
            breakGlass,
            overrideReason,
          })
    ).catch((error) => {
      console.error("[sync-cron] control_plane_gate_evaluation_failed", error);
      return null;
    });

    if (!gateVerdicts) {
      return NextResponse.json(
        {
          ok: false,
          controlPlaneOnly: true,
          providerScope,
          error: "gate_evaluation_failed",
        },
        { status: 500 },
      );
    }

    const repairPlan = await evaluateAndPersistSyncRepairPlan({
      buildId: requestedBuildId,
      providerScope,
      releaseGate: gateVerdicts.releaseGate,
    }).catch((error) => {
      console.error("[sync-cron] control_plane_repair_plan_failed", error);
      return null;
    });

    if (!repairPlan) {
      return NextResponse.json(
        {
          ok: false,
          controlPlaneOnly: true,
          providerScope,
          gateVerdicts,
          error: "repair_plan_failed",
        },
        { status: 500 },
      );
    }

    const blocked = enforceDeployGate && shouldEnforceSyncGateFailure([gateVerdicts.deployGate]);
    return NextResponse.json(
      {
        ok: !blocked,
        controlPlaneOnly: true,
        providerScope,
        gateVerdicts,
        repairPlan,
      },
      { status: blocked ? 503 : 200 },
    );
  }

  const businesses = await getActiveBusinesses().catch((err) => {
    console.error("[sync-cron] fetch_businesses_failed", err);
    return [] as Awaited<ReturnType<typeof getActiveBusinesses>>;
  });

  if (businesses.length === 0) {
    return NextResponse.json({ ok: true, synced: 0, message: "No active businesses." });
  }

  const results = await Promise.allSettled(
    businesses.map(async (business) => {
      const [gads, ga4, sc, metaScheduled, shopify] = await Promise.allSettled([
        enqueueGoogleAdsScheduledWork(business.id),
        syncGA4Reports(business.id),
        syncSearchConsoleReports(business.id),
        enqueueMetaScheduledWork(business.id),
        shopifySyncEnabled()
          ? syncShopifyCommerceReports(business.id)
          : Promise.resolve({ skipped: true, reason: "disabled" }),
      ]);

      return {
        businessId: business.id,
        businessName: business.name,
        googleAds: gads.status === "fulfilled" ? gads.value : { error: String((gads as PromiseRejectedResult).reason) },
        ga4: ga4.status === "fulfilled" ? ga4.value : { error: String((ga4 as PromiseRejectedResult).reason) },
        searchConsole: sc.status === "fulfilled" ? sc.value : { error: String((sc as PromiseRejectedResult).reason) },
        meta: metaScheduled.status === "fulfilled"
          ? metaScheduled.value
          : { error: String((metaScheduled as PromiseRejectedResult).reason) },
        shopify: shopify.status === "fulfilled"
          ? shopify.value
          : { error: String((shopify as PromiseRejectedResult).reason) },
      };
    }),
  );

  const summary = results.map((r) =>
    r.status === "fulfilled" ? r.value : { error: String(r.reason) }
  );

  const shouldEnforceSoakGate =
    process.env.SYNC_CRON_ENFORCE_SOAK_GATE?.trim() === "true";
  let soakGate: Awaited<ReturnType<typeof runSyncSoakGate>>["result"] | null = null;

  if (shouldEnforceSoakGate) {
    try {
      const soakRun = await runSyncSoakGate();
      soakGate = soakRun.result;
      if (soakGate.outcome !== "pass") {
        console.error("[sync-cron] soak_gate_failed", {
          releaseReadiness: soakGate.releaseReadiness,
          blockingChecks: soakGate.blockingChecks.map((check) => check.key),
          topIssue: soakGate.topIssue,
        });
      }
    } catch (error) {
      console.error("[sync-cron] soak_gate_error", error);
      return NextResponse.json(
        {
          ok: false,
          synced: businesses.length,
          results: summary,
          soakGate: {
            outcome: "fail",
            releaseReadiness: "blocked",
            summary: "Sync soak gate execution failed.",
            error: String(error),
          },
        },
        { status: 500 }
      );
    }
  }

  const gateVerdicts = await evaluateAndPersistSyncGates().catch((error) => {
    console.error("[sync-cron] sync_gate_evaluation_failed", error);
    return null;
  });
  const repairPlan = await evaluateAndPersistSyncRepairPlan({
    providerScope: "meta",
  }).catch((error) => {
    console.error("[sync-cron] sync_repair_plan_failed", error);
    return null;
  });

  logRuntimeInfo("sync-cron", "completed", {
    businessCount: businesses.length,
    succeeded: results.filter((r) => r.status === "fulfilled").length,
    failed: results.filter((r) => r.status === "rejected").length,
    soakGateOutcome: soakGate?.outcome ?? null,
    deployGateVerdict: gateVerdicts?.deployGate?.verdict ?? null,
    releaseGateVerdict: gateVerdicts?.releaseGate?.verdict ?? null,
    repairPlanEligible: repairPlan?.eligible ?? null,
    repairRecommendationCount: repairPlan?.recommendations.length ?? null,
  });
  return NextResponse.json(
    {
      ok: true,
      synced: businesses.length,
      results: summary,
      ...(soakGate ? { soakGate } : {}),
      ...(gateVerdicts ? { gateVerdicts } : {}),
      ...(repairPlan ? { repairPlan } : {}),
    },
    { status: soakGate?.outcome === "fail" ? 503 : 200 }
  );
}
