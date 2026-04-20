import { describe, expect, it } from "vitest";
import { buildGoogleAdsReleaseReadinessCandidate } from "@/lib/google-ads/control-plane";

describe("google ads control plane helper", () => {
  it("returns null when google is disconnected", () => {
    expect(
      buildGoogleAdsReleaseReadinessCandidate({
        connected: false,
        assignedAccountCount: 1,
        activityState: "waiting",
        progressState: "syncing",
        workerOnline: null,
        queueDepth: 0,
        leasedPartitions: 0,
        retryableFailedPartitions: 0,
        deadLetterPartitions: 0,
        staleLeasePartitions: 0,
        syncTruthState: "waiting",
        stallFingerprints: [],
      }),
    ).toBeNull();
  });

  it("builds a pass candidate for a healthy google state", () => {
    expect(
      buildGoogleAdsReleaseReadinessCandidate({
        connected: true,
        assignedAccountCount: 1,
        activityState: "busy",
        progressState: "syncing",
        workerOnline: true,
        queueDepth: 4,
        leasedPartitions: 1,
        retryableFailedPartitions: 0,
        deadLetterPartitions: 0,
        staleLeasePartitions: 0,
        syncTruthState: "ready",
        stallFingerprints: [],
      }),
    ).toMatchObject({
      pass: true,
      blockerClass: "none",
      evidence: {
        truthReady: true,
        queueDepth: 4,
        leasedPartitions: 1,
      },
    });
  });
});
