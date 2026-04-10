import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/ai/creatives/commentary/route";

const createCompletion = vi.fn();

vi.mock("@/lib/access", () => ({
  requireBusinessAccess: vi.fn(),
}));

vi.mock("@/lib/openai", () => ({
  getOpenAI: () => ({
    chat: {
      completions: {
        create: createCompletion,
      },
    },
  }),
}));

vi.mock("@/lib/demo-business", () => ({
  isDemoBusinessId: vi.fn(() => false),
  getDemoAiCreativeCommentary: vi.fn(() => ({
    headline: "Demo",
    summary: "Demo",
    opportunities: ["One", "Two"],
    risks: ["One", "Two"],
    nextActions: ["One", "Two", "Three"],
  })),
}));

vi.mock("@/lib/request-language", () => ({
  resolveRequestLanguage: vi.fn(() => "en"),
}));

const access = await import("@/lib/access");

function buildRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/ai/creatives/commentary", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ai/creatives/commentary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(access.requireBusinessAccess).mockResolvedValue({
      session: {} as never,
      membership: { businessId: "biz_1" } as never,
    });
  });

  it("rejects invalid rule reports", async () => {
    const response = await POST(
      buildRequest({
        businessId: "biz_1",
        currency: "USD",
        report: { creativeId: "creative_1" },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
    expect(payload.error).toBe("invalid_report");
  });

  it("passes the richer deterministic report to AI commentary and normalizes the response", async () => {
    createCompletion.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              headline: "Ready to scale",
              summary: "Winner family is strong, but fatigue risk is emerging.",
              opportunities: ["Scale into the matching lane", "Keep a challenger live"],
              risks: ["Watch fatigue on CTR", "Commercial guardrails may tighten"],
              nextActions: [
                "Promote it into scaling",
                "Keep one validation challenger active",
                "Recheck fatigue in 72 hours",
              ],
            }),
          },
        },
      ],
    });

    const response = await POST(
      buildRequest({
        businessId: "biz_1",
        currency: "USD",
        report: {
          creativeId: "creative_1",
          creativeName: "Hero creative",
          action: "scale",
          lifecycleState: "emerging_winner",
          score: 82,
          confidence: 0.78,
          summary: "Deterministic engine sees this as scale-ready.",
          accountContext: {
            roasAvg: 2.1,
            cpaAvg: 38,
            ctrAvg: 1.2,
            spendMedian: 120,
            spendP20: 60,
            spendP80: 240,
          },
          timeframeContext: {
            coreVerdict: "Current window is stronger than the chosen cohort.",
            selectedRangeOverlay: "Selected range remains healthy.",
            historicalSupport: "Historical support is present.",
          },
          factors: [
            {
              label: "ROAS benchmark",
              impact: "positive",
              value: "3.1x",
              reason: "ROAS is stronger than the contextual cohort.",
            },
            {
              label: "Fatigue engine",
              impact: "negative",
              value: "watch",
              reason: "CTR decay is starting to show up.",
            },
          ],
          family: {
            familyId: "family_1",
            familyLabel: "Hero family",
            familySource: "story_identity",
            memberCount: 2,
          },
          benchmark: {
            selectedCohort: "family",
            selectedCohortLabel: "Family",
            sampleSize: 2,
            fallbackChain: ["family"],
            missingContext: [],
            metrics: {
              roas: { current: 3.1, benchmark: 2.2, deltaPct: 0.4091, status: "better" },
              cpa: { current: 24, benchmark: 31, deltaPct: -0.2258, status: "better" },
              ctr: { current: 1.9, benchmark: 1.4, deltaPct: 0.3571, status: "better" },
              clickToPurchase: { current: 2.2, benchmark: 1.8, deltaPct: 0.2222, status: "better" },
              attention: {
                label: "Thumbstop",
                current: 31,
                benchmark: 24,
                deltaPct: 0.2917,
                status: "better",
              },
            },
          },
          fatigue: {
            status: "watch",
            confidence: 0.66,
            ctrDecay: 0.19,
            clickToPurchaseDecay: 0.08,
            roasDecay: 0.11,
            spendConcentration: 0.58,
            frequencyPressure: 2.1,
            winnerMemory: true,
            evidence: ["CTR decay 19% vs prior winner window."],
            missingContext: [],
          },
          deployment: {
            metaFamily: "purchase_value",
            metaFamilyLabel: "Purchase Value",
            targetLane: "Scaling",
            targetAdSetRole: "scaling_hero",
            preferredCampaignIds: ["cmp_1"],
            preferredCampaignNames: ["Scaling campaign"],
            preferredAdSetIds: ["adset_1"],
            preferredAdSetNames: ["Scaling ad set"],
            geoContext: "scale",
            constraints: ["Watch fatigue before aggressive budget moves."],
            whatWouldChangeThisDecision: ["If ROAS drops below cohort for 3 days, pull it back to validation."],
          },
          deterministicDecision: {
            lifecycleState: "scale_ready",
            primaryAction: "promote_to_scaling",
            legacyAction: "scale",
          },
          commercialContext: {
            operatingMode: "Scale",
            confidence: 0.81,
            missingInputs: [],
          },
          pattern: {
            hook: "travel",
            angle: "utility",
            format: "video",
          },
        },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.source).toBe("ai");
    expect(payload.commentary.headline).toBe("Ready to scale");
    expect(createCompletion).toHaveBeenCalledTimes(1);

    const requestPayload = createCompletion.mock.calls[0]?.[0];
    const userMessage = requestPayload?.messages?.[1]?.content;
    expect(userMessage).toContain("\"family\"");
    expect(userMessage).toContain("\"deployment\"");
    expect(userMessage).toContain("\"deterministicDecision\"");
    expect(userMessage).toContain("\"commercialContext\"");
  });
});
