import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import {
  getGA4TokenAndProperty,
  runGA4Report,
  GA4AuthError,
} from "@/lib/google-analytics-reporting";
import {
  resolveSearchConsoleContext,
  SearchConsoleAuthError,
} from "@/lib/search-console";
import {
  GA4_AI_SOURCE_FILTER,
  classifyAiSource,
  scoreQueryIntent,
  generateGeoInsights,
  clusterQueryTopics,
} from "@/lib/geo-intelligence";
import { scorePageGeo, scoreQueryGeo, scoreTopicGeo } from "@/lib/geo-scoring";

export async function GET(request: NextRequest) {
  const businessId = request.nextUrl.searchParams.get("businessId");
  const startDate =
    request.nextUrl.searchParams.get("startDate") ?? "30daysAgo";
  const endDate = request.nextUrl.searchParams.get("endDate") ?? "yesterday";

  if (!businessId) {
    return NextResponse.json({ error: "missing_business_id" }, { status: 400 });
  }

  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "collaborator",
  });
  if ("error" in access) return access.error;

  // Resolve both sources — neither is required to block the response
  let ga4Token: string | null = null;
  let ga4PropertyId: string | null = null;
  let ga4Error: string | null = null;
  let scContext: Awaited<ReturnType<typeof resolveSearchConsoleContext>> | null = null;
  let scError: string | null = null;

  try {
    const result = await getGA4TokenAndProperty(businessId);
    ga4Token = result.accessToken;
    ga4PropertyId = result.propertyId;
  } catch (err) {
    ga4Error =
      err instanceof GA4AuthError ? err.code : "ga4_unavailable";
  }

  try {
    scContext = await resolveSearchConsoleContext({
      businessId,
      requireSite: true,
    });
  } catch (err) {
    scError =
      err instanceof SearchConsoleAuthError ? err.code : "sc_unavailable";
  }

  // Fetch GA4 AI traffic overview
  let aiSessions = 0;
  let aiEngagementRate = 0;
  let aiPurchaseCvr = 0;
  let totalSessions = 0;
  let totalEngagementRate = 0;
  let totalPurchaseCvr = 0;
  let aiPageCount = 0;
  let topAiSource: string | null = null;
  const aiSourceBreakdown: Array<{ engine: string; sessions: number; purchaseCvr: number; engagementRate: number }> = [];

  if (ga4Token && ga4PropertyId) {
    const [aiReport, totalReport, aiBySourceReport] = await Promise.all([
      // AI sessions only
      runGA4Report({
        propertyId: ga4PropertyId,
        accessToken: ga4Token,
        dateRanges: [{ startDate, endDate }],
        metrics: [
          { name: "sessions" },
          { name: "engagedSessions" },
          { name: "engagementRate" },
          { name: "ecommercePurchases" },
        ],
        dimensionFilter: GA4_AI_SOURCE_FILTER,
      }),
      // Site-wide totals
      runGA4Report({
        propertyId: ga4PropertyId,
        accessToken: ga4Token,
        dateRanges: [{ startDate, endDate }],
        metrics: [
          { name: "sessions" },
          { name: "engagementRate" },
          { name: "ecommercePurchases" },
        ],
      }),
      // AI sessions by source
      runGA4Report({
        propertyId: ga4PropertyId,
        accessToken: ga4Token,
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "sessionSource" }],
        metrics: [
          { name: "sessions" },
          { name: "engagementRate" },
          { name: "ecommercePurchases" },
        ],
        dimensionFilter: GA4_AI_SOURCE_FILTER,
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 20,
      }),
    ]);

    const aiTotals = aiReport.totals?.[0] ?? aiReport.rows[0];
    aiSessions = parseFloat(aiTotals?.metrics[0] ?? "0");
    const aiEngaged = parseFloat(aiTotals?.metrics[1] ?? "0");
    aiEngagementRate = parseFloat(aiTotals?.metrics[2] ?? "0");
    const aiPurchases = parseFloat(aiTotals?.metrics[3] ?? "0");
    aiPurchaseCvr = aiSessions > 0 ? aiPurchases / aiSessions : 0;

    const siteRow = totalReport.totals?.[0] ?? totalReport.rows[0];
    totalSessions = parseFloat(siteRow?.metrics[0] ?? "0");
    totalEngagementRate = parseFloat(siteRow?.metrics[1] ?? "0");
    const totalPurchases = parseFloat(siteRow?.metrics[2] ?? "0");
    totalPurchaseCvr = totalSessions > 0 ? totalPurchases / totalSessions : 0;

    // Count distinct AI-visited pages (proxy)
    aiPageCount = Math.min(aiReport.rowCount, 50);

    // Source breakdown
    for (const row of aiBySourceReport.rows) {
      const source = row.dimensions[0];
      const sessions = parseFloat(row.metrics[0] ?? "0");
      const engRate = parseFloat(row.metrics[1] ?? "0");
      const purchases = parseFloat(row.metrics[2] ?? "0");
      const engine = classifyAiSource(source) ?? "Other AI";
      aiSourceBreakdown.push({
        engine,
        sessions,
        purchaseCvr: sessions > 0 ? purchases / sessions : 0,
        engagementRate: engRate,
      });
    }

    if (aiSourceBreakdown.length > 0) {
      topAiSource = aiSourceBreakdown.sort((a, b) => b.sessions - a.sessions)[0].engine;
    }
  }

  // Fetch SC query overview
  let aiStyleQueryCount = 0;
  let totalQueryCount = 0;
  let strongestGeoQuery: { query: string; geoScore: number; impressions: number } | null = null;
  let strongestGeoTopic: { topic: string; geoScore: number; impressions: number; coverageStrength: string } | null = null;

  type ScRow = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };

  if (scContext?.siteUrl) {
    try {
      const endpointSite = encodeURIComponent(scContext.siteUrl);
      const scRes = await fetch(
        `https://www.googleapis.com/webmasters/v3/sites/${endpointSite}/searchAnalytics/query`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${scContext.accessToken}`,
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
      if (scRes.ok) {
        const scData = await scRes.json() as { rows?: ScRow[] };
        const rows = scData.rows ?? [];
        totalQueryCount = rows.length;

        const scoredRows = rows.map((r) => {
          const query = r.keys?.[0] ?? "";
          const intent = scoreQueryIntent(query);
          const wordCount = query.trim().split(/\s+/).length;
          const scored = scoreQueryGeo({
            impressions: Math.round(r.impressions ?? 0),
            position: r.position ?? 99,
            ctr: r.ctr ?? 0,
            isAiStyle: intent.isAiStyle,
            wordCount,
          });
          return { query, isAiStyle: intent.isAiStyle, impressions: Math.round(r.impressions ?? 0), geoScore: scored.total };
        });

        aiStyleQueryCount = scoredRows.filter((r) => r.isAiStyle).length;

        // Strongest GEO query
        const topQuery = [...scoredRows].sort((a, b) => b.geoScore - a.geoScore)[0];
        if (topQuery) strongestGeoQuery = { query: topQuery.query, geoScore: topQuery.geoScore, impressions: topQuery.impressions };

        // Topic clusters
        const queryList = rows.map((r) => ({
          query: r.keys?.[0] ?? "",
          impressions: Math.round(r.impressions ?? 0),
          clicks: Math.round(r.clicks ?? 0),
          position: r.position ?? 0,
        }));
        const topics = clusterQueryTopics(queryList);
        const topTopic = topics
          .map((t) => ({
            ...t,
            tGeoScore: scoreTopicGeo({
              impressions: t.impressions,
              avgPosition: t.avgPosition,
              queryCount: t.queryCount,
              informationalDensity: 0.5,
              avgCtr: t.impressions > 0 ? t.clicks / t.impressions : 0,
            }).total,
          }))
          .sort((a, b) => b.tGeoScore - a.tGeoScore)[0];
        if (topTopic) {
          strongestGeoTopic = {
            topic: topTopic.topic,
            geoScore: topTopic.tGeoScore,
            impressions: topTopic.impressions,
            coverageStrength: topTopic.coverageStrength,
          };
        }
      }
    } catch {
      // SC query fetch failed — non-fatal
    }
  }

  const insights = generateGeoInsights({
    aiSources: aiSourceBreakdown as Parameters<typeof generateGeoInsights>[0]["aiSources"],
    siteAvgPurchaseCvr: totalPurchaseCvr,
    siteAvgEngagementRate: totalEngagementRate,
    aiStyleQueryCount,
    totalQueryCount,
    totalAiSessions: aiSessions,
    totalSessions,
  });

  // GEO opportunity score: 0–100 composite
  let geoScore = 0;
  if (totalSessions > 0) {
    const aiShare = aiSessions / totalSessions;
    geoScore += Math.min(40, aiShare * 2000);
  }
  if (totalQueryCount > 0) {
    const infoShare = aiStyleQueryCount / totalQueryCount;
    geoScore += Math.min(30, infoShare * 50);
  }
  if (aiEngagementRate > 0) geoScore += Math.min(30, aiEngagementRate * 30);
  geoScore = Math.min(100, Math.round(geoScore));

  // Top 3 priorities for the overview action board
  const top3Priorities: Array<{
    title: string;
    description: string;
    priority: "high" | "medium" | "low";
    effort: string;
    impact: string;
  }> = [];

  if (aiSessions > 0 && aiPurchaseCvr < totalPurchaseCvr * 0.5 && totalPurchaseCvr > 0) {
    top3Priorities.push({
      title: "Convert AI traffic to revenue",
      description: "AI-referred visitors are engaging but not converting. Add CTAs, comparison tables, and buying guides to your top AI pages.",
      priority: "high",
      effort: "Medium",
      impact: "+20–40% revenue from AI traffic",
    });
  }
  if (aiStyleQueryCount > 0 && totalQueryCount > 0 && aiStyleQueryCount / totalQueryCount < 0.3) {
    top3Priorities.push({
      title: "Expand informational content coverage",
      description: `Only ${Math.round((aiStyleQueryCount / totalQueryCount) * 100)}% of ranking queries are AI-style. Create FAQ sections and how-to guides to improve AI citation rates.`,
      priority: "high",
      effort: "High",
      impact: "+30–60% AI query visibility",
    });
  }
  if (strongestGeoTopic && strongestGeoTopic.coverageStrength === "Weak") {
    top3Priorities.push({
      title: `Build authority for "${strongestGeoTopic.topic}"`,
      description: `Your strongest GEO topic has only weak coverage. A content cluster or hub page could unlock ${strongestGeoTopic.impressions.toLocaleString()} impressions.`,
      priority: "medium",
      effort: "High",
      impact: "+40–80% topic authority",
    });
  }
  if (top3Priorities.length < 3 && aiSessions === 0) {
    top3Priorities.push({
      title: "Attract your first AI-engine visitors",
      description: "No AI-source traffic detected yet. Start with structured FAQ content, schema markup, and direct-answer formatting on your top pages.",
      priority: "high",
      effort: "Medium",
      impact: "Unlock AI discovery channel",
    });
  }
  if (top3Priorities.length < 3 && totalQueryCount > 0) {
    top3Priorities.push({
      title: "Add FAQ schema to top-ranking pages",
      description: "AI engines extract Q&A pairs to generate answers. Adding FAQ schema to your top informational pages increases citation frequency.",
      priority: "medium",
      effort: "Low",
      impact: "+15–25% long-tail visibility",
    });
  }

  return NextResponse.json({
    sources: {
      ga4: ga4Error
        ? { connected: false, error: ga4Error }
        : { connected: true },
      searchConsole: scError
        ? { connected: false, error: scError }
        : { connected: true },
    },
    kpis: {
      aiSessions,
      aiEngagementRate,
      aiPurchaseCvr,
      geoScore,
      aiPageCount,
      topAiSource,
      siteAvgEngagementRate: totalEngagementRate,
      siteAvgPurchaseCvr: totalPurchaseCvr,
      aiStyleQueryCount,
      totalQueryCount,
    },
    insights,
    top3Priorities: top3Priorities.slice(0, 3),
    highlights: {
      strongestGeoQuery,
      strongestGeoTopic,
    },
  });
}
