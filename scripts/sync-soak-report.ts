import { loadEnvConfig } from "@next/env";
import { runSyncSoakGate } from "@/lib/sync/soak-gate";

loadEnvConfig(process.cwd());

async function main() {
  const { result: output } = await runSyncSoakGate();

  console.log(JSON.stringify(output, null, 2));
  if (output.outcome !== "pass") {
    console.error("[sync-soak-report] gate_failed", {
      releaseReadiness: output.releaseReadiness,
      blockingChecks: output.blockingChecks.map((check) => check.key),
      topIssue: output.topIssue,
    });
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
