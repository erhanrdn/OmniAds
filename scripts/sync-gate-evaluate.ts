import { configureOperationalScriptRuntime } from "./_operational-runtime";

type ParsedArgs = {
  gate: "deploy_gate" | "release_gate" | "all";
  persist: boolean;
  enforce: boolean;
  breakGlass: boolean;
  overrideReason: string | null;
};

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    gate: "all",
    persist: true,
    enforce: false,
    breakGlass: false,
    overrideReason: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--gate") {
      const value = argv[index + 1]?.trim();
      if (value !== "deploy_gate" && value !== "release_gate" && value !== "all") {
        throw new Error("invalid value for --gate");
      }
      parsed.gate = value;
      index += 1;
      continue;
    }
    if (arg === "--no-persist") {
      parsed.persist = false;
      continue;
    }
    if (arg === "--enforce") {
      parsed.enforce = true;
      continue;
    }
    if (arg === "--break-glass") {
      parsed.breakGlass = true;
      continue;
    }
    if (arg === "--override-reason") {
      const value = argv[index + 1]?.trim();
      if (!value) {
        throw new Error("missing value for --override-reason");
      }
      parsed.overrideReason = value;
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
  const {
    evaluateDeployGate,
    evaluateReleaseGate,
    evaluateAndPersistSyncGates,
    shouldEnforceSyncGateFailure,
  } = await import(
    "@/lib/sync/release-gates"
  );

  const result =
    args.gate === "deploy_gate"
      ? {
          deployGate: await evaluateDeployGate({
            persist: args.persist,
            breakGlass: args.breakGlass,
            overrideReason: args.overrideReason,
            environment,
          }),
          releaseGate: null,
        }
      : args.gate === "release_gate"
        ? {
            deployGate: null,
            releaseGate: await evaluateReleaseGate({
              persist: args.persist,
              breakGlass: args.breakGlass,
              overrideReason: args.overrideReason,
              environment,
            }),
          }
        : await evaluateAndPersistSyncGates({
            breakGlass: args.breakGlass,
            overrideReason: args.overrideReason,
            environment,
          });

  console.log(JSON.stringify(result, null, 2));

  if (!args.enforce) {
    process.exit(0);
  }

  const records = [result.deployGate, result.releaseGate].filter(Boolean);
  if (shouldEnforceSyncGateFailure(records)) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
