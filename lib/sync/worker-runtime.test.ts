import { describe, expect, it } from "vitest";
import {
  buildProviderHeartbeatWorkerId,
  prioritizeBusinessesForAdapter,
} from "@/lib/sync/worker-runtime";

describe("prioritizeBusinessesForAdapter", () => {
  const businesses = [
    { id: "biz-1", name: "One" },
    { id: "biz-2", name: "Two" },
    { id: "biz-3", name: "Three" },
  ];

  it("prioritizes meta businesses from META_DEBUG_PRIORITY_BUSINESS_IDS", () => {
    const previous = process.env.META_DEBUG_PRIORITY_BUSINESS_IDS;
    process.env.META_DEBUG_PRIORITY_BUSINESS_IDS = "biz-3,biz-1";
    const result = prioritizeBusinessesForAdapter("meta", businesses);
    expect(result.map((row) => row.id)).toEqual(["biz-3", "biz-1", "biz-2"]);
    process.env.META_DEBUG_PRIORITY_BUSINESS_IDS = previous;
  });

  it("keeps other providers in original order without matching debug ids", () => {
    const result = prioritizeBusinessesForAdapter("other", businesses);
    expect(result.map((row) => row.id)).toEqual(["biz-1", "biz-2", "biz-3"]);
  });
});

describe("buildProviderHeartbeatWorkerId", () => {
  it("keeps the base worker id for all-scope heartbeats", () => {
    expect(buildProviderHeartbeatWorkerId("worker-1", "all")).toBe("worker-1");
  });

  it("suffixes provider-specific heartbeats", () => {
    expect(buildProviderHeartbeatWorkerId("worker-1", "meta")).toBe("worker-1:meta");
    expect(buildProviderHeartbeatWorkerId("worker-1", "google_ads")).toBe("worker-1:google_ads");
  });
});
