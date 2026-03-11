import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import {
  resolveSearchConsoleContext,
  SearchConsoleAuthError,
} from "@/lib/search-console";
import { clusterQueryTopics, scoreQueryIntent } from "@/lib/geo-intelligence";
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

  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "collaborator",
  });
  if ("error" in access) return access.error;

  let context: Awaited<ReturnType<typeof resolveSearchConsoleContext>>;
  try {
    context = await resolveSearchConsoleContext({
      businessId,
      requireSite: true,
    });
  } catch (err) {
    if (err instanceof SearchConsoleAuthError) {
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status: err.status }
      );
    }
    throw err;
  }

  const endpointSite = encodeURIComponent(context.siteUrl ?? "");
  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${endpointSite}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${context.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions: ["query"],
        rowLimit: 500,
      }),
      cache: "no-store",
    }
  );

  if (!res.ok) {
    return NextResponse.json(
      { error: "sc_fetch_failed", message: "Could not fetch Search Console data." },
      { status: 502 }
    );
  }

  const data = (await res.json()) as {
    rows?: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }>;
  };

  const rawRows = data.rows ?? [];

  // Build a map of query → ctr for informational density calculation per cluster
  const queryCtrMap = new Map<string, { ctr: number; isAiStyle: boolean }>();
  for (const row of rawRows) {
    const q = row.keys?.[0] ?? "";
    queryCtrMap.set(q, {
      ctr: row.ctr ?? 0,
      isAiStyle: scoreQueryIntent(q).isAiStyle,
    });
  }

  const queryList = rawRows.map((row) => ({
    query: row.keys?.[0] ?? "",
    impressions: Math.round(row.impressions ?? 0),
    clicks: Math.round(row.clicks ?? 0),
    position: row.position ?? 0,
  }));

  const clusters = clusterQueryTopics(queryList);

  // Enrich each cluster with v2 fields
  const topics = clusters.map((cluster) => {
    // Informational density: fraction of queries in this cluster that are AI-style
    const aiStyleCount = cluster.queries.filter((q) => queryCtrMap.get(q)?.isAiStyle).length;
    const informationalDensity = cluster.queryCount > 0 ? aiStyleCount / Math.min(cluster.queryCount, cluster.queries.length) : 0;
    const avgCtr = cluster.impressions > 0 ? cluster.clicks / cluster.impressions : 0;

    // v2 scoring
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

    // Pick a recommendation based on coverage strength
    let recommendation: GeoRecommendation | null = null;
    const evidence = `${cluster.impressions.toLocaleString()} impressions, ${cluster.queryCount} queries, avg position ${cluster.avgPosition.toFixed(1)}`;

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
      priority,
      confidence,
      informationalDensity,
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

  return NextResponse.json({ topics, total: topics.length });
}
