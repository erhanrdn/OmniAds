import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/access", () => ({
  requireBusinessAccess: vi.fn(),
}));

vi.mock("@/lib/business-mode.server", () => ({
  isDemoBusiness: vi.fn(),
}));

vi.mock("@/lib/google-ads/action-clusters", () => ({
  executeActionCluster: vi.fn(),
  rollbackActionCluster: vi.fn(),
}));

vi.mock("@/lib/google-ads/advisor-memory", () => ({
  getAdvisorExecutionCalibration: vi.fn(),
  logAdvisorExecutionEvent: vi.fn(),
  recordAdvisorOutcome: vi.fn(),
  updateAdvisorCompletionState: vi.fn(),
  updateAdvisorExecutionState: vi.fn(),
  updateAdvisorMemoryAction: vi.fn(),
}));

vi.mock("@/lib/google-ads/advisor-mutate", () => ({
  executeAdvisorMutation: vi.fn(),
  preflightAdvisorMutation: vi.fn(),
  rollbackAdvisorMutation: vi.fn(),
}));

vi.mock("@/lib/google-ads/search-intelligence-storage", () => ({
  appendGoogleAdsDecisionActionOutcomeLog: vi.fn(async () => undefined),
}));

const access = await import("@/lib/access");
const businessMode = await import("@/lib/business-mode.server");
const advisorMemory = await import("@/lib/google-ads/advisor-memory");
const advisorMutate = await import("@/lib/google-ads/advisor-mutate");
const { POST } = await import("@/app/api/google-ads/advisor-memory/route");

describe("POST /api/google-ads/advisor-memory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("GOOGLE_ADS_DECISION_ENGINE_V2", "true");
    vi.stubEnv("GOOGLE_ADS_WRITEBACK_ENABLED", "false");
    vi.mocked(access.requireBusinessAccess).mockResolvedValue({
      session: {} as never,
      membership: {} as never,
    });
    vi.mocked(businessMode.isDemoBusiness).mockResolvedValue(false);
  });

  it("blocks write-back execution when the explicit capability gate is disabled", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/google-ads/advisor-memory", {
        method: "POST",
        body: JSON.stringify({
          businessId: "biz",
          accountId: "acc_1",
          recommendationFingerprint: "fp_1",
          executionAction: "apply_mutate",
          mutateActionType: "add_negative_keyword",
          mutatePayloadPreview: { adGroupId: "ag_1", text: "free" },
        }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toContain("write-back is disabled");
    expect(payload.capabilityGate).toMatchObject({
      enabled: false,
      mutateEnabled: false,
      rollbackEnabled: false,
      clusterExecutionEnabled: false,
    });
    expect(vi.mocked(advisorMutate.preflightAdvisorMutation)).not.toHaveBeenCalled();
    expect(vi.mocked(advisorMutate.executeAdvisorMutation)).not.toHaveBeenCalled();
  });

  it("records a manual outcome without requiring write-back capability", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/google-ads/advisor-memory", {
        method: "POST",
        body: JSON.stringify({
          businessId: "biz",
          accountId: "all",
          recommendationFingerprint: "fp_2",
          executionAction: "record_outcome",
          outcomeVerdict: "improved",
          outcomeMetric: "manual_validation",
          outcomeDelta: -3,
          outcomeConfidence: "medium",
        }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ ok: true });
    expect(vi.mocked(advisorMemory.recordAdvisorOutcome)).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz",
        accountId: "all",
        recommendationFingerprint: "fp_2",
        verdict: "improved",
        metric: "manual_validation",
        delta: -3,
      })
    );
  });
});
