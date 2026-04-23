import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/meta/recommendations/route";
import { assertMetaRecommendationsPageContract } from "@/lib/meta/page-route-contract.test-helpers";

vi.mock("@/lib/access", () => ({
  requireBusinessAccess: vi.fn(),
}));

vi.mock("@/lib/business-mode.server", () => ({
  isDemoBusiness: vi.fn(),
}));

vi.mock("@/lib/request-language", () => ({
  resolveRequestLanguage: vi.fn(),
}));

vi.mock("@/lib/creative-decision-os-config", () => ({
  isCreativeDecisionOsV1EnabledForBusiness: vi.fn(() => false),
}));

vi.mock("@/lib/creative-decision-os-source", () => ({
  getCreativeDecisionOsForRange: vi.fn(),
}));

vi.mock("@/lib/meta/breakdowns-source", () => ({
  getMetaBreakdownsForRange: vi.fn(async () => ({
    status: "ok",
    age: [],
    location: [],
    placement: [],
    budget: { campaign: [], adset: [] },
    audience: { available: false, reason: "n/a" },
    products: { available: false, reason: "n/a" },
    isPartial: false,
    notReadyReason: null,
  })),
}));

vi.mock("@/lib/meta/campaigns-source", () => ({
  getMetaCampaignsForRange: vi.fn(async () => ({
    status: "ok",
    rows: [],
    isPartial: false,
    notReadyReason: null,
  })),
}));

vi.mock("@/lib/meta/config-snapshots", () => ({
  readMetaBidRegimeHistorySummaries: vi.fn(),
}));

vi.mock("@/lib/meta/decision-os-config", () => ({
  isMetaDecisionOsV1EnabledForBusiness: vi.fn(() => false),
}));

vi.mock("@/lib/meta/decision-os-source", () => ({
  getMetaDecisionOsForRange: vi.fn(),
}));

vi.mock("@/lib/meta/recommendations", () => ({
  buildMetaRecommendations: vi.fn(() => ({
    status: "ok",
    summary: {
      title: "Summary",
      summary: "Summary",
      primaryLens: "volume",
      confidence: "medium",
      recommendationCount: 1,
    },
    recommendations: [
      {
        id: "rec_1",
        campaignId: "cmp_1",
        decisionState: "act",
        title: "Raise budget",
        recommendedAction: "Increase the budget on the best campaign.",
        why: "The selected campaign is outperforming peers.",
        summary: "Strong profitability signal.",
        expectedImpact: "More profitable volume.",
        evidence: [{ label: "ROAS", value: "3.20x", tone: "positive" }],
      },
    ],
  })),
  buildMetaRecommendationsFromDecisionOs: vi.fn((decisionOs?: {
    businessId?: string;
    startDate?: string;
    endDate?: string;
  }) => ({
    status: "ok",
    businessId: decisionOs?.businessId,
    startDate: decisionOs?.startDate,
    endDate: decisionOs?.endDate,
    summary: {
      title: "Decision OS summary",
      summary: "Decision OS summary",
      primaryLens: "structure",
      confidence: "high",
      recommendationCount: 1,
    },
    recommendations: [
      {
        id: "decision_rec_1",
        campaignId: "cmp_1",
        decisionState: "act",
        title: "Decision OS action",
        recommendedAction: "Follow Decision OS action.",
        why: "Decision OS authority is ready.",
        summary: "Decision OS action context.",
        expectedImpact: "Cleaner execution.",
        evidence: [{ label: "Authority", value: "ready", tone: "positive" }],
      },
    ],
    sourceModel: "decision_os_unified",
  })),
}));

vi.mock("@/lib/meta/creative-intelligence", () => ({
  buildMetaCreativeIntelligence: vi.fn(() => ({ rows: [] })),
}));

vi.mock("@/lib/meta/creative-score-service", () => ({
  getCreativeScoreSnapshot: vi.fn(async () => ({
    selectedRows: [],
    historyById: new Map(),
    decisionsById: new Map(),
    computedAt: new Date().toISOString(),
    freshnessState: "fresh",
    ruleVersion: "meta-creative-score-v1",
  })),
}));

const access = await import("@/lib/access");
const businessMode = await import("@/lib/business-mode.server");
const campaignsSource = await import("@/lib/meta/campaigns-source");
const breakdownsSource = await import("@/lib/meta/breakdowns-source");
const creativeDecisionOsConfig = await import("@/lib/creative-decision-os-config");
const creativeDecisionOsSource = await import("@/lib/creative-decision-os-source");
const decisionOsConfig = await import("@/lib/meta/decision-os-config");
const decisionOsSource = await import("@/lib/meta/decision-os-source");
const metaRecommendations = await import("@/lib/meta/recommendations");
const requestLanguage = await import("@/lib/request-language");
const configSnapshots = await import("@/lib/meta/config-snapshots");

describe("GET /api/meta/recommendations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(access.requireBusinessAccess).mockResolvedValue({
      session: {} as never,
      membership: {} as never,
    });
    vi.mocked(businessMode.isDemoBusiness).mockResolvedValue(false);
    vi.mocked(requestLanguage.resolveRequestLanguage).mockResolvedValue("en");
    vi.mocked(decisionOsConfig.isMetaDecisionOsV1EnabledForBusiness).mockReturnValue(false);
    vi.mocked(creativeDecisionOsConfig.isCreativeDecisionOsV1EnabledForBusiness).mockReturnValue(false);
    vi.mocked(configSnapshots.readMetaBidRegimeHistorySummaries).mockResolvedValue(new Map());
  });

  afterEach(() => {
  });

  it("loads creative scoring from the score snapshot service without creative history fanout", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/meta/recommendations?businessId=biz&startDate=2026-03-01&endDate=2026-03-31"
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("ok");
    assertMetaRecommendationsPageContract(payload);
    expect(payload.analysisSource).toEqual({
      system: "snapshot_fallback",
      decisionOsAvailable: false,
      fallbackReason: "decision_os_feature_disabled",
    });
    expect(payload.businessId).toBe("biz");
    expect(payload.startDate).toBe("2026-03-01");
    expect(payload.endDate).toBe("2026-03-31");
    expect(campaignsSource.getMetaCampaignsForRange).toHaveBeenCalled();
    expect(breakdownsSource.getMetaBreakdownsForRange).toHaveBeenCalled();
    expect(decisionOsSource.getMetaDecisionOsForRange).not.toHaveBeenCalled();
  });

  it("labels Decision OS recommendations when the unified path succeeds", async () => {
    vi.mocked(decisionOsConfig.isMetaDecisionOsV1EnabledForBusiness).mockReturnValue(true);
    vi.mocked(decisionOsSource.getMetaDecisionOsForRange).mockResolvedValue({
      contractVersion: "meta-decision-os.v1",
      businessId: "biz",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    } as never);

    const response = await GET(
      new NextRequest(
        "http://localhost/api/meta/recommendations?businessId=biz&startDate=2026-03-01&endDate=2026-03-31&analyticsStartDate=2026-02-01&analyticsEndDate=2026-02-28&decisionAsOf=2026-04-10"
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.analysisSource).toEqual({
      system: "decision_os",
      decisionOsAvailable: true,
    });
    expect(payload.sourceModel).toBe("decision_os_unified");
    expect(payload.businessId).toBe("biz");
    expect(payload.startDate).toBe("2026-03-01");
    expect(payload.endDate).toBe("2026-03-31");
    expect(decisionOsSource.getMetaDecisionOsForRange).toHaveBeenCalledWith({
      businessId: "biz",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      analyticsStartDate: "2026-02-01",
      analyticsEndDate: "2026-02-28",
      decisionAsOf: "2026-04-10",
    });
    expect(metaRecommendations.buildMetaRecommendationsFromDecisionOs).toHaveBeenCalled();
    expect(campaignsSource.getMetaCampaignsForRange).not.toHaveBeenCalled();
  });

  it("passes decision timing and explicit benchmark scope into Creative linkage when enabled", async () => {
    vi.mocked(decisionOsConfig.isMetaDecisionOsV1EnabledForBusiness).mockReturnValue(true);
    vi.mocked(creativeDecisionOsConfig.isCreativeDecisionOsV1EnabledForBusiness).mockReturnValue(true);
    vi.mocked(decisionOsSource.getMetaDecisionOsForRange).mockResolvedValue({
      contractVersion: "meta-decision-os.v1",
      businessId: "biz",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      campaigns: [],
      opportunityBoard: [],
    } as never);
    vi.mocked(creativeDecisionOsSource.getCreativeDecisionOsForRange).mockResolvedValue({
      contractVersion: "creative-decision-os.v1",
      creatives: [],
    } as never);

    const response = await GET(
      new NextRequest(
        "http://localhost/api/meta/recommendations?businessId=biz&startDate=2026-03-01&endDate=2026-03-31&analyticsStartDate=2026-02-01&analyticsEndDate=2026-02-28&decisionAsOf=2026-04-10&benchmarkScope=campaign&benchmarkScopeId=cmp_1&benchmarkScopeLabel=Campaign%201",
      ),
    );

    expect(response.status).toBe(200);
    expect(creativeDecisionOsSource.getCreativeDecisionOsForRange).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz",
        startDate: "2026-03-01",
        endDate: "2026-03-31",
        analyticsStartDate: "2026-02-01",
        analyticsEndDate: "2026-02-28",
        decisionAsOf: "2026-04-10",
        benchmarkScope: {
          scope: "campaign",
          scopeId: "cmp_1",
          scopeLabel: "Campaign 1",
        },
      }),
    );
  });

  it("preserves upstream Decision OS range metadata instead of relabeling stale recommendations", async () => {
    vi.mocked(decisionOsConfig.isMetaDecisionOsV1EnabledForBusiness).mockReturnValue(true);
    vi.mocked(decisionOsSource.getMetaDecisionOsForRange).mockResolvedValue({
      contractVersion: "meta-decision-os.v1",
      businessId: "previous-biz",
      startDate: "2026-02-01",
      endDate: "2026-02-28",
    } as never);

    const response = await GET(
      new NextRequest(
        "http://localhost/api/meta/recommendations?businessId=biz&startDate=2026-03-01&endDate=2026-03-31"
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.analysisSource).toEqual({
      system: "decision_os",
      decisionOsAvailable: true,
    });
    expect(payload.businessId).toBe("previous-biz");
    expect(payload.startDate).toBe("2026-02-01");
    expect(payload.endDate).toBe("2026-02-28");
  });

  it("keeps the intentional snapshot-backed bid regime analysis path", async () => {
    await GET(
      new NextRequest(
        "http://localhost/api/meta/recommendations?businessId=biz&startDate=2026-03-01&endDate=2026-03-31"
      )
    );

    expect(configSnapshots.readMetaBidRegimeHistorySummaries).toHaveBeenCalledTimes(1);
    expect(configSnapshots.readMetaBidRegimeHistorySummaries).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz",
        entityLevel: "campaign",
      })
    );
  });
});
