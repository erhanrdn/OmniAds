import { configureOperationalScriptRuntime } from "./_operational-runtime";

type ParsedArgs = {
  help: boolean;
  providerScopes: string[];
  onlineWindowMinutes: number;
  minOnlineWorkers: number;
  minHeartbeatAfter: string | null;
};

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    help: false,
    providerScopes: [],
    onlineWindowMinutes: 5,
    minOnlineWorkers: 1,
    minHeartbeatAfter: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (arg === "--provider-scope") {
      const value = argv[index + 1]?.trim();
      if (!value) {
        throw new Error("missing value for --provider-scope");
      }
      parsed.providerScopes.push(value);
      index += 1;
      continue;
    }
    if (arg === "--online-window-minutes") {
      const value = Number(argv[index + 1] ?? "");
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error("invalid value for --online-window-minutes");
      }
      parsed.onlineWindowMinutes = value;
      index += 1;
      continue;
    }
    if (arg === "--min-online-workers") {
      const value = Number(argv[index + 1] ?? "");
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error("invalid value for --min-online-workers");
      }
      parsed.minOnlineWorkers = value;
      index += 1;
      continue;
    }
    if (arg === "--min-heartbeat-after") {
      const value = argv[index + 1]?.trim();
      if (!value) {
        throw new Error("missing value for --min-heartbeat-after");
      }
      parsed.minHeartbeatAfter = value;
      index += 1;
      continue;
    }

    throw new Error(`unknown argument: ${arg}`);
  }

  return parsed;
}

function printUsage() {
  console.log(
    "usage: node --import tsx scripts/sync-worker-healthcheck.ts [--provider-scope <scope>] [--online-window-minutes <minutes>] [--min-online-workers <count>] [--min-heartbeat-after <iso>]",
  );
}

async function main() {
  configureOperationalScriptRuntime();
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    process.exit(0);
  }

  const { getSyncWorkerHealthSummary } = await import("@/lib/sync/worker-health");
  const summary = await getSyncWorkerHealthSummary({
    providerScopes: args.providerScopes,
    onlineWindowMinutes: args.onlineWindowMinutes,
  });

  const minHeartbeatAfterMs =
    args.minHeartbeatAfter != null ? new Date(args.minHeartbeatAfter).getTime() : null;
  if (
    minHeartbeatAfterMs != null &&
    (!Number.isFinite(minHeartbeatAfterMs) || Number.isNaN(minHeartbeatAfterMs))
  ) {
    throw new Error("invalid ISO timestamp for --min-heartbeat-after");
  }

  const lastHeartbeatMs =
    summary.lastHeartbeatAt != null ? new Date(summary.lastHeartbeatAt).getTime() : null;
  const heartbeatSatisfied =
    minHeartbeatAfterMs == null ||
    (lastHeartbeatMs != null &&
      Number.isFinite(lastHeartbeatMs) &&
      lastHeartbeatMs >= minHeartbeatAfterMs);
  const pass = summary.onlineWorkers >= args.minOnlineWorkers && heartbeatSatisfied;

  console.log(
    JSON.stringify(
      {
        providerScopes: args.providerScopes,
        onlineWindowMinutes: args.onlineWindowMinutes,
        minOnlineWorkers: args.minOnlineWorkers,
        minHeartbeatAfter: args.minHeartbeatAfter,
        pass,
        reason: pass
          ? "healthy"
          : heartbeatSatisfied
            ? "insufficient_online_workers"
            : "fresh_heartbeat_not_observed",
        summary,
      },
      null,
      2,
    ),
  );

  process.exit(pass ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  printUsage();
  process.exit(1);
});
