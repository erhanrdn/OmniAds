import { loadEnvConfig } from "@next/env";
import { durableWorkerAdapters } from "@/lib/sync/provider-worker-adapters";
import { runDurableWorkerRuntime } from "@/lib/sync/worker-runtime";

loadEnvConfig(process.cwd());

void runDurableWorkerRuntime({
  adapters: durableWorkerAdapters,
}).catch((error) => {
  console.error("[sync-worker] fatal", error);
  process.exitCode = 1;
});
