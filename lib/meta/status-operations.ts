export type MetaOperationsBlockReason =
  | "worker_offline"
  | "lease_denied"
  | "queue_backlogged";

function parseTimestampMs(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

export function deriveMetaOperationsBlockReason(input: {
  workerHealthy: boolean;
  queueDepth: number;
  leasedPartitions: number;
  consumeStage?: string | null;
  heartbeatAgeMs?: number | null;
  latestActivityAt?: string | null;
  historicalCoreQueued?: number;
  extendedHistoricalQueued?: number;
  maintenanceQueued?: number;
  nowMs?: number;
}): MetaOperationsBlockReason | null {
  if (input.queueDepth <= 0) return null;
  if (!input.workerHealthy) return "worker_offline";
  if (input.consumeStage === "lease_denied") return "lease_denied";
  if (input.leasedPartitions > 0) return null;

  const historicalBacklog =
    (input.historicalCoreQueued ?? 0) > 0 || (input.extendedHistoricalQueued ?? 0) > 0;
  const maintenanceOnlyBacklog =
    !historicalBacklog && (input.maintenanceQueued ?? 0) > 0;

  const nowMs = input.nowMs ?? Date.now();
  const latestActivityMs = parseTimestampMs(input.latestActivityAt);
  const activityAgeMs =
    latestActivityMs != null ? Math.max(0, nowMs - latestActivityMs) : null;
  const heartbeatAgeMs = input.heartbeatAgeMs ?? null;
  const hasStaleActivity = activityAgeMs == null || activityAgeMs > 10 * 60_000;
  const hasFreshWorkerHeartbeat =
    heartbeatAgeMs != null && heartbeatAgeMs <= 3 * 60_000;

  if (historicalBacklog && (hasStaleActivity || hasFreshWorkerHeartbeat)) {
    return "queue_backlogged";
  }

  if (!historicalBacklog && maintenanceOnlyBacklog) {
    return null;
  }

  return null;
}
