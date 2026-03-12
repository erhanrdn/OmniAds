import { NextRequest, NextResponse } from "next/server";
import { isDemoBusiness } from "@/lib/business-mode.server";
import { requireBusinessAccess } from "@/lib/access";
import { getDemoGeoOpportunities } from "@/lib/demo-business";
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
  clusterQueryTopics,
} from "@/lib/geo-intelligence";
import {
  assignPriority,
  assignEffort,
  assignConfidence,
} from "@/lib/geo-scoring";
import {
  type GeoOpportunityV2,
  recommendationToOpportunity,
  buildRewriteTitleRec,
  buildAddFaqRec,
  buildExpandGuideRec,
  buildBuildClusterRec,
  buildRefreshRec,
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
  if (await isDemoBusiness(businessId)) {
    return NextResponse.json(getDemoGeoOpportunities());
  }

  const opportunities: GeoOpportunityV2[] = [];

  // ── GA4 AI data ─────────────────────────────────────────────────
  let ga4Available = false;
  try {
    const { accessToken, propertyId } = await getGA4TokenAndProperty(businessId);
    ga4Available = true;

    const [aiByPage, aiBySource, totalReport] = await Promise.all([
      runGA4Report({
        propertyId,
        accessToken,
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "landingPage" }],
        metrics: [
          { name: "sessions" },
          { name: "engagementRate" },
          { name: "ecommercePurchases" },
        ],
        dimensionFilter: GA4_AI_SOURCE_FILTER,
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 50,
      }),
      runGA4Report({
        propertyId,
        accessToken,
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "sessionSource" }],
        metrics: [{ name: "sessions" }, { name: "ecommercePurchases" }],
        dimensionFilter: GA4_AI_SOURCE_FILTER,
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 10,
      }),
      runGA4Report({
        propertyId,
        accessToken,
        dateRanges: [{ startDate, endDate }],
        metrics: [{ name: "sessions" }, { name: "ecommercePurchases" }],
      }),
    ]);

    const totalRow = totalReport.totals?.[0] ?? totalReport.rows[0];
    const totalSessions = parseFloat(totalRow?.metrics[0] ?? "0");
    const totalPurchases = parseFloat(totalRow?.metrics[1] ?? "0");
    const siteAvgCvr = totalSessions > 0 ? totalPurchases / totalSessions : 0;
    const hasGA4 = true;
    const hasSC = false; // may be overridden below

    // Opportunity: high AI traffic page with weak conversion
    for (const row of aiByPage.rows.slice(0, 15)) {
      const path = row.dimensions[0];
      const aiSessions = parseFloat(row.metrics[0] ?? "0");
      const engRate = parseFloat(row.metrics[1] ?? "0");
      const purchases = parseFloat(row.metrics[2] ?? "0");
      const cvr = aiSessions > 0 ? purchases / aiSessions : 0;

      if (aiSessions > 30 && cvr < siteAvgCvr * 0.3 && siteAvgCvr > 0) {
        const priority = assignPriority(75, aiSessions, cvr - siteAvgCvr);
        const confidence = assignConfidence(hasGA4, hasSC, Math.round(aiSessions));
        opportunities.push({
          type: "conversion",
          priority,
          effort: "medium",
          confidence,
          impact: "+20–40% revenue from AI traffic",
          title: "AI-discovered page losing commercial potential",
          target: path,
          evidence: `${Math.round(aiSessions)} AI-source sessions with only ${(cvr * 100).toFixed(1)}% purchase CVR vs ${(siteAvgCvr * 100).toFixed(1)}% site average.`,
          recommendation:
            "Add a clear product/service CTA, comparison table, or buying guide section to convert AI-discovery intent into revenue.",
          whyItMatters:
            "AI-referred visitors often have high informational intent that transitions to purchase intent with the right nudge. Leaving this gap means losing high-quality leads.",
        });
      }

      // Low engagement from AI visitors
      if (aiSessions > 20 && engRate < 0.3) {
        const priority = assignPriority(55, aiSessions, 0);
        const confidence = assignConfidence(hasGA4, hasSC, Math.round(aiSessions));
        opportunities.push({
          type: "content",
          priority,
          effort: "medium",
          confidence,
          impact: "+15–30% engagement",
          title: "Poor content match for AI-sourced visitors",
          target: path,
          evidence: `${Math.round(aiSessions)} AI sessions but ${(engRate * 100).toFixed(0)}% engagement rate — visitors are not finding what they expected.`,
          recommendation:
            "Restructure this page to directly answer the informational queries driving AI-source traffic. Use FAQ blocks and direct answers near the top.",
          whyItMatters:
            "Low engagement tells AI engines that this page doesn't satisfy the query intent, which can reduce future citation frequency.",
        });
      }
    }

    // Opportunity: strong AI source with concentrated page discovery
    const strongSource = aiBySource.rows
      .filter((r) => parseFloat(r.metrics[0] ?? "0") > 50)
      .slice(0, 1)[0];
    if (strongSource) {
      const engine = classifyAiSource(strongSource.dimensions[0]) ?? "AI engine";
      const sourceSessions = parseFloat(strongSource.metrics[0] ?? "0");
      const priority = assignPriority(50, sourceSessions, 0);
      opportunities.push({
        type: "traffic",
        priority,
        effort: "high",
        confidence: assignConfidence(hasGA4, hasSC, Math.round(sourceSessions)),
        impact: "+30–60% AI channel reach",
        title: `Amplify ${engine} discovery across more pages`,
        target: engine,
        evidence: `${engine} is already sending ${Math.round(sourceSessions)} sessions, concentrated on only a few pages.`,
        recommendation: `Create structured, answer-friendly content on more category and topic pages. ${engine} favors comprehensive pages with clear headings and direct answers.`,
        whyItMatters:
          "When an AI engine trusts your site for one topic, expanding topical coverage can multiply citations across related queries.",
      });
    }
  } catch (err) {
    if (!(err instanceof GA4AuthError)) throw err;
  }

  // ── Search Console data ─────────────────────────────────────────
  let hasSCData = false;
  try {
    const scContext = await resolveSearchConsoleContext({
      businessId,
      requireSite: true,
    });

    const endpointSite = encodeURIComponent(scContext.siteUrl ?? "");
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
      hasSCData = true;
      const scData = (await scRes.json()) as {
        rows?: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }>;
      };
      const scRows = scData.rows ?? [];

      // High impressions + weak CTR informational queries → rewrite title
      const highImpLowCtr = scRows
        .map((r) => ({
          query: r.keys?.[0] ?? "",
          impressions: Math.round(r.impressions ?? 0),
          clicks: Math.round(r.clicks ?? 0),
          ctr: r.ctr ?? 0,
          position: r.position ?? 99,
        }))
        .filter((r) => {
          const intent = scoreQueryIntent(r.query);
          return intent.isAiStyle && r.impressions > 100 && r.ctr < 0.03 && r.position <= 15;
        })
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, 3);

      for (const q of highImpLowCtr) {
        const priority = assignPriority(70, q.impressions, 0);
        const confidence = assignConfidence(ga4Available, hasSCData, q.impressions > 500 ? 10 : 5);
        const rec = buildRewriteTitleRec({
          target: `"${q.query}"`,
          evidence: `${q.impressions.toLocaleString()} impressions, ${(q.ctr * 100).toFixed(1)}% CTR — page is visible but not compelling enough to click.`,
          priority,
          confidence,
          position: q.position,
        });
        opportunities.push(recommendationToOpportunity(rec));
      }

      const queryList = scRows.map((r) => ({
        query: r.keys?.[0] ?? "",
        impressions: Math.round(r.impressions ?? 0),
        clicks: Math.round(r.clicks ?? 0),
        position: r.position ?? 0,
      }));
      const topics = clusterQueryTopics(queryList);

      // Weak topic clusters with meaningful impressions → expand guide
      const weakTopics = topics
        .filter((t) => t.coverageStrength === "Weak" && t.impressions > 200)
        .slice(0, 2);

      for (const topic of weakTopics) {
        const priority = assignPriority(60, topic.impressions, 0);
        const confidence = assignConfidence(ga4Available, hasSCData, topic.queryCount);
        const rec = buildExpandGuideRec({
          target: topic.topic,
          evidence: `${topic.impressions.toLocaleString()} impressions across ${topic.queryCount} queries but thin coverage.`,
          priority,
          confidence,
          impressions: topic.impressions,
        });
        opportunities.push(recommendationToOpportunity(rec));
      }

      // Moderate topic clusters → build cluster
      const moderateTopics = topics
        .filter((t) => t.coverageStrength === "Moderate" && t.queryCount >= 4 && t.impressions > 500)
        .slice(0, 2);

      for (const topic of moderateTopics) {
        const priority = assignPriority(55, topic.impressions, 0);
        const confidence = assignConfidence(ga4Available, hasSCData, topic.queryCount);
        const rec = buildBuildClusterRec({
          target: topic.topic,
          evidence: `${topic.impressions.toLocaleString()} impressions, ${topic.queryCount} queries, average position ${topic.avgPosition.toFixed(1)}.`,
          priority,
          confidence,
          queryCount: topic.queryCount,
        });
        opportunities.push(recommendationToOpportunity(rec));
      }

      // Near page 1 AI-style queries → add FAQ
      const nearPage1 = scRows
        .filter((r) => {
          const intent = scoreQueryIntent(r.keys?.[0] ?? "");
          return (
            intent.isAiStyle &&
            (r.position ?? 99) >= 5 &&
            (r.position ?? 99) <= 15 &&
            (r.impressions ?? 0) > 50
          );
        })
        .sort((a, b) => (b.impressions ?? 0) - (a.impressions ?? 0))
        .slice(0, 2);

      for (const q of nearPage1) {
        const impressions = Math.round(q.impressions ?? 0);
        const position = q.position ?? 10;
        const priority = assignPriority(58, impressions, 0);
        const confidence = assignConfidence(ga4Available, hasSCData, impressions > 200 ? 8 : 4);
        const rec = buildAddFaqRec({
          target: `"${q.keys?.[0] ?? ""}"`,
          evidence: `Position ${position.toFixed(1)} with ${impressions.toLocaleString()} impressions. A small boost from FAQ expansion could push to top 5.`,
          priority,
          confidence,
          queryCount: 1,
        });
        opportunities.push(recommendationToOpportunity(rec));
      }

      // High-position AI queries with decent impressions but low CTR → refresh
      const highPosLowCtr = scRows
        .filter((r) => {
          const intent = scoreQueryIntent(r.keys?.[0] ?? "");
          return intent.isAiStyle && (r.position ?? 99) <= 5 && (r.ctr ?? 0) < 0.05 && (r.impressions ?? 0) > 200;
        })
        .sort((a, b) => (b.impressions ?? 0) - (a.impressions ?? 0))
        .slice(0, 1);

      for (const q of highPosLowCtr) {
        const impressions = Math.round(q.impressions ?? 0);
        const position = q.position ?? 3;
        const priority = assignPriority(65, impressions, 0);
        const confidence = assignConfidence(ga4Available, hasSCData, impressions > 500 ? 10 : 5);
        const rec = buildRefreshRec({
          target: `"${q.keys?.[0] ?? ""}"`,
          evidence: `Position ${position.toFixed(1)} but only ${((q.ctr ?? 0) * 100).toFixed(1)}% CTR — high rank isn't translating to clicks. Content may feel stale or misaligned.`,
          priority,
          confidence,
          avgPosition: position,
        });
        opportunities.push(recommendationToOpportunity(rec));
      }
    }
  } catch (err) {
    if (!(err instanceof SearchConsoleAuthError)) throw err;
  }

  // If no GA4 available, add a connection prompt
  if (!ga4Available) {
    opportunities.push({
      type: "traffic",
      priority: "high",
      effort: "low",
      confidence: "high",
      impact: "Unlocks AI traffic attribution",
      title: "Connect GA4 to detect AI-source traffic",
      target: "GA4 Integration",
      evidence: "Without GA4, AI referral traffic detection is unavailable.",
      recommendation:
        "Connect GA4 and select a property in Integrations to unlock AI traffic source analysis.",
      whyItMatters:
        "Knowing which AI engines send traffic — and how those visitors behave — is the foundation of a GEO strategy. Without GA4 attribution, you're flying blind.",
    });
  }

  // Deduplicate by target + title, sort by priority
  const seen = new Set<string>();
  const deduped = opportunities.filter((op) => {
    const key = `${op.title}|${op.target}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  deduped.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return NextResponse.json({ opportunities: deduped.slice(0, 12) });
}
