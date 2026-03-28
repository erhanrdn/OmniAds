import { durableWorkerAdapters } from "@/lib/sync/provider-worker-adapters";
import { runDurableWorkerRuntime } from "@/lib/sync/worker-runtime";

void runDurableWorkerRuntime({
  adapters: durableWorkerAdapters,
}).catch((error) => {
  console.error("[sync-worker] fatal", error);
  process.exitCode = 1;
});
