import { pruneSyncLifecycleData } from "@/lib/sync/retention";

void pruneSyncLifecycleData()
  .then((result) => {
    console.log("[sync-prune]", result);
  })
  .catch((error) => {
    console.error("[sync-prune] fatal", error);
    process.exitCode = 1;
  });
