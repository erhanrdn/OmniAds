import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  getGoogleAdsAdvisorReport,
  getGoogleAdsOverviewReport,
  getGoogleAdsProductsReport,
  getGoogleAdsSearchIntelligenceReport,
} from "@/lib/google-ads/serving";

type SurfaceName =
  | "overview"
  | "advisor"
  | "search_intelligence"
  | "products"
  | "status";

interface ParsedArgs {
  businessId: string;
  startDate: string;
  endDate: string;
  baseUrl: string | null;
  sessionCookie: string | null;
  sessionCookieFile: string | null;
  timeoutMs: number;
}

interface SurfaceResult {
  surface: SurfaceName;
  ok: boolean;
  durationMs: number;
  skipped: boolean;
  detail: string;
}

function parseArgs(argv: string[]) {
  const parsed = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value =
      argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[index + 1] : "true";
    parsed.set(key, value);
    if (value !== "true") index += 1;
  }
  return parsed;
}

function normalizeBaseUrl(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  try {
    return new URL(text).toString().replace(/\/+$/, "");
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

function describeError(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function shouldGoogleAdsCloseoutSmokeFail(results: SurfaceResult[]) {
  return results.some((result) => !result.skipped && !result.ok);
}

export function parseGoogleAdsCloseoutSmokeArgs(argv: string[]): ParsedArgs {
  const args = parseArgs(argv);
  const businessId = args.get("business-id") ?? args.get("businessId");
  const startDate = args.get("start-date") ?? args.get("startDate");
  const endDate = args.get("end-date") ?? args.get("endDate");
  if (!businessId || !startDate || !endDate) {
    throw new Error(
      "Missing required args. Required: --business-id --start-date --end-date",
    );
  }
  const timeoutMs = Number(args.get("timeout-ms") ?? "30000");
  return {
    businessId,
    startDate,
    endDate,
    baseUrl: normalizeBaseUrl(args.get("base-url") ?? args.get("baseUrl") ?? null),
    sessionCookie: normalizeSessionCookieToken(
      args.get("session-cookie") ?? args.get("sessionCookie") ?? null,
    ),
    sessionCookieFile:
      args.get("session-cookie-file") ?? args.get("sessionCookieFile") ?? null,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30000,
  };
}

export async function measureGoogleAdsCloseoutSurface(
  surface: SurfaceName,
  timeoutMs: number,
  operation: () => Promise<string>,
): Promise<SurfaceResult> {
  const startedAt = performance.now();
  try {
    const detail = await Promise.race([
      operation(),
      new Promise<string>((_, reject) => {
        const timer = setTimeout(() => {
          clearTimeout(timer);
          reject(new Error(`Timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
    return {
      surface,
      ok: true,
      skipped: false,
      durationMs: Number((performance.now() - startedAt).toFixed(2)),
      detail,
    };
  } catch (error) {
    return {
      surface,
      ok: false,
      skipped: false,
      durationMs: Number((performance.now() - startedAt).toFixed(2)),
      detail: describeError(error),
    };
  }
}

async function measureStatusSurface(input: {
  businessId: string;
  startDate: string;
  endDate: string;
  baseUrl: string | null;
  cookieHeader: string | null;
  timeoutMs: number;
}): Promise<SurfaceResult> {
  if (!input.baseUrl) {
    return {
      surface: "status",
      ok: false,
      skipped: true,
      durationMs: 0,
      detail: "Skipped: --base-url was not provided.",
    };
  }
  if (!input.cookieHeader) {
    return {
      surface: "status",
      ok: false,
      skipped: true,
      durationMs: 0,
      detail: "Skipped: authenticated status route smoke requires --session-cookie or --session-cookie-file.",
    };
  }

  const url = new URL("/api/google-ads/status", `${input.baseUrl}/`);
  url.searchParams.set("businessId", input.businessId);
  url.searchParams.set("dateRange", "custom");
  url.searchParams.set("customStart", input.startDate);
  url.searchParams.set("customEnd", input.endDate);

  return measureGoogleAdsCloseoutSurface("status", input.timeoutMs, async () => {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (input.cookieHeader) {
      headers.Cookie = input.cookieHeader;
    }
    const response = await fetch(url.toString(), {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(input.timeoutMs),
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as
      | { state?: unknown }
      | { error?: unknown }
      | null;
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return `state=${String(payload && "state" in payload ? payload.state ?? "unknown" : "unknown")}`;
  });
}

async function main() {
  const parsed = parseGoogleAdsCloseoutSmokeArgs(process.argv.slice(2));
  const sessionCookieToken = await resolveSessionCookieToken({
    sessionCookie: parsed.sessionCookie,
    sessionCookieFile: parsed.sessionCookieFile,
  });
  const cookieHeader = buildCookieHeader(sessionCookieToken);

  const reportParams = {
    businessId: parsed.businessId,
    accountId: null,
    dateRange: "custom" as const,
    customStart: parsed.startDate,
    customEnd: parsed.endDate,
    compareMode: "none" as const,
    compareStart: null,
    compareEnd: null,
    debug: false,
  };

  const results = await Promise.all([
    measureGoogleAdsCloseoutSurface("overview", parsed.timeoutMs, async () => {
      const report = await getGoogleAdsOverviewReport({
        ...reportParams,
        source: "google_ads_closeout_smoke_overview",
      });
      return `topCampaigns=${Array.isArray(report.topCampaigns) ? report.topCampaigns.length : 0}`;
    }),
    measureGoogleAdsCloseoutSurface("advisor", parsed.timeoutMs, async () => {
      const report = await getGoogleAdsAdvisorReport({
        businessId: parsed.businessId,
        accountId: null,
        dateRange: "custom",
        customStart: parsed.startDate,
        customEnd: parsed.endDate,
        debug: false,
      });
      return `recommendations=${Array.isArray(report.recommendations) ? report.recommendations.length : 0}`;
    }),
    measureGoogleAdsCloseoutSurface("search_intelligence", parsed.timeoutMs, async () => {
      const report = await getGoogleAdsSearchIntelligenceReport({
        businessId: parsed.businessId,
        accountId: null,
        dateRange: "custom",
        customStart: parsed.startDate,
        customEnd: parsed.endDate,
      });
      return `rows=${Array.isArray(report.rows) ? report.rows.length : 0}`;
    }),
    measureGoogleAdsCloseoutSurface("products", parsed.timeoutMs, async () => {
      const report = await getGoogleAdsProductsReport({
        businessId: parsed.businessId,
        accountId: null,
        dateRange: "custom",
        customStart: parsed.startDate,
        customEnd: parsed.endDate,
      });
      return `rows=${Array.isArray(report.rows) ? report.rows.length : 0}`;
    }),
    measureStatusSurface({
      businessId: parsed.businessId,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      baseUrl: parsed.baseUrl,
      cookieHeader,
      timeoutMs: parsed.timeoutMs,
    }),
  ]);

  console.log(
    JSON.stringify(
      {
        businessId: parsed.businessId,
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        failed: shouldGoogleAdsCloseoutSmokeFail(results),
        results,
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
