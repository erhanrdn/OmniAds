type ParsedArgs = {
  buildId: string | null;
  environment: string | null;
  providerScope: string;
  breakGlass: boolean;
  overrideReason: string | null;
  enforceDeployGate: boolean;
};

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    buildId: null,
    environment: null,
    providerScope: "meta",
    breakGlass: false,
    overrideReason: null,
    enforceDeployGate: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--build-id") {
      const value = argv[index + 1]?.trim();
      if (!value) throw new Error("missing value for --build-id");
      parsed.buildId = value;
      index += 1;
      continue;
    }
    if (arg === "--environment") {
      const value = argv[index + 1]?.trim();
      if (!value) throw new Error("missing value for --environment");
      parsed.environment = value;
      index += 1;
      continue;
    }
    if (arg === "--provider-scope") {
      const value = argv[index + 1]?.trim();
      if (!value) throw new Error("missing value for --provider-scope");
      parsed.providerScope = value;
      index += 1;
      continue;
    }
    if (arg === "--break-glass") {
      parsed.breakGlass = true;
      continue;
    }
    if (arg === "--override-reason") {
      const value = argv[index + 1]?.trim();
      if (!value) throw new Error("missing value for --override-reason");
      parsed.overrideReason = value;
      index += 1;
      continue;
    }
    if (arg === "--enforce-deploy-gate") {
      parsed.enforceDeployGate = true;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }

  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const environment = args.environment ?? process.env.NODE_ENV?.trim() ?? "production";
  const {
    evaluateAndPersistSyncGates,
    shouldEnforceSyncGateFailure,
  } = await import("@/lib/sync/release-gates");
  const { evaluateAndPersistSyncRepairPlan } = await import("@/lib/sync/repair-planner");
  const {
    getSyncControlPlanePersistenceStatus,
  } = await import("@/lib/sync/control-plane-persistence");

  const gateVerdicts = await evaluateAndPersistSyncGates({
    buildId: args.buildId ?? undefined,
    environment,
    breakGlass: args.breakGlass,
    overrideReason: args.overrideReason,
  });
  const repairPlan = await evaluateAndPersistSyncRepairPlan({
    buildId: args.buildId ?? undefined,
    environment,
    providerScope: args.providerScope,
    releaseGate: gateVerdicts.releaseGate,
  });
  const persistence = await getSyncControlPlanePersistenceStatus({
    buildId: args.buildId ?? undefined,
    environment,
    providerScope: args.providerScope,
  });

  const result = {
    identity: persistence.identity,
    gateVerdicts,
    repairPlan,
    persistence,
  };

  console.log(JSON.stringify(result, null, 2));

  if (
    args.enforceDeployGate &&
    shouldEnforceSyncGateFailure([gateVerdicts.deployGate])
  ) {
    process.exit(2);
  }

  if (!persistence.exactRowsPresent) {
    process.exit(3);
  }

  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
