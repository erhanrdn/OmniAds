import { describe, expect, it } from "vitest";
import { buildCreativeDecisionOs, type CreativeDecisionOsInputRow } from "@/lib/creative-decision-os";

function buildRow(overrides: Partial<CreativeDecisionOsInputRow> = {}): CreativeDecisionOsInputRow {
  return {
    creativeId: "creative-1",
    name: "Creative 1",
    creativeFormat: "video",
    creativeAgeDays: 20,
    spendVelocity: 25,
    frequency: 1.6,
    spend: 500,
    purchaseValue: 1800,
    roas: 3.6,
    cpa: 20,
    ctr: 2.1,
    cpm: 13,
    cpc: 0.7,
    purchases: 25,
    impressions: 32000,
    linkClicks: 920,
    hookRate: 30,
    holdRate: 16,
    video25Rate: 62,
    watchRate: 42,
    video75Rate: 28,
    clickToPurchaseRate: 2.72,
    atcToPurchaseRate: 0.18,
    copyText: "Pack once and move faster.",
    copyVariants: ["Pack once and move faster."],
    headlineVariants: ["Pack Once"],
    descriptionVariants: ["Free shipping"],
    objectStoryId: "story-1",
    effectiveObjectStoryId: "story-1",
    postId: "post-1",
    campaignId: "cmp-1",
    campaignName: "Campaign",
    adSetId: "adset-1",
    adSetName: "Ad Set",
    taxonomyPrimaryLabel: "Video",
    taxonomySecondaryLabel: "Utility",
    taxonomyVisualFormat: "video",
    aiTags: {
      messagingAngle: ["utility"],
      hookTactic: ["travel_pack"],
    },
    historicalWindows: null,
    ...overrides,
  };
}

describe("buildCreativeDecisionOs", () => {
  it("uses story identity as the first family grouping source", () => {
    const payload = buildCreativeDecisionOs({
      businessId: "biz",
      startDate: "2026-04-01",
      endDate: "2026-04-10",
      rows: [
        buildRow({ creativeId: "creative-1", name: "Creative 1", objectStoryId: "shared", effectiveObjectStoryId: "shared", postId: "post-shared" }),
        buildRow({ creativeId: "creative-2", name: "Creative 2", objectStoryId: "shared", effectiveObjectStoryId: "shared", postId: "post-shared", spend: 420, purchaseValue: 1320, roas: 3.14 }),
      ],
    });

    expect(payload.families).toHaveLength(1);
    expect(payload.families[0]?.familySource).toBe("story_identity");
    expect(payload.creatives[0]?.familyId).toBe(payload.creatives[1]?.familyId);
  });

  it("classifies scale, fatigue, blocked, and comeback states deterministically", () => {
    const payload = buildCreativeDecisionOs({
      businessId: "biz",
      startDate: "2026-04-01",
      endDate: "2026-04-10",
      rows: [
        buildRow({
          creativeId: "winner",
          name: "Winner",
          copyText: "Pack faster with the organizer winner.",
          copyVariants: ["Pack faster with the organizer winner."],
          headlineVariants: ["Winner angle"],
          descriptionVariants: ["Winner description"],
          objectStoryId: "winner-story",
          effectiveObjectStoryId: "winner-story",
          postId: "winner-post",
          historicalWindows: {
            last30: {
              spend: 440,
              purchaseValue: 1540,
              roas: 3.5,
              cpa: 20,
              ctr: 2,
              purchases: 22,
              impressions: 28000,
              linkClicks: 810,
              hookRate: 29,
              holdRate: 15,
              video25Rate: 60,
              watchRate: 40,
              video75Rate: 26,
              clickToPurchaseRate: 2.7,
              atcToPurchaseRate: 0.19,
            },
            allHistory: {
              spend: 520,
              purchaseValue: 1780,
              roas: 3.42,
              cpa: 21,
              ctr: 2.1,
              purchases: 24,
              impressions: 31000,
              linkClicks: 880,
              hookRate: 30,
              holdRate: 16,
              video25Rate: 61,
              watchRate: 41,
              video75Rate: 27,
              clickToPurchaseRate: 2.73,
              atcToPurchaseRate: 0.18,
            },
          },
        }),
        buildRow({
          creativeId: "fatigue",
          name: "Fatigue",
          copyText: "Traveler proof that used to scale.",
          copyVariants: ["Traveler proof that used to scale."],
          headlineVariants: ["Fatigue angle"],
          descriptionVariants: ["Fatigue description"],
          objectStoryId: "fatigue-story",
          effectiveObjectStoryId: "fatigue-story",
          postId: "fatigue-post",
          spend: 480,
          purchaseValue: 720,
          roas: 1.5,
          cpa: 60,
          ctr: 1.0,
          purchases: 8,
          linkClicks: 510,
          hookRate: 15,
          clickToPurchaseRate: 1.57,
          historicalWindows: {
            last30: {
              spend: 420,
              purchaseValue: 1512,
              roas: 3.6,
              cpa: 22,
              ctr: 2.2,
              purchases: 19,
              impressions: 29000,
              linkClicks: 770,
              hookRate: 31,
              holdRate: 15,
              video25Rate: 63,
              watchRate: 44,
              video75Rate: 30,
              clickToPurchaseRate: 2.47,
              atcToPurchaseRate: 0.18,
            },
            allHistory: {
              spend: 560,
              purchaseValue: 1904,
              roas: 3.4,
              cpa: 23,
              ctr: 2.1,
              purchases: 24,
              impressions: 33000,
              linkClicks: 910,
              hookRate: 30,
              holdRate: 16,
              video25Rate: 62,
              watchRate: 43,
              video75Rate: 28,
              clickToPurchaseRate: 2.63,
              atcToPurchaseRate: 0.18,
            },
          },
        }),
        buildRow({
          creativeId: "blocked",
          name: "Blocked",
          copyText: "Low trust blocked concept.",
          copyVariants: ["Low trust blocked concept."],
          headlineVariants: ["Blocked angle"],
          descriptionVariants: ["Blocked description"],
          objectStoryId: "blocked-story",
          effectiveObjectStoryId: "blocked-story",
          postId: "blocked-post",
          spend: 410,
          purchaseValue: 168,
          roas: 0.41,
          cpa: 205,
          ctr: 0.62,
          purchases: 1,
          impressions: 33000,
          linkClicks: 205,
          hookRate: 9,
          clickToPurchaseRate: 0.98,
          historicalWindows: {},
        }),
        buildRow({
          creativeId: "comeback",
          name: "Comeback",
          copyText: "Past winner ready for a comeback.",
          copyVariants: ["Past winner ready for a comeback."],
          headlineVariants: ["Comeback angle"],
          descriptionVariants: ["Comeback description"],
          objectStoryId: "comeback-story",
          effectiveObjectStoryId: "comeback-story",
          postId: "comeback-post",
          spend: 3,
          purchaseValue: 0,
          roas: 0,
          cpa: 0,
          ctr: 0.2,
          purchases: 0,
          impressions: 140,
          linkClicks: 8,
          hookRate: 4,
          clickToPurchaseRate: 0,
          historicalWindows: {
            last30: {
              spend: 360,
              purchaseValue: 1188,
              roas: 3.3,
              cpa: 21,
              ctr: 2.0,
              purchases: 17,
              impressions: 24000,
              linkClicks: 650,
              hookRate: 24,
              holdRate: 13,
              video25Rate: 58,
              watchRate: 37,
              video75Rate: 23,
              clickToPurchaseRate: 2.61,
              atcToPurchaseRate: 0.19,
            },
            allHistory: {
              spend: 440,
              purchaseValue: 1496,
              roas: 3.4,
              cpa: 20,
              ctr: 2.2,
              purchases: 22,
              impressions: 29000,
              linkClicks: 780,
              hookRate: 28,
              holdRate: 15,
              video25Rate: 60,
              watchRate: 39,
              video75Rate: 25,
              clickToPurchaseRate: 2.82,
              atcToPurchaseRate: 0.18,
            },
          },
        }),
      ],
    });

    const byId = new Map(payload.creatives.map((creative) => [creative.creativeId, creative]));

    expect(byId.get("winner")?.lifecycleState).toMatch(/scale_ready|stable_winner/);
    expect(byId.get("winner")?.policy?.explanation?.compare.cutoverState).toBeDefined();
    expect(byId.get("fatigue")?.lifecycleState).toBe("fatigued_winner");
    expect(byId.get("fatigue")?.primaryAction).toBe("refresh_replace");
    expect(byId.get("fatigue")?.policy?.primaryDriver).toBe("fatigue");
    expect(byId.get("fatigue")?.policy?.explanation?.fatigueOrComeback).toContain(
      "Fatigue logic",
    );
    expect(byId.get("blocked")?.lifecycleState).toBe("blocked");
    expect(byId.get("blocked")?.primaryAction).toBe("block_deploy");
    expect(byId.get("comeback")?.lifecycleState).toBe("comeback_candidate");
    expect(byId.get("comeback")?.primaryAction).toBe("retest_comeback");
    expect(byId.get("comeback")?.policy?.primaryDriver).toBe("comeback");
  });

  it("keeps lifecycle, primary decisions, and fingerprints stable when only reporting dates change", () => {
    const analyticsWindow = {
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      role: "analysis_only" as const,
    };
    const decisionWindows = {
      recent7d: {
        key: "recent7d" as const,
        label: "recent 7d",
        startDate: "2026-04-04",
        endDate: "2026-04-10",
        days: 7,
        role: "recent_watch" as const,
      },
      primary30d: {
        key: "primary30d" as const,
        label: "primary 30d",
        startDate: "2026-03-12",
        endDate: "2026-04-10",
        days: 30,
        role: "decision_authority" as const,
      },
      baseline90d: {
        key: "baseline90d" as const,
        label: "baseline 90d",
        startDate: "2026-01-11",
        endDate: "2026-04-10",
        days: 90,
        role: "historical_memory" as const,
      },
    };
    const historicalMemory = {
      available: true,
      source: "rolling_baseline" as const,
      baselineWindowKey: "baseline90d" as const,
      startDate: "2026-01-11",
      endDate: "2026-04-10",
      lookbackDays: 90,
      note: "Decisions use live rolling windows with baseline memory instead of the selected period.",
    };

    const april = buildCreativeDecisionOs({
      businessId: "biz",
      startDate: "2026-04-01",
      endDate: "2026-04-30",
      evidenceSource: "live",
      analyticsWindow,
      decisionWindows,
      historicalMemory,
      decisionAsOf: "2026-04-10",
      rows: [buildRow()],
    });
    const march = buildCreativeDecisionOs({
      businessId: "biz",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      evidenceSource: "live",
      analyticsWindow,
      decisionWindows,
      historicalMemory,
      decisionAsOf: "2026-04-10",
      rows: [buildRow()],
    });

    const aprilCreative = april.creatives[0]!;
    const marchCreative = march.creatives[0]!;

    expect(aprilCreative.lifecycleState).toBe(marchCreative.lifecycleState);
    expect(aprilCreative.primaryAction).toBe(marchCreative.primaryAction);
    expect(aprilCreative.actionFingerprint).toBe(marchCreative.actionFingerprint);
    expect(aprilCreative.evidenceHash).toBe(marchCreative.evidenceHash);
    expect(aprilCreative.operatorPolicy.segment).toBe(marchCreative.operatorPolicy.segment);
    expect(aprilCreative.operatorPolicy.pushReadiness).toBe(marchCreative.operatorPolicy.pushReadiness);
    expect(aprilCreative.provenance).toMatchObject({
      businessId: "biz",
      decisionAsOf: "2026-04-10",
      analyticsWindow,
      sourceWindow: {
        key: "primary30d",
        startDate: "2026-03-12",
        endDate: "2026-04-10",
        role: "decision_authority",
      },
      sourceRowScope: {
        system: "creative",
        entityType: "creative",
        entityId: "creative-1",
      },
      sourceDecisionId: "creative:creative-1",
    });
    expect(april.decisionWindows.primary30d).toEqual(march.decisionWindows.primary30d);
    expect(april.analyticsWindow).toEqual(analyticsWindow);
    expect(march.analyticsWindow).toEqual(analyticsWindow);
    expect(april.historicalAnalysis.selectedWindow.startDate).toBe("2026-04-01");
    expect(march.historicalAnalysis.selectedWindow.startDate).toBe("2026-03-01");
  });

  it("marks missing or non-live Creative evidence as contextual instead of queue-ready", () => {
    const unknown = buildCreativeDecisionOs({
      businessId: "biz",
      startDate: "2026-04-01",
      endDate: "2026-04-10",
      rows: [buildRow()],
    });
    const snapshot = buildCreativeDecisionOs({
      businessId: "biz",
      startDate: "2026-04-01",
      endDate: "2026-04-10",
      evidenceSource: "snapshot",
      rows: [buildRow()],
    });

    expect(unknown.creatives[0]?.operatorPolicy).toMatchObject({
      evidenceSource: "unknown",
      state: "contextual_only",
      pushReadiness: "blocked_from_push",
      queueEligible: false,
    });
    expect(snapshot.creatives[0]?.operatorPolicy).toMatchObject({
      evidenceSource: "snapshot",
      state: "contextual_only",
      pushReadiness: "blocked_from_push",
      queueEligible: false,
    });
  });

  it("routes low-truth and inactive creatives into explicit surface lanes", () => {
    const payload = buildCreativeDecisionOs({
      businessId: "biz",
      startDate: "2026-04-01",
      endDate: "2026-04-10",
      evidenceSource: "live",
      operatingMode: {
        businessId: "biz",
        startDate: "2026-04-01",
        endDate: "2026-04-10",
        analyticsWindow: {
          startDate: "2026-04-01",
          endDate: "2026-04-10",
          role: "analysis_only",
        },
        decisionWindows: {
          recent7d: {
            key: "recent7d",
            label: "recent 7d",
            startDate: "2026-04-04",
            endDate: "2026-04-10",
            days: 7,
            role: "recent_watch",
          },
          primary30d: {
            key: "primary30d",
            label: "primary 30d",
            startDate: "2026-03-12",
            endDate: "2026-04-10",
            days: 30,
            role: "decision_authority",
          },
          baseline90d: {
            key: "baseline90d",
            label: "baseline 90d",
            startDate: "2026-01-11",
            endDate: "2026-04-10",
            days: 90,
            role: "historical_memory",
          },
        },
        historicalMemory: {
          available: true,
          source: "rolling_baseline",
          baselineWindowKey: "baseline90d",
          startDate: "2026-01-11",
          endDate: "2026-04-10",
          lookbackDays: 90,
          note: "Decisions use live rolling windows with baseline memory instead of the selected period.",
        },
        decisionAsOf: "2026-04-10",
        currentMode: "Explore",
        recommendedMode: "Explore",
        confidence: 0.62,
        why: ["Low-truth operating mode."],
        guardrails: [],
        changeTriggers: [],
        activeCommercialInputs: [],
        platformInputs: [],
        missingInputs: ["Target pack is missing."],
        degradedMode: {
          active: true,
          confidenceCap: 0.62,
          reasons: ["Commercial truth is incomplete."],
          safeActionLabels: ["review_hold", "degraded_no_scale"],
        },
      },
      rows: [
        buildRow({
          creativeId: "scale",
          spend: 420,
          purchaseValue: 1512,
          roas: 3.6,
          purchases: 18,
        }),
        buildRow({
          creativeId: "hold",
          name: "Hold",
          spend: 80,
          purchaseValue: 120,
          roas: 1.5,
          purchases: 2,
          impressions: 1800,
          linkClicks: 24,
        }),
        buildRow({
          creativeId: "retired",
          name: "Retired",
          spend: 4,
          purchaseValue: 0,
          roas: 0,
          purchases: 0,
          impressions: 120,
          linkClicks: 4,
          historicalWindows: {},
        }),
      ],
    });

    const byId = new Map(payload.creatives.map((creative) => [creative.creativeId, creative]));

    expect(byId.get("scale")?.trust.operatorDisposition).toBe("profitable_truth_capped");
    expect(byId.get("scale")?.trust.surfaceLane).toBe("watchlist");
    expect(byId.get("scale")?.trust.evidence).toMatchObject({
      completeness: "partial",
      suppressed: true,
      aggressiveActionBlocked: true,
    });
    expect(byId.get("hold")?.trust.truthState).toBe("degraded_missing_truth");
    expect(byId.get("retired")?.trust.surfaceLane).toBe("archive_context");
    expect(payload.summary.surfaceSummary.degradedCount).toBeGreaterThan(0);
    expect(payload.summary.surfaceSummary.archiveCount).toBeGreaterThan(0);
    expect(payload.authority).toMatchObject({
      scope: "Creative Decision OS",
      truthState: "degraded_missing_truth",
      completeness: "partial",
    });
  });
});
