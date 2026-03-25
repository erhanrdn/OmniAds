import type {
  LandingPageAiCommentary,
  LandingPageAiReport,
  LandingPageFunnelStepKey,
  LandingPagePerformanceResponse,
  LandingPagePerformanceRow,
  LandingPagePerformanceSummary,
  LandingPageRuleReport,
} from "@/src/types/landing-pages";
import type { AppLanguage } from "@/lib/i18n";

export const LANDING_PAGE_EVENT_NAMES = [
  "scroll",
  "view_item",
  "add_to_cart",
  "begin_checkout",
  "add_shipping_info",
  "purchase",
] as const;

export const LANDING_PAGE_FUNNEL_LABELS: Record<AppLanguage, Record<LandingPageFunnelStepKey, string>> = {
  en: {
    sessions: "Sessions",
    scroll: "Scroll",
    view_item: "View item",
    add_to_cart: "Add to cart",
    begin_checkout: "Begin checkout",
    add_shipping_info: "Add shipping info",
    add_payment_info: "Add payment info",
    purchase: "Purchase",
  },
  tr: {
    sessions: "Oturumlar",
    scroll: "Kaydirma",
    view_item: "Urun goruntuleme",
    add_to_cart: "Sepete ekleme",
    begin_checkout: "Checkout baslangici",
    add_shipping_info: "Kargo bilgisi",
    add_payment_info: "Odeme bilgisi",
    purchase: "Satin alma",
  },
};

export function getLandingPageFunnelLabel(step: LandingPageFunnelStepKey, language: AppLanguage = "en") {
  return LANDING_PAGE_FUNNEL_LABELS[language][step];
}

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
  { from: "add_shipping_info", to: "purchase", getFromValue: (row) => row.addShippingInfo, getToValue: (row) => row.purchases },
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
    { step: "add_shipping_info" as const, dropRate: 1 - clampRate(safeDivide(purchases, addShippingInfo)) },
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
  if (row.checkoutToShippingRate >= 0.65) strengths.push("Checkout progression remains healthy once users start the formal checkout flow.");

  if (row.engagementRate < 0.35) concerns.push("Traffic is arriving but not engaging with the page content.");
  if (row.sessionToViewItemRate < 0.2) concerns.push("Visitors are not progressing from landing to product exploration.");
  if (row.viewItem > 0 && row.viewItemToCartRate < 0.08) concerns.push("Product interest is not converting into add-to-cart intent.");
  if (row.checkouts > 0 && row.checkoutToShippingRate < 0.4) concerns.push("Users are stalling inside checkout before they reach shipping details.");

  return {
    url: row.path,
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

export function buildLandingPageAiFallback(
  report: LandingPageAiReport,
  ruleReport?: LandingPageRuleReport | null,
  language: AppLanguage = "en",
  pageSnapshot?: {
    fetched?: boolean;
    title?: string | null;
    metaDescription?: string | null;
    headings?: string[];
    bodyExcerpt?: string | null;
  } | null,
): LandingPageAiCommentary {
  const labels = LANDING_PAGE_FUNNEL_LABELS[language];
  const biggestLeakLabel = report.biggestLeak
    ? `${labels[report.biggestLeak.from]} -> ${labels[report.biggestLeak.to]}`
    : language === "tr"
      ? "Belirgin bir sizinti yok"
      : "No major leak detected";
  const visibleTitle = pageSnapshot?.title?.trim() || report.title;
  const visibleHeading = pageSnapshot?.headings?.find(Boolean)?.trim() || null;
  const visibleMeta = pageSnapshot?.metaDescription?.trim() || null;
  const fetchedContext = pageSnapshot?.fetched === true;
  const handoffSummary =
    ruleReport?.archetype &&
    (ruleReport.archetype === "listing" ||
      ruleReport.archetype === "homepage" ||
      ruleReport.archetype === "content" ||
      ruleReport.archetype === "campaign") &&
    ruleReport.primaryLeak === null;
  const summary =
    handoffSummary
      ? language === "tr"
        ? `${visibleTitle} giris sayfasi gorevini yerine getiriyor ve daha zayif donusum sinyali kullanicilar bu sayfadan ayrilip urun veya cart akislarina gectikten sonra ortaya cikiyor.`
        : `${visibleTitle} is doing its main entry-page job, and the weaker conversion signal appears after visitors leave this page for downstream product or cart flows.`
      : report.biggestLeak
      ? language === "tr"
        ? `${visibleTitle} en fazla kullaniciyi ${biggestLeakLabel} arasinda kaybediyor.`
        : `${visibleTitle} loses the most users between ${biggestLeakLabel}.`
      : language === "tr"
        ? `${visibleTitle} hunisi gorece dengeli ve tek bir yikici dusus noktasi yok.`
        : `${visibleTitle} has a relatively even funnel with no single catastrophic drop-off step.`;

  const insights = [
    fetchedContext
      ? visibleHeading && visibleHeading !== visibleTitle
        ? `The fetched page is framed around "${visibleHeading}", so the visible page promise is clearer than the downstream conversion signal suggests.`
        : language === "tr"
          ? `Alinan sayfa net bir ${ruleReport?.archetype ?? "landing"} baglami sunuyor; bu da etkilesimin neden gorece saglikli kaldigini aciklamaya yardimci oluyor.`
          : `The fetched page presents a clear ${ruleReport?.archetype ?? "landing"} context, which helps explain why engagement stays relatively healthy.`
      : report.strengths[0] ?? (language === "tr" ? "Trafik kalitesi ve asagi huni donusumu daha yakindan dogrulanmali." : "Traffic quality and downstream conversion need closer validation."),
    visibleMeta
      ? language === "tr"
        ? `Gorunen aciklamasi "${visibleMeta.slice(0, 110)}${visibleMeta.length > 110 ? "..." : ""}" uzerine kurulu; bunu gercek CTA yolu ve urun yolculuguyla karsilastirmak gerekir.`
        : `Its visible description leans on "${visibleMeta.slice(0, 110)}${visibleMeta.length > 110 ? "..." : ""}", which is worth checking against the actual CTA path and product journey.`
      : report.concerns[0] ?? (language === "tr" ? "Tek bir baskin sorun yok ancak hunide halen optimizasyon alani bulunuyor." : "No single concern dominates, but optimization headroom remains in the funnel."),
    handoffSummary
      ? language === "tr"
        ? "Buradaki ana soru bu sayfanin kullanicilari dogru urun setine ve sonraki adima yonlendirip yonlendirmedigi; yoksa PDP veya cart gibi davranmasi gerekip gerekmedigi degil."
        : "The main question here is whether this page is sending users into the right product set and next step, not whether it should behave like a PDP or cart."
      : report.strongestStep
        ? language === "tr"
          ? `En net ileri hareket halen ${labels[report.strongestStep.from]} -> ${labels[report.strongestStep.to]} adiminda goruluyor.`
          : `The clearest forward motion still happens at ${labels[report.strongestStep.from]} -> ${labels[report.strongestStep.to]}.`
        : language === "tr"
          ? "Asagi huni adimlarinin hicbiri net bir guc olarak one cikacak kadar hacme sahip degil."
          : "No downstream step has enough volume to call out as a clear strength.",
  ];

  const recommendations = [
    handoffSummary
      ? language === "tr"
        ? "Sayfanin kendisini yeniden tasarlamadan once bu sayfanin ziyaretcileri hangi urun kartlarina, koleksiyon satirlarina veya sonraki tik hedeflerine yonlendirdigini inceleyin."
        : "Review which product tiles, collection rows, or next-click destinations this page pushes visitors into before redesigning the page itself."
      : report.biggestLeak
      ? language === "tr"
        ? `Daha fazla trafik buyutmeden once duzeltmeleri ${biggestLeakLabel} etrafinda onceliklendirin.`
        : `Prioritize fixes around ${biggestLeakLabel} before scaling more traffic.`
      : language === "tr"
        ? "Ilk ilerlemeyi iyilestirmek icin hero ve ilk CTA'nin daha yuksek niyetli varyasyonlarini test edin."
        : "Test higher-intent variants of the hero and first CTA to improve initial progression.",
    fetchedContext
      ? language === "tr"
        ? "Gorunen baslik, kategori cercevesi ve ilk ticari ipucunun bir sonraki tiklamayi kullaniciyi aratmadan acik hale getirip getirmedigini denetleyin."
        : "Audit whether the visible headline, category framing, and first commerce cue make the next click obvious without forcing users to hunt."
      : report.conversionRate >= 0.02
        ? language === "tr"
          ? "Zaten donusen yapiyi copy ve layout degisikliklerini kademeli test ederek koruyun."
          : "Protect what is already converting by testing copy and layout changes incrementally."
        : language === "tr"
          ? "Reklamlar, baslik, teklif cercevesi ve ilk CTA arasindaki mesaj uyumunu denetleyin."
          : "Audit message match between ads, headline, offer framing, and first CTA.",
    handoffSummary
      ? language === "tr"
        ? "Bu sayfanin isaret ettiginden daha zayif merchandising, guven veya checkout ivmesi olup olmadigi icin hedef urun sayfalarini ve cart yolunu kontrol edin."
        : "Check the destination product pages and cart path for weaker merchandising, trust, or checkout momentum than this page suggests."
      : language === "tr"
        ? "Gec huni kararlarinin tam veriye dayanmasi icin checkout ve shipping adimlarindaki analytics etiketlerini inceleyin."
        : "Review analytics tagging on checkout and shipping steps so late-funnel decisions are based on complete data.",
  ];

  const risks = [
    fetchedContext
      ? language === "tr"
        ? "Gorunen sayfa yapisini asiri agresif degistirmek asil sorunun sonraki tik hedefinde olup olmadigini gizleyebilir."
        : "Changing the visible page structure too aggressively can hide whether the real issue lives in the next-click destination."
      : report.concerns[1] ?? (language === "tr" ? "Adim takibi eksikse dusuk guvenli degisiklikler asil sizintiyi gizleyebilir." : "Low-conviction changes may hide the real leak if step tracking is incomplete."),
    report.biggestLeak && report.biggestLeak.from === "sessions"
      ? language === "tr"
        ? "Urun kesfini iyilestirmeden trafigi buyutmek bosa giden oturumlari artirabilir."
        : "Scaling traffic before improving product discovery can magnify wasted sessions."
      : handoffSummary
        ? language === "tr"
          ? "Bu sayfadan PDP'lere gecis dengesizse acilis sayfasi gercekte oldugundan daha zayif gorunebilir."
          : "If the handoff from this page into PDPs is uneven, the landing page can look weaker than it really is."
        : language === "tr"
          ? "Gec huni surtunmesi, ust huni trafigi saglikli gorunse bile geliri baskilayabilir."
          : "Late-funnel friction can suppress revenue even when top-of-funnel traffic looks healthy.",
    language === "tr"
      ? "Event enstrumantasyonu parcaliysa, bazi huni kayiplari yalnizca bu sayfa yerine eksik tracking veya hedef sayfa sorunlarini yansitabilir."
      : "If event instrumentation is partial, some funnel losses may reflect missing tracking or destination-page issues instead of this page alone.",
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
