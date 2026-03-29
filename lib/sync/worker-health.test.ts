import { describe, expect, it } from "vitest";
import { selectProviderWorkerForBusiness } from "@/lib/sync/worker-health";

describe("selectProviderWorkerForBusiness", () => {
  it("prefers the active lease owner when available", () => {
    const worker = selectProviderWorkerForBusiness({
      businessId: "grandmix",
      activeLeaseOwner: "worker-2",
      workers: [
        {
          workerId: "worker-1",
          lastBusinessId: "other-biz",
          lastConsumedBusinessId: "other-biz",
          metaJson: { currentBusinessId: "other-biz" },
        },
        {
          workerId: "worker-2",
          lastBusinessId: "grandmix",
          lastConsumedBusinessId: "grandmix",
          metaJson: { currentBusinessId: "grandmix" },
        },
      ],
    });

    expect(worker?.workerId).toBe("worker-2");
  });

  it("falls back to current or batched business matches before the newest unrelated worker", () => {
    const worker = selectProviderWorkerForBusiness({
      businessId: "grandmix",
      workers: [
        {
          workerId: "worker-1",
          lastBusinessId: "other-biz",
          lastConsumedBusinessId: "other-biz",
          metaJson: { currentBusinessId: "other-biz" },
        },
        {
          workerId: "worker-2",
          lastBusinessId: "another-biz",
          lastConsumedBusinessId: "another-biz",
          metaJson: { batchBusinessIds: ["foo", "grandmix", "bar"] },
        },
      ],
    });

    expect(worker?.workerId).toBe("worker-2");
  });
});
