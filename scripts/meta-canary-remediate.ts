import { configureOperationalScriptRuntime } from "./_operational-runtime";

type ParsedArgs = {
  expectedBuildId: string;
  releaseGateId: string;
  repairPlanId: string;
  businessIds: string[];
  successMode: "proof" | "clearance";
};

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    expectedBuildId: "",
    releaseGateId: "",
    repairPlanId: "",
    businessIds: [],
    successMode: "proof",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--expected-build-id") {
      parsed.expectedBuildId = argv[index + 1]?.trim() ?? "";
      index += 1;
      continue;
    }
    if (arg === "--release-gate-id") {
      parsed.releaseGateId = argv[index + 1]?.trim() ?? "";
      index += 1;
      continue;
    }
    if (arg === "--repair-plan-id") {
      parsed.repairPlanId = argv[index + 1]?.trim() ?? "";
      index += 1;
      continue;
    }
    if (arg === "--business-ids") {
      const value = argv[index + 1]?.trim() ?? "";
      parsed.businessIds = value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
      index += 1;
      continue;
    }
    if (arg === "--success-mode") {
      const value = argv[index + 1]?.trim() ?? "";
      if (value !== "proof" && value !== "clearance") {
        throw new Error(`invalid --success-mode: ${value || "<empty>"}`);
      }
      parsed.successMode = value;
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }

  if (!parsed.expectedBuildId || !parsed.releaseGateId || !parsed.repairPlanId) {
    throw new Error(
      "usage: node --import tsx scripts/meta-canary-remediate.ts --expected-build-id <sha> --release-gate-id <id> --repair-plan-id <id> [--business-ids <csv>] [--success-mode <proof|clearance>]",
    );
  }

  return parsed;
}

async function main() {
  configureOperationalScriptRuntime();
  const args = parseArgs(process.argv.slice(2));
  const { runMetaCanaryRemediation } = await import("@/lib/sync/meta-canary-remediation");
  const result = await runMetaCanaryRemediation({
    expectedBuildId: args.expectedBuildId,
    releaseGateId: args.releaseGateId,
    repairPlanId: args.repairPlanId,
    businessIds: args.businessIds,
    successMode: args.successMode,
    workflowRunId: process.env.GITHUB_RUN_ID?.trim() || null,
    workflowActor: process.env.GITHUB_ACTOR?.trim() || null,
  });

  console.log(JSON.stringify(result, null, 2));

  if (args.successMode === "proof" ? result.proofPassed !== true : result.clearancePassed !== true) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
