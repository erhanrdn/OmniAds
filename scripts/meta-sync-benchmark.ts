import { writeFile } from "node:fs/promises";
import {
  collectMetaSyncReadinessSnapshot,
  summarizeMetaSyncBenchmarkSeries,
} from "@/lib/meta-sync-benchmark";
import { runMigrations } from "@/lib/migrations";
import {
  configureOperationalScriptRuntime,
  withOperationalStartupLogsSilenced,
} from "./_operational-runtime";

type BenchmarkArgs = {
  businessId: string | null;
  outPath: string | null;
  recentDays: number;
  priorityWindowDays: number;
  recentWindowMinutes: number;
  samples: number;
  intervalSeconds: number;
  dryRun: boolean;
  help: boolean;
};

function parseArgs(argv: string[]): BenchmarkArgs {
  let businessId: string | null = null;
  let outPath: string | null = null;
  let recentDays = Number(process.env.META_RECENT_RECOVERY_DAYS ?? 14) || 14;
  let priorityWindowDays = 3;
  let recentWindowMinutes = 15;
  let samples = 4;
  let intervalSeconds = 300;
  let dryRun = false;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if ((current === "--business" || current === "-b") && argv[index + 1]) {
      businessId = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if ((current === "--out" || current === "-o") && argv[index + 1]) {
      outPath = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if ((current === "--recent-days" || current === "-r") && argv[index + 1]) {
      const parsed = Number(argv[index + 1]);
      if (Number.isFinite(parsed) && parsed > 0) recentDays = parsed;
      index += 1;
      continue;
    }
    if (
      (current === "--priority-window-days" || current === "-p") &&
      argv[index + 1]
    ) {
      const parsed = Number(argv[index + 1]);
      if (Number.isFinite(parsed) && parsed > 0) priorityWindowDays = parsed;
      index += 1;
      continue;
    }
    if (
      (current === "--window-minutes" || current === "-w") &&
      argv[index + 1]
    ) {
      const parsed = Number(argv[index + 1]);
      if (Number.isFinite(parsed) && parsed > 0) recentWindowMinutes = parsed;
      index += 1;
      continue;
    }
    if ((current === "--samples" || current === "-s") && argv[index + 1]) {
      const parsed = Number(argv[index + 1]);
      if (Number.isFinite(parsed) && parsed > 0) samples = parsed;
      index += 1;
      continue;
    }
    if (
      (current === "--interval-seconds" || current === "-i") &&
      argv[index + 1]
    ) {
      const parsed = Number(argv[index + 1]);
      if (Number.isFinite(parsed) && parsed >= 0) intervalSeconds = parsed;
      index += 1;
      continue;
    }
    if (current === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (current === "--help" || current === "-h") {
      help = true;
      continue;
    }
    if (!current?.startsWith("-") && !businessId) {
      businessId = current;
    }
  }

  return {
    businessId,
    outPath,
    recentDays,
    priorityWindowDays,
    recentWindowMinutes,
    samples,
    intervalSeconds,
    dryRun,
    help,
  };
}

function printUsage() {
  console.log(
    [
      "usage: node --import tsx scripts/meta-sync-benchmark.ts --business <businessId> [options]",
      "",
      "options:",
      "  --recent-days <n>             Recent user-facing window to evaluate (default: META_RECENT_RECOVERY_DAYS or 14)",
      "  --priority-window-days <n>    Short priority window to evaluate (default: 3)",
      "  --window-minutes <n>          Drain-rate evidence window in minutes (default: 15)",
      "  --samples <n>                 Number of benchmark samples to capture (default: 4)",
      "  --interval-seconds <n>        Seconds to wait between samples (default: 300)",
      "  --out <path>                  Write JSON output to a file",
      "  --dry-run                     Print resolved arguments without touching the database",
      "  --help                        Show this message",
    ].join("\n"),
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const runtime = configureOperationalScriptRuntime();
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    return;
  }
  if (!args.businessId) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const resolved = {
    businessId: args.businessId,
    recentDays: args.recentDays,
    priorityWindowDays: args.priorityWindowDays,
    recentWindowMinutes: args.recentWindowMinutes,
    samples: args.samples,
    intervalSeconds: args.intervalSeconds,
    runtimeMigrationsEnabled: runtime.runtimeMigrationsEnabled,
  };

  if (args.dryRun) {
    console.log(
      JSON.stringify(
        {
          mode: "dry_run",
          ...resolved,
        },
        null,
        2,
      ),
    );
    return;
  }

  const payload = await withOperationalStartupLogsSilenced(async () => {
    if (runtime.runtimeMigrationsEnabled) {
      await runMigrations();
    }

    const samples = [];
    for (let index = 0; index < args.samples; index += 1) {
      samples.push(
        await collectMetaSyncReadinessSnapshot({
          businessId: args.businessId as string,
          recentDays: args.recentDays,
          priorityWindowDays: args.priorityWindowDays,
          recentWindowMinutes: args.recentWindowMinutes,
        }),
      );
      if (index < args.samples - 1 && args.intervalSeconds > 0) {
        await sleep(args.intervalSeconds * 1000);
      }
    }

    return {
      capturedAt: new Date().toISOString(),
      businessId: args.businessId,
      config: {
        recentDays: args.recentDays,
        priorityWindowDays: args.priorityWindowDays,
        recentWindowMinutes: args.recentWindowMinutes,
        samples: args.samples,
        intervalSeconds: args.intervalSeconds,
      },
      samples,
      summary: summarizeMetaSyncBenchmarkSeries(samples),
    };
  });

  const output = JSON.stringify(payload, null, 2);
  if (args.outPath) {
    await writeFile(args.outPath, `${output}\n`, "utf8");
  }
  console.log(output);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
