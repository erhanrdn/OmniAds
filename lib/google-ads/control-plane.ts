import type {
  ProviderActivityState,
  ProviderProgressState,
  ProviderStallFingerprint,
  SyncTruthState,
} from "@/lib/sync/provider-status-truth";
import { classifyProviderReleaseTruth } from "@/lib/sync/release-gates";
import type { GoogleAdsReleaseReadinessCandidate } from "@/lib/google-ads/status-types";

export interface GoogleAdsReleaseCandidateInput {
  connected: boolean;
  assignedAccountCount: number;
  activityState: ProviderActivityState;
  progressState: ProviderProgressState;
  workerOnline: boolean | null;
  queueDepth: number;
  leasedPartitions: number;
  retryableFailedPartitions: number;
  deadLetterPartitions: number;
  staleLeasePartitions: number;
  syncTruthState: SyncTruthState;
  stallFingerprints: ProviderStallFingerprint[];
}

export function buildGoogleAdsReleaseReadinessCandidate(
  input: GoogleAdsReleaseCandidateInput,
): GoogleAdsReleaseReadinessCandidate | null {
  if (!input.connected || input.assignedAccountCount <= 0) {
    return null;
  }

  return classifyProviderReleaseTruth({
    activityState: input.activityState,
    progressState: input.progressState,
    workerOnline: input.workerOnline,
    queueDepth: input.queueDepth,
    leasedPartitions: input.leasedPartitions,
    truthReady: input.syncTruthState === "ready",
    retryableFailedPartitions: input.retryableFailedPartitions,
    deadLetterPartitions: input.deadLetterPartitions,
    staleLeasePartitions: input.staleLeasePartitions,
    reclaimCandidateCount: 0,
    recentTruthState: input.syncTruthState === "ready" ? "ready" : input.syncTruthState,
    priorityTruthState: input.syncTruthState === "ready" ? "ready" : input.syncTruthState,
    stallFingerprints: input.stallFingerprints,
  });
}
