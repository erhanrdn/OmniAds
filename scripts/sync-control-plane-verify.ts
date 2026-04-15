import { configureOperationalScriptRuntime } from "./_operational-runtime";

type ParsedArgs = {
  buildId: string | null;
  environment: string | null;
  providerScope: string;
};

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    buildId: null,
    environment: null,
    providerScope: "meta",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--build-id") {
      const value = argv[index + 1]?.trim();
      if (!value) {
        throw new Error("missing value for --build-id");
      }
      parsed.buildId = value;
      index += 1;
      continue;
    }
    if (arg === "--environment") {
      const value = argv[index + 1]?.trim();
      if (!value) {
        throw new Error("missing value for --environment");
      }
      parsed.environment = value;
      index += 1;
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
  const { getSyncControlPlanePersistenceStatus } = await import(
    "@/lib/sync/control-plane-persistence"
  );

  const status = await getSyncControlPlanePersistenceStatus({
    buildId: args.buildId ?? undefined,
    environment: args.environment ?? undefined,
    providerScope: args.providerScope,
  });

  console.log(JSON.stringify(status, null, 2));

  if (!status.exactRowsPresent) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
