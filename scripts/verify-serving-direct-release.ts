import { readFile } from "node:fs/promises";
import { configureOperationalScriptRuntime } from "@/scripts/_operational-runtime";
import { readServingFreshnessStatus } from "@/lib/serving-freshness-status";
import {
  buildServingDirectReleaseSmokeRoutes,
  buildServingDirectReleaseWindow,
  summarizeServingDirectReleaseVerification,
  type ServingDirectReleaseBuildInfoResult,
  type ServingDirectReleaseMode,
  type ServingDirectReleaseRouteResult,
} from "@/lib/serving-direct-release";

configureOperationalScriptRuntime();

async function withStartupLogsSilenced<T>(callback: () => Promise<T>) {
  const originalInfo = console.info;
  console.info = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].startsWith("[startup]")) {
      return;
    }
    originalInfo(...args);
  };
  try {
    return await callback();
  } finally {
    console.info = originalInfo;
  }
}

function normalizeDate(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
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

function normalizeSessionCookieToken(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const match = text.match(/(?:^|;\s*)omniads_session=([^;\s]+)/i);
  return (match?.[1] ?? text).trim() || null;
}

function parseArgs(argv: string[]) {
  const [businessId, ...rest] = argv;
  const options = {
    businessId: businessId?.trim() || "",
    releaseMode: "preflight" as ServingDirectReleaseMode,
    startDate: null as string | null,
    endDate: null as string | null,
    overviewProvider: null as "google" | "meta" | null,
    demographicsDimension: "country",
    baseUrl: null as string | null,
    sessionCookie: null as string | null,
    sessionCookieFile: null as string | null,
    expectedBuildId: null as string | null,
    timeoutMs: 30_000,
  };

  for (const arg of rest) {
    if (arg.startsWith("--mode=")) {
      const value = arg.slice("--mode=".length).trim();
      if (value === "preflight" || value === "post_deploy") {
        options.releaseMode = value;
      }
      continue;
    }
    if (arg.startsWith("--start-date=")) {
      options.startDate = normalizeDate(arg.slice("--start-date=".length));
      continue;
    }
    if (arg.startsWith("--end-date=")) {
      options.endDate = normalizeDate(arg.slice("--end-date=".length));
      continue;
    }
    if (arg.startsWith("--overview-provider=")) {
      const value = arg.slice("--overview-provider=".length).trim();
      if (value === "google" || value === "meta") {
        options.overviewProvider = value;
      }
      continue;
    }
    if (arg.startsWith("--demographics-dimension=")) {
      const value = arg.slice("--demographics-dimension=".length).trim();
      if (value) {
        options.demographicsDimension = value;
      }
      continue;
    }
    if (arg.startsWith("--base-url=")) {
      options.baseUrl = normalizeBaseUrl(arg.slice("--base-url=".length));
      continue;
    }
    if (arg.startsWith("--session-cookie=")) {
      options.sessionCookie = normalizeSessionCookieToken(
        arg.slice("--session-cookie=".length),
      );
      continue;
    }
    if (arg.startsWith("--session-cookie-file=")) {
      options.sessionCookieFile =
        arg.slice("--session-cookie-file=".length).trim() || null;
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

async function resolveSessionCookieToken(input: {
  sessionCookie: string | null;
  sessionCookieFile: string | null;
}) {
  if (input.sessionCookie) return input.sessionCookie;
  if (!input.sessionCookieFile) return null;
  const fileContents = await readFile(input.sessionCookieFile, "utf8");
  return normalizeSessionCookieToken(fileContents);
}

function buildCookieHeader(token: string | null) {
  return token ? `omniads_session=${token}` : null;
}

async function fetchBuildInfo(input: {
  baseUrl: string | null;
  expectedBuildId: string | null;
  timeoutMs: number;
}) {
  if (!input.baseUrl) {
    return {
      path: "/api/build-info",
      url: null,
      status: "skipped",
      httpStatus: null,
      observedBuildId: null,
      expectedBuildId: input.expectedBuildId,
      matchesExpectedBuildId: null,
      error: null,
    } satisfies ServingDirectReleaseBuildInfoResult;
  }

  const url = new URL("/api/build-info", `${input.baseUrl}/`).toString();
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(input.timeoutMs),
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as
      | { buildId?: unknown }
      | null;
    const observedBuildId =
      typeof payload?.buildId === "string" ? payload.buildId : null;
    const matchesExpectedBuildId = input.expectedBuildId
      ? observedBuildId === input.expectedBuildId
      : null;
    const status =
      response.ok && (input.expectedBuildId ? matchesExpectedBuildId !== false : true)
        ? "passed"
        : "failed";

    return {
      path: "/api/build-info",
      url,
      status,
      httpStatus: response.status,
      observedBuildId,
      expectedBuildId: input.expectedBuildId,
      matchesExpectedBuildId,
      error: response.ok ? null : `HTTP ${response.status}`,
    } satisfies ServingDirectReleaseBuildInfoResult;
  } catch (error) {
    return {
      path: "/api/build-info",
      url,
      status: "failed",
      httpStatus: null,
      observedBuildId: null,
      expectedBuildId: input.expectedBuildId,
      matchesExpectedBuildId: null,
      error: error instanceof Error ? error.message : String(error),
    } satisfies ServingDirectReleaseBuildInfoResult;
  }
}

async function fetchSmokeRoutes(input: {
  baseUrl: string | null;
  businessId: string;
  startDate: string;
  endDate: string;
  demographicsDimension: string;
  cookieHeader: string | null;
  timeoutMs: number;
}) {
  if (!input.baseUrl) return [] as ServingDirectReleaseRouteResult[];

  const routes = buildServingDirectReleaseSmokeRoutes({
    baseUrl: input.baseUrl,
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
    demographicsDimension: input.demographicsDimension,
  });

  if (!input.cookieHeader) {
    return routes.map(
      (route) =>
        ({
          routeId: route.routeId,
          path: route.path,
          url: route.url,
          status: "skipped",
          httpStatus: null,
          contentType: null,
          error: null,
          skippedReason:
            "Authenticated route smoke requires --session-cookie or --session-cookie-file.",
          requiresAuth: true,
        }) satisfies ServingDirectReleaseRouteResult,
    );
  }

  const results: ServingDirectReleaseRouteResult[] = [];
  for (const route of routes) {
    try {
      const response = await fetch(route.url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Cookie: input.cookieHeader,
        },
        signal: AbortSignal.timeout(input.timeoutMs),
        cache: "no-store",
      });
      await response.arrayBuffer();
      results.push({
        routeId: route.routeId,
        path: route.path,
        url: route.url,
        status: response.ok ? "passed" : "failed",
        httpStatus: response.status,
        contentType: response.headers.get("content-type"),
        error: response.ok ? null : `HTTP ${response.status}`,
        skippedReason: null,
        requiresAuth: true,
      });
    } catch (error) {
      results.push({
        routeId: route.routeId,
        path: route.path,
        url: route.url,
        status: "failed",
        httpStatus: null,
        contentType: null,
        error: error instanceof Error ? error.message : String(error),
        skippedReason: null,
        requiresAuth: true,
      });
    }
  }

  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.businessId) {
    console.error(
      "usage: node --import tsx scripts/verify-serving-direct-release.ts <businessId> [--mode=preflight|post_deploy] [--start-date=YYYY-MM-DD] [--end-date=YYYY-MM-DD] [--overview-provider=google|meta] [--demographics-dimension=<dimension>] [--base-url=https://host] [--session-cookie=<token>] [--session-cookie-file=/path/to/file] [--expected-build-id=<sha>] [--timeout-ms=30000]",
    );
    process.exit(1);
  }

  const defaultWindow = buildServingDirectReleaseWindow();
  const startDate = args.startDate ?? defaultWindow.startDate;
  const endDate = args.endDate ?? defaultWindow.endDate;

  await withStartupLogsSilenced(async () => {
    const sessionCookieToken = await resolveSessionCookieToken({
      sessionCookie: args.sessionCookie,
      sessionCookieFile: args.sessionCookieFile,
    });
    const cookieHeader = buildCookieHeader(sessionCookieToken);

    const [freshnessStatus, buildInfo, routeResults] = await Promise.all([
      readServingFreshnessStatus({
        businessId: args.businessId,
        startDate,
        endDate,
        overviewProvider: args.overviewProvider,
        demographicsDimension: args.demographicsDimension,
      }),
      fetchBuildInfo({
        baseUrl: args.baseUrl,
        expectedBuildId: args.expectedBuildId,
        timeoutMs: args.timeoutMs,
      }),
      fetchSmokeRoutes({
        baseUrl: args.baseUrl,
        businessId: args.businessId,
        startDate,
        endDate,
        demographicsDimension: args.demographicsDimension,
        cookieHeader,
        timeoutMs: args.timeoutMs,
      }),
    ]);

    const summary = summarizeServingDirectReleaseVerification({
      releaseMode: args.releaseMode,
      freshnessStatus,
      buildInfo,
      routeResults,
      authenticatedRouteSmokeEnabled: Boolean(args.baseUrl && cookieHeader),
    });

    console.log(
      JSON.stringify(
        {
          releaseMode: args.releaseMode,
          businessId: args.businessId,
          capturedAt: new Date().toISOString(),
          verificationWindow: {
            startDate,
            endDate,
            overviewProvider: args.overviewProvider,
            demographicsDimension: args.demographicsDimension,
          },
          targetBaseUrl: args.baseUrl,
          expectedBuildId: args.expectedBuildId,
          httpSmoke: {
            buildInfoEnabled: Boolean(args.baseUrl),
            authenticatedRoutesEnabled: Boolean(args.baseUrl && cookieHeader),
            authMode: cookieHeader ? "omniads_session_cookie" : "none",
            buildInfo,
            routes: routeResults,
          },
          freshnessStatus,
          summary,
        },
        null,
        2,
      ),
    );
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
