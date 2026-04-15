import { configureOperationalScriptRuntime } from "./_operational-runtime";

type ParsedArgs = {
  persist: boolean;
  providerScope: string;
};

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    persist: true,
    providerScope: "meta",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--no-persist") {
      parsed.persist = false;
      continue;
    }
    if (arg === "--provider-scope") {
      const value = argv[index + 1]?.trim();
      if (!value) {
        throw new Error("missing value for --provider-scope");
      }
      parsed.providerScope = value;
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }

  return parsed;
}

async function main() {
  configureOperationalScriptRuntime();
  const args = parseArgs(process.argv.slice(2));
  const environment = process.env.NODE_ENV?.trim() || "production";
  const { evaluateAndPersistSyncRepairPlan } = await import("@/lib/sync/repair-planner");
  const result = await evaluateAndPersistSyncRepairPlan({
    environment,
    providerScope: args.providerScope,
    persist: args.persist,
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
