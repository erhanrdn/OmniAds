import type { NextRequest } from "next/server";
import { getMetricLabelForKey } from "@/lib/report-metric-catalog";
import {
  type CustomReportDocument,
  type CustomReportBreakdown,
  type CustomReportRecord,
  type CustomReportWidgetDefinition,
  type RenderedReportPayload,
  type RenderedReportWidget,
} from "@/lib/custom-reports";

function toCurrency(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

function toCompactNumber(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("en-US", {
    notation: Math.abs(value) >= 1000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function toRatio(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "-";
  return `${value.toFixed(2)}x`;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatMetricValue(metricKey: string, value: number | null) {
  if (metricKey.includes("roas")) return toRatio(value);
  if (metricKey.includes("ctr") || metricKey.includes("rate")) {
    return value == null || !Number.isFinite(value) ? "-" : `${value.toFixed(2)}%`;
  }
  if (
    metricKey.includes("spend") ||
    metricKey.includes("revenue") ||
    metricKey.includes("cpa") ||
    metricKey.includes("cpm") ||
    metricKey.includes("cpc")
  ) {
    return toCurrency(value);
  }
  return toCompactNumber(value);
}

function formatCellValue(metricKey: string, value: unknown) {
  if (metricKey === "name" || metricKey === "status" || metricKey === "channel" || metricKey === "currency") {
    return String(value ?? "-");
  }
  return formatMetricValue(metricKey, parseNumber(value));
}

function getMetricSeriesColor(index: number) {
  return ["#2563eb", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444"][index % 5];
}

function formatSeriesMetricLabel(metricKey: string) {
  return getMetricLabelForKey(metricKey);
}

function getMetricContainerKey(metricKey: string) {
  const [prefix, suffix] = metricKey.includes(".") ? metricKey.split(".", 2) : ["all", metricKey];
  return {
    provider: prefix === "meta" || prefix === "google" || prefix === "combined" ? prefix : "combined",
    metric: suffix,
  };
}

function enumerateDays(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  const dates: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function getBreakdownBucket(input: { label: string; breakdown: CustomReportBreakdown }) {
  const date = new Date(`${input.label}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return input.label;
  if (input.breakdown === "day") return input.label;
  if (input.breakdown === "month") {
    return date.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
  }
  const start = new Date(date);
  const day = start.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setUTCDate(start.getUTCDate() + diff);
  return start.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function aggregateSeriesPoints(
  points: Array<{ label: string; value: number }>,
  breakdown: CustomReportBreakdown
) {
  if (breakdown === "day") return points;
  const buckets = new Map<string, number>();
  for (const point of points) {
    const bucket = getBreakdownBucket({ label: point.label, breakdown });
    buckets.set(bucket, Number((buckets.get(bucket) ?? 0) + point.value));
  }
  return Array.from(buckets.entries()).map(([label, value]) => ({ label, value }));
}

function resolveDateRangePreset(preset: CustomReportDocument["dateRangePreset"]) {
  const end = new Date();
  const endDate = end.toISOString().slice(0, 10);
  const start = new Date(end);
  const days = preset === "7" ? 6 : preset === "90" ? 89 : 29;
  start.setUTCDate(start.getUTCDate() - days);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate,
    label: `Last ${preset} Days`,
  };
}

async function fetchInternalJson<T>(request: NextRequest, path: string) {
  const url = new URL(path, request.nextUrl.origin);
  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      cookie: request.headers.get("cookie") ?? "",
    },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as T | null;
  if (!response.ok) {
    throw new Error(
      (payload as { message?: string; error?: string } | null)?.message ??
        `Failed to fetch ${path}`
    );
  }
  return payload as T;
}

async function fetchInternalJsonWithParams<T>(
  request: NextRequest,
  pathname: string,
  params: Record<string, string>
) {
  const url = new URL(pathname, request.nextUrl.origin);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return fetchInternalJson<T>(request, `${url.pathname}${url.search}`);
}

function getWidgetColumns(widget: CustomReportWidgetDefinition, fallback: string[]) {
  return widget.columns?.length ? widget.columns : fallback;
}

function sumMetric(
  rows: Array<Record<string, unknown>>,
  metricKey: string,
  nestedKey?: string
) {
  return rows.reduce((sum, row) => {
    const container =
      nestedKey && typeof row[nestedKey] === "object" && row[nestedKey] !== null
        ? (row[nestedKey] as Record<string, unknown>)
        : row;
    return sum + Number(parseNumber(container[metricKey]) ?? 0);
  }, 0);
}

function mapDynamicColumnsToRow(
  source: Record<string, unknown>,
  columns: string[],
  nestedKey?: string
) {
  const container =
    nestedKey && typeof source[nestedKey] === "object" && source[nestedKey] !== null
      ? (source[nestedKey] as Record<string, unknown>)
      : source;
  return Object.fromEntries(
    columns.map((column) => [column, formatCellValue(column, container[column])])
  );
}

function aggregateMetricFromRows(
  rows: Array<Record<string, unknown>>,
  metricKey: string,
  nestedKey?: string
) {
  return rows.reduce((sum, row) => {
    const container =
      nestedKey && typeof row[nestedKey] === "object" && row[nestedKey] !== null
        ? (row[nestedKey] as Record<string, unknown>)
        : row;
    return sum + Number(parseNumber(container[metricKey]) ?? 0);
  }, 0);
}

async function buildProviderSeries(input: {
  request: NextRequest;
  businessId: string;
  provider: "meta" | "google";
  metricKey: string;
  accountId?: string | null;
  startDate: string;
  endDate: string;
  breakdown: CustomReportBreakdown;
}) {
  const dates = enumerateDays(input.startDate, input.endDate);
  const metric = input.metricKey.split(".").pop() ?? input.metricKey;
  const dailyPoints = await Promise.all(
    dates.map(async (date) => {
      if (input.provider === "meta") {
        const payload = await fetchInternalJsonWithParams<{ rows?: Array<Record<string, unknown>> }>(
          input.request,
          "/api/meta/campaigns",
          {
            businessId: input.businessId,
            startDate: date,
            endDate: date,
            ...(input.accountId ? { accountId: input.accountId } : {}),
          }
        ).catch(() => null);
        return {
          label: date,
          value: aggregateMetricFromRows(payload?.rows ?? [], metric),
        };
      }

      const payload = await fetchInternalJsonWithParams<{ rows?: Array<Record<string, unknown>> }>(
        input.request,
        "/api/google-ads/campaigns",
        {
          businessId: input.businessId,
          dateRange: "custom",
          customStart: date,
          customEnd: date,
          compareMode: "none",
          ...(input.accountId ? { accountId: input.accountId } : {}),
        }
      ).catch(() => null);
      return {
        label: date,
        value: aggregateMetricFromRows(payload?.rows ?? [], metric, "metrics"),
      };
    })
  );

  return aggregateSeriesPoints(dailyPoints, input.breakdown).map((point) => ({
    label: input.breakdown === "day" ? point.label.slice(5) : point.label,
    value: point.value,
  }));
}

function toCsvValue(value: string | number | null | undefined) {
  if (value == null) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function renderWidgetCsv(widget: RenderedReportWidget) {
  const columns = widget.columns ?? [];
  const rows = widget.rows ?? [];
  const header = columns.join(",");
  const body = rows
    .map((row) => columns.map((column) => toCsvValue(row[column])).join(","))
    .join("\n");
  return [header, body].filter(Boolean).join("\n");
}

export async function renderCustomReport(params: {
  request: NextRequest;
  businessId: string;
  name: string;
  description?: string | null;
  reportId?: string;
  definition: CustomReportDocument;
}): Promise<RenderedReportPayload> {
  const { request, businessId, name, description, reportId, definition } = params;
  const range = resolveDateRangePreset(definition.dateRangePreset);

  let overviewSummary:
    | {
        pins?: Array<{ id?: string; title?: string; value?: number | null; changePct?: number | null }>;
        attribution?: Array<Record<string, unknown>>;
      }
    | null = null;
  let sparklines:
    | {
        sparklines?: {
          combined?: Array<{ date: string; spend: number; revenue: number; purchases: number }>;
          providerTrends?: Partial<
            Record<"meta" | "google", Array<{ date: string; spend: number; revenue: number; purchases: number }>>
          >;
        };
      }
    | null = null;
  const metaCampaignCache = new Map<
    string,
    { rows?: Array<Record<string, unknown>>; status?: string; message?: string; meta?: Record<string, unknown> }
  >();
  const googleCampaignCache = new Map<
    string,
    { data?: Array<Record<string, unknown>>; meta?: Record<string, unknown> }
  >();

  async function getOverviewSummaryData() {
    if (overviewSummary) return overviewSummary;
    overviewSummary = await fetchInternalJson(request, `/api/overview-summary?businessId=${encodeURIComponent(businessId)}&startDate=${range.startDate}&endDate=${range.endDate}&compareMode=${definition.compareMode}`);
    return overviewSummary;
  }

  async function getSparklineData() {
    if (sparklines) return sparklines;
    sparklines = await fetchInternalJson(request, `/api/overview-sparklines?businessId=${encodeURIComponent(businessId)}&startDate=${range.startDate}&endDate=${range.endDate}`);
    return sparklines;
  }

  async function getMetaCampaignData(accountId?: string) {
    const cacheKey = accountId ?? "__all__";
    const cached = metaCampaignCache.get(cacheKey);
    if (cached) return cached;
    const params = new URLSearchParams({
      businessId,
      startDate: range.startDate,
      endDate: range.endDate,
    });
    if (accountId) params.set("accountId", accountId);
    const payload = await fetchInternalJson<
      { rows?: Array<Record<string, unknown>>; status?: string; message?: string; meta?: Record<string, unknown> }
    >(request, `/api/meta/campaigns?${params.toString()}`);
    metaCampaignCache.set(cacheKey, payload);
    return payload;
  }

  async function getGoogleCampaignData(accountId?: string) {
    const cacheKey = accountId ?? "__all__";
    const cached = googleCampaignCache.get(cacheKey);
    if (cached) return cached;
    const params = new URLSearchParams({
      businessId,
      dateRange: definition.dateRangePreset,
    });
    if (accountId) params.set("accountId", accountId);
    const payload = await fetchInternalJson<{ data?: Array<Record<string, unknown>>; meta?: Record<string, unknown> }>(
      request,
      `/api/google-ads/campaigns?${params.toString()}`
    );
    googleCampaignCache.set(cacheKey, payload);
    return payload;
  }

  const renderedWidgets = await Promise.all(
    definition.widgets
      .slice()
      .sort((a, b) => a.slot - b.slot)
      .map(async (widget): Promise<RenderedReportWidget> => {
        if (widget.type === "section") {
          return {
            id: widget.id,
            slot: widget.slot,
            colSpan: widget.colSpan,
            rowSpan: widget.rowSpan,
            type: widget.type,
            title: widget.title,
            subtitle: widget.subtitle,
            text: widget.text ?? "",
          };
        }

        if (widget.type === "text") {
          return {
            id: widget.id,
            slot: widget.slot,
            colSpan: widget.colSpan,
            rowSpan: widget.rowSpan,
            type: widget.type,
            title: widget.title,
            subtitle: widget.subtitle,
            text: widget.text ?? "",
          };
        }

        try {
          if (widget.dataSource === "overview_summary") {
            const summary = await getOverviewSummaryData();
            const pins = summary?.pins ?? [];
            const platformSections = (summary as { platforms?: Array<{ id?: string; metrics?: Array<{ id?: string; value?: number | null }> }> } | null)?.platforms ?? [];

            const directMatch = pins.find((pin) => pin.id === widget.metricKey);
            let value = parseNumber(directMatch?.value);
            let delta = parseNumber(directMatch?.changePct);

            if (value == null && widget.metricKey?.includes("-")) {
              const [providerKey, metricKey] = widget.metricKey.split("-", 2);
              const providerSection = platformSections.find((section) => section.id === providerKey);
              const providerMetric = providerSection?.metrics?.find((metric) => metric.id === metricKey);
              value = parseNumber(providerMetric?.value);
            }

            return {
              id: widget.id,
              slot: widget.slot,
              colSpan: widget.colSpan,
              rowSpan: widget.rowSpan,
              type: widget.type,
              title: widget.title,
              subtitle: widget.subtitle,
              value: formatMetricValue(widget.metricKey ?? "", value),
              deltaLabel:
                delta == null ? null : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}% vs previous`,
              emptyMessage: value == null ? "Metric unavailable for this business." : undefined,
            };
          }

          if (widget.dataSource === "overview_trend") {
            const data = await getSparklineData();
            const yMetrics = widget.yMetrics?.length
              ? widget.yMetrics
              : widget.metricKey
                ? [widget.metricKey]
                : ["combined.spend"];
            const breakdown = widget.breakdown ?? "day";
            const series = await Promise.all(
              yMetrics.map(async (metricKey, index) => {
                const { provider, metric } = getMetricContainerKey(metricKey);
                let points: Array<{ label: string; value: number }> = [];

                if (provider === "meta" || provider === "google") {
                  points = await buildProviderSeries({
                    request,
                    businessId,
                    provider,
                    metricKey,
                    accountId: widget.accountId ?? null,
                    startDate: range.startDate,
                    endDate: range.endDate,
                    breakdown,
                  });
                } else {
                  const trendSet = data?.sparklines?.combined ?? [];
                  const rawPoints = trendSet.map((point) => ({
                    label: point.date,
                    value: (() => {
                      if (metric === "roas") {
                        const spend = Number(point.spend ?? 0);
                        return spend > 0 ? Number(point.revenue ?? 0) / spend : 0;
                      }
                      if (metric === "spend" || metric === "revenue" || metric === "purchases") {
                        return Number(point[metric] ?? 0);
                      }
                      return 0;
                    })(),
                  }));
                  points = aggregateSeriesPoints(rawPoints, breakdown).map((point) => ({
                    label: breakdown === "day" ? point.label.slice(5) : point.label,
                    value: point.value,
                  }));
                }

                return {
                  key: metricKey,
                  label: formatSeriesMetricLabel(metricKey),
                  color: getMetricSeriesColor(index),
                  points,
                };
              })
            );
            const chartPoints = series[0]?.points ?? [];
            return {
              id: widget.id,
              slot: widget.slot,
              colSpan: widget.colSpan,
              rowSpan: widget.rowSpan,
              type: widget.type,
              title: widget.title,
              subtitle: widget.subtitle,
              points: chartPoints,
              series,
              emptyMessage: chartPoints.length === 0 ? "No trend data yet." : undefined,
            };
          }

          if (widget.dataSource === "channel_attribution") {
            const summary = await getOverviewSummaryData();
            const attribution = (summary?.attribution ?? []).slice(0, widget.limit ?? 8);
            const columns = getWidgetColumns(widget, [
              "channel",
              "spend",
              "revenue",
              "roas",
              "conversions",
            ]);
            const rows = attribution.map((row) => ({
              channel: String(row.channel ?? "-"),
              spend: toCurrency(parseNumber(row.spend)),
              revenue: toCurrency(parseNumber(row.revenue)),
              roas: toRatio(parseNumber(row.roas)),
              conversions: toCompactNumber(parseNumber(row.conversions)),
              clicks: toCompactNumber(parseNumber(row.clicks)),
              ctr: parseNumber(row.ctr) == null ? "-" : `${Number(row.ctr).toFixed(2)}%`,
              cpa: toCurrency(parseNumber(row.cpa)),
            }));
            return {
              id: widget.id,
              slot: widget.slot,
              colSpan: widget.colSpan,
              rowSpan: widget.rowSpan,
              type: widget.type,
              title: widget.title,
              subtitle: widget.subtitle,
              columns,
              rows,
              emptyMessage: rows.length === 0 ? "No channel attribution rows yet." : undefined,
            };
          }

          if (widget.dataSource === "meta_campaigns") {
            const payload = await getMetaCampaignData(widget.accountId);
            const scopedRows =
              widget.accountId != null
                ? (payload?.rows ?? []).filter((row) => String(row.accountId ?? "") === widget.accountId)
                : (payload?.rows ?? []);
            const sourceRows = scopedRows.slice(0, widget.limit ?? 8);
            if (widget.type === "metric") {
              const metricKey = widget.metricKey ?? "spend";
              const totalValue = sumMetric(scopedRows, metricKey);
              return {
                id: widget.id,
                slot: widget.slot,
                colSpan: widget.colSpan,
                rowSpan: widget.rowSpan,
                type: widget.type,
                title: widget.title,
                subtitle: widget.subtitle,
                value: formatMetricValue(metricKey, totalValue),
                emptyMessage:
                  scopedRows.length === 0 ? "No Meta campaign metrics for this selection." : undefined,
              };
            }
            const columns = getWidgetColumns(widget, [
              "name",
              "status",
              "spend",
              "revenue",
              "purchases",
              "roas",
            ]);
            const rows = sourceRows.map((row) => mapDynamicColumnsToRow(row, columns));
            return {
              id: widget.id,
              slot: widget.slot,
              colSpan: widget.colSpan,
              rowSpan: widget.rowSpan,
              type: widget.type,
              title: widget.title,
              subtitle: widget.subtitle,
              columns,
              rows,
              emptyMessage: rows.length === 0 ? "No Meta campaign rows for this selection." : undefined,
            };
          }

          if (widget.dataSource === "google_campaigns") {
            const payload = await getGoogleCampaignData(widget.accountId);
            const scopedRows =
              widget.accountId != null
                ? (payload?.data ?? []).filter((row) => String(row.customerId ?? row.customer_id ?? "") === widget.accountId)
                : (payload?.data ?? []);
            const sourceRows = scopedRows.slice(0, widget.limit ?? 8);
            if (widget.type === "metric") {
              const metricKey = widget.metricKey ?? "spend";
              const totalValue = sumMetric(scopedRows, metricKey, "metrics");
              return {
                id: widget.id,
                slot: widget.slot,
                colSpan: widget.colSpan,
                rowSpan: widget.rowSpan,
                type: widget.type,
                title: widget.title,
                subtitle: widget.subtitle,
                value: formatMetricValue(metricKey, totalValue),
                warning: hasPermissionWarning(payload?.meta)
                  ? "Google Ads returned a permission warning for this business."
                  : null,
                emptyMessage:
                  scopedRows.length === 0 ? "No Google campaign metrics for this selection." : undefined,
              };
            }
            const columns = getWidgetColumns(widget, [
              "name",
              "status",
              "spend",
              "revenue",
              "conversions",
              "roas",
            ]);
            const rows = sourceRows.map((row) => ({
              ...mapDynamicColumnsToRow(row, columns.filter((column) => column === "name" || column === "status")),
              ...mapDynamicColumnsToRow(
                row,
                columns.filter((column) => column !== "name" && column !== "status"),
                "metrics"
              ),
            }));
            const warning = hasPermissionWarning(payload?.meta)
              ? "Google Ads returned a permission warning for this business."
              : null;
            return {
              id: widget.id,
              slot: widget.slot,
              colSpan: widget.colSpan,
              rowSpan: widget.rowSpan,
              type: widget.type,
              title: widget.title,
              subtitle: widget.subtitle,
              columns,
              rows,
              warning,
              emptyMessage: rows.length === 0 ? "No Google campaign rows for this selection." : undefined,
            };
          }

          return {
            id: widget.id,
            slot: widget.slot,
            colSpan: widget.colSpan,
            rowSpan: widget.rowSpan,
            type: widget.type,
            title: widget.title,
            subtitle: widget.subtitle,
            emptyMessage: "Unsupported widget source.",
          };
        } catch (error) {
          return {
            id: widget.id,
            slot: widget.slot,
            colSpan: widget.colSpan,
            rowSpan: widget.rowSpan,
            type: widget.type,
            title: widget.title,
            subtitle: widget.subtitle,
            warning: error instanceof Error ? error.message : "Widget failed to load.",
            emptyMessage: "Widget failed to load.",
          };
        }
      })
  );

  return {
    businessId,
    reportId,
    name,
    description,
    dateRangeLabel: `${range.label} (${range.startDate} to ${range.endDate})`,
    generatedAt: new Date().toISOString(),
    widgets: renderedWidgets,
  };
}

function hasPermissionWarning(meta: unknown) {
  if (!meta || typeof meta !== "object") return false;
  const warnings = (meta as { warnings?: unknown }).warnings;
  return Array.isArray(warnings)
    ? warnings.some(
        (warning) =>
          typeof warning === "string" &&
          warning.toUpperCase().includes("PERMISSION")
      )
    : false;
}

export async function renderCustomReportRecord(
  request: NextRequest,
  report: CustomReportRecord
) {
  return renderCustomReport({
    request,
    businessId: report.businessId,
    reportId: report.id,
    name: report.name,
    description: report.description,
    definition: report.definition,
  });
}
