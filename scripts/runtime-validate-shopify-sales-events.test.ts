import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getIntegrationMock,
  getReportingDateRangeKeyMock,
  getShopifySyncStateMock,
} = vi.hoisted(() => ({
  getIntegrationMock: vi.fn(),
  getReportingDateRangeKeyMock: vi.fn(),
  getShopifySyncStateMock: vi.fn(),
}));

vi.mock("@/lib/integrations", () => ({
  getIntegration: getIntegrationMock,
}));

vi.mock("@/lib/reporting-cache", () => ({
  getReportingDateRangeKey: getReportingDateRangeKeyMock,
}));

vi.mock("@/lib/shopify/sync-state", () => ({
  getShopifySyncState: getShopifySyncStateMock,
}));

import {
  parseRuntimeValidateShopifySalesEventsArgs,
  resolveValidationWindow,
} from "@/scripts/runtime-validate-shopify-sales-events";

describe("runtime validate shopify sales events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getReportingDateRangeKeyMock.mockImplementation((startDate: string, endDate: string) =>
      `${startDate}:${endDate}`,
    );
  });

  it("parses required cli args", () => {
    expect(
      parseRuntimeValidateShopifySalesEventsArgs([
        "biz-1",
        "--recent-targets=both",
        "--materialize=1",
        "--use-runner-lease=0",
        "--poll-seconds=15",
        "--base-wait-seconds=180",
        "--extended-wait-seconds=480",
      ]),
    ).toEqual({
      businessId: "biz-1",
      recentTargets: "both",
      materializeOverviewState: true,
      useRunnerLease: false,
      pollSeconds: 15,
      baseWaitSeconds: 180,
      extendedWaitSeconds: 480,
    });
  });

  it("resolves the latest fully synced recent Shopify window", async () => {
    getIntegrationMock.mockResolvedValue({
      status: "connected",
      provider_account_id: "shop-1",
    });
    getShopifySyncStateMock
      .mockResolvedValueOnce({
        latestSyncWindowStart: "2026-04-12",
        latestSyncWindowEnd: "2026-04-18",
        readyThroughDate: "2026-04-18",
      })
      .mockResolvedValueOnce({
        latestSyncWindowStart: "2026-04-12",
        latestSyncWindowEnd: "2026-04-18",
        readyThroughDate: "2026-04-18",
      });

    await expect(
      resolveValidationWindow({
        businessId: "biz-1",
        recentTargets: { orders: true, returns: true },
      }),
    ).resolves.toEqual({
      providerAccountId: "shop-1",
      startDate: "2026-04-12",
      endDate: "2026-04-18",
      providerDateRangeKey: "2026-04-12:2026-04-18",
    });

    expect(getShopifySyncStateMock).toHaveBeenCalledTimes(2);
    expect(getShopifySyncStateMock).toHaveBeenNthCalledWith(1, {
      businessId: "biz-1",
      providerAccountId: "shop-1",
      syncTarget: "commerce_orders_recent",
    });
    expect(getShopifySyncStateMock).toHaveBeenNthCalledWith(2, {
      businessId: "biz-1",
      providerAccountId: "shop-1",
      syncTarget: "commerce_returns_recent",
    });
  });

  it("falls back to the trailing 7-day window when order start is unavailable", async () => {
    getIntegrationMock.mockResolvedValue({
      status: "connected",
      provider_account_id: "shop-1",
    });
    getShopifySyncStateMock
      .mockResolvedValueOnce({
        latestSyncWindowStart: null,
        latestSyncWindowEnd: "2026-04-18",
        readyThroughDate: "2026-04-18",
      })
      .mockResolvedValueOnce({
        latestSyncWindowStart: "2026-04-12",
        latestSyncWindowEnd: "2026-04-18",
        readyThroughDate: "2026-04-18",
      });

    await expect(
      resolveValidationWindow({
        businessId: "biz-1",
        recentTargets: { orders: true, returns: true },
      }),
    ).resolves.toEqual({
      providerAccountId: "shop-1",
      startDate: "2026-04-12",
      endDate: "2026-04-18",
      providerDateRangeKey: "2026-04-12:2026-04-18",
    });
  });
});
