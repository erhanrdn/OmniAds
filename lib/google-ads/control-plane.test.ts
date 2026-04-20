import { afterEach, describe, expect, it } from "vitest";
import {
  buildGoogleAdsReleaseGateRecord,
  buildGoogleAdsReleaseReadinessCandidate,
} from "@/lib/google-ads/control-plane";

describe("google ads control plane helper", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

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

  it("builds a provider-scoped google release gate record", () => {
    process.env = {
      ...originalEnv,
      SYNC_RELEASE_GATE_MODE: "block",
    };

    expect(
      buildGoogleAdsReleaseGateRecord({
        buildId: "build-1",
        environment: "production",
        canaries: [
          {
            businessId: "biz-1",
            businessName: "Google Biz",
            pass: true,
            blockerClass: null,
            evidence: {
              truthReady: true,
            },
          },
        ],
      }),
    ).toMatchObject({
      gateKind: "release_gate",
      mode: "block",
      baseResult: "pass",
      verdict: "pass",
      blockerClass: null,
      evidence: {
        providerScope: "google_ads",
        canaries: [
          {
            businessId: "biz-1",
            businessName: "Google Biz",
            pass: true,
          },
        ],
      },
    });
  });
});
