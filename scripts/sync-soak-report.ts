import { loadEnvConfig } from "@next/env";
import { getAdminOperationsHealth } from "@/lib/admin-operations-health";
import { evaluateSyncSoakHealth } from "@/lib/sync/soak-gate";

loadEnvConfig(process.cwd());

async function main() {
  const snapshot = await getAdminOperationsHealth();
  const output = evaluateSyncSoakHealth(snapshot.syncHealth);

  console.log(JSON.stringify(output, null, 2));
  if (output.outcome !== "pass") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
