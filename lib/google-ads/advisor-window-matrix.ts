import type {
  GoogleAdsAdvisorSelectedWindow,
  GoogleAdsAdvisorSupportWindow,
} from "@/lib/google-ads/advisor-windows";
import type {
  GoogleAdsSearchClusterDailySupportReadRow,
  GoogleAdsSearchQueryHotDailySupportReadRow,
  GoogleAdsTopQueryWeeklySupportReadRow,
} from "@/lib/google-ads/search-intelligence-storage";
import type { GoogleAdsWarehouseDailyRow } from "@/lib/google-ads/warehouse-types";

export type GoogleAdsAdvisorWindowMatrixKey =
  | "selected_custom"
  | GoogleAdsAdvisorSupportWindow["key"];

type AdvisorWindowMatrixDescriptor = {
  key: GoogleAdsAdvisorWindowMatrixKey;
  label: string;
  startDate: string;
  endDate: string;
};

export interface GoogleAdsAdvisorWindowMatrixSlice {
  rangeKey: string;
  startDate: string;
  endDate: string;
  startWeek: string;
  endWeek: string;
  campaignDailyRows: GoogleAdsWarehouseDailyRow[];
  keywordDailyRows: GoogleAdsWarehouseDailyRow[];
  productDailyRows: GoogleAdsWarehouseDailyRow[];
  hotQueryRows: GoogleAdsSearchQueryHotDailySupportReadRow[];
  queryWeeklyRows: GoogleAdsTopQueryWeeklySupportReadRow[];
  clusterDailyRows: GoogleAdsSearchClusterDailySupportReadRow[];
}

export interface GoogleAdsAdvisorWindowMatrixView {
  key: GoogleAdsAdvisorWindowMatrixKey;
  label: string;
  startDate: string;
  endDate: string;
  slice: GoogleAdsAdvisorWindowMatrixSlice;
}

export interface GoogleAdsAdvisorWindowMatrixRowCounts {
  campaignDailyRows: number;
  keywordDailyRows: number;
  productDailyRows: number;
  hotQueryRows: number;
  queryWeeklyRows: number;
  clusterDailyRows: number;
}

export interface GoogleAdsAdvisorWindowMatrixTelemetry {
  windowCount: number;
  assignedCampaignRows: number;
  assignedKeywordRows: number;
  assignedProductRows: number;
  windowRowCounts: Record<GoogleAdsAdvisorWindowMatrixKey, GoogleAdsAdvisorWindowMatrixRowCounts>;
}

export interface GoogleAdsAdvisorWindowMatrix {
  selectedView: GoogleAdsAdvisorWindowMatrixView;
  supportViews: Record<GoogleAdsAdvisorSupportWindow["key"], GoogleAdsAdvisorWindowMatrixView>;
  allViews: GoogleAdsAdvisorWindowMatrixView[];
  uniqueSlices: GoogleAdsAdvisorWindowMatrixSlice[];
  telemetry: GoogleAdsAdvisorWindowMatrixTelemetry;
}

function normalizeDate(value: string) {
  return value.slice(0, 10);
}

function isoWeekStart(date: string) {
  const value = new Date(`${date}T00:00:00Z`);
  const day = value.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  value.setUTCDate(value.getUTCDate() + diff);
  return value.toISOString().slice(0, 10);
}

function createSlice(descriptor: AdvisorWindowMatrixDescriptor): GoogleAdsAdvisorWindowMatrixSlice {
  return {
    rangeKey: `${descriptor.startDate}:${descriptor.endDate}`,
    startDate: descriptor.startDate,
    endDate: descriptor.endDate,
    startWeek: isoWeekStart(descriptor.startDate),
    endWeek: isoWeekStart(descriptor.endDate),
    campaignDailyRows: [],
    keywordDailyRows: [],
    productDailyRows: [],
    hotQueryRows: [],
    queryWeeklyRows: [],
    clusterDailyRows: [],
  };
}

export function buildGoogleAdsAdvisorWindowMatrix(input: {
  selectedWindow: GoogleAdsAdvisorSelectedWindow;
  supportWindows: GoogleAdsAdvisorSupportWindow[];
  campaignDailyRows: GoogleAdsWarehouseDailyRow[];
  keywordDailyRows: GoogleAdsWarehouseDailyRow[];
  productDailyRows: GoogleAdsWarehouseDailyRow[];
  hotQueryRows: GoogleAdsSearchQueryHotDailySupportReadRow[];
  queryWeeklyRows: GoogleAdsTopQueryWeeklySupportReadRow[];
  clusterDailyRows: GoogleAdsSearchClusterDailySupportReadRow[];
}): GoogleAdsAdvisorWindowMatrix {
  const descriptors: AdvisorWindowMatrixDescriptor[] = [
    {
      key: "selected_custom",
      label: input.selectedWindow.label,
      startDate: input.selectedWindow.customStart,
      endDate: input.selectedWindow.customEnd,
    },
    ...input.supportWindows.map((window) => ({
      key: window.key,
      label: window.label,
      startDate: window.customStart,
      endDate: window.customEnd,
    })),
  ];

  const slicesByRange = new Map<string, GoogleAdsAdvisorWindowMatrixSlice>();
  const allViews = descriptors.map((descriptor) => {
    const rangeKey = `${descriptor.startDate}:${descriptor.endDate}`;
    const existing = slicesByRange.get(rangeKey);
    const slice = existing ?? createSlice(descriptor);
    if (!existing) slicesByRange.set(rangeKey, slice);
    return {
      key: descriptor.key,
      label: descriptor.label,
      startDate: descriptor.startDate,
      endDate: descriptor.endDate,
      slice,
    } satisfies GoogleAdsAdvisorWindowMatrixView;
  });

  const uniqueSlices = Array.from(slicesByRange.values());
  let assignedCampaignRows = 0;
  let assignedKeywordRows = 0;
  let assignedProductRows = 0;

  for (const row of input.campaignDailyRows) {
    const date = normalizeDate(row.date);
    for (const slice of uniqueSlices) {
      if (date >= slice.startDate && date <= slice.endDate) {
        slice.campaignDailyRows.push(row);
        assignedCampaignRows += 1;
      }
    }
  }

  for (const row of input.keywordDailyRows) {
    const date = normalizeDate(row.date);
    for (const slice of uniqueSlices) {
      if (date >= slice.startDate && date <= slice.endDate) {
        slice.keywordDailyRows.push(row);
        assignedKeywordRows += 1;
      }
    }
  }

  for (const row of input.productDailyRows) {
    const date = normalizeDate(row.date);
    for (const slice of uniqueSlices) {
      if (date >= slice.startDate && date <= slice.endDate) {
        slice.productDailyRows.push(row);
        assignedProductRows += 1;
      }
    }
  }

  for (const row of input.hotQueryRows) {
    const date = normalizeDate(row.date);
    for (const slice of uniqueSlices) {
      if (date >= slice.startDate && date <= slice.endDate) {
        slice.hotQueryRows.push(row);
      }
    }
  }

  for (const row of input.clusterDailyRows) {
    const date = normalizeDate(row.date);
    for (const slice of uniqueSlices) {
      if (date >= slice.startDate && date <= slice.endDate) {
        slice.clusterDailyRows.push(row);
      }
    }
  }

  for (const row of input.queryWeeklyRows) {
    const weekStart = normalizeDate(row.weekStart);
    for (const slice of uniqueSlices) {
      if (weekStart >= slice.startWeek && weekStart <= slice.endWeek) {
        slice.queryWeeklyRows.push(row);
      }
    }
  }

  const selectedView = allViews.find((view) => view.key === "selected_custom");
  if (!selectedView) {
    throw new Error("advisor window matrix missing selected_custom view");
  }

  const supportViews = Object.fromEntries(
    allViews
      .filter((view) => view.key !== "selected_custom")
      .map((view) => [view.key, view]),
  ) as Record<GoogleAdsAdvisorSupportWindow["key"], GoogleAdsAdvisorWindowMatrixView>;

  const windowRowCounts = Object.fromEntries(
    allViews.map((view) => [
      view.key,
      {
        campaignDailyRows: view.slice.campaignDailyRows.length,
        keywordDailyRows: view.slice.keywordDailyRows.length,
        productDailyRows: view.slice.productDailyRows.length,
        hotQueryRows: view.slice.hotQueryRows.length,
        queryWeeklyRows: view.slice.queryWeeklyRows.length,
        clusterDailyRows: view.slice.clusterDailyRows.length,
      } satisfies GoogleAdsAdvisorWindowMatrixRowCounts,
    ]),
  ) as Record<GoogleAdsAdvisorWindowMatrixKey, GoogleAdsAdvisorWindowMatrixRowCounts>;

  return {
    selectedView,
    supportViews,
    allViews,
    uniqueSlices,
    telemetry: {
      windowCount: allViews.length,
      assignedCampaignRows,
      assignedKeywordRows,
      assignedProductRows,
      windowRowCounts,
    },
  };
}
