export type MetaMetricKey =
  | "spend"
  | "purchaseValue"
  | "roas"
  | "cpa"
  | "cpcLink"
  | "cpm"
  | "ctrAll"
  | "purchases"
  | "thumbstop"
  | "video25"
  | "video50"
  | "clickToPurchase"
  | "atcToPurchaseRatio";

export interface MetaCreativeRow {
  id: string;
  name: string;
  format: "image" | "video";
  thumbnailUrl: string;
  launchDate: string;
  tags: string[];
  spend: number;
  purchaseValue: number;
  roas: number;
  cpa: number;
  cpcLink: number;
  cpm: number;
  ctrAll: number;
  purchases: number;
  thumbstop: number;
  clickToPurchase: number;
  video25: number;
  video50: number;
  atcToPurchaseRatio: number;
}

type GoodDirection = "high" | "low" | "neutral";

export const METRIC_CONFIG: Record<
  MetaMetricKey,
  {
    label: string;
    goodDirection: GoodDirection;
    format: (value: number) => string;
  }
> = {
  spend: {
    label: "Spend",
    goodDirection: "neutral",
    format: (value) => `$${value.toLocaleString()}`,
  },
  purchaseValue: {
    label: "Purchase value",
    goodDirection: "high",
    format: (value) => `$${value.toLocaleString()}`,
  },
  roas: {
    label: "ROAS",
    goodDirection: "high",
    format: (value) => value.toFixed(2),
  },
  cpa: {
    label: "CPA",
    goodDirection: "low",
    format: (value) => `$${value.toFixed(2)}`,
  },
  cpcLink: {
    label: "CPC (link)",
    goodDirection: "low",
    format: (value) => `$${value.toFixed(2)}`,
  },
  cpm: {
    label: "CPM",
    goodDirection: "low",
    format: (value) => `$${value.toFixed(2)}`,
  },
  ctrAll: {
    label: "CTR (all)",
    goodDirection: "high",
    format: (value) => `${value.toFixed(2)}%`,
  },
  purchases: {
    label: "Purchases",
    goodDirection: "high",
    format: (value) => value.toLocaleString(),
  },
  thumbstop: {
    label: "Thumbstop",
    goodDirection: "high",
    format: (value) => `${value.toFixed(2)}%`,
  },
  video25: {
    label: "25% video plays rate",
    goodDirection: "high",
    format: (value) => `${value.toFixed(2)}%`,
  },
  video50: {
    label: "50% video plays rate",
    goodDirection: "high",
    format: (value) => `${value.toFixed(2)}%`,
  },
  clickToPurchase: {
    label: "Click to purchase",
    goodDirection: "high",
    format: (value) => `${value.toFixed(2)}%`,
  },
  atcToPurchaseRatio: {
    label: "ATC to purchase ratio",
    goodDirection: "high",
    format: (value) => `${value.toFixed(2)}%`,
  },
};

export const METRIC_OPTIONS: MetaMetricKey[] = [
  "spend",
  "purchaseValue",
  "roas",
  "cpa",
  "cpcLink",
  "cpm",
  "ctrAll",
  "purchases",
  "thumbstop",
  "video25",
  "video50",
  "clickToPurchase",
  "atcToPurchaseRatio",
];

export const DEFAULT_TABLE_METRICS: MetaMetricKey[] = [
  "spend",
  "purchaseValue",
  "roas",
  "cpa",
  "cpcLink",
  "cpm",
  "ctrAll",
  "purchases",
];
