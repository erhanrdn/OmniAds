import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  buildNormalizationRunDir,
  getOptionalCliValue,
  parseCliArgs,
  writeJsonFile,
  writeTextFile,
} from "./db-normalization-support";
import { configureOperationalScriptRuntime } from "./_operational-runtime";

type CutoverStep = {
  name: string;
  command: string;
  required: boolean;
};

type CutoverResult = {
  name: string;
  command: string;
  ok: boolean;
  exitCode: number | null;
  stdout: string | null;
  stderr: string | null;
};

function quoteShell(value: string) {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function readBooleanFlag(value: string | null | undefined, fallback = false) {
  if (value == null) return fallback;
  return value === "true" || value === "1";
}

function buildCaptureCommand(input: {
  runDir: string;
  stage: "before" | "after";
  includeWriteBenchmark: boolean;
}) {
  const args = [
    "node --import tsx scripts/db-normalization-capture.ts",
    `--run-dir ${quoteShell(input.runDir)}`,
    `--stage ${input.stage}`,
  ];
  if (input.includeWriteBenchmark) {
    args.push("--include-write-benchmark");
  }
  return args.join(" ");
}

function buildCompareCommand(runDir: string) {
  return [
    "node --import tsx scripts/db-normalization-compare.ts",
    `--run-dir ${quoteShell(runDir)}`,
  ].join(" ");
}

function runCommand(step: CutoverStep): CutoverResult {
  const result = spawnSync(step.command, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    shell: true,
  });

  return {
    name: step.name,
    command: step.command,
    ok: result.status === 0,
    exitCode: result.status,
    stdout: result.stdout?.trim() || null,
    stderr: result.stderr?.trim() || null,
  };
}

function buildMarkdown(input: {
  runDir: string;
  dryRun: boolean;
  steps: CutoverStep[];
  results: CutoverResult[];
}) {
  const lines: string[] = [];
  lines.push("# DB Normalization Cutover");
  lines.push("");
  lines.push(`- Run dir: \`${input.runDir}\``);
  lines.push(`- Dry run: \`${String(input.dryRun)}\``);
  lines.push("");
  lines.push("## Steps");
  for (const step of input.steps) {
    lines.push(`- ${step.name}: \`${step.command}\``);
  }

  if (input.results.length > 0) {
    lines.push("");
    lines.push("## Results");
    for (const result of input.results) {
      lines.push(
        `- ${result.name}: ok=${String(result.ok)} exitCode=${String(result.exitCode)}`,
      );
    }
  }

  return lines.join("\n");
}

async function main() {
  configureOperationalScriptRuntime();
  const parsed = parseCliArgs(process.argv.slice(2));
  const runDir = buildNormalizationRunDir({
    runDir: getOptionalCliValue(parsed, "run-dir", null) ?? undefined,
  });
  const dryRun = parsed.flags.has("dry-run");
  const includeWriteBenchmark = readBooleanFlag(
    getOptionalCliValue(parsed, "include-write-benchmark", "false"),
    false,
  );
  const backupCommand = getOptionalCliValue(parsed, "backup-command", null);
  const migrationCommand =
    getOptionalCliValue(parsed, "migration-command", "npm run db:migrate") ??
    "npm run db:migrate";

  const steps: CutoverStep[] = [
    {
      name: "capture_before",
      command: buildCaptureCommand({
        runDir,
        stage: "before",
        includeWriteBenchmark,
      }),
      required: true,
    },
    ...(backupCommand
      ? [
          {
            name: "backup",
            command: backupCommand,
            required: true,
          } satisfies CutoverStep,
        ]
      : []),
    {
      name: "migrate",
      command: migrationCommand,
      required: true,
    },
    {
      name: "capture_after",
      command: buildCaptureCommand({
        runDir,
        stage: "after",
        includeWriteBenchmark,
      }),
      required: true,
    },
    {
      name: "compare",
      command: buildCompareCommand(runDir),
      required: true,
    },
  ];

  const results: CutoverResult[] = [];
  if (!dryRun) {
    for (const step of steps) {
      const result = runCommand(step);
      results.push(result);
      if (!result.ok && step.required) {
        break;
      }
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    runDir,
    dryRun,
    includeWriteBenchmark,
    backupCommand,
    migrationCommand,
    steps,
    results,
    completed: dryRun
      ? false
      : results.length === steps.length && results.every((result) => result.ok),
  };

  await writeJsonFile(path.join(runDir, "cutover-plan.json"), payload);
  await writeTextFile(
    path.join(runDir, "cutover-plan.md"),
    buildMarkdown({ runDir, dryRun, steps, results }),
  );

  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
