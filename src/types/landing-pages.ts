export type LandingPageFunnelStepKey =
  | "sessions"
  | "scroll"
  | "view_item"
  | "add_to_cart"
  | "begin_checkout"
  | "add_shipping_info"
  | "add_payment_info"
  | "purchase";

export interface LandingPagePerformanceRow {
  path: string;
  title: string;
  sessions: number;
  engagementRate: number;
  scrollRate: number;
  viewItem: number;
  addToCarts: number;
  checkouts: number;
  addShippingInfo: number;
  addPaymentInfo: number;
  purchases: number;
  totalRevenue: number;
  averagePurchaseRevenue: number;
  sessionToViewItemRate: number;
  viewItemToCartRate: number;
  cartToCheckoutRate: number;
  checkoutToShippingRate: number;
  shippingToPaymentRate: number;
  paymentToPurchaseRate: number;
  sessionToPurchaseRate: number;
  largestDropOffStep: LandingPageFunnelStepKey | null;
  largestDropOffRate: number;
  dataCompleteness: "complete" | "partial";
}

export interface LandingPagePerformanceSummary {
  totalLandingPages: number;
  totalSessions: number;
  avgEngagementRate: number;
  avgScrollRate: number;
  totalViewItem: number;
  totalAddToCarts: number;
  totalCheckouts: number;
  totalAddShippingInfo: number;
  totalAddPaymentInfo: number;
  totalPurchases: number;
  totalRevenue: number;
  averagePurchaseRevenue: number;
  sessionToPurchaseRate: number;
  topLandingPagePath: string | null;
  weakestLandingPagePath: string | null;
}

export interface LandingPagePerformanceMeta {
  empty: boolean;
  hasEcommerceData: boolean;
  unavailableMetrics: Array<{
    metric: string;
    reason: string;
  }>;
  propertyName?: string;
}

export interface LandingPagePerformanceResponse {
  rows: LandingPagePerformanceRow[];
  summary: LandingPagePerformanceSummary;
  meta: LandingPagePerformanceMeta;
}

export interface LandingPageAiReport {
  path: string;
  title: string;
  sessions: number;
  purchases: number;
  totalRevenue: number;
  engagementRate: number;
  scrollRate: number;
  conversionRate: number;
  biggestLeak: {
    from: LandingPageFunnelStepKey;
    to: LandingPageFunnelStepKey;
    dropRate: number;
  } | null;
  strongestStep: {
    from: LandingPageFunnelStepKey;
    to: LandingPageFunnelStepKey;
    conversionRate: number;
  } | null;
  strengths: string[];
  concerns: string[];
}

export interface LandingPageAiCommentary {
  summary: string;
  insights: string[];
  recommendations: string[];
  risks: string[];
}

export interface LandingPageAiCommentaryResponse {
  source: "ai" | "fallback";
  warning?: string | null;
  commentary: LandingPageAiCommentary;
}
