import { loadEnvConfig } from "@next/env";
import { repairMetaRunningRunsUnderTerminalParents } from "@/lib/meta/cleanup";

loadEnvConfig(process.cwd());

async function main() {
  const businessId = process.argv[2]?.trim() || null;
  const summary = await repairMetaRunningRunsUnderTerminalParents({ businessId });
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
