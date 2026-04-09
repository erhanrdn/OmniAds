import { createHash } from "node:crypto";
import { getDb } from "@/lib/db";
import { getDbSchemaReadiness } from "@/lib/db-schema-readiness";
import { getIntegrationMetadata } from "@/lib/integrations";
import { getProviderAccountAssignments } from "@/lib/provider-account-assignments";
import { getReportingDateRangeKey } from "@/lib/reporting-cache";
import { getNormalizedSearchParamsKey } from "@/lib/route-report-cache";
import {
  GA4_AUTO_WARM_DATE_WINDOWS,
  GA4_AUTO_WARM_DETAIL_REQUESTS,
} from "@/lib/sync/report-warmer-boundaries";
import { SHOPIFY_OVERVIEW_CANARY_TIMEZONE_BASIS, buildShopifyOverviewCanaryKey } from "@/lib/shopify/serving";
import { getShopifySyncState } from "@/lib/shopify/sync-state";

export type ServingFreshnessStatusClassification =
  | "automated_present"
  | "automated_missing"
  | "manual_boundary"
  | "manual_missing"
  | "unknown";

export type ServingFreshnessAutomationMode = "automated" | "manual";

export type ServingFreshnessScope =
  | "default_bounded"
  | "recent_bounded"
  | "exact_historical"
  | "custom";

export interface ServingFreshnessStatusLastObserved {
  targetUpdatedAt?: string | null;
  targetCreatedAt?: string | null;
  targetGeneratedAt?: string | null;
  targetHydratedAt?: string | null;
  ownerCompletedAt?: string | null;
  ownerTriggeredAt?: string | null;
  ownerLatestSuccessfulSyncAt?: string | null;
  ownerLatestSyncStartedAt?: string | null;
  ownerLatestSyncWindowStart?: string | null;
  ownerLatestSyncWindowEnd?: string | null;
  latestManualObservedAt?: string | null;
}

export interface ServingFreshnessStatusAgeMs {
  targetUpdatedAt?: number | null;
  targetCreatedAt?: number | null;
  targetGeneratedAt?: number | null;
  targetHydratedAt?: number | null;
  ownerCompletedAt?: number | null;
  ownerTriggeredAt?: number | null;
  ownerLatestSuccessfulSyncAt?: number | null;
  ownerLatestSyncStartedAt?: number | null;
  latestManualObservedAt?: number | null;
}

export interface ServingFreshnessStatusEntry {
  surface: string;
  ownerModule: string;
  triggerLane: string;
  automationMode: ServingFreshnessAutomationMode;
  freshnessScope: ServingFreshnessScope;
  statusClassification: ServingFreshnessStatusClassification;
  statusReason: string;
  selection: {
    provider?: string | null;
    reportType?: string | null;
    cacheType?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    dateRangeKey?: string | null;
    dimension?: string | null;
    canaryKey?: string | null;
    reconciliationKey?: string | null;
  };
  lastObserved: ServingFreshnessStatusLastObserved;
  ageMs: ServingFreshnessStatusAgeMs;
  operatorFallbackCommand: string | null;
  notes: string[];
}

export interface ServingFreshnessStatusReport {
  businessId: string;
  capturedAt: string;
  reusedExistingLane: "cli_only";
  manualBoundarySelection: {
    startDate: string | null;
    endDate: string | null;
    overviewProvider: "google" | "meta" | null;
    demographicsDimension: string | null;
  };
  classifications: Record<ServingFreshnessStatusClassification, number>;
  entries: ServingFreshnessStatusEntry[];
}

export interface ServingFreshnessStatusInput {
  businessId: string;
  startDate?: string | null;
  endDate?: string | null;
  overviewProvider?: "google" | "meta" | null;
  demographicsDimension?: string | null;
  referenceDate?: Date;
  shopifyRecentWindowDays?: number;
}

type EntryReadKind =
  | "overview_range"
  | "reporting_snapshot"
  | "seo_cache"
  | "shopify_serving_state"
  | "shopify_reconciliation";

interface ServingFreshnessStatusEntrySpec {
  kind: EntryReadKind;
  surface: string;
  ownerModule: string;
  triggerLane: string;
  automationMode: ServingFreshnessAutomationMode;
  freshnessScope: ServingFreshnessScope;
  selection: ServingFreshnessStatusEntry["selection"];
  statusReason: string;
  operatorFallbackCommand: string | null;
  notes: string[];
  applicable: boolean;
  exactManualSelection: boolean;
}

interface ServingFreshnessStatusContext {
  ga4Integration: Awaited<ReturnType<typeof getIntegrationMetadata>>;
  searchConsoleIntegration: Awaited<ReturnType<typeof getIntegrationMetadata>>;
  shopifyIntegration: Awaited<ReturnType<typeof getIntegrationMetadata>>;
}

function envNumber(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeDate(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function formatDateArg(value: string | null | undefined, fallback: string) {
  return normalizeDate(value) ?? fallback;
}

function formatDimensionArg(value: string | null | undefined, fallback: string) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function hashAccountIds(providerAccountIds: string[]) {
  return createHash("sha1")
    .update(
      [...new Set(providerAccountIds)]
        .filter((value) => value.trim().length > 0)
        .sort()
        .join("|"),
    )
    .digest("hex");
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function buildUtcSyncWindow(days: number, referenceDate = new Date()) {
  const end = new Date(referenceDate);
  const start = new Date(end);
  start.setDate(end.getDate() - days);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function getTodayIsoForTimeZoneServer(timeZone: string, referenceDate = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(referenceDate);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function buildShopifyRecentWindow(input: {
  timeZone?: string | null;
  referenceDate?: Date;
  recentWindowDays?: number;
}) {
  const timeZone = input.timeZone || "UTC";
  const recentWindowDays =
    input.recentWindowDays ?? envNumber("SHOPIFY_COMMERCE_SYNC_DAYS", 7);
  const today = getTodayIsoForTimeZoneServer(timeZone, input.referenceDate);
  const end = new Date(`${today}T00:00:00Z`);
  const start = addUtcDays(end, -(recentWindowDays - 1));
  return {
    startDate: toIsoDate(start),
    endDate: today,
    timeZone,
    recentWindowDays,
  };
}

function ageMs(value: string | null | undefined, capturedAt: string) {
  if (!value) return null;
  const observedMs = new Date(value).getTime();
  const capturedMs = new Date(capturedAt).getTime();
  if (!Number.isFinite(observedMs) || !Number.isFinite(capturedMs)) return null;
  return Math.max(0, capturedMs - observedMs);
}

export function classifyServingFreshnessStatus(input: {
  automationMode: ServingFreshnessAutomationMode;
  applicable: boolean;
  observedTargetTimestamp?: string | null;
  exactManualSelection?: boolean;
}): ServingFreshnessStatusClassification {
  if (!input.applicable) {
    return "unknown";
  }
  if (input.automationMode === "automated") {
    return input.observedTargetTimestamp ? "automated_present" : "automated_missing";
  }
  if (input.exactManualSelection) {
    return input.observedTargetTimestamp ? "manual_boundary" : "manual_missing";
  }
  return "manual_boundary";
}

function buildManualGa4FallbackCommand(input: {
  reportType: string;
  startDate?: string | null;
  endDate?: string | null;
  dimension?: string | null;
}) {
  const startDate = formatDateArg(input.startDate, "<yyyy-mm-dd>");
  const endDate = formatDateArg(input.endDate, "<yyyy-mm-dd>");
  const parts = [
    "npm run reporting:cache:warm --",
    "--business-id <business_id>",
    `--report-type ${input.reportType}`,
    `--start-date ${startDate}`,
    `--end-date ${endDate}`,
  ];
  if (input.dimension) {
    parts.push(`--dimension ${formatDimensionArg(input.dimension, "<dimension>")}`);
  }
  return parts.join(" ");
}

function buildManualOverviewRangeFallbackCommand(input: {
  provider: "google" | "meta";
  startDate?: string | null;
  endDate?: string | null;
}) {
  const startDate = formatDateArg(input.startDate, "<yyyy-mm-dd>");
  const endDate = formatDateArg(input.endDate, "<yyyy-mm-dd>");
  return [
    "npm run overview:summary:materialize --",
    "--business-id <business_id>",
    `--provider ${input.provider}`,
    `--start-date ${startDate}`,
    `--end-date ${endDate}`,
  ].join(" ");
}

function replaceBusinessIdPlaceholder(value: string | null | undefined, businessId: string) {
  if (!value) return value ?? null;
  return value.replace("%3Cbusiness_id%3E", encodeURIComponent(businessId));
}

function sortEntries(entries: ServingFreshnessStatusEntry[]) {
  return [...entries].sort((left, right) => {
    if (left.surface === right.surface) {
      const leftStart = left.selection.startDate ?? "";
      const rightStart = right.selection.startDate ?? "";
      if (leftStart === rightStart) {
        const leftDimension = left.selection.dimension ?? "";
        const rightDimension = right.selection.dimension ?? "";
        if (leftDimension === rightDimension) {
          return (left.selection.provider ?? "").localeCompare(right.selection.provider ?? "");
        }
        return leftDimension.localeCompare(rightDimension);
      }
      return leftStart.localeCompare(rightStart);
    }
    return left.surface.localeCompare(right.surface);
  });
}

export function buildServingFreshnessStatusEntrySpecs(
  input: Omit<ServingFreshnessStatusInput, "businessId"> & {
    shopifyRecentWindow?: { startDate: string; endDate: string };
  } = {},
) {
  const referenceDate = input.referenceDate ?? new Date();
  const selectedStartDate = normalizeDate(input.startDate);
  const selectedEndDate = normalizeDate(input.endDate);
  const manualDimension = String(input.demographicsDimension ?? "").trim() || null;
  const exactSelection = Boolean(selectedStartDate && selectedEndDate);
  const shopifyRecentWindow =
    input.shopifyRecentWindow ??
    buildShopifyRecentWindow({
      timeZone: "UTC",
      referenceDate,
      recentWindowDays: input.shopifyRecentWindowDays,
    });
  const automatedGa4WindowKeys = new Set(
    GA4_AUTO_WARM_DATE_WINDOWS.map((window) => {
      const { startDate, endDate } = buildUtcSyncWindow(window.days, referenceDate);
      return `${startDate}:${endDate}`;
    }),
  );
  const selectedWindowKey =
    selectedStartDate && selectedEndDate
      ? `${selectedStartDate}:${selectedEndDate}`
      : null;

  const specs: ServingFreshnessStatusEntrySpec[] = [];

  for (const provider of (["google", "meta"] as const)) {
    specs.push({
      kind: "overview_range",
      surface: `platform_overview_summary_ranges.${provider}`,
      ownerModule: "@/lib/overview-summary-range-owner",
      triggerLane: "npm run overview:summary:materialize",
      automationMode: "manual",
      freshnessScope: "exact_historical",
      statusReason: "Exact selected historical overview summary ranges remain explicit CLI-owned.",
      selection: {
        provider,
        startDate: selectedStartDate,
        endDate: selectedEndDate,
      },
      operatorFallbackCommand: buildManualOverviewRangeFallbackCommand({
        provider,
        startDate: selectedStartDate,
        endDate: selectedEndDate,
      }),
      notes: exactSelection
        ? []
        : ["Exact selected range was not provided; status reflects the intentional manual boundary and latest observed hydrated range for the current account set."],
      applicable: true,
      exactManualSelection: exactSelection,
    });
  }

  for (const window of GA4_AUTO_WARM_DATE_WINDOWS) {
    const { startDate, endDate } = buildUtcSyncWindow(window.days, referenceDate);
    const overviewKey = getNormalizedSearchParamsKey(
      new URLSearchParams({ businessId: "<business_id>", startDate, endDate }),
    );
    specs.push({
      kind: "reporting_snapshot",
      surface: "provider_reporting_snapshots.ga4_analytics_overview",
      ownerModule: "@/lib/reporting-cache-writer via @/lib/user-facing-report-cache-owners",
      triggerLane: "@/lib/sync/ga4-sync",
      automationMode: "automated",
      freshnessScope: "default_bounded",
      statusReason: `GA4 sync owns the current automated ${window.label} overview snapshot window.`,
      selection: {
        provider: "ga4",
        reportType: "ga4_analytics_overview",
        startDate,
        endDate,
        dateRangeKey: overviewKey,
      },
      operatorFallbackCommand: null,
      notes: [],
      applicable: true,
      exactManualSelection: false,
    });
    specs.push({
      kind: "reporting_snapshot",
      surface: "provider_reporting_snapshots.ecommerce_fallback",
      ownerModule: "@/lib/reporting-cache-writer via @/lib/user-facing-report-cache-owners",
      triggerLane: "@/lib/sync/ga4-sync",
      automationMode: "automated",
      freshnessScope: "default_bounded",
      statusReason: `GA4 sync owns the current automated ${window.label} ecommerce fallback snapshot window.`,
      selection: {
        provider: "ga4",
        reportType: "ecommerce_fallback",
        startDate,
        endDate,
        dateRangeKey: getReportingDateRangeKey(startDate, endDate),
      },
      operatorFallbackCommand: null,
      notes: [],
      applicable: true,
      exactManualSelection: false,
    });

    for (const report of GA4_AUTO_WARM_DETAIL_REQUESTS) {
      const searchParams = new URLSearchParams({
        businessId: "<business_id>",
        startDate,
        endDate,
      });
      if ("dimension" in report) {
        searchParams.set("dimension", report.dimension);
      }
      specs.push({
        kind: "reporting_snapshot",
        surface: `provider_reporting_snapshots.${report.reportType}`,
        ownerModule: "@/lib/reporting-cache-writer via @/lib/user-facing-report-cache-owners",
        triggerLane: "@/lib/sync/ga4-sync",
        automationMode: "automated",
        freshnessScope: "default_bounded",
        statusReason:
          report.reportType === "ga4_detailed_demographics"
            ? `GA4 sync owns the current automated ${window.label} demographics snapshot only for dimension=country.`
            : `GA4 sync owns the current automated ${window.label} detail snapshot window.`,
        selection: {
          provider: "ga4",
          reportType: report.reportType,
          startDate,
          endDate,
          dateRangeKey: getNormalizedSearchParamsKey(searchParams),
          dimension: "dimension" in report ? report.dimension : null,
        },
        operatorFallbackCommand: null,
        notes: [],
        applicable: true,
        exactManualSelection: false,
      });
    }
  }

  const manualGa4CustomSurfaces = [
    "ga4_analytics_overview",
    "ga4_detailed_audience",
    "ga4_detailed_cohorts",
    "ga4_landing_page_performance_v1",
    "ga4_detailed_landing_pages",
    "ga4_detailed_products",
    "ecommerce_fallback",
  ] as const;

  for (const reportType of manualGa4CustomSurfaces) {
    const exactDateRangeKey =
      selectedStartDate && selectedEndDate
        ? reportType === "ecommerce_fallback"
          ? getReportingDateRangeKey(selectedStartDate, selectedEndDate)
          : getNormalizedSearchParamsKey(
              new URLSearchParams({
                businessId: "<business_id>",
                startDate: selectedStartDate,
                endDate: selectedEndDate,
              }),
            )
        : null;
    specs.push({
      kind: "reporting_snapshot",
      surface: `provider_reporting_snapshots.${reportType}.custom_window`,
      ownerModule: "@/lib/reporting-cache-writer via @/lib/user-facing-report-cache-owners",
      triggerLane: "npm run reporting:cache:warm",
      automationMode: "manual",
      freshnessScope: "custom",
      statusReason: "Non-default GA4 windows stay explicit CLI-owned.",
      selection: {
        provider: "ga4",
        reportType,
        startDate: selectedStartDate,
        endDate: selectedEndDate,
        dateRangeKey: exactDateRangeKey,
      },
      operatorFallbackCommand: buildManualGa4FallbackCommand({
        reportType,
        startDate: selectedStartDate,
        endDate: selectedEndDate,
      }),
      notes: exactSelection
        ? selectedWindowKey && automatedGa4WindowKeys.has(selectedWindowKey)
          ? ["The supplied window matches the current automated GA4 default boundary; inspect the automated status rows above instead of the manual custom boundary."]
          : []
        : ["Exact custom window was not provided; status reflects the intentional manual boundary only."],
      applicable: !(selectedWindowKey && automatedGa4WindowKeys.has(selectedWindowKey)),
      exactManualSelection: exactSelection && !(selectedWindowKey && automatedGa4WindowKeys.has(selectedWindowKey)),
    });
  }

  const demographicsSelectionKey =
    selectedStartDate && selectedEndDate && manualDimension
      ? getNormalizedSearchParamsKey(
          new URLSearchParams({
            businessId: "<business_id>",
            startDate: selectedStartDate,
            endDate: selectedEndDate,
            dimension: manualDimension,
          }),
        )
      : null;
  specs.push({
    kind: "reporting_snapshot",
    surface: "provider_reporting_snapshots.ga4_detailed_demographics.non_country_dimension",
    ownerModule: "@/lib/reporting-cache-writer via @/lib/user-facing-report-cache-owners",
    triggerLane: "npm run reporting:cache:warm",
    automationMode: "manual",
    freshnessScope: "custom",
    statusReason: "Non-country GA4 demographics dimensions stay explicit CLI-owned.",
    selection: {
      provider: "ga4",
      reportType: "ga4_detailed_demographics",
      startDate: selectedStartDate,
      endDate: selectedEndDate,
      dateRangeKey: demographicsSelectionKey,
      dimension: manualDimension,
    },
    operatorFallbackCommand: buildManualGa4FallbackCommand({
      reportType: "ga4_detailed_demographics",
      startDate: selectedStartDate,
      endDate: selectedEndDate,
      dimension: manualDimension ?? "<dimension>",
    }),
    notes: exactSelection && manualDimension
      ? manualDimension === "country"
        ? ["The supplied dimension matches the automated boundary; inspect the automated demographics status rows above instead of the manual non-country boundary."]
        : []
      : ["Exact non-country dimension selection was not fully provided; status reflects the intentional manual boundary and latest observed alternate-dimension snapshot when derivable."],
    applicable: manualDimension !== "country",
    exactManualSelection: Boolean(exactSelection && manualDimension && manualDimension !== "country"),
  });

  for (const window of GA4_AUTO_WARM_DATE_WINDOWS) {
    const { startDate, endDate } = buildUtcSyncWindow(window.days, referenceDate);
    for (const cacheType of (["overview", "findings"] as const)) {
      specs.push({
        kind: "seo_cache",
        surface: `seo_results_cache.${cacheType}`,
        ownerModule: "@/lib/seo/results-cache-writer",
        triggerLane: "@/lib/sync/search-console-sync",
        automationMode: "automated",
        freshnessScope: "default_bounded",
        statusReason: `Search Console sync owns the current automated ${window.label} ${cacheType} cache window.`,
        selection: {
          cacheType,
          startDate,
          endDate,
        },
        operatorFallbackCommand: null,
        notes: [],
        applicable: true,
        exactManualSelection: false,
      });
    }
  }

  specs.push({
    kind: "reporting_snapshot",
    surface: "provider_reporting_snapshots.overview_shopify_orders_aggregate_v6.recent_window",
    ownerModule: "@/lib/reporting-cache-writer via @/lib/user-facing-report-cache-owners",
    triggerLane: "@/lib/sync/shopify-sync",
    automationMode: "automated",
    freshnessScope: "recent_bounded",
    statusReason: "Shopify sync owns the current bounded recent overview snapshot window when overview materialization stays enabled.",
    selection: {
      provider: "shopify",
      reportType: "overview_shopify_orders_aggregate_v6",
      startDate: shopifyRecentWindow.startDate,
      endDate: shopifyRecentWindow.endDate,
      dateRangeKey: getReportingDateRangeKey(shopifyRecentWindow.startDate, shopifyRecentWindow.endDate),
    },
    operatorFallbackCommand: null,
    notes: [],
    applicable: true,
    exactManualSelection: false,
  });

  specs.push({
    kind: "reporting_snapshot",
    surface: "provider_reporting_snapshots.overview_shopify_orders_aggregate_v6.custom_window",
    ownerModule: "@/lib/reporting-cache-writer via @/lib/user-facing-report-cache-owners",
    triggerLane: "npm run reporting:cache:warm",
    automationMode: "manual",
    freshnessScope: "custom",
    statusReason: "Shopify overview snapshot windows outside the recent automated window stay explicit CLI-owned.",
    selection: {
      provider: "shopify",
      reportType: "overview_shopify_orders_aggregate_v6",
      startDate: selectedStartDate,
      endDate: selectedEndDate,
      dateRangeKey:
        selectedStartDate && selectedEndDate
          ? getReportingDateRangeKey(selectedStartDate, selectedEndDate)
          : null,
    },
    operatorFallbackCommand: [
      "npm run reporting:cache:warm --",
      "--business-id <business_id>",
      "--report-type overview_shopify_orders_aggregate_v6",
      `--start-date ${formatDateArg(selectedStartDate, "<yyyy-mm-dd>")}`,
      `--end-date ${formatDateArg(selectedEndDate, "<yyyy-mm-dd>")}`,
    ].join(" "),
    notes: exactSelection
      ? selectedStartDate === shopifyRecentWindow.startDate && selectedEndDate === shopifyRecentWindow.endDate
        ? ["The supplied window matches the current automated Shopify recent boundary; inspect the automated recent-window status row above instead of the manual custom boundary."]
        : []
      : ["Exact Shopify custom window was not provided; status reflects the intentional manual boundary and latest observed non-recent snapshot when derivable."],
    applicable: !(
      selectedStartDate === shopifyRecentWindow.startDate &&
      selectedEndDate === shopifyRecentWindow.endDate
    ),
    exactManualSelection: exactSelection && !(
      selectedStartDate === shopifyRecentWindow.startDate &&
      selectedEndDate === shopifyRecentWindow.endDate
    ),
  });

  const recentCanaryKey = buildShopifyOverviewCanaryKey({
    startDate: shopifyRecentWindow.startDate,
    endDate: shopifyRecentWindow.endDate,
    timeZoneBasis: SHOPIFY_OVERVIEW_CANARY_TIMEZONE_BASIS,
  });
  specs.push({
    kind: "shopify_serving_state",
    surface: "shopify_serving_state",
    ownerModule: "@/lib/shopify/overview-materializer",
    triggerLane: "@/lib/sync/shopify-sync",
    automationMode: "automated",
    freshnessScope: "recent_bounded",
    statusReason: "Shopify sync owns the recent bounded serving-state canary for the overview window.",
    selection: {
      provider: "shopify",
      startDate: shopifyRecentWindow.startDate,
      endDate: shopifyRecentWindow.endDate,
      canaryKey: recentCanaryKey,
    },
    operatorFallbackCommand: null,
    notes: [],
    applicable: true,
    exactManualSelection: false,
  });
  specs.push({
    kind: "shopify_reconciliation",
    surface: "shopify_reconciliation_runs",
    ownerModule: "@/lib/shopify/overview-materializer",
    triggerLane: "@/lib/sync/shopify-sync",
    automationMode: "automated",
    freshnessScope: "recent_bounded",
    statusReason: "Shopify sync owns the recent bounded reconciliation evidence for the overview window.",
    selection: {
      provider: "shopify",
      startDate: shopifyRecentWindow.startDate,
      endDate: shopifyRecentWindow.endDate,
      reconciliationKey: recentCanaryKey,
    },
    operatorFallbackCommand: null,
    notes: [],
    applicable: true,
    exactManualSelection: false,
  });

  return specs;
}

async function tableReady(table: string) {
  const readiness = await getDbSchemaReadiness({ tables: [table] }).catch(() => null);
  return Boolean(readiness?.ready);
}

async function readProviderSyncJob(input: {
  businessId: string;
  provider: string;
  reportType: string;
  dateRangeKey: string | null | undefined;
}) {
  if (!input.dateRangeKey) return null;
  if (!(await tableReady("provider_sync_jobs"))) return null;
  const sql = getDb();
  const rows = (await sql.query(
    `
      SELECT status, triggered_at, started_at, completed_at, error_message
      FROM provider_sync_jobs
      WHERE business_id = $1
        AND provider = $2
        AND report_type = $3
        AND date_range_key = $4
      LIMIT 1
    `,
    [input.businessId, input.provider, input.reportType, input.dateRangeKey],
  )) as Array<Record<string, unknown>>;
  const row = rows[0] ?? null;
  if (!row) return null;
  return {
    status: row.status ? String(row.status) : null,
    triggeredAt: row.triggered_at ? new Date(String(row.triggered_at)).toISOString() : null,
    startedAt: row.started_at ? new Date(String(row.started_at)).toISOString() : null,
    completedAt: row.completed_at ? new Date(String(row.completed_at)).toISOString() : null,
    errorMessage: row.error_message ? String(row.error_message) : null,
  };
}

async function readExactReportingSnapshot(input: {
  businessId: string;
  provider: string;
  reportType: string;
  dateRangeKey: string | null | undefined;
}) {
  if (!input.dateRangeKey) return null;
  if (!(await tableReady("provider_reporting_snapshots"))) return null;
  const sql = getDb();
  const rows = (await sql.query(
    `
      SELECT created_at, updated_at
      FROM provider_reporting_snapshots
      WHERE business_id = $1
        AND provider = $2
        AND report_type = $3
        AND date_range_key = $4
      LIMIT 1
    `,
    [input.businessId, input.provider, input.reportType, input.dateRangeKey],
  )) as Array<Record<string, unknown>>;
  const row = rows[0] ?? null;
  if (!row) return null;
  return {
    createdAt: row.created_at ? new Date(String(row.created_at)).toISOString() : null,
    updatedAt: row.updated_at ? new Date(String(row.updated_at)).toISOString() : null,
  };
}

async function readLatestReportingSnapshot(input: {
  businessId: string;
  provider: string;
  reportType: string;
  exactDateRangeKey?: string | null;
  excludeDateRangeKey?: string | null;
  dateRangeKeyLike?: string | null;
  dateRangeKeyNotLike?: string | null;
}) {
  if (!(await tableReady("provider_reporting_snapshots"))) return null;
  const sql = getDb();
  const rows = (await sql.query(
    `
      SELECT created_at, updated_at, date_range_key
      FROM provider_reporting_snapshots
      WHERE business_id = $1
        AND provider = $2
        AND report_type = $3
        AND ($4::text IS NULL OR date_range_key = $4)
        AND ($5::text IS NULL OR date_range_key <> $5)
        AND ($6::text IS NULL OR date_range_key LIKE $6)
        AND ($7::text IS NULL OR date_range_key NOT LIKE $7)
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    [
      input.businessId,
      input.provider,
      input.reportType,
      input.exactDateRangeKey ?? null,
      input.excludeDateRangeKey ?? null,
      input.dateRangeKeyLike ?? null,
      input.dateRangeKeyNotLike ?? null,
    ],
  )) as Array<Record<string, unknown>>;
  const row = rows[0] ?? null;
  if (!row) return null;
  return {
    createdAt: row.created_at ? new Date(String(row.created_at)).toISOString() : null,
    updatedAt: row.updated_at ? new Date(String(row.updated_at)).toISOString() : null,
    dateRangeKey: row.date_range_key ? String(row.date_range_key) : null,
  };
}

async function readExactSeoCache(input: {
  businessId: string;
  cacheType: "overview" | "findings";
  startDate: string | null | undefined;
  endDate: string | null | undefined;
}) {
  if (!input.startDate || !input.endDate) return null;
  if (!(await tableReady("seo_results_cache"))) return null;
  const sql = getDb();
  const rows = (await sql.query(
    `
      SELECT generated_at
      FROM seo_results_cache
      WHERE business_id = $1
        AND cache_type = $2
        AND start_date = $3::date
        AND end_date = $4::date
      LIMIT 1
    `,
    [input.businessId, input.cacheType, input.startDate, input.endDate],
  )) as Array<Record<string, unknown>>;
  const row = rows[0] ?? null;
  if (!row) return null;
  return {
    generatedAt: row.generated_at ? new Date(String(row.generated_at)).toISOString() : null,
  };
}

async function readOverviewRangeObservation(input: {
  businessId: string;
  provider: "google" | "meta";
  startDate?: string | null;
  endDate?: string | null;
}) {
  if (!(await tableReady("platform_overview_summary_ranges"))) {
    return { applicable: false as const, exact: null, latest: null, note: "platform_overview_summary_ranges table is not ready." };
  }
  const assignment = await getProviderAccountAssignments(input.businessId, input.provider).catch(() => null);
  const providerAccountIds = [...new Set((assignment?.account_ids ?? []).map((value) => String(value).trim()).filter(Boolean))].sort();
  if (providerAccountIds.length === 0) {
    return { applicable: false as const, exact: null, latest: null, note: `No ${input.provider} provider account assignments are currently stored for this business.` };
  }

  const sql = getDb();
  const providerAccountIdsHash = hashAccountIds(providerAccountIds);
  const exactRows =
    input.startDate && input.endDate
      ? ((await sql.query(
          `
            SELECT hydrated_at, updated_at, max_source_updated_at
            FROM platform_overview_summary_ranges
            WHERE business_id = $1
              AND provider = $2
              AND provider_account_ids_hash = $3
              AND start_date = $4::date
              AND end_date = $5::date
            LIMIT 1
          `,
          [input.businessId, input.provider, providerAccountIdsHash, input.startDate, input.endDate],
        )) as Array<Record<string, unknown>>)
      : [];
  const latestRows = (await sql.query(
    `
      SELECT hydrated_at, updated_at, max_source_updated_at, start_date::text AS start_date, end_date::text AS end_date
      FROM platform_overview_summary_ranges
      WHERE business_id = $1
        AND provider = $2
        AND provider_account_ids_hash = $3
      ORDER BY hydrated_at DESC
      LIMIT 1
    `,
    [input.businessId, input.provider, providerAccountIdsHash],
  )) as Array<Record<string, unknown>>;

  const exact = exactRows[0] ?? null;
  const latest = latestRows[0] ?? null;
  return {
    applicable: true as const,
    exact: exact
      ? {
          hydratedAt: exact.hydrated_at ? new Date(String(exact.hydrated_at)).toISOString() : null,
          updatedAt: exact.updated_at ? new Date(String(exact.updated_at)).toISOString() : null,
          maxSourceUpdatedAt: exact.max_source_updated_at
            ? new Date(String(exact.max_source_updated_at)).toISOString()
            : null,
        }
      : null,
    latest: latest
      ? {
          hydratedAt: latest.hydrated_at ? new Date(String(latest.hydrated_at)).toISOString() : null,
          updatedAt: latest.updated_at ? new Date(String(latest.updated_at)).toISOString() : null,
          maxSourceUpdatedAt: latest.max_source_updated_at
            ? new Date(String(latest.max_source_updated_at)).toISOString()
            : null,
          startDate: latest.start_date ? String(latest.start_date) : null,
          endDate: latest.end_date ? String(latest.end_date) : null,
        }
      : null,
    note: null,
  };
}

async function buildStatusEntry(
  spec: ServingFreshnessStatusEntrySpec,
  input: ServingFreshnessStatusInput,
  capturedAt: string,
  context: ServingFreshnessStatusContext,
  shopifyRecentWindow: { startDate: string; endDate: string; timeZone: string; recentWindowDays: number },
) {
  const lastObserved: ServingFreshnessStatusLastObserved = {};
  const notes = [...spec.notes];
  let applicable = spec.applicable;

  if (spec.kind === "overview_range") {
    const observation = await readOverviewRangeObservation({
      businessId: input.businessId,
      provider: spec.selection.provider as "google" | "meta",
      startDate: spec.selection.startDate,
      endDate: spec.selection.endDate,
    });
    applicable = observation.applicable;
    if (observation.note) {
      notes.push(observation.note);
    }
    lastObserved.targetHydratedAt =
      observation.exact?.hydratedAt ?? observation.latest?.hydratedAt ?? null;
    lastObserved.targetUpdatedAt =
      observation.exact?.updatedAt ?? observation.latest?.updatedAt ?? null;
    lastObserved.latestManualObservedAt = observation.latest?.hydratedAt ?? null;
    if (observation.latest?.startDate && observation.latest?.endDate) {
      notes.push(
        `Latest hydrated range for the current ${spec.selection.provider} account set is ${observation.latest.startDate}..${observation.latest.endDate}.`,
      );
    }
  }

  if (spec.kind === "reporting_snapshot") {
    const provider = spec.selection.provider!;
    const reportType = spec.selection.reportType!;
    const exact = await readExactReportingSnapshot({
      businessId: input.businessId,
      provider,
      reportType,
      dateRangeKey: replaceBusinessIdPlaceholder(
        spec.selection.dateRangeKey,
        input.businessId,
      ),
    });

    if (provider === "ga4") {
      if (context.ga4Integration?.status !== "connected") {
        applicable = false;
        notes.push("GA4 integration is not currently connected for this business.");
      }
    }

    if (provider === "shopify" && context.shopifyIntegration?.status !== "connected") {
      applicable = false;
      notes.push("Shopify integration is not currently connected for this business.");
    }

    lastObserved.targetCreatedAt = exact?.createdAt ?? null;
    lastObserved.targetUpdatedAt = exact?.updatedAt ?? null;

    if (spec.automationMode === "automated" && provider === "ga4") {
      const syncJob = await readProviderSyncJob({
        businessId: input.businessId,
        provider: "ga4",
        reportType: "ga4_overview",
        dateRangeKey:
          spec.selection.startDate && spec.selection.endDate
            ? getNormalizedSearchParamsKey(
                new URLSearchParams({
                  businessId: input.businessId,
                  startDate: spec.selection.startDate,
                  endDate: spec.selection.endDate,
                }),
              )
            : null,
      });
      lastObserved.ownerTriggeredAt = syncJob?.triggeredAt ?? null;
      lastObserved.ownerCompletedAt = syncJob?.completedAt ?? null;
      if (syncJob?.status && syncJob.status !== "done") {
        notes.push(`Latest GA4 owner job for this window is in status=${syncJob.status}.`);
      }
    }

    if (spec.automationMode === "automated" && provider === "shopify") {
      const providerAccountId = context.shopifyIntegration?.provider_account_id ?? null;
      if (!providerAccountId) {
        applicable = false;
        notes.push("Shopify provider account id is not available for recent-window owner status.");
      } else {
        const [ordersRecent, returnsRecent] = await Promise.all([
          getShopifySyncState({
            businessId: input.businessId,
            providerAccountId,
            syncTarget: "commerce_orders_recent",
          }).catch(() => null),
          getShopifySyncState({
            businessId: input.businessId,
            providerAccountId,
            syncTarget: "commerce_returns_recent",
          }).catch(() => null),
        ]);
        lastObserved.ownerLatestSyncStartedAt = ordersRecent?.latestSyncStartedAt ?? null;
        lastObserved.ownerLatestSuccessfulSyncAt =
          ordersRecent?.latestSuccessfulSyncAt ?? returnsRecent?.latestSuccessfulSyncAt ?? null;
        lastObserved.ownerLatestSyncWindowStart = ordersRecent?.latestSyncWindowStart ?? null;
        lastObserved.ownerLatestSyncWindowEnd = ordersRecent?.latestSyncWindowEnd ?? null;
        if (ordersRecent?.latestSyncStatus && ordersRecent.latestSyncStatus !== "succeeded") {
          notes.push(`Latest Shopify orders recent sync status=${ordersRecent.latestSyncStatus}.`);
        }
        if (returnsRecent?.latestSyncStatus && returnsRecent.latestSyncStatus !== "succeeded") {
          notes.push(`Latest Shopify returns recent sync status=${returnsRecent.latestSyncStatus}.`);
        }
      }
    }

    if (spec.surface.endsWith(".custom_window")) {
      if (provider === "shopify") {
        const latestManual = await readLatestReportingSnapshot({
          businessId: input.businessId,
          provider,
          reportType,
          exactDateRangeKey:
            spec.exactManualSelection && spec.selection.dateRangeKey ? spec.selection.dateRangeKey : null,
          excludeDateRangeKey: getReportingDateRangeKey(
            shopifyRecentWindow.startDate,
            shopifyRecentWindow.endDate,
          ),
        });
        lastObserved.latestManualObservedAt = latestManual?.updatedAt ?? null;
      }
    }

    if (spec.surface.endsWith(".non_country_dimension")) {
      const exactManual = spec.exactManualSelection
        ? await readExactReportingSnapshot({
            businessId: input.businessId,
            provider,
            reportType,
            dateRangeKey: replaceBusinessIdPlaceholder(
              spec.selection.dateRangeKey,
              input.businessId,
            ),
          })
        : null;
      const latestManual = await readLatestReportingSnapshot({
        businessId: input.businessId,
        provider,
        reportType,
        exactDateRangeKey:
          spec.exactManualSelection && spec.selection.dateRangeKey
            ? replaceBusinessIdPlaceholder(
                spec.selection.dateRangeKey,
                input.businessId,
              )
            : null,
        dateRangeKeyLike: "%dimension=%",
        dateRangeKeyNotLike: "%dimension=country%",
      });
      lastObserved.targetCreatedAt = exactManual?.createdAt ?? lastObserved.targetCreatedAt ?? null;
      lastObserved.targetUpdatedAt = exactManual?.updatedAt ?? lastObserved.targetUpdatedAt ?? null;
      lastObserved.latestManualObservedAt = latestManual?.updatedAt ?? null;
    }
  }

  if (spec.kind === "seo_cache") {
    if (context.searchConsoleIntegration?.status !== "connected") {
      applicable = false;
      notes.push("Search Console integration is not currently connected for this business.");
    }
    const exact = await readExactSeoCache({
      businessId: input.businessId,
      cacheType: spec.selection.cacheType as "overview" | "findings",
      startDate: spec.selection.startDate,
      endDate: spec.selection.endDate,
    });
    lastObserved.targetGeneratedAt = exact?.generatedAt ?? null;
    const syncJob = await readProviderSyncJob({
      businessId: input.businessId,
      provider: "search_console",
      reportType: "seo_overview",
      dateRangeKey:
        spec.selection.startDate && spec.selection.endDate
          ? `${spec.selection.startDate}:${spec.selection.endDate}`
          : null,
    });
    lastObserved.ownerTriggeredAt = syncJob?.triggeredAt ?? null;
    lastObserved.ownerCompletedAt = syncJob?.completedAt ?? null;
    if (syncJob?.status && syncJob.status !== "done") {
      notes.push(`Latest Search Console owner job for this window is in status=${syncJob.status}.`);
    }
  }

  if (spec.kind === "shopify_serving_state" || spec.kind === "shopify_reconciliation") {
    const providerAccountId = context.shopifyIntegration?.provider_account_id ?? null;
    if (context.shopifyIntegration?.status !== "connected" || !providerAccountId) {
      applicable = false;
      notes.push("Shopify integration is not currently connected for this business.");
    } else {
      const [ordersRecent, returnsRecent] = await Promise.all([
        getShopifySyncState({
          businessId: input.businessId,
          providerAccountId,
          syncTarget: "commerce_orders_recent",
        }).catch(() => null),
        getShopifySyncState({
          businessId: input.businessId,
          providerAccountId,
          syncTarget: "commerce_returns_recent",
        }).catch(() => null),
      ]);
      lastObserved.ownerLatestSyncStartedAt = ordersRecent?.latestSyncStartedAt ?? null;
      lastObserved.ownerLatestSuccessfulSyncAt =
        ordersRecent?.latestSuccessfulSyncAt ?? returnsRecent?.latestSuccessfulSyncAt ?? null;
      lastObserved.ownerLatestSyncWindowStart = ordersRecent?.latestSyncWindowStart ?? null;
      lastObserved.ownerLatestSyncWindowEnd = ordersRecent?.latestSyncWindowEnd ?? null;

      if (spec.kind === "shopify_serving_state") {
        if (!(await tableReady("shopify_serving_state"))) {
          applicable = false;
          notes.push("shopify_serving_state table is not ready.");
        } else {
          const sql = getDb();
          const rows = (await sql.query(
            `
              SELECT assessed_at, updated_at
              FROM shopify_serving_state
              WHERE business_id = $1
                AND provider_account_id = $2
                AND canary_key = $3
              LIMIT 1
            `,
            [input.businessId, providerAccountId, spec.selection.canaryKey],
          )) as Array<Record<string, unknown>>;
          const row = rows[0] ?? null;
          lastObserved.targetUpdatedAt = row?.updated_at
            ? new Date(String(row.updated_at)).toISOString()
            : null;
          lastObserved.targetCreatedAt = row?.assessed_at
            ? new Date(String(row.assessed_at)).toISOString()
            : null;
        }
      }

      if (spec.kind === "shopify_reconciliation") {
        if (!(await tableReady("shopify_reconciliation_runs"))) {
          applicable = false;
          notes.push("shopify_reconciliation_runs table is not ready.");
        } else {
          const sql = getDb();
          const rows = (await sql.query(
            `
              SELECT recorded_at, created_at
              FROM shopify_reconciliation_runs
              WHERE business_id = $1
                AND provider_account_id = $2
                AND reconciliation_key = $3
              ORDER BY recorded_at DESC NULLS LAST, created_at DESC
              LIMIT 1
            `,
            [input.businessId, providerAccountId, spec.selection.reconciliationKey],
          )) as Array<Record<string, unknown>>;
          const row = rows[0] ?? null;
          lastObserved.targetUpdatedAt = row?.recorded_at
            ? new Date(String(row.recorded_at)).toISOString()
            : null;
          lastObserved.targetCreatedAt = row?.created_at
            ? new Date(String(row.created_at)).toISOString()
            : null;
        }
      }
    }
  }

  const observedTargetTimestamp =
    lastObserved.targetUpdatedAt ??
    lastObserved.targetGeneratedAt ??
    lastObserved.targetHydratedAt ??
    null;
  const statusClassification = classifyServingFreshnessStatus({
    automationMode: spec.automationMode,
    applicable,
    observedTargetTimestamp,
    exactManualSelection: spec.exactManualSelection,
  });

  const ageInfo: ServingFreshnessStatusAgeMs = {
    targetUpdatedAt: ageMs(lastObserved.targetUpdatedAt, capturedAt),
    targetCreatedAt: ageMs(lastObserved.targetCreatedAt, capturedAt),
    targetGeneratedAt: ageMs(lastObserved.targetGeneratedAt, capturedAt),
    targetHydratedAt: ageMs(lastObserved.targetHydratedAt, capturedAt),
    ownerCompletedAt: ageMs(lastObserved.ownerCompletedAt, capturedAt),
    ownerTriggeredAt: ageMs(lastObserved.ownerTriggeredAt, capturedAt),
    ownerLatestSuccessfulSyncAt: ageMs(lastObserved.ownerLatestSuccessfulSyncAt, capturedAt),
    ownerLatestSyncStartedAt: ageMs(lastObserved.ownerLatestSyncStartedAt, capturedAt),
    latestManualObservedAt: ageMs(lastObserved.latestManualObservedAt, capturedAt),
  };

  if (statusClassification === "automated_missing") {
    notes.push("The current bounded automated target row is missing from the serving/cache table.");
  }
  if (statusClassification === "manual_missing") {
    notes.push("The exact selected manual boundary is not currently materialized.");
  }
  if (statusClassification === "unknown" && !notes.length) {
    notes.push("The owner applicability for this surface could not be derived from current integration or assignment state.");
  }

  return {
    surface: spec.surface,
    ownerModule: spec.ownerModule,
    triggerLane: spec.triggerLane,
    automationMode: spec.automationMode,
    freshnessScope: spec.freshnessScope,
    statusClassification,
    statusReason: spec.statusReason,
    selection: spec.selection,
    lastObserved,
    ageMs: ageInfo,
    operatorFallbackCommand: spec.operatorFallbackCommand,
    notes,
  } satisfies ServingFreshnessStatusEntry;
}

export async function readServingFreshnessStatus(
  input: ServingFreshnessStatusInput,
): Promise<ServingFreshnessStatusReport> {
  const capturedAt = new Date().toISOString();
  const referenceDate = input.referenceDate ?? new Date();
  const [ga4Integration, searchConsoleIntegration, shopifyIntegration] = await Promise.all([
    getIntegrationMetadata(input.businessId, "ga4").catch(() => null),
    getIntegrationMetadata(input.businessId, "search_console").catch(() => null),
    getIntegrationMetadata(input.businessId, "shopify").catch(() => null),
  ]);
  const shopifyRecentWindow = buildShopifyRecentWindow({
    timeZone:
      typeof shopifyIntegration?.metadata?.iana_timezone === "string"
        ? shopifyIntegration.metadata.iana_timezone
        : "UTC",
    referenceDate,
    recentWindowDays: input.shopifyRecentWindowDays,
  });

  const rawSpecs = buildServingFreshnessStatusEntrySpecs({
    startDate: input.startDate,
    endDate: input.endDate,
    overviewProvider: input.overviewProvider,
    demographicsDimension: input.demographicsDimension,
    referenceDate,
    shopifyRecentWindowDays: shopifyRecentWindow.recentWindowDays,
    shopifyRecentWindow: {
      startDate: shopifyRecentWindow.startDate,
      endDate: shopifyRecentWindow.endDate,
    },
  });

  const specs =
    input.overviewProvider == null
      ? rawSpecs
      : rawSpecs.filter((spec) =>
          spec.kind !== "overview_range" || spec.selection.provider === input.overviewProvider,
        );

  const entries = await Promise.all(
    specs.map((spec) =>
      buildStatusEntry(
        {
          ...spec,
          selection:
            spec.kind === "reporting_snapshot" &&
            spec.selection.provider === "ga4" &&
            spec.selection.dateRangeKey?.includes("%3Cbusiness_id%3E")
              ? {
                  ...spec.selection,
                  dateRangeKey: replaceBusinessIdPlaceholder(
                    spec.selection.dateRangeKey,
                    input.businessId,
                  ),
                }
              : spec.selection,
        },
        input,
        capturedAt,
        {
          ga4Integration,
          searchConsoleIntegration,
          shopifyIntegration,
        },
        shopifyRecentWindow,
      ),
    ),
  );

  const sortedEntries = sortEntries(entries);
  const classifications = sortedEntries.reduce<Record<ServingFreshnessStatusClassification, number>>(
    (acc, entry) => {
      acc[entry.statusClassification] += 1;
      return acc;
    },
    {
      automated_present: 0,
      automated_missing: 0,
      manual_boundary: 0,
      manual_missing: 0,
      unknown: 0,
    },
  );

  return {
    businessId: input.businessId,
    capturedAt,
    reusedExistingLane: "cli_only",
    manualBoundarySelection: {
      startDate: normalizeDate(input.startDate),
      endDate: normalizeDate(input.endDate),
      overviewProvider: input.overviewProvider ?? null,
      demographicsDimension: String(input.demographicsDimension ?? "").trim() || null,
    },
    classifications,
    entries: sortedEntries,
  };
}
