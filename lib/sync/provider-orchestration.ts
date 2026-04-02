import type {
  ProviderCheckpointHealth,
  ProviderDomainReadiness,
  ProviderReadinessLevel,
} from "@/lib/provider-readiness";
import type { ProviderLeasePlan } from "@/lib/sync/provider-status-truth";

export interface ProviderSyncPartitionPlan<TPartition> {
  partitions: TPartition[];
}

export type ProviderSyncPhase =
  | "discover"
  | "fetch_raw"
  | "transform"
  | "bulk_upsert"
  | "finalize";

export interface ProviderSyncPartitionIdentity {
  partitionId: string;
  businessId: string;
  providerAccountId: string;
  scope: string;
  partitionDate: string;
}

export interface ProviderSyncCheckpointState {
  checkpointId?: string | null;
  checkpointScope: string;
  phase: ProviderSyncPhase;
  pageIndex: number;
  isPaginated?: boolean;
  cursor?: string | null;
  nextCursor?: string | null;
  rawSnapshotIds?: string[];
  rowsFetched?: number;
  rowsWritten?: number;
  attemptCount: number;
  heartbeatAt?: string | null;
  retryAfterAt?: string | null;
  poisonedAt?: string | null;
  poisonReason?: string | null;
  deadLetterReason?: string | null;
}

export interface ProviderSyncChunk<TPayload> {
  payload: TPayload;
  cursor?: string | null;
  nextCursor?: string | null;
}

export type ProviderReplayReasonCode =
  | "reclaim_replay"
  | "quota_retry"
  | "transform_failure_replay"
  | "flush_verification_mismatch"
  | "manual_replay"
  | "quarantine_release";

export interface ProviderPhaseReplayDecision {
  phase: ProviderSyncPhase;
  replaySafe: boolean;
  resumeFromCheckpoint: boolean;
  requiresRollback: boolean;
  reasonCode: ProviderReplayReasonCode;
  detail?: string | null;
}

export type ProviderReclaimDisposition =
  | "alive_slow"
  | "stalled_reclaimable"
  | "poison_candidate";

export type ProviderReclaimReasonCode =
  | "lease_expired_no_progress"
  | "worker_offline_no_progress"
  | "same_phase_reentry_limit"
  | "poison_checkpoint_detected"
  | "legacy_runtime_stale"
  | "progress_recently_advanced"
  | "active_worker_lease_present";

export interface ProviderReclaimDecision {
  disposition: ProviderReclaimDisposition;
  reasonCode: ProviderReclaimReasonCode;
  detail?: string | null;
}

export interface ProviderSyncAdapter<
  TPartition extends ProviderSyncPartitionIdentity,
  TCheckpoint extends ProviderSyncCheckpointState,
  TChunk,
  TFailureClass extends string = string,
> {
  planPartitions(range: {
    businessId: string;
    startDate: string;
    endDate: string;
  }): Promise<ProviderSyncPartitionPlan<TPartition>>;
  leasePartitions(input: {
    businessId: string;
    limit: number;
    workerId: string;
    plan?: ProviderLeasePlan | null;
  }): Promise<TPartition[]>;
  getCheckpoint(input: {
    partition: TPartition;
  }): Promise<TCheckpoint | null>;
  fetchChunk(input: {
    partition: TPartition;
    checkpoint: TCheckpoint | null;
  }): Promise<TChunk>;
  persistChunk(input: {
    partition: TPartition;
    chunk: TChunk;
  }): Promise<void>;
  transformChunk(input: {
    partition: TPartition;
    chunk: TChunk;
  }): Promise<void>;
  writeFacts(input: {
    partition: TPartition;
    chunk: TChunk;
  }): Promise<void>;
  advanceCheckpoint(input: {
    partition: TPartition;
    chunk: TChunk;
  }): Promise<void>;
  completePartition(input: {
    partition: TPartition;
  }): Promise<void>;
  classifyFailure(error: unknown): TFailureClass;
  getReadiness?(input: {
    businessId: string;
    providerAccountId?: string | null;
  }): Promise<{
    readinessLevel: ProviderReadinessLevel;
    checkpointHealth: ProviderCheckpointHealth | null;
    domainReadiness?: ProviderDomainReadiness | null;
  }>;
}
