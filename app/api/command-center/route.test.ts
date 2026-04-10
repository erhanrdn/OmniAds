import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/access", () => ({
  requireBusinessAccess: vi.fn(),
}));

vi.mock("@/lib/command-center-config", () => ({
  isCommandCenterV1EnabledForBusiness: vi.fn(),
}));

vi.mock("@/lib/command-center-service", () => ({
  getCommandCenterSnapshot: vi.fn(),
}));

vi.mock("@/lib/command-center-store", () => ({
  getCommandCenterPermissions: vi.fn(),
}));

const access = await import("@/lib/access");
const config = await import("@/lib/command-center-config");
const service = await import("@/lib/command-center-service");
const store = await import("@/lib/command-center-store");
const { GET } = await import("@/app/api/command-center/route");

describe("GET /api/command-center", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(access.requireBusinessAccess).mockResolvedValue({
      session: {
        user: {
          id: "user_1",
          email: "operator@adsecute.com",
        },
      } as never,
      membership: {
        role: "collaborator",
      } as never,
    });
    vi.mocked(config.isCommandCenterV1EnabledForBusiness).mockReturnValue(true);
    vi.mocked(store.getCommandCenterPermissions).mockReturnValue({
      canEdit: true,
      reason: null,
      role: "collaborator",
    });
    vi.mocked(service.getCommandCenterSnapshot).mockResolvedValue({
      contractVersion: "command-center.v1",
      generatedAt: "2026-04-11T00:00:00.000Z",
      businessId: "biz",
      startDate: "2026-04-01",
      endDate: "2026-04-10",
      activeViewKey: "today_priorities",
      permissions: {
        canEdit: true,
        reason: null,
        role: "collaborator",
      },
      summary: {
        totalActions: 3,
        pendingCount: 2,
        approvedCount: 1,
        rejectedCount: 0,
        snoozedCount: 0,
        assignedCount: 1,
        watchlistCount: 1,
      },
      actions: [],
      savedViews: [],
      journal: [],
      handoffs: [],
      assignableUsers: [],
    } as never);
  });

  it("returns the typed command center payload", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/command-center?businessId=biz&startDate=2026-04-01&endDate=2026-04-10&viewKey=today_priorities",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.contractVersion).toBe("command-center.v1");
    expect(service.getCommandCenterSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz",
        startDate: "2026-04-01",
        endDate: "2026-04-10",
        activeViewKey: "today_priorities",
      }),
    );
  });

  it("returns 404 when the feature gate is disabled", async () => {
    vi.mocked(config.isCommandCenterV1EnabledForBusiness).mockReturnValue(false);

    const response = await GET(
      new NextRequest("http://localhost/api/command-center?businessId=biz"),
    );
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toBe("command_center_disabled");
  });
});
