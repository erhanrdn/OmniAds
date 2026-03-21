import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveProviderDiscoveryPayload } from "@/lib/provider-account-discovery";
import * as assignments from "@/lib/provider-account-assignments";
import * as snapshots from "@/lib/provider-account-snapshots";

vi.mock("@/lib/provider-account-assignments", () => ({
  getProviderAccountAssignments: vi.fn(),
}));

vi.mock("@/lib/provider-account-snapshots", () => ({
  readProviderAccountSnapshot: vi.fn(),
  requestProviderAccountSnapshotRefresh: vi.fn(),
  forceProviderAccountSnapshotRefresh: vi.fn(),
}));

describe("resolveProviderDiscoveryPayload", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns snapshot data immediately and schedules a background refresh when stale", async () => {
    vi.mocked(assignments.getProviderAccountAssignments).mockResolvedValue({
      id: "1",
      business_id: "biz",
      provider: "google",
      account_ids: ["123"],
      created_at: "",
      updated_at: "",
    });
    vi.mocked(snapshots.readProviderAccountSnapshot).mockResolvedValue({
      accounts: [{ id: "123", name: "Main account" }],
      meta: {
        source: "snapshot",
        fetchedAt: "2026-03-21T10:00:00.000Z",
        stale: true,
        refreshFailed: false,
        lastError: null,
        lastKnownGoodAvailable: true,
        refreshRequestedAt: null,
        lastRefreshAttemptAt: null,
        nextRefreshAfter: null,
        refreshInProgress: false,
        sourceReason: "stale_snapshot_refresh",
      },
    });
    vi.mocked(snapshots.requestProviderAccountSnapshotRefresh).mockResolvedValue(null);

    const payload = await resolveProviderDiscoveryPayload({
      businessId: "biz",
      provider: "google",
      refreshRequested: false,
      liveLoader: vi.fn(),
      missingSnapshotNotice: "missing",
      degradedNotice: "degraded",
      unavailableNotice: "unavailable",
    });

    expect(payload.data).toEqual([{ id: "123", name: "Main account", assigned: true }]);
    expect(payload.notice).toBe("degraded");
    expect(snapshots.requestProviderAccountSnapshotRefresh).toHaveBeenCalledTimes(1);
  });

  it("returns empty terminal payload and schedules refresh when no snapshot exists", async () => {
    vi.mocked(assignments.getProviderAccountAssignments).mockResolvedValue(null);
    vi.mocked(snapshots.readProviderAccountSnapshot).mockResolvedValue(null);
    vi.mocked(snapshots.requestProviderAccountSnapshotRefresh).mockResolvedValue(null);

    const payload = await resolveProviderDiscoveryPayload({
      businessId: "biz",
      provider: "meta",
      refreshRequested: false,
      liveLoader: vi.fn(),
      missingSnapshotNotice: "missing",
      degradedNotice: "degraded",
      unavailableNotice: "unavailable",
    });

    expect(payload.data).toEqual([]);
    expect(payload.notice).toBe("unavailable");
    expect(payload.meta.stale).toBe(true);
    expect(payload.meta.lastKnownGoodAvailable).toBe(false);
    expect(snapshots.requestProviderAccountSnapshotRefresh).toHaveBeenCalledTimes(1);
  });

  it("forces live refresh only for explicit refresh requests", async () => {
    vi.mocked(assignments.getProviderAccountAssignments).mockResolvedValue(null);
    vi.mocked(snapshots.forceProviderAccountSnapshotRefresh).mockResolvedValue({
      accounts: [{ id: "act_1", name: "Account 1" }],
      meta: {
        source: "live",
        fetchedAt: "2026-03-21T10:00:00.000Z",
        stale: false,
        refreshFailed: false,
        lastError: null,
        lastKnownGoodAvailable: true,
        refreshRequestedAt: null,
        lastRefreshAttemptAt: null,
        nextRefreshAfter: null,
        refreshInProgress: false,
        sourceReason: "manual_refresh",
      },
    });

    const payload = await resolveProviderDiscoveryPayload({
      businessId: "biz",
      provider: "meta",
      refreshRequested: true,
      liveLoader: vi.fn(),
      missingSnapshotNotice: "missing",
      degradedNotice: "degraded",
      unavailableNotice: "unavailable",
    });

    expect(payload.data).toEqual([{ id: "act_1", name: "Account 1", assigned: false }]);
    expect(snapshots.forceProviderAccountSnapshotRefresh).toHaveBeenCalledTimes(1);
    expect(snapshots.requestProviderAccountSnapshotRefresh).not.toHaveBeenCalled();
  });
});
