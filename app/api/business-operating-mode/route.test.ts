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

const access = await import("@/lib/access");
const commercialTruth = await import("@/lib/business-commercial");
const operatingMode = await import("@/lib/business-operating-mode");
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
    vi.mocked(operatingMode.buildAccountOperatingMode).mockReturnValue({
      businessId: "biz",
      startDate: "2026-04-01",
      endDate: "2026-04-10",
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
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = new URL(typeof input === "string" ? input : input.toString());
        if (url.pathname === "/api/meta/campaigns") {
          return new Response(JSON.stringify({ rows: [{ id: "cmp_1" }] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (url.pathname === "/api/meta/breakdowns") {
          return new Response(JSON.stringify({ location: [] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response("not found", { status: 404 });
      }),
    );
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
        campaigns: expect.objectContaining({
          rows: expect.any(Array),
        }),
      }),
    );
  });

  it("soft-fails internal Meta fetches instead of throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("unavailable", { status: 500 })),
    );

    const response = await GET(
      new NextRequest("http://localhost/api/business-operating-mode?businessId=biz"),
    );

    expect(response.status).toBe(200);
    expect(operatingMode.buildAccountOperatingMode).toHaveBeenCalledWith(
      expect.objectContaining({
        campaigns: null,
        breakdowns: null,
      }),
    );
  });
});
