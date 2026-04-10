import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyGoogleAdsStructuredAssist } from "@/lib/google-ads/advisor-structured-assist";
import type { GoogleAdvisorResponse, GoogleRecommendation } from "@/lib/google-ads/growth-advisor-types";

const createCompletion = vi.fn();

vi.mock("@/lib/openai", () => ({
  getOpenAI: () => ({
    chat: {
      completions: {
        create: createCompletion,
      },
    },
  }),
}));

function buildRecommendation(
  overrides: Partial<GoogleRecommendation> = {}
): GoogleRecommendation {
  return {
    id: "rec_1",
    level: "account",
    type: "brand_leakage",
    strategyLayer: "Search Governance",
    decisionState: "act",
    decisionFamily: "brand_governance",
    doBucket: "do_now",
    priority: "high",
    confidence: "medium",
    dataTrust: "high",
    integrityState: "ready",
    supportStrength: "strong",
    actionability: "ready_now",
    reversibility: "high",
    title: "Brand demand is leaking into growth lanes",
    summary: "Brand-like demand is appearing outside the dedicated brand lane.",
    why: "Mixed brand routing makes growth lanes look healthier than they really are.",
    decision: {
      decisionFamily: "brand_governance",
      lane: "review",
      riskLevel: "medium",
      blastRadius: "campaign",
      confidence: 0.82,
      windowsUsed: {
        healthWindow: "alarm_7d",
        primaryWindow: "operational_28d",
        queryWindow: "query_governance_56d",
        baselineWindow: "baseline_84d",
        maturityCutoffDays: 84,
      },
      whyNow: "Recurring branded leakage is visible across recent windows.",
      whyNot: [],
      blockers: [],
      validationPlan: ["Check whether branded demand stops appearing in non-brand lanes after 7 days."],
      rollbackPlan: ["Reverse the manual routing change in Google Ads if branded demand drops from the intended lane."],
      evidenceSummary: "Leakage evidence is visible.",
      evidencePoints: [
        { label: "Leaked brand queries", value: "3" },
        { label: "Main leakage lane", value: "PMax Prospecting" },
      ],
    },
    decisionNarrative: {
      whatHappened: "Brand demand is leaking.",
      whyItHappened: "Lane boundaries are soft.",
      whatToDo: "Review routing and exclusions.",
      risk: "Growth lanes can look artificially strong.",
      howToValidate: ["Check whether branded demand stops appearing in non-brand lanes after 7 days."],
      howToRollBack: "Reverse the manual routing change in Google Ads if branded demand drops from the intended lane.",
    },
    whyNow: "Recurring branded leakage is visible across recent windows.",
    reasonCodes: ["brand_leakage"],
    confidenceExplanation: "Multi-window support is present.",
    confidenceDegradationReasons: [],
    recommendedAction:
      "Treat the overlap as a routing problem first and keep branded demand isolated before broader discovery is scaled.",
    potentialContribution: {
      label: "Control gain",
      impact: "medium",
      summary: "Cleaning brand leakage improves the truthfulness of growth-lane performance.",
    },
    impactBand: "medium",
    effortScore: "medium",
    rollbackGuidance: "Reverse the manual routing change in Google Ads if branded demand drops from the intended lane.",
    validationChecklist: ["Check whether branded demand stops appearing in non-brand lanes after 7 days."],
    blockers: [],
    rankScore: 18,
    rankExplanation: "Leakage is high priority.",
    impactScore: 10,
    recommendationFingerprint: "fp_1",
    evidence: [
      { label: "Leaked brand queries", value: "3" },
      { label: "Main leakage lane", value: "PMax Prospecting" },
    ],
    timeframeContext: {
      coreVerdict: "Core windows show recurring branded leakage.",
      selectedRangeNote: "Selected range confirms the recent pocket.",
      historicalSupport: "Historical support is present.",
    },
    affectedFamilies: ["brand_search", "non_brand_search", "pmax_scaling"],
    overlapEntities: ["Brand Search", "PMax Prospecting"],
    negativeQueries: ["brand chairs", "brand sofa"],
    negativeGuardrails: ["brand", "sku"],
    playbookSteps: [
      "Review branded query routing in the leaking lane.",
      "Keep the dedicated brand lane isolated before scaling discovery.",
    ],
    prerequisites: ["Brand query controls must exist in the leaking lane where possible."],
    ...overrides,
  };
}

function buildAdvisor(recommendations: GoogleRecommendation[]): GoogleAdvisorResponse {
  return {
    summary: {
      headline: "headline",
      operatorNote: "note",
      demandMap: "map",
      topPriority: "priority",
      totalRecommendations: recommendations.length,
      actRecommendationCount: recommendations.filter((entry) => entry.decisionState === "act").length,
      accountState: "scaling_ready",
      accountOperatingMode: "Operator-first",
      topConstraint: "constraint",
      topGrowthLever: "lever",
      recommendedFocusToday: "focus",
      watchouts: [],
      dataTrustSummary: "trust",
      campaignRoles: [],
    },
    recommendations,
    sections: [
      {
        id: "section_1",
        title: "Search Governance",
        recommendations,
      },
    ],
    clusters: [],
    metadata: {
      analysisMode: "snapshot",
      asOfDate: "2026-04-10",
      decisionEngineVersion: "v2",
      snapshotModel: "decision_snapshot_v2",
      selectedWindowKey: "operational_28d",
      primaryWindowKey: "operational_28d",
      queryWindowKey: "query_governance_56d",
      baselineWindowKey: "baseline_84d",
      maturityCutoffDays: 84,
      lagAdjustedEndDate: {
        available: false,
        value: null,
        note: null,
      },
      selectedRangeRole: "contextual_only",
      analysisWindows: {
        healthAlarmWindows: [],
        operationalWindow: {
          key: "operational_28d",
          label: "operational 28d",
          startDate: "2026-03-13",
          endDate: "2026-04-10",
          days: 28,
          role: "operational_decision",
        },
        queryGovernanceWindow: {
          key: "query_governance_56d",
          label: "query governance 56d",
          startDate: "2026-02-14",
          endDate: "2026-04-10",
          days: 56,
          role: "query_governance",
        },
        baselineWindow: {
          key: "baseline_84d",
          label: "baseline 84d",
          startDate: "2026-01-16",
          endDate: "2026-04-10",
          days: 84,
          role: "baseline",
        },
      },
      executionSurface: {
        mode: "operator_first_manual_plan",
        decisionEngineV2Enabled: true,
        writebackEnabled: false,
        mutateVerified: false,
        rollbackVerified: false,
        capabilityGateReason: "Write-back is disabled.",
        summary: "Operator-first manual plan surface.",
      },
      historicalSupportAvailable: false,
      historicalSupport: null,
      decisionSummaryTotals: null,
      canonicalWindowTotals: null,
      selectedRangeContext: null,
      aggregateIntelligence: null,
      aiAssist: null,
      actionContract: null,
    },
  };
}

describe("applyGoogleAdsStructuredAssist", () => {
  beforeEach(() => {
    createCompletion.mockReset();
    vi.unstubAllEnvs();
  });

  it("applies a validated AI structured assist to an eligible generic recommendation", async () => {
    vi.stubEnv("GOOGLE_ADS_ADVISOR_AI_STRUCTURED_ASSIST_ENABLED", "true");
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    createCompletion.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              primaryAction: "Tighten brand routing before scaling discovery again.",
              scopeLabel: "Brand Search, Non Brand Search, and PMax lanes",
              exactChanges: [
                {
                  label: "Queries to review",
                  items: ["brand chairs", "brand sofa"],
                  emptyLabel: "No exact items attached.",
                  kind: "change",
                  tone: "primary",
                },
                {
                  label: "Lanes to isolate",
                  items: ["Brand Search", "PMax Prospecting"],
                  emptyLabel: "No exact items attached.",
                  kind: "change",
                  tone: "default",
                },
              ],
              expectedEffect: {
                summary: "Cleaning brand leakage improves the truthfulness of growth-lane performance.",
                estimationMode: "not_confidently_estimable",
                estimateLabel: null,
                note: "Business impact is not confidently estimable from the current code and data.",
              },
              whyThisNow: "Recurring branded leakage is visible across recent windows.",
              evidence: ["Leaked brand queries: 3"],
              validation: ["Check whether branded demand stops appearing in non-brand lanes after 7 days."],
              rollback: ["Reverse the manual routing change in Google Ads if branded demand drops from the intended lane."],
              blockedBecause: [],
              coachNote: "Use the exact routed queries as the manual review list.",
            }),
          },
        },
      ],
    });

    const result = await applyGoogleAdsStructuredAssist({
      analysisMode: "snapshot",
      advisorPayload: buildAdvisor([buildRecommendation()]),
    });

    expect(result.metadata?.aiAssist).toMatchObject({
      enabled: true,
      appliedCount: 1,
      rejectedCount: 0,
      failedCount: 0,
    });
    expect(result.recommendations[0]?.structuredAssist).toMatchObject({
      state: "applied",
      mode: "snapshot_time",
      model: "gpt-5-nano",
    });
    expect(result.recommendations[0]?.operatorActionCard?.assistMode).toBe("ai_structured_assist");
    expect(result.recommendations[0]?.operatorActionCard?.exactChanges[0]?.items).toContain("brand chairs");
  });

  it("does not call AI for a deterministic specialized family", async () => {
    vi.stubEnv("GOOGLE_ADS_ADVISOR_AI_STRUCTURED_ASSIST_ENABLED", "true");
    vi.stubEnv("OPENAI_API_KEY", "test-key");

    const result = await applyGoogleAdsStructuredAssist({
      analysisMode: "snapshot",
      advisorPayload: buildAdvisor([
        buildRecommendation({
          type: "query_governance",
          negativeQueries: ["refund policy"],
          playbookSteps: ["Add the exact negative manually."],
        }),
      ]),
    });

    expect(createCompletion).not.toHaveBeenCalled();
    expect(result.recommendations[0]?.structuredAssist?.state).toBe("not_requested");
    expect(result.recommendations[0]?.operatorActionCard?.assistMode).toBe("deterministic");
  });

  it("rejects AI output that introduces exact items outside the allowlist", async () => {
    vi.stubEnv("GOOGLE_ADS_ADVISOR_AI_STRUCTURED_ASSIST_ENABLED", "true");
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    createCompletion.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              primaryAction: "Tighten brand routing before scaling discovery again.",
              scopeLabel: "Brand Search, Non Brand Search, and PMax lanes",
              exactChanges: [
                {
                  label: "Queries to review",
                  items: ["invented query"],
                  kind: "change",
                  tone: "primary",
                },
              ],
              expectedEffect: {
                summary: "Cleaning brand leakage improves the truthfulness of growth-lane performance.",
                estimationMode: "not_confidently_estimable",
                estimateLabel: null,
                note: "Business impact is not confidently estimable from the current code and data.",
              },
              whyThisNow: "Recurring branded leakage is visible across recent windows.",
              blockedBecause: [],
            }),
          },
        },
      ],
    });

    const result = await applyGoogleAdsStructuredAssist({
      analysisMode: "snapshot",
      advisorPayload: buildAdvisor([buildRecommendation()]),
    });

    expect(result.recommendations[0]?.structuredAssist?.state).toBe("rejected");
    expect(result.recommendations[0]?.structuredAssist?.reason).toContain("allowlist");
    expect(result.recommendations[0]?.operatorActionCard?.assistMode).toBe("deterministic");
  });

  it("rejects AI output that tries to introduce a new exact estimate label", async () => {
    vi.stubEnv("GOOGLE_ADS_ADVISOR_AI_STRUCTURED_ASSIST_ENABLED", "true");
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    createCompletion.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              primaryAction: "Tighten brand routing before scaling discovery again.",
              scopeLabel: "Brand Search, Non Brand Search, and PMax lanes",
              exactChanges: [
                {
                  label: "Queries to review",
                  items: ["brand chairs"],
                  kind: "change",
                  tone: "primary",
                },
              ],
              expectedEffect: {
                summary: "Cleaning brand leakage improves the truthfulness of growth-lane performance.",
                estimationMode: "not_confidently_estimable",
                estimateLabel: "Revenue: $100-$200",
                note: "Invented.",
              },
              whyThisNow: "Recurring branded leakage is visible across recent windows.",
              blockedBecause: [],
            }),
          },
        },
      ],
    });

    const result = await applyGoogleAdsStructuredAssist({
      analysisMode: "snapshot",
      advisorPayload: buildAdvisor([buildRecommendation()]),
    });

    expect(result.recommendations[0]?.structuredAssist?.state).toBe("rejected");
    expect(result.recommendations[0]?.structuredAssist?.reason).toContain("estimate label");
    expect(result.recommendations[0]?.operatorActionCard?.assistMode).toBe("deterministic");
  });

  it("keeps deterministic fallback when OpenAI is not configured", async () => {
    vi.stubEnv("GOOGLE_ADS_ADVISOR_AI_STRUCTURED_ASSIST_ENABLED", "true");

    const result = await applyGoogleAdsStructuredAssist({
      analysisMode: "snapshot",
      advisorPayload: buildAdvisor([buildRecommendation()]),
    });

    expect(createCompletion).not.toHaveBeenCalled();
    expect(result.recommendations[0]?.structuredAssist?.state).toBe("not_configured");
    expect(result.recommendations[0]?.operatorActionCard?.assistMode).toBe("deterministic");
  });
});
