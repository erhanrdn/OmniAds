import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/meta/campaigns/route";

vi.mock("@/lib/business-mode.server", () => ({
  isDemoBusiness: vi.fn(),
}));

vi.mock("@/lib/access", () => ({
  requireBusinessAccess: vi.fn(),
}));

vi.mock("@/lib/integrations", () => ({
  getIntegration: vi.fn(),
}));

vi.mock("@/lib/provider-account-assignments", () => ({
  getProviderAccountAssignments: vi.fn(),
}));

vi.mock("@/lib/meta/readiness", () => ({
  getMetaPartialReason: vi.fn(),
  getMetaRangePreparationContext: vi.fn(),
}));

vi.mock("@/lib/meta/serving", () => ({
  getMetaWarehouseCampaignTable: vi.fn(),
}));

const businessMode = await import("@/lib/business-mode.server");
const access = await import("@/lib/access");
const integrations = await import("@/lib/integrations");
const assignments = await import("@/lib/provider-account-assignments");
const readiness = await import("@/lib/meta/readiness");
const serving = await import("@/lib/meta/serving");

describe("GET /api/meta/campaigns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(access.requireBusinessAccess).mockResolvedValue({
      session: {} as never,
      membership: {} as never,
    });
    vi.mocked(businessMode.isDemoBusiness).mockResolvedValue(false);
    vi.mocked(assignments.getProviderAccountAssignments).mockResolvedValue({
      id: "1",
      business_id: "biz",
      provider: "meta",
      account_ids: ["act_1"],
      created_at: "",
      updated_at: "",
    });
    vi.mocked(readiness.getMetaRangePreparationContext).mockResolvedValue({
      isSelectedCurrentDay: false,
      currentDateInTimezone: "2026-03-31",
      primaryAccountTimezone: "UTC",
    });
  });

  it("serves warehouse-backed historical data even without a live access token", async () => {
    vi.mocked(integrations.getIntegration).mockResolvedValue({
      id: "int_1",
      business_id: "biz",
      provider: "meta",
      status: "connected",
      provider_account_id: "act_1",
      provider_account_name: "Main",
      access_token: null,
      refresh_token: null,
      token_expires_at: null,
      scopes: null,
      error_message: null,
      metadata: {},
      connected_at: null,
      disconnected_at: null,
      created_at: "",
      updated_at: "",
    });
    vi.mocked(serving.getMetaWarehouseCampaignTable).mockResolvedValue([
      {
        id: "cmp_1",
        accountId: "act_1",
        name: "Campaign 1",
        status: "ACTIVE",
      },
    ] as never);

    const response = await GET(
      new NextRequest(
        "http://localhost/api/meta/campaigns?businessId=biz&startDate=2026-03-01&endDate=2026-03-15"
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("ok");
    expect(payload.rows).toHaveLength(1);
  });
});
