import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import { getDemoGeoTopics, isDemoBusinessId } from "@/lib/demo-business";
import {
  resolveSearchConsoleContext,
  SearchConsoleAuthError,
} from "@/lib/search-console";
import { clusterQueryTopics } from "@/lib/geo-intelligence";
import { classifyQuery } from "@/lib/geo-query-classification";
import {
  scoreTopicGeo,
  assignPriority,
  assignConfidence,
} from "@/lib/geo-scoring";
import {
  buildExpandGuideRec,
  buildBuildClusterRec,
  buildAddFaqRec,
  type GeoRecommendation,
} from "@/lib/geo-recommendations";
import { computeMomentum, computePreviousPeriod } from "@/lib/geo-momentum";

type ScRow = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };

async function fetchSCQueries(
  accessToken: string,
  siteUrl: string,
  startDate: string,
  endDate: string
): Promise<ScRow[]> {
  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ startDate, endDate, dimensions: ["query"], rowLimit: 500 }),
      cache: "no-store",
    }
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { rows?: ScRow[] };
  return data.rows ?? [];
}

export async function GET(request: NextRequest) {
  const businessId = request.nextUrl.searchParams.get("businessId");
  const startDate =
    request.nextUrl.searchParams.get("startDate") ??
    new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10);
  const endDate =
    request.nextUrl.searchParams.get("endDate") ??
    new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  if (!businessId) {
    return NextResponse.json({ error: "missing_business_id" }, { status: 400 });
  }

  const access = await requireBusinessAccess({ request, businessId, minRole: "collaborator" });
  if ("error" in access) return access.error;
  if (isDemoBusinessId(businessId)) {
    return NextResponse.json(getDemoGeoTopics());
  }

  let context: Awaited<ReturnType<typeof resolveSearchConsoleContext>>;
  try {
    context = await resolveSearchConsoleContext({ businessId, requireSite: true });
  } catch (err) {
    if (err instanceof SearchConsoleAuthError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
    }
    throw err;
  }

  const { prevStart, prevEnd } = computePreviousPeriod(startDate, endDate);
  const siteUrl = context.siteUrl ?? "";
  const token = context.accessToken;

  const [rawRows, previousRows] = await Promise.all([
    fetchSCQueries(token, siteUrl, startDate, endDate),
    fetchSCQueries(token, siteUrl, prevStart, prevEnd),
  ]);

  if (rawRows.length === 0) {
    return NextResponse.json(
      { error: "sc_fetch_failed", message: "Could not fetch Search Console data." },
      { status: 502 }
    );
  }

  // Build classification map for all queries
  const queryClassMap = new Map<string, { isAiStyle: boolean }>();
  for (const row of rawRows) {
    const q = row.keys?.[0] ?? "";
    const cls = classifyQuery(q);
    queryClassMap.set(q, { isAiStyle: cls.isAiStyle });
  }

  const queryList = rawRows.map((row) => ({
    query: row.keys?.[0] ?? "",
    impressions: Math.round(row.impressions ?? 0),
    clicks: Math.round(row.clicks ?? 0),
    position: row.position ?? 0,
  }));

  // Cluster the previous period as well (for momentum)
  const prevQueryList = previousRows.map((row) => ({
    query: row.keys?.[0] ?? "",
    impressions: Math.round(row.impressions ?? 0),
    clicks: Math.round(row.clicks ?? 0),
    position: row.position ?? 0,
  }));
  const prevClusters = clusterQueryTopics(prevQueryList);
  const prevClusterMap = new Map<string, { impressions: number; queryCount: number }>();
  for (const c of prevClusters) {
    prevClusterMap.set(c.topic, { impressions: c.impressions, queryCount: c.queryCount });
  }

  const clusters = clusterQueryTopics(queryList);

  const topics = clusters.map((cluster) => {
    // Informational density: fraction of queries in this cluster that are AI-style
    const aiStyleCount = cluster.queries.filter((q) => queryClassMap.get(q)?.isAiStyle).length;
    const informationalDensity = cluster.queryCount > 0
      ? aiStyleCount / Math.min(cluster.queryCount, cluster.queries.length)
      : 0;
    const avgCtr = cluster.impressions > 0 ? cluster.clicks / cluster.impressions : 0;

    // GEO scoring with breakdown
    const scored = scoreTopicGeo({
      impressions: cluster.impressions,
      avgPosition: cluster.avgPosition,
      queryCount: cluster.queryCount,
      informationalDensity,
      avgCtr,
    });
    const geoScore = scored.total;
    const priority = assignPriority(geoScore, cluster.impressions);
    const confidence = assignConfidence(false, true, cluster.queryCount);

    // Coverage gap: how much of demand is we're missing?
    const coverageGap = cluster.coverageStrength === "Weak"
      ? "high"
      : cluster.coverageStrength === "Moderate"
      ? "medium"
      : "low";

    // Momentum: compare current vs previous cluster impressions
    const prev = prevClusterMap.get(cluster.topic);
    const momentum = computeMomentum(cluster.impressions, prev?.impressions ?? 0, 20);

    // Recommendation — upgraded with momentum context
    let recommendation: GeoRecommendation | null = null;
    const evidence = `${cluster.impressions.toLocaleString()} impressions, ${cluster.queryCount} queries, avg pos ${cluster.avgPosition.toFixed(1)}${momentum.status === "rising" || momentum.status === "breakout" ? ` — ${momentum.label}` : ""}`;

    if (cluster.coverageStrength === "Weak" && cluster.queryCount >= 2) {
      recommendation = buildExpandGuideRec({
        target: cluster.topic,
        evidence,
        priority,
        confidence,
        impressions: cluster.impressions,
      });
    } else if (cluster.coverageStrength === "Moderate" && cluster.queryCount >= 4) {
      recommendation = buildBuildClusterRec({
        target: cluster.topic,
        evidence,
        priority,
        confidence,
        queryCount: cluster.queryCount,
      });
    } else if (cluster.coverageStrength === "Strong") {
      recommendation = buildAddFaqRec({
        target: cluster.topic,
        evidence,
        priority,
        confidence,
        queryCount: cluster.queryCount,
      });
    }

    return {
      ...cluster,
      geoScore,
      geoScoreBreakdown: scored.components,
      priority,
      confidence,
      informationalDensity,
      coverageGap,
      authorityStrength: cluster.coverageStrength,
      momentum: {
        status: momentum.status,
        label: momentum.label,
        score: momentum.score,
        growthRate: momentum.growthRate,
      },
      recommendation: recommendation
        ? {
            title: recommendation.title,
            effort: recommendation.effort,
            impact: recommendation.impact,
            expectedOutcome: recommendation.expectedOutcome,
          }
        : null,
    };
  });

  // Sort: breakout/rising topics first, then by geoScore
  topics.sort((a, b) => {
    const aMomentumBoost = a.momentum.status === "breakout" ? 20 : a.momentum.status === "rising" ? 10 : 0;
    const bMomentumBoost = b.momentum.status === "breakout" ? 20 : b.momentum.status === "rising" ? 10 : 0;
    return (b.geoScore + bMomentumBoost) - (a.geoScore + aMomentumBoost);
  });

  return NextResponse.json({ topics, total: topics.length });
}
