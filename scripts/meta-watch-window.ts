import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { configureOperationalScriptRuntime } from "./_operational-runtime";
import {
  countConsecutiveSuccessfulMetaWatchWindowRuns,
  evaluateMetaWatchWindowAcceptance,
  evaluateMetaWatchWindowStability,
} from "@/lib/sync/meta-watch-window";

configureOperationalScriptRuntime();

type ParsedArgs = {
  expectedBuildId: string;
  baseUrl: string;
  attempts: number;
  sleepMs: number;
  stabilityWindowMinutes: number;
  stabilityPollMs: number;
  outFile: string | null;
  minimumSuccessfulRuns: number;
  workflowFile: string;
  remediationWorkflowFile: string;
  requireBlockModes: boolean;
  streakEligible: boolean;
};

type WorkflowRunSummary = {
  id: number;
  event: string | null;
  status: string | null;
  conclusion: string | null;
  createdAt: string | null;
  htmlUrl: string | null;
};

type WatchWindowRunSummary = {
  expectedBuildId: string;
  baseUrl: string;
  attempts: number;
  stabilityWindowMinutes: number;
  stabilityPollMs: number;
  observationStartedAt: string;
  observationFinishedAt: string;
  acceptedAtAttempt: number | null;
  acceptance: ReturnType<typeof evaluateMetaWatchWindowAcceptance>;
  stabilityAcceptance: ReturnType<typeof evaluateMetaWatchWindowAcceptance> | null;
  stabilityWindowPassed: boolean;
  manualRemediationObserved: boolean;
  manualRemediationCheckPerformed: boolean;
  manualRemediationRuns: WorkflowRunSummary[];
  cleanDeployAccepted: boolean;
  cleanDeployReasons: string[];
  previousSuccessfulRuns: number | null;
  previousConsecutiveSuccessfulRuns: number | null;
  currentConsecutiveSuccessfulRuns: number | null;
  minimumSuccessfulRuns: number;
  streakEligible: boolean;
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
    stabilityWindowMinutes: 30,
    stabilityPollMs: 60_000,
    outFile: null,
    minimumSuccessfulRuns: 3,
    workflowFile: "meta-watch-window.yml",
    remediationWorkflowFile: "meta-canary-remediation.yml",
    requireBlockModes: false,
    streakEligible: false,
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
    if (arg === "--stability-window-minutes") {
      parsed.stabilityWindowMinutes = parsePositiveInt(
        argv[index + 1],
        parsed.stabilityWindowMinutes,
      );
      index += 1;
      continue;
    }
    if (arg === "--stability-poll-ms") {
      parsed.stabilityPollMs = parsePositiveInt(argv[index + 1], parsed.stabilityPollMs);
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
    if (arg === "--remediation-workflow-file") {
      parsed.remediationWorkflowFile =
        argv[index + 1]?.trim() || parsed.remediationWorkflowFile;
      index += 1;
      continue;
    }
    if (arg === "--require-block-modes") {
      parsed.requireBlockModes = true;
      continue;
    }
    if (arg === "--streak-eligible") {
      parsed.streakEligible = true;
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
  currentRunId: number | null;
}) {
  const runs = await fetchWorkflowRuns({
    repository: input.repository,
    token: input.token,
    workflowFile: input.workflowFile,
    perPage: 20,
  });
  const previousRuns = runs.filter((run) => run.id !== input.currentRunId);
  return {
    previousSuccessfulRuns: previousRuns.filter((run) => run.conclusion === "success").length,
    previousConsecutiveSuccessfulRuns:
      countConsecutiveSuccessfulMetaWatchWindowRuns(previousRuns),
  };
}

async function fetchWorkflowRuns(input: {
  repository: string;
  token: string;
  workflowFile: string;
  perPage?: number;
  event?: string;
}): Promise<WorkflowRunSummary[]> {
  const url = new URL(
    `https://api.github.com/repos/${input.repository}/actions/workflows/${input.workflowFile}/runs`,
  );
  url.searchParams.set("branch", "main");
  url.searchParams.set("per_page", String(input.perPage ?? 20));
  if (input.event) {
    url.searchParams.set("event", input.event);
  }

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
    workflow_runs?: Array<{
      id?: number;
      event?: string | null;
      status?: string | null;
      conclusion?: string | null;
      created_at?: string | null;
      html_url?: string | null;
    }>;
  };

  return (payload.workflow_runs ?? []).map((run) => ({
    id: Number(run.id ?? 0),
    event: run.event ?? null,
    status: run.status ?? null,
    conclusion: run.conclusion ?? null,
    createdAt: run.created_at ?? null,
    htmlUrl: run.html_url ?? null,
  }));
}

function toTimestamp(value: string | null) {
  if (!value) return Number.NaN;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

async function fetchManualRemediationRuns(input: {
  repository: string;
  token: string;
  workflowFile: string;
  startedAt: string;
  finishedAt: string;
}) {
  const startedAt = toTimestamp(input.startedAt);
  const finishedAt = toTimestamp(input.finishedAt);
  const runs = await fetchWorkflowRuns({
    repository: input.repository,
    token: input.token,
    workflowFile: input.workflowFile,
    perPage: 50,
    event: "workflow_dispatch",
  });

  return runs.filter((run) => {
    const createdAt = toTimestamp(run.createdAt);
    return Number.isFinite(createdAt) && createdAt >= startedAt && createdAt <= finishedAt;
  });
}

async function writeOutput(outFile: string, payload: WatchWindowRunSummary) {
  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, JSON.stringify(payload, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const observationStartedAt = nowIso();

  let acceptance = evaluateMetaWatchWindowAcceptance({}, args.expectedBuildId, {
    requireBlockModes: args.requireBlockModes,
  });
  let acceptedAtAttempt: number | null = null;

  for (let attempt = 1; attempt <= args.attempts; attempt += 1) {
    const payload = await fetchBuildInfo(args.baseUrl);
    acceptance = evaluateMetaWatchWindowAcceptance(payload, args.expectedBuildId, {
      requireBlockModes: args.requireBlockModes,
    });

    if (acceptance.accepted) {
      acceptedAtAttempt = attempt;
      break;
    }

    if (attempt < args.attempts) {
      await sleep(args.sleepMs);
    }
  }

  let stabilityAcceptance = acceptance.accepted ? acceptance : null;
  let stabilityWindowPassed = false;
  if (acceptance.accepted) {
    const deadline = Date.parse(observationStartedAt) + args.stabilityWindowMinutes * 60_000;
    while (Date.now() < deadline) {
      const remainingMs = deadline - Date.now();
      if (remainingMs > 0) {
        await sleep(Math.min(args.stabilityPollMs, remainingMs));
      }
      if (Date.now() >= deadline) {
        break;
      }

      const payload = await fetchBuildInfo(args.baseUrl);
      stabilityAcceptance = evaluateMetaWatchWindowAcceptance(payload, args.expectedBuildId, {
        requireBlockModes: args.requireBlockModes,
      });
      if (!stabilityAcceptance.accepted) {
        break;
      }
    }
    stabilityWindowPassed = Boolean(stabilityAcceptance?.accepted);
  }

  const observationFinishedAt = nowIso();

  let previousSuccessfulRuns: number | null = null;
  let previousConsecutiveSuccessfulRuns: number | null = null;
  let currentConsecutiveSuccessfulRuns: number | null = null;
  let watchWindowSatisfied: boolean | null = null;
  let manualRemediationRuns: WorkflowRunSummary[] = [];
  let manualRemediationCheckPerformed = false;
  const repository = process.env.GITHUB_REPOSITORY?.trim();
  const token = process.env.GITHUB_TOKEN?.trim();
  const currentRunId = Number.parseInt(process.env.GITHUB_RUN_ID ?? "", 10);

  if (repository && token) {
    manualRemediationRuns = await fetchManualRemediationRuns({
      repository,
      token,
      workflowFile: args.remediationWorkflowFile,
      startedAt: observationStartedAt,
      finishedAt: observationFinishedAt,
    }).catch(() => []);
    manualRemediationCheckPerformed = true;

    const runHistory = await fetchPreviousSuccessfulWatchRuns({
      repository,
      token,
      workflowFile: args.workflowFile,
      currentRunId: Number.isFinite(currentRunId) ? currentRunId : null,
    }).catch(() => null);
    previousSuccessfulRuns = runHistory?.previousSuccessfulRuns ?? null;
    previousConsecutiveSuccessfulRuns =
      runHistory?.previousConsecutiveSuccessfulRuns ?? null;
    const stability = evaluateMetaWatchWindowStability({
      immediateAcceptance: acceptance,
      stabilityAcceptance,
      manualRemediationObserved: manualRemediationRuns.length > 0,
    });
    if (args.streakEligible && previousConsecutiveSuccessfulRuns != null) {
      currentConsecutiveSuccessfulRuns =
        previousConsecutiveSuccessfulRuns + (stability.cleanDeployAccepted ? 1 : 0);
      watchWindowSatisfied =
        currentConsecutiveSuccessfulRuns >= args.minimumSuccessfulRuns;
    }
  }

  const stability = evaluateMetaWatchWindowStability({
    immediateAcceptance: acceptance,
    stabilityAcceptance,
    manualRemediationObserved: manualRemediationRuns.length > 0,
  });

  const summary: WatchWindowRunSummary = {
    expectedBuildId: args.expectedBuildId,
    baseUrl: args.baseUrl,
    attempts: args.attempts,
    stabilityWindowMinutes: args.stabilityWindowMinutes,
    stabilityPollMs: args.stabilityPollMs,
    observationStartedAt,
    observationFinishedAt,
    acceptedAtAttempt,
    acceptance,
    stabilityAcceptance,
    stabilityWindowPassed,
    manualRemediationObserved: manualRemediationRuns.length > 0,
    manualRemediationCheckPerformed,
    manualRemediationRuns,
    cleanDeployAccepted: stability.cleanDeployAccepted,
    cleanDeployReasons: stability.reasons,
    previousSuccessfulRuns,
    previousConsecutiveSuccessfulRuns,
    currentConsecutiveSuccessfulRuns,
    minimumSuccessfulRuns: args.minimumSuccessfulRuns,
    streakEligible: args.streakEligible,
    watchWindowSatisfied,
    sampledAt: nowIso(),
  };

  if (args.outFile) {
    await writeOutput(args.outFile, summary);
  }

  console.log(JSON.stringify(summary, null, 2));

  if (!stability.cleanDeployAccepted) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
