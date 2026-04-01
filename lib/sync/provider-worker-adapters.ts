import type { RunnerLeaseGuard } from "@/lib/sync/worker-runtime";
import type {
  ProviderSyncAdapter,
  ProviderSyncCheckpointState,
  ProviderSyncPartitionIdentity,
} from "@/lib/sync/provider-orchestration";
import { syncGoogleAdsReports } from "@/lib/sync/google-ads-sync";
import { consumeMetaQueuedWork } from "@/lib/sync/meta-sync";

export interface ProviderWorkerAdapter
  extends ProviderSyncAdapter<
    ProviderSyncPartitionIdentity,
    ProviderSyncCheckpointState,
    unknown,
    string
  > {
  providerScope: "meta" | "google_ads";
  consumeBusiness(
    businessId: string,
    input?: {
      runtimeLeaseGuard?: RunnerLeaseGuard;
    }
  ): Promise<unknown>;
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
  async consumeBusiness(businessId: string, input) {
    return consumeMetaQueuedWork(businessId, input);
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
  async consumeBusiness(businessId: string, input) {
    return syncGoogleAdsReports(businessId, input);
  },
};

export const durableWorkerAdapters = [metaWorkerAdapter, googleAdsWorkerAdapter];
