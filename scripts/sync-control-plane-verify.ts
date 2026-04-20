import { pathToFileURL } from "node:url";
import { configureOperationalScriptRuntime } from "./_operational-runtime";

type ParsedArgs = {
  buildId: string | null;
  environment: string | null;
  providerScope: string;
  requireBlockModes: boolean;
};

type SyncGateSnapshot = {
  id?: string | null;
  verdict?: string | null;
  mode?: string | null;
};

type SyncRepairPlanSnapshot = {
  id?: string | null;
  recommendations?: unknown[];
};

export function evaluateSyncControlPlaneVerification(input: {
  persistence: { exactRowsPresent?: boolean | null };
  deployGate: SyncGateSnapshot | null;
  releaseGate: SyncGateSnapshot | null;
  repairPlan: SyncRepairPlanSnapshot | null;
}, options?: { requireBlockModes?: boolean }) {
  const deployGatePass = input.deployGate?.verdict === "pass";
  const releaseGatePass = input.releaseGate?.verdict === "pass";
  const repairPlanEmpty =
    Array.isArray(input.repairPlan?.recommendations) &&
    input.repairPlan!.recommendations.length === 0;
  const requireBlockModes = options?.requireBlockModes === true;
  const deployGateModeBlock = input.deployGate?.mode === "block";
  const releaseGateModeBlock = input.releaseGate?.mode === "block";

  const reasons: string[] = [];
  if (input.persistence?.exactRowsPresent !== true) {
    reasons.push("exact_rows_missing");
  }
  if (!input.deployGate?.id) {
    reasons.push("deploy_gate_missing");
  }
  if (!deployGatePass) {
    reasons.push("deploy_gate_not_pass");
  }
  if (!input.releaseGate?.id) {
    reasons.push("release_gate_missing");
  }
  if (!releaseGatePass) {
    reasons.push("release_gate_not_pass");
  }
  if (!input.repairPlan?.id) {
    reasons.push("repair_plan_missing");
  }
  if (!repairPlanEmpty) {
    reasons.push("repair_plan_not_empty");
  }
  if (requireBlockModes && !deployGateModeBlock) {
    reasons.push("deploy_gate_mode_not_block");
  }
  if (requireBlockModes && !releaseGateModeBlock) {
    reasons.push("release_gate_mode_not_block");
  }

  return {
    accepted: reasons.length === 0,
    reasons,
    exactRowsPresent: input.persistence?.exactRowsPresent === true,
    deployGatePass,
    releaseGatePass,
    repairPlanEmpty,
    deployGateModeBlock,
    releaseGateModeBlock,
  };
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    buildId: null,
    environment: null,
    providerScope: "meta",
    requireBlockModes: false,
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
    if (arg === "--require-block-modes") {
      parsed.requireBlockModes = true;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }

  return parsed;
}

async function main() {
  configureOperationalScriptRuntime();
  const args = parseArgs(process.argv.slice(2));
  const [{ getSyncControlPlanePersistenceStatus }, { getLatestSyncGateRecords }, { getLatestSyncRepairPlan }] =
    await Promise.all([
      import("@/lib/sync/control-plane-persistence"),
      import("@/lib/sync/release-gates"),
      import("@/lib/sync/repair-planner"),
    ]);

  const [status, gates, repairPlan] = await Promise.all([
    getSyncControlPlanePersistenceStatus({
      buildId: args.buildId ?? undefined,
      environment: args.environment ?? undefined,
      providerScope: args.providerScope,
    }),
    getLatestSyncGateRecords({
      buildId: args.buildId ?? undefined,
      environment: args.environment ?? undefined,
      providerScope: args.providerScope,
    }),
    getLatestSyncRepairPlan({
      buildId: args.buildId ?? undefined,
      environment: args.environment ?? undefined,
      providerScope: args.providerScope,
    }),
  ]);

  const verification = evaluateSyncControlPlaneVerification({
    persistence: status,
    deployGate: gates.deployGate,
    releaseGate: gates.releaseGate,
    repairPlan,
  }, {
    requireBlockModes: args.requireBlockModes,
  });

  console.log(
    JSON.stringify(
      {
        verification,
        persistence: status,
        deployGate: gates.deployGate,
        releaseGate: gates.releaseGate,
        repairPlan,
      },
      null,
      2,
    ),
  );

  if (!verification.accepted) {
    process.exit(1);
  }
}

function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (isMainModule()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
