export type GoogleAdsDateRange =
  | "7"
  | "14"
  | "30"
  | "90"
  | "mtd"
  | "qtd"
  | "custom";

export type GoogleAdsCompareMode =
  | "none"
  | "previous_period"
  | "previous_year"
  | "custom";

function normalizeDateRange(value: string | null): GoogleAdsDateRange {
  switch (value) {
    case "7":
    case "14":
    case "30":
    case "90":
    case "mtd":
    case "qtd":
    case "custom":
      return value;
    default:
      return "30";
  }
}

function normalizeCompareMode(value: string | null): GoogleAdsCompareMode {
  switch (value) {
    case "none":
    case "previous_period":
    case "previous_year":
    case "custom":
      return value;
    default:
      return "previous_period";
  }
}

export function parseGoogleAdsRequestParams(searchParams: URLSearchParams) {
  return {
    businessId: searchParams.get("businessId"),
    accountId: searchParams.get("accountId"),
    dateRange: normalizeDateRange(searchParams.get("dateRange")),
    customStart: searchParams.get("customStart"),
    customEnd: searchParams.get("customEnd"),
    compareMode: normalizeCompareMode(searchParams.get("compareMode")),
    compareStart: searchParams.get("compareStart"),
    compareEnd: searchParams.get("compareEnd"),
    debug: searchParams.get("debug") === "1",
  };
}
