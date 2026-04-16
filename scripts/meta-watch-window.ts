import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { configureOperationalScriptRuntime } from "./_operational-runtime";
import { evaluateMetaWatchWindowAcceptance } from "@/lib/sync/meta-watch-window";

configureOperationalScriptRuntime();

type ParsedArgs = {
  expectedBuildId: string;
  baseUrl: string;
  attempts: number;
  sleepMs: number;
  outFile: string | null;
  minimumSuccessfulRuns: number;
  workflowFile: string;
};

type WatchWindowRunSummary = {
  expectedBuildId: string;
  baseUrl: string;
  attempts: number;
  acceptedAtAttempt: number | null;
  acceptance: ReturnType<typeof evaluateMetaWatchWindowAcceptance>;
  previousSuccessfulRuns: number | null;
  minimumSuccessfulRuns: number;
  watchWindowSatisfied: boolean | null;
  sampledAt: string;
};

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    expectedBuildId: "",
    baseUrl: "https://adsecute.com",
    attempts: 12,
    sleepMs: 5_000,
    outFile: null,
    minimumSuccessfulRuns: 3,
    workflowFile: "meta-watch-window.yml",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--expected-build-id") {
      parsed.expectedBuildId = argv[index + 1]?.trim() ?? "";
      index += 1;
      continue;
    }
    if (arg === "--base-url") {
      parsed.baseUrl = argv[index + 1]?.trim() ?? parsed.baseUrl;
      index += 1;
      continue;
    }
    if (arg === "--attempts") {
      parsed.attempts = parsePositiveInt(argv[index + 1], parsed.attempts);
      index += 1;
      continue;
    }
    if (arg === "--sleep-ms") {
      parsed.sleepMs = parsePositiveInt(argv[index + 1], parsed.sleepMs);
      index += 1;
      continue;
    }
    if (arg === "--out-file") {
      parsed.outFile = argv[index + 1]?.trim() ?? null;
      index += 1;
      continue;
    }
    if (arg === "--minimum-successful-runs") {
      parsed.minimumSuccessfulRuns = parsePositiveInt(
        argv[index + 1],
        parsed.minimumSuccessfulRuns,
      );
      index += 1;
      continue;
    }
    if (arg === "--workflow-file") {
      parsed.workflowFile = argv[index + 1]?.trim() || parsed.workflowFile;
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }

  if (!parsed.expectedBuildId) {
    throw new Error("--expected-build-id is required");
  }

  return parsed;
}

async function fetchBuildInfo(baseUrl: string) {
  const url = new URL("/api/build-info", `${baseUrl.replace(/\/+$/, "")}/`).toString();
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`build-info returned HTTP ${response.status}`);
  }

  return payload;
}

async function fetchPreviousSuccessfulWatchRuns(input: {
  repository: string;
  token: string;
  workflowFile: string;
}) {
  const url = new URL(
    `https://api.github.com/repos/${input.repository}/actions/workflows/${input.workflowFile}/runs`,
  );
  url.searchParams.set("branch", "main");
  url.searchParams.set("status", "completed");
  url.searchParams.set("per_page", "20");

  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${input.token}`,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`GitHub workflow runs API returned HTTP ${response.status}`);
  }

  const payload = (await response.json()) as {
    workflow_runs?: Array<{ conclusion?: string | null }>;
  };

  return (payload.workflow_runs ?? []).filter((run) => run.conclusion === "success").length;
}

async function writeOutput(outFile: string, payload: WatchWindowRunSummary) {
  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, JSON.stringify(payload, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let acceptance = evaluateMetaWatchWindowAcceptance({}, args.expectedBuildId);
  let acceptedAtAttempt: number | null = null;

  for (let attempt = 1; attempt <= args.attempts; attempt += 1) {
    const payload = await fetchBuildInfo(args.baseUrl);
    acceptance = evaluateMetaWatchWindowAcceptance(payload, args.expectedBuildId);

    if (acceptance.accepted) {
      acceptedAtAttempt = attempt;
      break;
    }

    if (attempt < args.attempts) {
      await sleep(args.sleepMs);
    }
  }

  let previousSuccessfulRuns: number | null = null;
  let watchWindowSatisfied: boolean | null = null;
  const repository = process.env.GITHUB_REPOSITORY?.trim();
  const token = process.env.GITHUB_TOKEN?.trim();

  if (repository && token) {
    previousSuccessfulRuns = await fetchPreviousSuccessfulWatchRuns({
      repository,
      token,
      workflowFile: args.workflowFile,
    }).catch(() => null);
    if (previousSuccessfulRuns != null) {
      watchWindowSatisfied =
        previousSuccessfulRuns + (acceptance.accepted ? 1 : 0) >= args.minimumSuccessfulRuns;
    }
  }

  const summary: WatchWindowRunSummary = {
    expectedBuildId: args.expectedBuildId,
    baseUrl: args.baseUrl,
    attempts: args.attempts,
    acceptedAtAttempt,
    acceptance,
    previousSuccessfulRuns,
    minimumSuccessfulRuns: args.minimumSuccessfulRuns,
    watchWindowSatisfied,
    sampledAt: nowIso(),
  };

  if (args.outFile) {
    await writeOutput(args.outFile, summary);
  }

  console.log(JSON.stringify(summary, null, 2));

  if (!acceptance.accepted) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
