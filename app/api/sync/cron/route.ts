import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";
import { syncGoogleAdsReports } from "@/lib/sync/google-ads-sync";
import { syncGA4Reports } from "@/lib/sync/ga4-sync";
import { syncSearchConsoleReports } from "@/lib/sync/search-console-sync";

/**
 * POST /api/sync/cron
 *
 * Proactively syncs Google Ads, GA4, and Search Console data for all
 * active (non-demo) businesses. Should be called every 10 minutes via
 * Vercel Cron or an external scheduler.
 *
 * Protected by CRON_SECRET bearer token.
 */

interface BusinessRow {
  id: string;
  name: string;
  is_demo_business: boolean;
}

async function fetchActiveBusinesses(): Promise<BusinessRow[]> {
  await runMigrations();
  const sql = getDb();
  return sql`
    SELECT id, name, is_demo_business
    FROM businesses
    WHERE is_demo_business = FALSE
    ORDER BY created_at
  ` as unknown as BusinessRow[];
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

  const businesses = await fetchActiveBusinesses().catch((err) => {
    console.error("[sync-cron] fetch_businesses_failed", err);
    return [] as BusinessRow[];
  });

  if (businesses.length === 0) {
    return NextResponse.json({ ok: true, synced: 0, message: "No active businesses." });
  }

  const results = await Promise.allSettled(
    businesses.map(async (business) => {
      const [gads, ga4, sc] = await Promise.allSettled([
        syncGoogleAdsReports(business.id),
        syncGA4Reports(business.id),
        syncSearchConsoleReports(business.id),
      ]);

      return {
        businessId: business.id,
        businessName: business.name,
        googleAds: gads.status === "fulfilled" ? gads.value : { error: String((gads as PromiseRejectedResult).reason) },
        ga4: ga4.status === "fulfilled" ? ga4.value : { error: String((ga4 as PromiseRejectedResult).reason) },
        searchConsole: sc.status === "fulfilled" ? sc.value : { error: String((sc as PromiseRejectedResult).reason) },
      };
    }),
  );

  const summary = results.map((r) =>
    r.status === "fulfilled" ? r.value : { error: String(r.reason) }
  );

  console.log("[sync-cron] completed", {
    businessCount: businesses.length,
    succeeded: results.filter((r) => r.status === "fulfilled").length,
    failed: results.filter((r) => r.status === "rejected").length,
  });

  return NextResponse.json({ ok: true, synced: businesses.length, results: summary });
}
