import { getActiveBusinesses } from "@/lib/sync/active-businesses";
import type { ProviderWorkerAdapter } from "@/lib/sync/provider-worker-adapters";
import {
  acquireSyncRunnerLease,
  heartbeatSyncWorker,
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
      workerId,
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
        adapters: options.adapters.map((adapter) => adapter.providerScope),
        globalDbConcurrency,
      },
      force: true,
    }).catch(() => null);

    const businesses = await getActiveBusinesses(maxBusinessesPerTick).catch(() => []);
    for (const adapter of options.adapters) {
      await heartbeat({
        providerScope: adapter.providerScope,
        status: "idle",
        metaJson: {
          providerScope: adapter.providerScope,
          globalDbConcurrency,
        },
        force: true,
      }).catch(() => null);
      const concurrency = envNumber(
        adapter.providerScope === "meta"
          ? "META_WORKER_CONCURRENCY"
          : "GOOGLE_ADS_WORKER_CONCURRENCY",
        1
      );
      const effectiveConcurrency = Math.max(1, Math.min(concurrency, globalDbConcurrency));
      for (let index = 0; index < businesses.length; index += effectiveConcurrency) {
        const businessBatch = businesses.slice(index, index + effectiveConcurrency);
        await Promise.all(
          businessBatch.map(async (business) => {
        const leased = await acquireSyncRunnerLease({
          businessId: business.id,
          providerScope: adapter.providerScope,
          leaseOwner: workerId,
          leaseMinutes,
        }).catch(() => false);
        if (!leased) return;

        try {
          await heartbeat({
            providerScope: adapter.providerScope,
            status: "running",
            lastBusinessId: business.id,
            metaJson: {
              providerScope: adapter.providerScope,
            },
          }).catch(() => null);
          await adapter.consumeBusiness(business.id);
        } catch (error) {
          console.error("[durable-worker] consume_failed", {
            businessId: business.id,
            providerScope: adapter.providerScope,
            message: error instanceof Error ? error.message : String(error),
          });
        } finally {
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
