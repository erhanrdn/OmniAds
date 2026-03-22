import type {
  LandingPageAiCommentary,
  LandingPageAiReport,
  LandingPageFunnelStepKey,
  LandingPagePerformanceResponse,
  LandingPagePerformanceRow,
  LandingPagePerformanceSummary,
} from "@/src/types/landing-pages";

export const LANDING_PAGE_EVENT_NAMES = [
  "scroll",
  "view_item",
  "add_to_cart",
  "begin_checkout",
  "add_shipping_info",
  "add_payment_info",
  "purchase",
] as const;

export const LANDING_PAGE_FUNNEL_LABELS: Record<LandingPageFunnelStepKey, string> = {
  sessions: "Sessions",
  scroll: "Scroll",
  view_item: "View item",
  add_to_cart: "Add to cart",
  begin_checkout: "Begin checkout",
  add_shipping_info: "Add shipping info",
  add_payment_info: "Add payment info",
  purchase: "Purchase",
};

const FUNNEL_TRANSITIONS: Array<{
  from: LandingPageFunnelStepKey;
  to: LandingPageFunnelStepKey;
  getFromValue: (row: LandingPagePerformanceRow) => number;
  getToValue: (row: LandingPagePerformanceRow) => number;
}> = [
  { from: "sessions", to: "view_item", getFromValue: (row) => row.sessions, getToValue: (row) => row.viewItem },
  { from: "view_item", to: "add_to_cart", getFromValue: (row) => row.viewItem, getToValue: (row) => row.addToCarts },
  { from: "add_to_cart", to: "begin_checkout", getFromValue: (row) => row.addToCarts, getToValue: (row) => row.checkouts },
  { from: "begin_checkout", to: "add_shipping_info", getFromValue: (row) => row.checkouts, getToValue: (row) => row.addShippingInfo },
  { from: "add_shipping_info", to: "add_payment_info", getFromValue: (row) => row.addShippingInfo, getToValue: (row) => row.addPaymentInfo },
  { from: "add_payment_info", to: "purchase", getFromValue: (row) => row.addPaymentInfo, getToValue: (row) => row.purchases },
];

function safeDivide(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }
  return numerator / denominator;
}

function clampRate(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function normalizeLandingPagePath(path: string | null | undefined): string {
  const raw = typeof path === "string" ? path.trim() : "";
  if (!raw || raw === "(not set)" || raw === "(other)") return "/";
  return raw;
}

export function makeLandingPageTitle(path: string): string {
  if (path === "/") return "Homepage";
  const segments = path.split("/").filter(Boolean);
  const last = segments.at(-1) ?? path;
  return last
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function buildLandingPageRow(input: {
  path: string;
  sessions: number;
  engagementRate: number;
  scrollEvents: number;
  viewItem: number;
  addToCarts: number;
  checkouts: number;
  addShippingInfo: number;
  addPaymentInfo: number;
  purchases: number;
  totalRevenue: number;
}): LandingPagePerformanceRow {
  const path = normalizeLandingPagePath(input.path);
  const sessions = Math.max(0, input.sessions);
  const viewItem = Math.max(0, input.viewItem);
  const addToCarts = Math.max(0, input.addToCarts);
  const checkouts = Math.max(0, input.checkouts);
  const addShippingInfo = Math.max(0, input.addShippingInfo);
  const addPaymentInfo = Math.max(0, input.addPaymentInfo);
  const purchases = Math.max(0, input.purchases);
  const totalRevenue = Math.max(0, input.totalRevenue);
  const scrollRate = clampRate(safeDivide(input.scrollEvents, sessions));
  const transitions = [
    {
      step: "sessions" as const,
      dropRate: 1 - clampRate(safeDivide(viewItem, sessions)),
    },
    {
      step: "view_item" as const,
      dropRate: 1 - clampRate(safeDivide(addToCarts, viewItem)),
    },
    {
      step: "add_to_cart" as const,
      dropRate: 1 - clampRate(safeDivide(checkouts, addToCarts)),
    },
    {
      step: "begin_checkout" as const,
      dropRate: 1 - clampRate(safeDivide(addShippingInfo, checkouts)),
    },
    {
      step: "add_shipping_info" as const,
      dropRate: 1 - clampRate(safeDivide(addPaymentInfo, addShippingInfo)),
    },
    {
      step: "add_payment_info" as const,
      dropRate: 1 - clampRate(safeDivide(purchases, addPaymentInfo)),
    },
  ];
  const largestDrop = transitions.reduce((best, current) => {
    if (current.dropRate > best.dropRate) return current;
    return best;
  }, { step: null as LandingPageFunnelStepKey | null, dropRate: 0 });

  return {
    path,
    title: makeLandingPageTitle(path),
    sessions,
    engagementRate: clampRate(input.engagementRate),
    scrollRate,
    viewItem,
    addToCarts,
    checkouts,
    addShippingInfo,
    addPaymentInfo,
    purchases,
    totalRevenue,
    averagePurchaseRevenue: safeDivide(totalRevenue, purchases),
    sessionToViewItemRate: clampRate(safeDivide(viewItem, sessions)),
    viewItemToCartRate: clampRate(safeDivide(addToCarts, viewItem)),
    cartToCheckoutRate: clampRate(safeDivide(checkouts, addToCarts)),
    checkoutToShippingRate: clampRate(safeDivide(addShippingInfo, checkouts)),
    shippingToPaymentRate: clampRate(safeDivide(addPaymentInfo, addShippingInfo)),
    paymentToPurchaseRate: clampRate(safeDivide(purchases, addPaymentInfo)),
    sessionToPurchaseRate: clampRate(safeDivide(purchases, sessions)),
    largestDropOffStep: largestDrop.step,
    largestDropOffRate: clampRate(largestDrop.dropRate),
    dataCompleteness:
      addShippingInfo > 0 || addPaymentInfo > 0 || purchases > 0 || totalRevenue > 0
        ? "complete"
        : "partial",
  };
}

export function summarizeLandingPageRows(
  rows: LandingPagePerformanceRow[],
): LandingPagePerformanceSummary {
  const totals = rows.reduce(
    (acc, row) => {
      acc.totalSessions += row.sessions;
      acc.weightedEngagement += row.engagementRate * row.sessions;
      acc.weightedScroll += row.scrollRate * row.sessions;
      acc.totalViewItem += row.viewItem;
      acc.totalAddToCarts += row.addToCarts;
      acc.totalCheckouts += row.checkouts;
      acc.totalAddShippingInfo += row.addShippingInfo;
      acc.totalAddPaymentInfo += row.addPaymentInfo;
      acc.totalPurchases += row.purchases;
      acc.totalRevenue += row.totalRevenue;
      return acc;
    },
    {
      totalSessions: 0,
      weightedEngagement: 0,
      weightedScroll: 0,
      totalViewItem: 0,
      totalAddToCarts: 0,
      totalCheckouts: 0,
      totalAddShippingInfo: 0,
      totalAddPaymentInfo: 0,
      totalPurchases: 0,
      totalRevenue: 0,
    }
  );

  const topLandingPage = [...rows].sort((a, b) => b.totalRevenue - a.totalRevenue)[0] ?? null;
  const weakestLandingPage = [...rows]
    .filter((row) => row.sessions >= 20)
    .sort((a, b) => a.sessionToPurchaseRate - b.sessionToPurchaseRate)[0] ?? null;

  return {
    totalLandingPages: rows.length,
    totalSessions: totals.totalSessions,
    avgEngagementRate: clampRate(safeDivide(totals.weightedEngagement, totals.totalSessions)),
    avgScrollRate: clampRate(safeDivide(totals.weightedScroll, totals.totalSessions)),
    totalViewItem: totals.totalViewItem,
    totalAddToCarts: totals.totalAddToCarts,
    totalCheckouts: totals.totalCheckouts,
    totalAddShippingInfo: totals.totalAddShippingInfo,
    totalAddPaymentInfo: totals.totalAddPaymentInfo,
    totalPurchases: totals.totalPurchases,
    totalRevenue: totals.totalRevenue,
    averagePurchaseRevenue: safeDivide(totals.totalRevenue, totals.totalPurchases),
    sessionToPurchaseRate: clampRate(safeDivide(totals.totalPurchases, totals.totalSessions)),
    topLandingPagePath: topLandingPage?.path ?? null,
    weakestLandingPagePath: weakestLandingPage?.path ?? null,
  };
}

export function buildLandingPageAiReport(row: LandingPagePerformanceRow): LandingPageAiReport {
  const rankedTransitions = FUNNEL_TRANSITIONS.map((transition) => {
    const fromValue = transition.getFromValue(row);
    const toValue = transition.getToValue(row);
    const conversionRate = clampRate(safeDivide(toValue, fromValue));
    return {
      from: transition.from,
      to: transition.to,
      conversionRate,
      dropRate: clampRate(1 - conversionRate),
    };
  });

  const biggestLeak = rankedTransitions
    .filter((item) => item.dropRate > 0)
    .sort((a, b) => b.dropRate - a.dropRate)[0] ?? null;
  const strongestStep = rankedTransitions
    .filter((item) => item.conversionRate > 0)
    .sort((a, b) => b.conversionRate - a.conversionRate)[0] ?? null;

  const strengths: string[] = [];
  const concerns: string[] = [];

  if (row.engagementRate >= 0.6) strengths.push("Engagement is healthy for a landing page with meaningful traffic.");
  if (row.scrollRate >= 0.45) strengths.push("Visitors are scrolling, which suggests the page is holding attention below the fold.");
  if (row.paymentToPurchaseRate >= 0.6) strengths.push("Payment completion is strong once users reach the final step.");

  if (row.engagementRate < 0.35) concerns.push("Traffic is arriving but not engaging with the page content.");
  if (row.sessionToViewItemRate < 0.2) concerns.push("Visitors are not progressing from landing to product exploration.");
  if (row.viewItem > 0 && row.viewItemToCartRate < 0.08) concerns.push("Product interest is not converting into add-to-cart intent.");
  if (row.addPaymentInfo > 0 && row.paymentToPurchaseRate < 0.35) concerns.push("Users are stalling late in checkout after entering payment details.");

  return {
    path: row.path,
    title: row.title,
    sessions: row.sessions,
    purchases: row.purchases,
    totalRevenue: row.totalRevenue,
    engagementRate: row.engagementRate,
    scrollRate: row.scrollRate,
    conversionRate: row.sessionToPurchaseRate,
    biggestLeak,
    strongestStep,
    strengths: strengths.slice(0, 3),
    concerns: concerns.slice(0, 3),
  };
}

export function buildLandingPageAiFallback(report: LandingPageAiReport): LandingPageAiCommentary {
  const biggestLeakLabel = report.biggestLeak
    ? `${LANDING_PAGE_FUNNEL_LABELS[report.biggestLeak.from]} -> ${LANDING_PAGE_FUNNEL_LABELS[report.biggestLeak.to]}`
    : "No major leak detected";
  const summary =
    report.biggestLeak
      ? `${report.title} loses the most users between ${biggestLeakLabel}.`
      : `${report.title} has a relatively even funnel with no single catastrophic drop-off step.`;

  const insights = [
    report.strengths[0] ?? "Traffic quality and downstream conversion need closer validation.",
    report.concerns[0] ?? "No single concern dominates, but optimization headroom remains in the funnel.",
    report.strongestStep
      ? `Strongest progression is ${LANDING_PAGE_FUNNEL_LABELS[report.strongestStep.from]} -> ${LANDING_PAGE_FUNNEL_LABELS[report.strongestStep.to]}.`
      : "No downstream step has enough volume to call out as a clear strength.",
  ];

  const recommendations = [
    report.biggestLeak
      ? `Prioritize fixes around ${LANDING_PAGE_FUNNEL_LABELS[report.biggestLeak.from]} -> ${LANDING_PAGE_FUNNEL_LABELS[report.biggestLeak.to]} before scaling more traffic.`
      : "Test higher-intent variants of the hero and first CTA to improve initial progression.",
    report.conversionRate >= 0.02
      ? "Protect what is already converting by testing copy and layout changes incrementally."
      : "Audit message match between ads, headline, offer framing, and first CTA.",
    "Review analytics tagging on shipping and payment steps so late-funnel decisions are based on complete data.",
  ];

  const risks = [
    report.concerns[1] ?? "Low-conviction changes may hide the real leak if step tracking is incomplete.",
    report.biggestLeak && report.biggestLeak.from === "sessions"
      ? "Scaling traffic before improving product discovery can magnify wasted sessions."
      : "Late-funnel friction can suppress revenue even when top-of-funnel traffic looks healthy.",
    "If event instrumentation is partial, some funnel losses may reflect missing tracking instead of user behavior.",
  ];

  return { summary, insights, recommendations, risks };
}

export function buildDemoLandingPagePerformanceResponse(): LandingPagePerformanceResponse {
  const rows = [
    buildLandingPageRow({
      path: "/products/explorer-backpack",
      sessions: 8200,
      engagementRate: 0.64,
      scrollEvents: 4510,
      viewItem: 3820,
      addToCarts: 842,
      checkouts: 401,
      addShippingInfo: 290,
      addPaymentInfo: 241,
      purchases: 198,
      totalRevenue: 25548,
    }),
    buildLandingPageRow({
      path: "/collections/backpacks",
      sessions: 7210,
      engagementRate: 0.55,
      scrollEvents: 3440,
      viewItem: 2142,
      addToCarts: 405,
      checkouts: 174,
      addShippingInfo: 121,
      addPaymentInfo: 94,
      purchases: 79,
      totalRevenue: 9638,
    }),
    buildLandingPageRow({
      path: "/products/travel-duffel",
      sessions: 6120,
      engagementRate: 0.58,
      scrollEvents: 3090,
      viewItem: 2664,
      addToCarts: 590,
      checkouts: 296,
      addShippingInfo: 224,
      addPaymentInfo: 184,
      purchases: 143,
      totalRevenue: 17160,
    }),
    buildLandingPageRow({
      path: "/blog/best-travel-backpacks",
      sessions: 4510,
      engagementRate: 0.65,
      scrollEvents: 2980,
      viewItem: 618,
      addToCarts: 74,
      checkouts: 22,
      addShippingInfo: 14,
      addPaymentInfo: 9,
      purchases: 6,
      totalRevenue: 582,
    }),
    buildLandingPageRow({
      path: "/products/daypack-lite",
      sessions: 4750,
      engagementRate: 0.49,
      scrollEvents: 1890,
      viewItem: 1764,
      addToCarts: 252,
      checkouts: 88,
      addShippingInfo: 46,
      addPaymentInfo: 27,
      purchases: 14,
      totalRevenue: 1148,
    }),
  ];

  return {
    rows,
    summary: summarizeLandingPageRows(rows),
    meta: {
      empty: rows.length === 0,
      hasEcommerceData: true,
      unavailableMetrics: [],
      propertyName: "Demo GA4 Property",
    },
  };
}
