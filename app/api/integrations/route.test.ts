import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { GET } from "@/app/api/integrations/route";

vi.mock("@/lib/access", () => ({
  requireBusinessAccess: vi.fn(),
}));

vi.mock("@/lib/business-mode.server", () => ({
  isDemoBusiness: vi.fn(),
}));

vi.mock("@/lib/integrations", () => ({
  getIntegrationMetadata: vi.fn(),
  getIntegrationsMetadataByBusiness: vi.fn(),
  disconnectIntegration: vi.fn(),
}));

const access = await import("@/lib/access");
const businessMode = await import("@/lib/business-mode.server");
const integrations = await import("@/lib/integrations");

describe("GET /api/integrations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(access.requireBusinessAccess).mockResolvedValue({
      session: {} as never,
      membership: {} as never,
    });
    vi.mocked(businessMode.isDemoBusiness).mockResolvedValue(false);
  });

  it("returns metadata rows without exposing token values", async () => {
    vi.mocked(integrations.getIntegrationsMetadataByBusiness).mockResolvedValue([
      {
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
      },
    ]);

    const response = await GET(
      new NextRequest("http://localhost/api/integrations?businessId=biz")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.integrations[0].access_token).toBeNull();
    expect(payload.integrations[0].refresh_token).toBeNull();
  });
});
