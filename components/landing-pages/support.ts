"use client";

import { formatMoney } from "@/components/creatives/money";
import {
  LANDING_PAGE_FUNNEL_LABELS,
  buildLandingPageAiReport,
} from "@/lib/landing-pages/performance";
import type {
  LandingPageAiReport,
  LandingPageFunnelStepKey,
  LandingPagePerformanceRow,
  LandingPagePerformanceSummary,
} from "@/src/types/landing-pages";

export type LandingPageSortableMetric =
  | "sessions"
  | "engagementRate"
  | "scrollRate"
  | "viewItem"
  | "addToCarts"
  | "checkouts"
  | "addShippingInfo"
  | "addPaymentInfo"
  | "purchases"
  | "totalRevenue"
  | "averagePurchaseRevenue";

export interface LandingPageSortState {
  key: LandingPageSortableMetric;
  direction: "asc" | "desc";
}

export function formatInteger(value: number): string {
  return Math.round(Number.isFinite(value) ? value : 0).toLocaleString();
}

export function formatPercent(value: number): string {
  return `${(Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 100).toFixed(1)}%`;
}

export function formatCurrency(value: number, currency: string | null): string {
  return formatMoney(value, currency, currency);
}

export function sortLandingPageRows(
  rows: LandingPagePerformanceRow[],
  sort: LandingPageSortState
): LandingPagePerformanceRow[] {
  return [...rows].sort((left, right) => {
    const leftValue = left[sort.key];
    const rightValue = right[sort.key];
    const diff = typeof leftValue === "number" && typeof rightValue === "number"
      ? leftValue - rightValue
      : 0;
    return sort.direction === "asc" ? diff : -diff;
  });
}

export function filterLandingPageRows(
  rows: LandingPagePerformanceRow[],
  searchTerm: string
): LandingPagePerformanceRow[] {
  const query = searchTerm.trim().toLowerCase();
  if (!query) return rows;
  return rows.filter((row) =>
    row.path.toLowerCase().includes(query) || row.title.toLowerCase().includes(query)
  );
}

export function buildSummaryCards(
  summary: LandingPagePerformanceSummary,
  currency: string | null
) {
  return [
    {
      label: "Sessions",
      value: formatInteger(summary.totalSessions),
      sub: `${formatInteger(summary.totalLandingPages)} landing pages`,
    },
    {
      label: "Engagement Rate",
      value: formatPercent(summary.avgEngagementRate),
      sub: `Scroll rate ${formatPercent(summary.avgScrollRate)}`,
    },
    {
      label: "Purchases",
      value: formatInteger(summary.totalPurchases),
      sub: `Session CVR ${formatPercent(summary.sessionToPurchaseRate)}`,
    },
    {
      label: "Revenue",
      value: formatCurrency(summary.totalRevenue, currency),
      sub: summary.topLandingPagePath ? `Top page ${summary.topLandingPagePath}` : "No top page yet",
    },
    {
      label: "Avg Order Value",
      value: formatCurrency(summary.averagePurchaseRevenue, currency),
      sub: `${formatInteger(summary.totalCheckouts)} checkout starts`,
    },
    {
      label: "Weakest Page",
      value: summary.weakestLandingPagePath ?? "—",
      sub: "Lowest session-to-purchase rate among active pages",
    },
  ];
}

export function getDropOffLabel(step: LandingPageFunnelStepKey | null): string {
  if (!step) return "No clear drop-off";
  if (step === "sessions") return `${LANDING_PAGE_FUNNEL_LABELS.sessions} -> ${LANDING_PAGE_FUNNEL_LABELS.view_item}`;
  if (step === "view_item") return `${LANDING_PAGE_FUNNEL_LABELS.view_item} -> ${LANDING_PAGE_FUNNEL_LABELS.add_to_cart}`;
  if (step === "add_to_cart") return `${LANDING_PAGE_FUNNEL_LABELS.add_to_cart} -> ${LANDING_PAGE_FUNNEL_LABELS.begin_checkout}`;
  if (step === "begin_checkout") return `${LANDING_PAGE_FUNNEL_LABELS.begin_checkout} -> ${LANDING_PAGE_FUNNEL_LABELS.add_shipping_info}`;
  if (step === "add_shipping_info") return `${LANDING_PAGE_FUNNEL_LABELS.add_shipping_info} -> ${LANDING_PAGE_FUNNEL_LABELS.purchase}`;
  if (step === "add_payment_info") return "Add payment info -> Purchase";
  return LANDING_PAGE_FUNNEL_LABELS[step];
}

export function toAiReport(row: LandingPagePerformanceRow): LandingPageAiReport {
  return buildLandingPageAiReport(row);
}

export function resolveLandingPageSiteBaseUrl(siteUrl: string | null | undefined): string | null {
  const raw = typeof siteUrl === "string" ? siteUrl.trim() : "";
  if (!raw) return null;
  if (raw.startsWith("sc-domain:")) {
    return `https://${raw.replace("sc-domain:", "").replace(/\/+$/, "")}`;
  }
  if (/^https?:\/\//i.test(raw)) {
    return raw.replace(/\/+$/, "");
  }
  return null;
}

export function resolveLandingPageAbsoluteUrl(
  path: string,
  siteUrl: string | null | undefined
): string {
  const base = resolveLandingPageSiteBaseUrl(siteUrl);
  if (!base) return path;
  try {
    return new URL(path, `${base}/`).toString();
  } catch {
    return path;
  }
}
