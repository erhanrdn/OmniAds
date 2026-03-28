export interface ProviderSyncPartitionPlan<TPartition> {
  partitions: TPartition[];
}

export interface ProviderSyncChunk<TPayload> {
  payload: TPayload;
  cursor?: string | null;
  nextCursor?: string | null;
}

export interface ProviderSyncAdapter<
  TPartition,
  TCheckpoint,
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
}
