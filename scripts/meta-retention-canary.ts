import { loadEnvConfig } from "@next/env";
import { runMetaRetentionCanary } from "@/lib/meta/retention-canary";

loadEnvConfig(process.cwd());

interface ParsedArgs {
  businessId: string | null;
  asOfDate: string | null;
  execute: boolean;
  json: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    businessId: null,
    asOfDate: null,
    execute: false,
    json: false,
    help: false,
  };

  for (const arg of argv) {
    if (arg === "--execute") {
      parsed.execute = true;
      continue;
    }
    if (arg === "--json") {
      parsed.json = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (arg.startsWith("--as-of=")) {
      parsed.asOfDate = arg.slice("--as-of=".length) || null;
      continue;
    }
    if (!arg.startsWith("-") && !parsed.businessId) {
      parsed.businessId = arg;
    }
  }

  return parsed;
}

function printHelp() {
  console.log(`Usage: npm run meta:retention-canary -- <businessId> [options]

Options:
  --execute                    Request business-scoped delete execution
  --as-of=YYYY-MM-DD           Override the retention as-of date
  --json                       Print machine-readable JSON
  --help                       Show this message

Execute gating:
  META_RETENTION_EXECUTION_ENABLED must remain false
  META_RETENTION_EXECUTE_CANARY_ENABLED=true
  META_RETENTION_EXECUTE_CANARY_BUSINESSES=<businessId>
`);
}

function printText(result: Awaited<ReturnType<typeof runMetaRetentionCanary>>) {
  console.log(`Meta Retention Canary for ${result.businessId}`);
  console.log(`As of: ${result.asOfDate}`);
  console.log(`Result: ${result.passed ? "PASS" : "FAIL"}`);
  console.log(
    `Global execution default: ${
      result.globalRetentionRuntime.defaultExecutionDisabled ? "disabled" : "enabled"
    } (${result.globalRetentionRuntime.mode})`,
  );
  console.log(
    `Canary mode: ${result.canaryRuntime.mode} (executeRequested=${result.executeRequested ? "yes" : "no"})`,
  );
  console.log(`Canary gate: ${result.canaryRuntime.gateReason}`);
  console.log("");

  if (result.blockers.length > 0) {
    console.log("Blockers:");
    for (const blocker of result.blockers) {
      console.log(`- ${blocker}`);
    }
    console.log("");
  }

  console.log("Protected truth:");
  for (const item of result.protectedTruth) {
    console.log(`- ${item}`);
  }
  console.log("");

  console.log("Allowed delete scope:");
  for (const item of result.allowedDeleteScope) {
    console.log(`- ${item}`);
  }
  console.log("");

  console.log("Run summary:");
  console.log(
    `- disposition=${result.run.executionDisposition}, mode=${result.run.mode}, skippedDueToActiveLease=${result.run.skippedDueToActiveLease ? "yes" : "no"}, deletedRows=${result.run.totalDeletedRows}`,
  );
  console.log(
    `- protectedRows=${result.protectionProof.protectedRows}, deletableRows=${result.protectionProof.deletableRows}, retainedRows=${result.protectionProof.retainedRows}, tablesWithDeletedRows=${result.protectionProof.tablesWithDeletedRows}`,
  );
  console.log("");

  console.log("Per-table proof:");
  for (const row of result.tables) {
    console.log(
      `- ${row.tableName}: scope=${row.deleteScope}, deletable=${row.deletableRows ?? "unknown"}, deleted=${row.deletedRows}, protected=${row.protectedRows ?? "unknown"}, cutoff=${row.cutoffDate}`,
    );
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  if (!args.businessId) {
    printHelp();
    process.exit(1);
  }

  const result = await runMetaRetentionCanary({
    businessId: args.businessId,
    asOfDate: args.asOfDate,
    execute: args.execute,
  });

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printText(result);
  }

  process.exit(result.passed ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
