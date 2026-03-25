"use client";

import { formatMoney } from "@/components/creatives/money";
import {
  buildLandingPageAiReport,
  getLandingPageFunnelLabel,
} from "@/lib/landing-pages/performance";
import type { AppLanguage } from "@/lib/i18n";
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
  currency: string | null,
  language: AppLanguage = "en"
) {
  return [
    {
      label: language === "tr" ? "Oturumlar" : "Sessions",
      value: formatInteger(summary.totalSessions),
      sub:
        language === "tr"
          ? `${formatInteger(summary.totalLandingPages)} landing page`
          : `${formatInteger(summary.totalLandingPages)} landing pages`,
    },
    {
      label: language === "tr" ? "Etkilesim Orani" : "Engagement Rate",
      value: formatPercent(summary.avgEngagementRate),
      sub:
        language === "tr"
          ? `Scroll orani ${formatPercent(summary.avgScrollRate)}`
          : `Scroll rate ${formatPercent(summary.avgScrollRate)}`,
    },
    {
      label: language === "tr" ? "Satin Almalar" : "Purchases",
      value: formatInteger(summary.totalPurchases),
      sub: `Session CVR ${formatPercent(summary.sessionToPurchaseRate)}`,
    },
    {
      label: language === "tr" ? "Gelir" : "Revenue",
      value: formatCurrency(summary.totalRevenue, currency),
      sub:
        summary.topLandingPagePath
          ? language === "tr"
            ? `En iyi sayfa ${summary.topLandingPagePath}`
            : `Top page ${summary.topLandingPagePath}`
          : language === "tr"
            ? "Henuz one cikan sayfa yok"
            : "No top page yet",
    },
    {
      label: language === "tr" ? "AOV" : "Avg Order Value",
      value: formatCurrency(summary.averagePurchaseRevenue, currency),
      sub:
        language === "tr"
          ? `${formatInteger(summary.totalCheckouts)} checkout baslangici`
          : `${formatInteger(summary.totalCheckouts)} checkout starts`,
    },
    {
      label: language === "tr" ? "En Zayif Sayfa" : "Weakest Page",
      value: summary.weakestLandingPagePath ?? "—",
      sub:
        language === "tr"
          ? "Aktif sayfalar arasinda en dusuk session-to-purchase orani"
          : "Lowest session-to-purchase rate among active pages",
    },
  ];
}

export function getDropOffLabel(step: LandingPageFunnelStepKey | null, language: AppLanguage = "en"): string {
  if (!step) return language === "tr" ? "Net bir dusus yok" : "No clear drop-off";
  if (step === "sessions") return `${getLandingPageFunnelLabel("sessions", language)} -> ${getLandingPageFunnelLabel("view_item", language)}`;
  if (step === "view_item") return `${getLandingPageFunnelLabel("view_item", language)} -> ${getLandingPageFunnelLabel("add_to_cart", language)}`;
  if (step === "add_to_cart") return `${getLandingPageFunnelLabel("add_to_cart", language)} -> ${getLandingPageFunnelLabel("begin_checkout", language)}`;
  if (step === "begin_checkout") return `${getLandingPageFunnelLabel("begin_checkout", language)} -> ${getLandingPageFunnelLabel("add_shipping_info", language)}`;
  if (step === "add_shipping_info") return `${getLandingPageFunnelLabel("add_shipping_info", language)} -> ${getLandingPageFunnelLabel("purchase", language)}`;
  if (step === "add_payment_info") return `${getLandingPageFunnelLabel("add_payment_info", language)} -> ${getLandingPageFunnelLabel("purchase", language)}`;
  return getLandingPageFunnelLabel(step, language);
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
