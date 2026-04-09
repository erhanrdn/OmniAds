import type {
  ServingFreshnessStatusEntry,
  ServingFreshnessStatusReport,
} from "@/lib/serving-freshness-status";

export type ServingDirectReleaseMode = "preflight" | "post_deploy";

export interface ServingDirectReleaseWindow {
  startDate: string;
  endDate: string;
}

export interface ServingDirectReleaseRouteSpec {
  routeId: string;
  path: string;
  url: string;
  requiresAuth: true;
}

export interface ServingDirectReleaseBuildInfoResult {
  path: "/api/build-info";
  url: string | null;
  status: "passed" | "failed" | "skipped";
  httpStatus: number | null;
  observedBuildId: string | null;
  expectedBuildId: string | null;
  matchesExpectedBuildId: boolean | null;
  error: string | null;
}

export interface ServingDirectReleaseRouteResult {
  routeId: string;
  path: string;
  url: string;
  status: "passed" | "failed" | "skipped";
  httpStatus: number | null;
  contentType: string | null;
  error: string | null;
  skippedReason: string | null;
  requiresAuth: true;
}

export interface ServingDirectReleaseManualFallback {
  surface: string;
  command: string;
}

export interface ServingDirectReleaseSummary {
  result: "pass" | "fail";
  blockers: string[];
  notes: string[];
  manualFallbackCommands: ServingDirectReleaseManualFallback[];
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, "");
}

function buildRouteUrl(input: {
  baseUrl: string;
  path: string;
  query: Record<string, string>;
}) {
  const url = new URL(input.path, `${normalizeBaseUrl(input.baseUrl)}/`);
  for (const [key, value] of Object.entries(input.query)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function uniqueManualFallbackCommands(entries: ServingFreshnessStatusEntry[]) {
  const seen = new Set<string>();
  const fallbacks: ServingDirectReleaseManualFallback[] = [];
  for (const entry of entries) {
    const command = entry.operatorFallbackCommand?.trim();
    if (!command) continue;
    const dedupeKey = `${entry.surface}::${command}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    fallbacks.push({
      surface: entry.surface,
      command,
    });
  }
  return fallbacks.sort((left, right) => left.surface.localeCompare(right.surface));
}

export function buildServingDirectReleaseWindow(
  referenceDate = new Date(),
): ServingDirectReleaseWindow {
  const endDate = toIsoDate(referenceDate);
  const startDate = toIsoDate(addUtcDays(referenceDate, -29));
  return { startDate, endDate };
}

export function buildServingDirectReleaseSmokeRoutes(input: {
  baseUrl: string;
  businessId: string;
  startDate: string;
  endDate: string;
  demographicsDimension?: string | null;
}) {
  const demographicsDimension =
    String(input.demographicsDimension ?? "").trim() || "country";
  const sharedQuery = {
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
  };

  const routeSpecs: Array<{
    routeId: string;
    path: string;
    query: Record<string, string>;
  }> = [
    {
      routeId: "overview",
      path: "/api/overview",
      query: sharedQuery,
    },
    {
      routeId: "overview_summary",
      path: "/api/overview-summary",
      query: {
        ...sharedQuery,
        compareMode: "none",
      },
    },
    {
      routeId: "overview_sparklines",
      path: "/api/overview-sparklines",
      query: sharedQuery,
    },
    {
      routeId: "analytics_overview",
      path: "/api/analytics/overview",
      query: sharedQuery,
    },
    {
      routeId: "analytics_audience",
      path: "/api/analytics/audience",
      query: sharedQuery,
    },
    {
      routeId: "analytics_cohorts",
      path: "/api/analytics/cohorts",
      query: sharedQuery,
    },
    {
      routeId: "analytics_demographics",
      path: "/api/analytics/demographics",
      query: {
        ...sharedQuery,
        dimension: demographicsDimension,
      },
    },
    {
      routeId: "analytics_landing_page_performance",
      path: "/api/analytics/landing-page-performance",
      query: sharedQuery,
    },
    {
      routeId: "analytics_landing_pages",
      path: "/api/analytics/landing-pages",
      query: sharedQuery,
    },
    {
      routeId: "analytics_products",
      path: "/api/analytics/products",
      query: sharedQuery,
    },
    {
      routeId: "seo_overview",
      path: "/api/seo/overview",
      query: sharedQuery,
    },
    {
      routeId: "seo_findings",
      path: "/api/seo/findings",
      query: sharedQuery,
    },
  ];

  return routeSpecs.map((route): ServingDirectReleaseRouteSpec => ({
    routeId: route.routeId,
    path: route.path,
    url: buildRouteUrl({
      baseUrl: input.baseUrl,
      path: route.path,
      query: route.query,
    }),
    requiresAuth: true,
  }));
}

export function summarizeServingDirectReleaseVerification(input: {
  releaseMode: ServingDirectReleaseMode;
  freshnessStatus: ServingFreshnessStatusReport;
  buildInfo: ServingDirectReleaseBuildInfoResult | null;
  routeResults: ServingDirectReleaseRouteResult[];
  authenticatedRouteSmokeEnabled: boolean;
}) {
  const blockers: string[] = [];
  const notes: string[] = [];

  const automatedMissingEntries = input.freshnessStatus.entries.filter(
    (entry) => entry.statusClassification === "automated_missing",
  );
  for (const entry of automatedMissingEntries) {
    blockers.push(`Automated surface missing: ${entry.surface}`);
  }

  if (
    input.buildInfo?.expectedBuildId &&
    input.buildInfo.matchesExpectedBuildId === false
  ) {
    blockers.push(
      `Build ID mismatch: expected ${input.buildInfo.expectedBuildId}, observed ${input.buildInfo.observedBuildId ?? "unknown"}.`,
    );
  } else if (input.buildInfo?.status === "failed") {
    blockers.push(
      input.buildInfo.error
        ? `Build info check failed: ${input.buildInfo.error}`
        : `Build info check failed for ${input.buildInfo.url ?? "/api/build-info"}`,
    );
  }

  for (const route of input.routeResults) {
    if (route.status !== "failed") continue;
    blockers.push(
      route.error
        ? `HTTP smoke failed for ${route.path}: ${route.error}`
        : `HTTP smoke failed for ${route.path} with status ${route.httpStatus ?? "unknown"}.`,
    );
  }

  if (!input.buildInfo?.url) {
    notes.push("Public build-info verification was not requested.");
  }
  if (!input.authenticatedRouteSmokeEnabled) {
    notes.push(
      "Authenticated HTTP smoke was skipped. Supply --base-url with --session-cookie or --session-cookie-file to exercise the user-facing GET routes.",
    );
  }

  const skippedRoutes = input.routeResults.filter((route) => route.status === "skipped");
  if (skippedRoutes.length > 0) {
    notes.push(
      `${skippedRoutes.length} authenticated route check(s) were skipped by input selection.`,
    );
  }

  const manualBoundaryCount =
    input.freshnessStatus.classifications.manual_boundary +
    input.freshnessStatus.classifications.manual_missing;
  if (manualBoundaryCount > 0) {
    notes.push(
      `${manualBoundaryCount} intentional manual boundary status row(s) remain operator-owned and are not deploy blockers by themselves.`,
    );
  }

  const unknownCount = input.freshnessStatus.classifications.unknown;
  if (unknownCount > 0) {
    notes.push(
      `${unknownCount} status row(s) remained unknown because applicability could not be derived conservatively from the current repo-supported signals.`,
    );
  }

  return {
    result: blockers.length === 0 ? "pass" : "fail",
    blockers,
    notes,
    manualFallbackCommands: uniqueManualFallbackCommands(
      input.freshnessStatus.entries,
    ),
  } satisfies ServingDirectReleaseSummary;
}
