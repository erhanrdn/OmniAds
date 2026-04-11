import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/access", () => ({
  requireBusinessAccess: vi.fn(),
}));

vi.mock("@/lib/business-commercial", () => ({
  getBusinessCommercialTruthSnapshot: vi.fn(),
}));

vi.mock("@/lib/business-operating-mode", () => ({
  buildAccountOperatingMode: vi.fn(),
}));

vi.mock("@/lib/meta/operator-decision-source", () => ({
  getMetaDecisionWindowContext: vi.fn(),
  getMetaDecisionSourceSnapshot: vi.fn(),
}));

const access = await import("@/lib/access");
const commercialTruth = await import("@/lib/business-commercial");
const operatingMode = await import("@/lib/business-operating-mode");
const decisionWindowSource = await import("@/lib/meta/operator-decision-source");
const { GET } = await import("@/app/api/business-operating-mode/route");

describe("GET /api/business-operating-mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(access.requireBusinessAccess).mockResolvedValue({
      session: {} as never,
      membership: {} as never,
    });
    vi.mocked(commercialTruth.getBusinessCommercialTruthSnapshot).mockResolvedValue({
      businessId: "biz",
    } as never);
    vi.mocked(decisionWindowSource.getMetaDecisionWindowContext).mockResolvedValue({
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
    } as never);
    vi.mocked(decisionWindowSource.getMetaDecisionSourceSnapshot).mockResolvedValue({
      campaigns: {
        rows: [{ id: "cmp_1" }],
      },
      breakdowns: {
        location: [],
      },
      adSets: {
        rows: [],
      },
    } as never);
    vi.mocked(operatingMode.buildAccountOperatingMode).mockReturnValue({
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
      confidence: 0.5,
      why: ["Low signal"],
      guardrails: [],
      changeTriggers: [],
      activeCommercialInputs: [],
      platformInputs: [],
      missingInputs: ["Target pack is not configured yet."],
    } as never);
  });

  it("builds an operating-mode payload from commercial truth and Meta route inputs", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/business-operating-mode?businessId=biz&startDate=2026-04-01&endDate=2026-04-10",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.recommendedMode).toBe("Explore");
    expect(operatingMode.buildAccountOperatingMode).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz",
        startDate: "2026-04-01",
        endDate: "2026-04-10",
        decisionAsOf: "2026-04-10",
        campaigns: expect.objectContaining({
          rows: expect.any(Array),
        }),
      }),
    );
  });

  it("uses direct Meta sources instead of internal HTTP fetches", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const response = await GET(
      new NextRequest("http://localhost/api/business-operating-mode?businessId=biz"),
    );

    expect(response.status).toBe(200);
    expect(decisionWindowSource.getMetaDecisionSourceSnapshot).toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
