import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import type { CommandCenterAction, CommandCenterPermissions } from "@/lib/command-center";
import { buildOperatorDecisionMetadata } from "@/lib/operator-decision-metadata";

vi.mock("@/lib/command-center-store", () => ({
  listCommandCenterJournal: vi.fn(),
  syncCommandCenterActionWorkflowStatus: vi.fn(),
}));

vi.mock("@/lib/command-center-execution-store", () => ({
  appendCommandCenterExecutionAudit: vi.fn(),
  getCommandCenterExecutionState: vi.fn(),
  listCommandCenterExecutionAudit: vi.fn(),
  upsertCommandCenterExecutionState: vi.fn(),
}));

vi.mock("@/lib/command-center-execution-config", () => ({
  canApplyMetaExecutionForBusiness: vi.fn(),
  isCommandCenterExecutionV1Enabled: vi.fn(),
}));

vi.mock("@/lib/meta/decision-os-source", () => ({
  getMetaDecisionOsForRange: vi.fn(),
}));

vi.mock("@/lib/meta/execution", () => ({
  getMetaAdSetExecutionState: vi.fn(),
  mutateMetaAdSetExecution: vi.fn(),
}));

const commandCenterStore = await import("@/lib/command-center-store");
const executionStore = await import("@/lib/command-center-execution-store");
const executionConfig = await import("@/lib/command-center-execution-config");
const decisionSource = await import("@/lib/meta/decision-os-source");
const metaExecution = await import("@/lib/meta/execution");
const executionService = await import("@/lib/command-center-execution-service");

const permissions: CommandCenterPermissions = {
  canEdit: true,
  reason: null,
  role: "collaborator",
};

function buildActionFixture(
  overrides: Partial<CommandCenterAction> = {},
): CommandCenterAction {
  return {
    actionFingerprint: "cc_meta_1",
    sourceSystem: "meta",
    sourceType: "meta_adset_decision",
    surfaceLane: "action_core",
    truthState: "live_confident",
    operatorDisposition: "standard",
    trustReasons: ["ROAS is beating target."],
    title: "Prospecting Wide US",
    recommendedAction: "scale_budget",
    confidence: 0.9,
    priority: "high",
    summary: "ROAS is beating target.",
    decisionSignals: ["ROAS is beating target."],
    evidence: [],
    guardrails: ["Scale in controlled steps."],
    relatedEntities: [
      {
        type: "campaign",
        id: "cmp_1",
        label: "Spring Promo",
      },
      {
        type: "adset",
        id: "adset_1",
        label: "Prospecting Wide US",
      },
    ],
    tags: ["scale_promotions"],
    watchlistOnly: false,
    status: "approved",
    assigneeUserId: null,
    assigneeName: null,
    snoozeUntil: null,
    latestNoteExcerpt: null,
    noteCount: 0,
    lastMutatedAt: null,
    lastMutationId: null,
    createdAt: "2026-04-11T00:00:00.000Z",
    sourceContext: {
      sourceLabel: "Meta Decision OS",
      operatingMode: "Exploit",
      sourceDeepLink: "/platforms/meta",
      sourceDecisionId: "decision_1",
    },
    throughput: {
      priorityScore: 88,
      actionable: true,
      defaultQueueEligible: true,
      selectedInDefaultQueue: true,
      ageHours: 12,
      ageLabel: "12h old",
      ageAnchorAt: "2026-04-10T12:00:00.000Z",
      slaTargetHours: 24,
      slaStatus: "on_track",
    },
    ...overrides,
  };
}

function buildMetaDecisionResponse() {
  const metadata = buildOperatorDecisionMetadata({
    analyticsStartDate: "2026-04-01",
    analyticsEndDate: "2026-04-10",
    decisionAsOf: "2026-04-10",
  });
  return {
    contractVersion: "meta-decision-os.v1",
    generatedAt: "2026-04-11T00:00:00.000Z",
    businessId: "biz",
    startDate: "2026-04-01",
    endDate: "2026-04-10",
    analyticsWindow: metadata.analyticsWindow,
    decisionWindows: metadata.decisionWindows,
    historicalMemory: metadata.historicalMemory,
    decisionAsOf: metadata.decisionAsOf,
    summary: {
      todayPlanHeadline: "Today plan",
      todayPlan: [],
      budgetShiftSummary: "0",
      noTouchSummary: "0",
      winnerScaleSummary: {
        candidateCount: 1,
        protectedCount: 0,
        headline: "1 active winner scale candidate is ready for controlled growth.",
      },
      operatingMode: {
        currentMode: "Exploit",
        recommendedMode: "Exploit",
        confidence: 0.88,
      },
      confidence: 0.88,
      surfaceSummary: {
        actionCoreCount: 1,
        watchlistCount: 0,
        archiveCount: 0,
        degradedCount: 0,
      },
    },
    campaigns: [],
    adSets: [
      {
        decisionId: "decision_1",
        adSetId: "adset_1",
        adSetName: "Prospecting Wide US",
        campaignId: "cmp_1",
        campaignName: "Spring Promo",
        actionType: "scale_budget",
        actionSize: "medium",
        priority: "high",
        confidence: 0.91,
        reasons: ["ROAS is beating target."],
        guardrails: ["Scale in controlled steps."],
        relatedCreativeNeeds: [],
        relatedGeoContext: [],
        supportingMetrics: {
          spend: 500,
          revenue: 1700,
          roas: 3.4,
          cpa: 20,
          ctr: 1.8,
          purchases: 24,
          impressions: 12000,
          clicks: 200,
          bidStrategyLabel: "Cost Cap",
          optimizationGoal: "PURCHASE",
          dailyBudget: 100,
          lifetimeBudget: null,
        },
        whatWouldChangeThisDecision: [],
        noTouch: false,
        policy: {
          strategyClass: "scale_budget",
          objectiveFamily: "sales",
          bidRegime: "cost_cap",
          primaryDriver: "roas_outperforming",
          secondaryDrivers: ["signal_density"],
          winnerState: "scale_candidate",
        },
        trust: {
          surfaceLane: "action_core",
          truthState: "live_confident",
          operatorDisposition: "standard",
          reasons: ["ROAS is beating target."],
        },
      },
    ],
    budgetShifts: [],
    geoDecisions: [],
    placementAnomalies: [],
    noTouchList: [],
    winnerScaleCandidates: [
      {
        candidateId: "cmp_1:adset_1",
        campaignId: "cmp_1",
        campaignName: "Spring Promo",
        adSetId: "adset_1",
        adSetName: "Prospecting Wide US",
        confidence: 0.91,
        why: "ROAS is beating target.",
        suggestedMoveBand: "10-15% of current budget load",
        evidence: [],
        guardrails: ["Scale in controlled steps."],
        supportingMetrics: {
          spend: 500,
          revenue: 1700,
          roas: 3.4,
          cpa: 20,
          ctr: 1.8,
          purchases: 24,
          dailyBudget: 100,
          bidStrategyLabel: "Cost Cap",
          optimizationGoal: "PURCHASE",
        },
        policy: {
          strategyClass: "scale_budget",
          objectiveFamily: "sales",
          bidRegime: "cost_cap",
          primaryDriver: "roas_outperforming",
          secondaryDrivers: ["signal_density"],
          winnerState: "scale_candidate",
        },
      },
    ],
    commercialTruthCoverage: {
      mode: "configured_targets",
      targetPackConfigured: true,
      countryEconomicsConfigured: true,
      promoCalendarConfigured: true,
      operatingConstraintsConfigured: true,
      missingInputs: [],
      notes: [],
    },
  };
}

describe("command center execution service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(executionConfig.isCommandCenterExecutionV1Enabled).mockReturnValue(true);
    vi.mocked(executionConfig.canApplyMetaExecutionForBusiness).mockReturnValue(true);
    vi.mocked(commandCenterStore.listCommandCenterJournal).mockResolvedValue([
      {
        id: "journal_1",
        businessId: "biz",
        actionFingerprint: "cc_meta_1",
        actionTitle: "Prospecting Wide US",
        sourceSystem: "meta",
        sourceType: "meta_adset_decision",
        eventType: "status_changed",
        actorUserId: "user_1",
        actorName: "Operator",
        actorEmail: "operator@adsecute.com",
        message: "Approved Prospecting Wide US.",
        note: null,
        metadata: { mutation: "approve" },
        createdAt: "2026-04-11T10:00:00.000Z",
      },
    ] as never);
    vi.mocked(executionStore.getCommandCenterExecutionState).mockResolvedValue(null);
    vi.mocked(executionStore.listCommandCenterExecutionAudit).mockResolvedValue([]);
    vi.mocked(decisionSource.getMetaDecisionOsForRange).mockResolvedValue(
      buildMetaDecisionResponse() as never,
    );
    vi.mocked(metaExecution.getMetaAdSetExecutionState).mockResolvedValue({
      provider: "meta",
      businessId: "biz",
      adSetId: "adset_1",
      adSetName: "Prospecting Wide US",
      providerAccountId: "act_1",
      providerAccountName: "Account 1",
      currency: "USD",
      campaignId: "cmp_1",
      campaignName: "Spring Promo",
      status: "ACTIVE",
      budgetLevel: "adset",
      dailyBudget: 100,
      lifetimeBudget: null,
      optimizationGoal: "PURCHASE",
      bidStrategyLabel: "Cost Cap",
      isBudgetMixed: false,
      isConfigMixed: false,
      providerAccessible: true,
      isDemo: false,
    } as never);
  });

  it("builds a supported preview with an exact budget target", async () => {
    const preview = await executionService.getCommandCenterExecutionPreview({
      request: new NextRequest("http://localhost/api/command-center/execution"),
      businessId: "biz",
      startDate: "2026-04-01",
      endDate: "2026-04-10",
      action: buildActionFixture(),
      permissions,
    });

    expect(preview.supportMode).toBe("supported");
    expect(preview.status).toBe("ready_for_apply");
    expect(preview.requestedState?.dailyBudget).toBe(115);
    expect(preview.plan?.requestedDailyBudget).toBe(115);
    expect(preview.permission.canApply).toBe(true);
  });

  it("degrades to manual-only for campaign-owned budgets", async () => {
    vi.mocked(metaExecution.getMetaAdSetExecutionState).mockResolvedValue({
      provider: "meta",
      businessId: "biz",
      adSetId: "adset_1",
      adSetName: "Prospecting Wide US",
      providerAccountId: "act_1",
      providerAccountName: "Account 1",
      currency: "USD",
      campaignId: "cmp_1",
      campaignName: "Spring Promo",
      status: "ACTIVE",
      budgetLevel: "campaign",
      dailyBudget: 100,
      lifetimeBudget: null,
      optimizationGoal: "PURCHASE",
      bidStrategyLabel: "Cost Cap",
      isBudgetMixed: false,
      isConfigMixed: false,
      providerAccessible: true,
      isDemo: false,
    } as never);

    const preview = await executionService.getCommandCenterExecutionPreview({
      request: new NextRequest("http://localhost/api/command-center/execution"),
      businessId: "biz",
      startDate: "2026-04-01",
      endDate: "2026-04-10",
      action: buildActionFixture(),
      permissions,
    });

    expect(preview.supportMode).toBe("manual_only");
    expect(preview.status).toBe("manual_only");
    expect(preview.permission.canApply).toBe(false);
  });

  it("rejects apply when the preview hash is stale", async () => {
    await expect(
      executionService.applyCommandCenterExecution({
        request: new NextRequest("http://localhost/api/command-center/execution/apply", {
          method: "POST",
        }),
        businessId: "biz",
        startDate: "2026-04-01",
        endDate: "2026-04-10",
        action: buildActionFixture(),
        permissions,
        actorUserId: "user_1",
        actorName: "Operator",
        actorEmail: "operator@adsecute.com",
        clientMutationId: "apply_1",
        previewHash: "stale_hash",
      }),
    ).rejects.toThrow("Execution preview is stale");
  });
});
