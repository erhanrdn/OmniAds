import { configureOperationalScriptRuntime } from "@/scripts/_operational-runtime";
import {
  buildReleaseAuthorityCanonicalDoc,
  readReleaseAuthorityCanonicalDoc,
} from "@/lib/release-authority/doc";
import {
  verifyReleaseAuthorityManifestIntegrity,
  resolveLocalGitHeadSha,
  resolveOriginMainSha,
} from "@/lib/release-authority/integrity";
import { buildReleaseAuthorityReport } from "@/lib/release-authority/report";
import type { ReleaseAuthorityReport } from "@/lib/release-authority/types";

configureOperationalScriptRuntime();

type VerifyMode = "preflight" | "post_deploy";

interface RemoteJsonResult<T> {
  url: string | null;
  status: "passed" | "failed" | "skipped";
  httpStatus: number | null;
  payload: T | null;
  error: string | null;
}

function tryReadCanonicalDoc() {
  try {
    return readReleaseAuthorityCanonicalDoc();
  } catch {
    return null;
  }
}

function normalizeBaseUrl(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function parseArgs(argv: string[]) {
  const options = {
    mode: "preflight" as VerifyMode,
    baseUrl: null as string | null,
    expectedBuildId: null as string | null,
    timeoutMs: 15_000,
  };

  for (const arg of argv) {
    if (arg.startsWith("--mode=")) {
      const value = arg.slice("--mode=".length).trim();
      if (value === "preflight" || value === "post_deploy") {
        options.mode = value;
      }
      continue;
    }
    if (arg.startsWith("--base-url=")) {
      options.baseUrl = normalizeBaseUrl(arg.slice("--base-url=".length));
      continue;
    }
    if (arg.startsWith("--expected-build-id=")) {
      options.expectedBuildId =
        arg.slice("--expected-build-id=".length).trim() || null;
      continue;
    }
    if (arg.startsWith("--timeout-ms=")) {
      const parsed = Number(arg.slice("--timeout-ms=".length).trim());
      if (Number.isFinite(parsed) && parsed > 0) {
        options.timeoutMs = parsed;
      }
    }
  }

  return options;
}

async function fetchJson<T>(input: {
  baseUrl: string | null;
  path: string;
  timeoutMs: number;
}): Promise<RemoteJsonResult<T>> {
  if (!input.baseUrl) {
    return {
      url: null,
      status: "skipped",
      httpStatus: null,
      payload: null,
      error: null,
    };
  }

  const url = new URL(input.path, `${input.baseUrl}/`).toString();
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(input.timeoutMs),
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as T | null;
    return {
      url,
      status: response.ok ? "passed" : "failed",
      httpStatus: response.status,
      payload,
      error: response.ok ? null : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      url,
      status: "failed",
      httpStatus: null,
      payload: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildPreflightSummary(input: {
  report: ReleaseAuthorityReport;
  integrity: ReturnType<typeof verifyReleaseAuthorityManifestIntegrity>;
  canonicalDocMatches: boolean;
}) {
  const blockers: string[] = [];
  const notes: string[] = [];

  if (input.integrity.missingPaths.length > 0) {
    blockers.push(
      `Manifest references missing path(s): ${input.integrity.missingPaths.join(", ")}`,
    );
  }

  if (input.integrity.bannerFailures.length > 0) {
    blockers.push(
      `Phase 02-06 reference docs are missing the V3-01 release-authority banner in ${input.integrity.bannerFailures
        .map((entry) => entry.path)
        .join(", ")}`,
    );
  }

  if (input.report.verdicts.docsVsRuntime.status !== "aligned") {
    blockers.push(input.report.verdicts.docsVsRuntime.summary);
  }

  if (input.report.verdicts.flagsVsRuntime.status !== "aligned") {
    blockers.push(input.report.verdicts.flagsVsRuntime.summary);
  }

  if (!input.canonicalDocMatches) {
    blockers.push(
      "Canonical release-authority doc does not match the generated V3 authority output. Run scripts/generate-release-authority-doc.ts and commit the result.",
    );
  }

  if (input.report.runtime.currentMainShaSource === "unresolved") {
    blockers.push("Remote main SHA could not be resolved in preflight.");
  }

  if (input.report.verdicts.liveVsMain.status === "drifted") {
    notes.push(
      "Local release candidate differs from current remote main. This is expected on pull requests but must align before an exact-SHA production deploy.",
    );
  }

  return {
    result: blockers.length === 0 ? "pass" : "fail",
    blockers,
    notes,
  };
}

function buildPostDeploySummary(input: {
  expectedBuildId: string | null;
  buildInfo: RemoteJsonResult<{ buildId?: string }>;
  authority: RemoteJsonResult<ReleaseAuthorityReport>;
}) {
  const blockers: string[] = [];
  const notes: string[] = [];

  if (input.buildInfo.status !== "passed") {
    blockers.push(
      input.buildInfo.error
        ? `Build info verification failed: ${input.buildInfo.error}`
        : "Build info verification failed.",
    );
  }

  const observedBuildId =
    typeof input.buildInfo.payload?.buildId === "string"
      ? input.buildInfo.payload.buildId
      : null;
  if (input.expectedBuildId && observedBuildId !== input.expectedBuildId) {
    blockers.push(
      `Build info mismatch: expected ${input.expectedBuildId}, observed ${observedBuildId ?? "unknown"}.`,
    );
  }

  if (input.authority.status !== "passed" || !input.authority.payload) {
    blockers.push(
      input.authority.error
        ? `Release authority verification failed: ${input.authority.error}`
        : "Release authority verification failed.",
    );
  } else {
    const report = input.authority.payload;
    if (
      input.expectedBuildId &&
      report.runtime.currentLiveSha !== input.expectedBuildId
    ) {
      blockers.push(
        `Release authority live SHA mismatch: expected ${input.expectedBuildId}, observed ${report.runtime.currentLiveSha}.`,
      );
    }

    if (observedBuildId && report.runtime.currentLiveSha !== observedBuildId) {
      blockers.push(
        `Release authority live SHA ${report.runtime.currentLiveSha} does not match build-info ${observedBuildId}.`,
      );
    }

    if (report.verdicts.liveVsMain.status !== "aligned") {
      blockers.push(report.verdicts.liveVsMain.summary);
    }

    if (report.verdicts.docsVsRuntime.status !== "aligned") {
      blockers.push(report.verdicts.docsVsRuntime.summary);
    }

    if (report.verdicts.flagsVsRuntime.status !== "aligned") {
      blockers.push(report.verdicts.flagsVsRuntime.summary);
    }

    if (report.unresolvedDriftItems.length > 0) {
      blockers.push(
        `Release authority still reports unresolved drift items: ${report.unresolvedDriftItems
          .map((item) => item.id)
          .join(", ")}`,
      );
    }

    notes.push(
      `Feature authority source: ${report.release.featureAuthoritySource.apiRoute} + ${report.release.featureAuthoritySource.canonicalDoc}`,
    );
  }

  return {
    result: blockers.length === 0 ? "pass" : "fail",
    blockers,
    notes,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.mode === "post_deploy" && !options.baseUrl) {
    console.error(
      "post_deploy mode requires --base-url=https://adsecute.com",
    );
    process.exit(1);
  }

  if (options.mode === "preflight") {
    const report = buildReleaseAuthorityReport({
      currentLiveSha: resolveLocalGitHeadSha(),
      currentMainSha: resolveOriginMainSha(),
      currentMainShaSource: "git_remote",
      nodeEnv: process.env.NODE_ENV ?? "development",
    });
    const integrity = verifyReleaseAuthorityManifestIntegrity();
    const canonicalDoc = tryReadCanonicalDoc();
    const summary = buildPreflightSummary({
      report,
      integrity,
      canonicalDocMatches:
        canonicalDoc !== null &&
        canonicalDoc ===
        buildReleaseAuthorityCanonicalDoc(report),
    });

    console.log(
      JSON.stringify(
        {
          mode: options.mode,
          capturedAt: new Date().toISOString(),
          report,
          integrity,
          summary,
        },
        null,
        2,
      ),
    );

    if (summary.result !== "pass") {
      process.exit(1);
    }
    return;
  }

  const [buildInfo, authority] = await Promise.all([
    fetchJson<{ buildId?: string }>({
      baseUrl: options.baseUrl,
      path: "/api/build-info",
      timeoutMs: options.timeoutMs,
    }),
    fetchJson<ReleaseAuthorityReport>({
      baseUrl: options.baseUrl,
      path: "/api/release-authority",
      timeoutMs: options.timeoutMs,
    }),
  ]);

  const summary = buildPostDeploySummary({
    expectedBuildId: options.expectedBuildId,
    buildInfo,
    authority,
  });

  if (
    authority.payload &&
    tryReadCanonicalDoc() !==
      buildReleaseAuthorityCanonicalDoc(authority.payload)
  ) {
    summary.result = "fail";
    summary.blockers.push(
      "Canonical release-authority doc does not literally match the live release-authority payload.",
    );
  }

  console.log(
    JSON.stringify(
      {
        mode: options.mode,
        capturedAt: new Date().toISOString(),
        targetBaseUrl: options.baseUrl,
        expectedBuildId: options.expectedBuildId,
        buildInfo,
        authority,
        summary,
      },
      null,
      2,
    ),
  );

  if (summary.result !== "pass") {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
