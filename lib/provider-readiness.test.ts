import { describe, expect, it } from "vitest";
import { buildProviderStateContract } from "@/lib/provider-readiness";

describe("buildProviderStateContract", () => {
  it("treats disconnected historical warehouse data as warehouse_only", () => {
    expect(
      buildProviderStateContract({
        credentialState: "not_connected",
        hasAssignedAccounts: true,
        warehouseRowCount: 10,
        warehousePartial: false,
        syncState: "ready",
        selectedCurrentDay: false,
      })
    ).toMatchObject({
      warehouseState: "ready",
      servingMode: "warehouse_only",
      isPartial: false,
    });
  });

  it("treats missing assignments as unavailable and partial", () => {
    expect(
      buildProviderStateContract({
        credentialState: "connected",
        hasAssignedAccounts: false,
        warehouseRowCount: 0,
        warehousePartial: false,
        syncState: "connected_no_assignment",
      })
    ).toMatchObject({
      assignmentState: "unassigned",
      servingMode: "unavailable",
      isPartial: true,
    });
  });

  it("uses live overlay mode only for current-day connected serving", () => {
    expect(
      buildProviderStateContract({
        credentialState: "connected",
        hasAssignedAccounts: true,
        warehouseRowCount: 2,
        warehousePartial: true,
        syncState: "syncing",
        selectedCurrentDay: true,
      })
    ).toMatchObject({
      servingMode: "warehouse_with_live_overlay",
      warehouseState: "partial",
      isPartial: true,
    });
  });

  it("keeps warehouse state ready even when sync state is stale", () => {
    expect(
      buildProviderStateContract({
        credentialState: "connected",
        hasAssignedAccounts: true,
        warehouseRowCount: 25,
        warehousePartial: false,
        syncState: "stale",
        selectedCurrentDay: false,
      })
    ).toMatchObject({
      warehouseState: "ready",
      syncState: "stale",
      servingMode: "warehouse_only",
      isPartial: false,
    });
  });
});
