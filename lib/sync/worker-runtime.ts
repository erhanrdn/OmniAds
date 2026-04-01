import { getActiveBusinesses } from "@/lib/sync/active-businesses";
import type { ProviderWorkerAdapter } from "@/lib/sync/provider-worker-adapters";
import {
  acquireSyncRunnerLease,
  heartbeatSyncWorker,
  renewSyncRunnerLease,
  releaseSyncRunnerLease,
} from "@/lib/sync/worker-health";
import { pruneSyncLifecycleData } from "@/lib/sync/retention";

function envNumber(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface DurableWorkerRuntimeOptions {
  adapters: ProviderWorkerAdapter[];
}

export interface RunnerLeaseGuard {
  isLeaseLost(): boolean;
  getLeaseLossReason(): string | null;
}

export function createRunnerLeaseGuard() {
  let leaseLost = false;
  let leaseLossReason: string | null = null;
  return {
    markLeaseLost(reason: string) {
      if (leaseLost) return;
      leaseLost = true;
      leaseLossReason = reason;
    },
    isLeaseLost() {
      return leaseLost;
    },
    getLeaseLossReason() {
      return leaseLossReason;
    },
  };
}

function parseEnvList(name: string) {
  const raw = process.env[name];
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function prioritizeBusinessesForAdapter(
  providerScope: string,
  businesses: Array<{ id: string; name: string }>
) {
  const prioritizedIds = parseEnvList(
    providerScope === "google_ads"
      ? "GOOGLE_ADS_DEBUG_PRIORITY_BUSINESS_IDS"
      : providerScope === "meta"
        ? "META_DEBUG_PRIORITY_BUSINESS_IDS"
        : ""
  );
  if (prioritizedIds.length === 0) return businesses;
  const priorityRank = new Map(prioritizedIds.map((id, index) => [id, index]));
  return [...businesses].sort((left, right) => {
    const leftRank = priorityRank.get(left.id);
    const rightRank = priorityRank.get(right.id);
    if (leftRank == null && rightRank == null) return 0;
    if (leftRank == null) return 1;
    if (rightRank == null) return -1;
    return leftRank - rightRank;
  });
}

export function buildProviderHeartbeatWorkerId(workerId: string, providerScope: string) {
  return providerScope === "all" ? workerId : `${workerId}:${providerScope}`;
}

function getWorkerBuildFingerprint() {
  return (
    process.env.APP_BUILD_ID?.trim() ||
    process.env.NEXT_BUILD_ID?.trim() ||
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    process.env.RAILWAY_GIT_COMMIT_SHA?.trim() ||
    process.env.RENDER_GIT_COMMIT?.trim() ||
    "dev-build"
  );
}

export async function runDurableWorkerRuntime(options: DurableWorkerRuntimeOptions) {
  process.env.SYNC_WORKER_MODE = "1";
  const workerId =
    process.env.WORKER_INSTANCE_ID?.trim() ||
    `sync-worker:${process.pid}:${Math.random().toString(36).slice(2, 10)}`;
  const pollIntervalMs = envNumber("WORKER_POLL_INTERVAL_MS", 10_000);
  const maxBusinessesPerTick = envNumber("WORKER_MAX_BUSINESSES_PER_TICK", 50);
  const leaseMinutes = envNumber("WORKER_RUNNER_LEASE_MINUTES", 2);
  const heartbeatIntervalMs = envNumber("WORKER_HEARTBEAT_INTERVAL_MS", 15_000);
  const globalDbConcurrency = envNumber("WORKER_GLOBAL_DB_CONCURRENCY", 4);
  const pruneIntervalMs = envNumber("WORKER_PRUNE_INTERVAL_MS", 6 * 60 * 60_000);
  const workerStartedAt = new Date().toISOString();
  const workerBuildId = getWorkerBuildFingerprint();
  const discoveredBusinesses = new Set<string>();
  let shuttingDown = false;
  let lastHeartbeatAt = 0;
  let lastPruneAt = 0;

  async function heartbeat(input: {
    providerScope: string;
    status: "starting" | "idle" | "running" | "stopping" | "stopped";
    lastBusinessId?: string | null;
    lastPartitionId?: string | null;
    metaJson?: Record<string, unknown>;
    force?: boolean;
  }) {
    const now = Date.now();
    if (!input.force && now - lastHeartbeatAt < heartbeatIntervalMs) return;
    lastHeartbeatAt = now;
    await heartbeatSyncWorker({
      workerId: buildProviderHeartbeatWorkerId(workerId, input.providerScope),
      instanceType: "durable_sync_worker",
      providerScope: input.providerScope,
      status: input.status,
      lastBusinessId: input.lastBusinessId,
      lastPartitionId: input.lastPartitionId,
      metaJson: input.metaJson,
    });
  }

  const shutdown = async () => {
    shuttingDown = true;
    await heartbeat({
      providerScope: "all",
      status: "stopping",
      force: true,
    }).catch(() => null);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await heartbeat({
    providerScope: "all",
    status: "starting",
    force: true,
  });

  while (!shuttingDown) {
    if (Date.now() - lastPruneAt >= pruneIntervalMs) {
      await pruneSyncLifecycleData()
        .then((result) => {
          lastPruneAt = Date.now();
          console.log("[durable-worker] lifecycle_prune", result);
        })
        .catch((error) => {
          console.error("[durable-worker] lifecycle_prune_failed", {
            message: error instanceof Error ? error.message : String(error),
          });
        });
    }

    await heartbeat({
      providerScope: "all",
      status: "idle",
      metaJson: {
        workerBuildId,
        workerStartedAt,
        tickStartedAt: new Date().toISOString(),
        adapters: options.adapters.map((adapter) => adapter.providerScope),
        globalDbConcurrency,
      },
      force: true,
    }).catch(() => null);

    const businesses = await getActiveBusinesses(maxBusinessesPerTick).catch(() => []);
    for (const business of businesses) {
      discoveredBusinesses.add(business.id);
    }
    for (const adapter of options.adapters) {
      const adapterBusinesses = prioritizeBusinessesForAdapter(adapter.providerScope, businesses);
      await heartbeat({
        providerScope: adapter.providerScope,
        status: "idle",
        metaJson: {
          workerBuildId,
          workerStartedAt,
          providerScope: adapter.providerScope,
          tickStartedAt: new Date().toISOString(),
          batchBusinessIds: adapterBusinesses.map((business) => business.id),
          globalDbConcurrency,
        },
        force: true,
      }).catch(() => null);
      const concurrency = envNumber(
        adapter.providerScope === "meta"
          ? "META_WORKER_CONCURRENCY"
          : adapter.providerScope === "shopify"
            ? "SHOPIFY_WORKER_CONCURRENCY"
          : "GOOGLE_ADS_WORKER_CONCURRENCY",
        1
      );
      const effectiveConcurrency = Math.max(1, Math.min(concurrency, globalDbConcurrency));
      for (let index = 0; index < adapterBusinesses.length; index += effectiveConcurrency) {
        const businessBatch = adapterBusinesses.slice(index, index + effectiveConcurrency);
        await Promise.all(
          businessBatch.map(async (business) => {
        const batchBusinessIds = businessBatch.map((entry) => entry.id);
        const consumeStartedAt = new Date().toISOString();
        await heartbeat({
          providerScope: adapter.providerScope,
          status: "idle",
          lastBusinessId: business.id,
          metaJson: {
            workerBuildId,
            workerStartedAt,
            providerScope: adapter.providerScope,
            tickStartedAt: new Date().toISOString(),
            batchBusinessIds,
            currentBusinessId: business.id,
            consumeStage: "discovered",
            consumeOutcome: null,
          },
          force: true,
        }).catch(() => null);
        const leased = await acquireSyncRunnerLease({
          businessId: business.id,
          providerScope: adapter.providerScope,
          leaseOwner: workerId,
          leaseMinutes,
        }).catch(() => false);
        if (!leased) {
          await heartbeat({
            providerScope: adapter.providerScope,
            status: "idle",
            lastBusinessId: business.id,
            metaJson: {
              workerBuildId,
              workerStartedAt,
              providerScope: adapter.providerScope,
              batchBusinessIds,
              currentBusinessId: business.id,
              consumeStage: "lease_denied",
              consumeOutcome: "lease_denied",
              consumeReason: "lease_not_acquired",
              consumeFinishedAt: new Date().toISOString(),
            },
            force: true,
          }).catch(() => null);
          return;
        }

        await heartbeat({
          providerScope: adapter.providerScope,
          status: "running",
          lastBusinessId: business.id,
          metaJson: {
            workerBuildId,
            workerStartedAt,
            providerScope: adapter.providerScope,
            batchBusinessIds,
            currentBusinessId: business.id,
            consumeStage: "lease_acquired",
            consumeOutcome: null,
            lastLeaseAcquiredAt: new Date().toISOString(),
          },
          force: true,
        }).catch(() => null);

        const leaseGuard = createRunnerLeaseGuard();
        let leaseRenewalStopped = false;
        let leaseRenewalInFlight: Promise<void> | null = null;
        const leaseRenewalIntervalMs = Math.max(10_000, Math.floor((leaseMinutes * 60_000) / 2));
        const leaseRenewalTimer = setInterval(() => {
          if (leaseRenewalStopped) return;
          leaseRenewalInFlight = renewSyncRunnerLease({
            businessId: business.id,
            providerScope: adapter.providerScope,
            leaseOwner: workerId,
            leaseMinutes,
          })
            .then((renewed) => {
              if (renewed) return;
              leaseGuard.markLeaseLost("runner_lease_conflict");
              console.warn("[durable-worker] runner_lease_lost", {
                businessId: business.id,
                providerScope: adapter.providerScope,
                workerId,
              });
            })
            .catch((error) => {
              leaseGuard.markLeaseLost("runner_lease_renewal_failed");
              console.warn("[durable-worker] runner_lease_renewal_failed", {
                businessId: business.id,
                providerScope: adapter.providerScope,
                workerId,
                message: error instanceof Error ? error.message : String(error),
              });
            });
        }, leaseRenewalIntervalMs);

        try {
          await heartbeat({
            providerScope: adapter.providerScope,
            status: "running",
            lastBusinessId: business.id,
            metaJson: {
              workerBuildId,
              workerStartedAt,
              providerScope: adapter.providerScope,
              batchBusinessIds,
              currentBusinessId: business.id,
              consumeStage: "consume_started",
              consumeStartedAt,
            },
            force: true,
          }).catch(() => null);
          const result = await adapter.consumeBusiness(business.id, {
            runtimeLeaseGuard: leaseGuard,
          });
          const syncResult =
            result && typeof result === "object" ? (result as Record<string, unknown>) : null;
          await heartbeat({
            providerScope: adapter.providerScope,
            status: "idle",
            lastBusinessId: business.id,
            metaJson: {
              workerBuildId,
              workerStartedAt,
              providerScope: adapter.providerScope,
              batchBusinessIds,
              currentBusinessId: business.id,
              consumeStage: "consume_succeeded",
              consumeStartedAt:
                syncResult?.consumeStartedAt && typeof syncResult.consumeStartedAt === "string"
                  ? syncResult.consumeStartedAt
                  : consumeStartedAt,
              consumeFinishedAt: new Date().toISOString(),
              consumeOutcome:
                syncResult?.outcome && typeof syncResult.outcome === "string"
                  ? syncResult.outcome
                  : "consume_succeeded",
              consumeReason:
                syncResult?.failureReason && typeof syncResult.failureReason === "string"
                  ? syncResult.failureReason
                  : null,
              consumeAttempted:
                syncResult?.attempted && typeof syncResult.attempted === "number"
                  ? syncResult.attempted
                  : null,
              consumeSucceeded:
                syncResult?.succeeded && typeof syncResult.succeeded === "number"
                  ? syncResult.succeeded
                  : null,
              consumeFailed:
                syncResult?.failed && typeof syncResult.failed === "number"
                  ? syncResult.failed
                  : null,
              discoveredBusinessCount: discoveredBusinesses.size,
            },
            force: true,
          }).catch(() => null);
        } catch (error) {
          console.error("[durable-worker] consume_failed", {
            businessId: business.id,
            providerScope: adapter.providerScope,
            message: error instanceof Error ? error.message : String(error),
          });
          await heartbeat({
            providerScope: adapter.providerScope,
            status: "idle",
            lastBusinessId: business.id,
            metaJson: {
              workerBuildId,
              workerStartedAt,
              providerScope: adapter.providerScope,
              batchBusinessIds,
              currentBusinessId: business.id,
              consumeStage: "consume_failed",
              consumeStartedAt,
              consumeFinishedAt: new Date().toISOString(),
              consumeOutcome: "consume_failed",
              consumeReason: error instanceof Error ? error.message : String(error),
            },
            force: true,
          }).catch(() => null);
        } finally {
          leaseRenewalStopped = true;
          clearInterval(leaseRenewalTimer);
          if (leaseRenewalInFlight) {
            const renewalPromise: Promise<void> = leaseRenewalInFlight;
            await renewalPromise.catch(() => null);
          }
          await releaseSyncRunnerLease({
            businessId: business.id,
            providerScope: adapter.providerScope,
            leaseOwner: workerId,
          }).catch(() => null);
        }
          })
        );
      }
    }

    await sleep(pollIntervalMs);
  }

  await heartbeat({
    providerScope: "all",
    status: "stopped",
    force: true,
  }).catch(() => null);
}
