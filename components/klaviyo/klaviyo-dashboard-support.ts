import type {
  KlaviyoBenchmarkStatus,
  KlaviyoDateRangePreset,
} from "@/lib/klaviyo/types";

export const KLAVIYO_TABS = [
  { id: "overview", label: "Overview" },
  { id: "flows", label: "Flows" },
  { id: "campaigns", label: "Campaigns" },
  { id: "recommendations", label: "Recommendations" },
  { id: "diagnostics", label: "Diagnostics" },
] as const;

export const KLAVIYO_PRESETS: KlaviyoDateRangePreset[] = [
  "7d",
  "14d",
  "30d",
  "90d",
  "custom",
];

export function benchmarkLabel(status: KlaviyoBenchmarkStatus) {
  switch (status) {
    case "above":
      return "Above benchmark";
    case "near":
      return "Near benchmark";
    case "below":
      return "Below benchmark";
    case "significantly_below":
      return "Significantly below";
  }
}

import { formatCurrencySmart, formatPercentFromRatioSmart } from "@/lib/metric-format";

export function percent(value: number) {
  return formatPercentFromRatioSmart(value);
}

export function currency(value: number) {
  return formatCurrencySmart(value, "$", { compactLarge: false });
}
