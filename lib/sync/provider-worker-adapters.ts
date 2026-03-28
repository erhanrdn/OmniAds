import type { ProviderSyncAdapter } from "@/lib/sync/provider-orchestration";
import { syncGoogleAdsReports } from "@/lib/sync/google-ads-sync";
import { syncMetaReports } from "@/lib/sync/meta-sync";

export interface ProviderWorkerAdapter
  extends ProviderSyncAdapter<unknown, unknown, unknown, string> {
  providerScope: "meta" | "google_ads";
  consumeBusiness(businessId: string): Promise<unknown>;
}

const unsupported = async () => {
  throw new Error("Provider worker adapter uses existing provider sync runtime for this cutover.");
};

export const metaWorkerAdapter: ProviderWorkerAdapter = {
  providerScope: "meta",
  planPartitions: unsupported,
  leasePartitions: unsupported,
  getCheckpoint: unsupported,
  fetchChunk: unsupported,
  persistChunk: unsupported,
  transformChunk: unsupported,
  writeFacts: unsupported,
  advanceCheckpoint: unsupported,
  completePartition: unsupported,
  classifyFailure(error) {
    return error instanceof Error ? error.message : String(error);
  },
  async consumeBusiness(businessId: string) {
    return syncMetaReports(businessId);
  },
};

export const googleAdsWorkerAdapter: ProviderWorkerAdapter = {
  providerScope: "google_ads",
  planPartitions: unsupported,
  leasePartitions: unsupported,
  getCheckpoint: unsupported,
  fetchChunk: unsupported,
  persistChunk: unsupported,
  transformChunk: unsupported,
  writeFacts: unsupported,
  advanceCheckpoint: unsupported,
  completePartition: unsupported,
  classifyFailure(error) {
    return error instanceof Error ? error.message : String(error);
  },
  async consumeBusiness(businessId: string) {
    return syncGoogleAdsReports(businessId);
  },
};

export const durableWorkerAdapters = [metaWorkerAdapter, googleAdsWorkerAdapter];
