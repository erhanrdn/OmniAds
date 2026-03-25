import type {
  LandingPageArchetype,
  LandingPageCauseTag,
  LandingPageFunnelStepKey,
  LandingPagePerformanceRow,
  LandingPageRuleAction,
  LandingPageRuleReport,
  LandingPageRuleScoreBreakdown,
} from "@/src/types/landing-pages";
import type { AppLanguage } from "@/lib/i18n";

function clamp(value: number, min = 0, max = 100): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function clampUnit(value: number): number {
  return clamp(value, 0, 1);
}

function safeDivide(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return numerator / denominator;
}

function scoreFromBand(value: number, weak: number, strong: number): number {
  const normalized = safeDivide(value - weak, strong - weak);
  return clamp(normalized * 100);
}

function detectArchetype(path: string): LandingPageArchetype {
  const normalized = path.toLowerCase();
  if (normalized === "/") return "homepage";
  if (normalized.startsWith("/products/")) return "product";
  if (
    normalized.startsWith("/collections/") ||
    normalized.startsWith("/category/") ||
    normalized.startsWith("/categories/") ||
    normalized.startsWith("/search")
  ) {
    return "listing";
  }
  if (
    normalized.startsWith("/blogs/") ||
    normalized.startsWith("/blog/") ||
    normalized.startsWith("/articles/")
  ) {
    return "content";
  }
  if (
    normalized.startsWith("/pages/") ||
    normalized.includes("campaign") ||
    normalized.includes("landing") ||
    normalized.includes("offer")
  ) {
    return "campaign";
  }
  return "other";
}

function buildScoreBreakdown(row: LandingPagePerformanceRow, archetype: LandingPageArchetype): LandingPageRuleScoreBreakdown {
  const trafficQuality = clamp(
    scoreFromBand(row.engagementRate, 0.3, 0.75) * 0.7 +
      scoreFromBand(row.scrollRate, 0.1, 0.45) * 0.3
  );
  const discovery = clamp(scoreFromBand(row.sessionToViewItemRate, 0.08, 0.45));
  const intent = clamp(scoreFromBand(row.viewItemToCartRate, 0.04, 0.18));
  const checkout = clamp(
    scoreFromBand(row.cartToCheckoutRate, 0.12, 0.45) * 0.55 +
      scoreFromBand(row.checkoutToShippingRate, 0.2, 0.65) * 0.45
  );
  const revenueEfficiency = clamp(
    scoreFromBand(row.sessionToPurchaseRate, 0.002, 0.03) * 0.7 +
      scoreFromBand(row.averagePurchaseRevenue, 25, 180) * 0.3
  );

  if (archetype === "homepage") {
    return {
      trafficQuality,
      discovery,
      intent: clamp(intent * 0.85),
      checkout,
      revenueEfficiency,
    };
  }

  if (archetype === "product") {
    return {
      trafficQuality: clamp(trafficQuality * 0.9),
      discovery: clamp(discovery * 0.9),
      intent: clamp(intent * 1.08),
      checkout,
      revenueEfficiency,
    };
  }

  if (archetype === "listing") {
    return {
      trafficQuality,
      discovery: clamp(discovery * 1.08),
      intent,
      checkout: clamp(checkout * 0.92),
      revenueEfficiency,
    };
  }

  if (archetype === "content") {
    return {
      trafficQuality: clamp(trafficQuality * 1.06),
      discovery,
      intent: clamp(intent * 0.8),
      checkout: clamp(checkout * 0.85),
      revenueEfficiency: clamp(revenueEfficiency * 0.9),
    };
  }

  return { trafficQuality, discovery, intent, checkout, revenueEfficiency };
}

function overallScore(scores: LandingPageRuleScoreBreakdown, archetype: LandingPageArchetype): number {
  const weightsByArchetype: Record<LandingPageArchetype, LandingPageRuleScoreBreakdown> = {
    homepage: {
      trafficQuality: 28,
      discovery: 28,
      intent: 14,
      checkout: 12,
      revenueEfficiency: 18,
    },
    listing: {
      trafficQuality: 18,
      discovery: 32,
      intent: 20,
      checkout: 12,
      revenueEfficiency: 18,
    },
    product: {
      trafficQuality: 14,
      discovery: 16,
      intent: 30,
      checkout: 20,
      revenueEfficiency: 20,
    },
    campaign: {
      trafficQuality: 24,
      discovery: 24,
      intent: 18,
      checkout: 14,
      revenueEfficiency: 20,
    },
    content: {
      trafficQuality: 34,
      discovery: 24,
      intent: 12,
      checkout: 10,
      revenueEfficiency: 20,
    },
    other: {
      trafficQuality: 22,
      discovery: 24,
      intent: 18,
      checkout: 16,
      revenueEfficiency: 20,
    },
  };

  const weights = weightsByArchetype[archetype];
  return Math.round(
    safeDivide(
      scores.trafficQuality * weights.trafficQuality +
        scores.discovery * weights.discovery +
        scores.intent * weights.intent +
        scores.checkout * weights.checkout +
        scores.revenueEfficiency * weights.revenueEfficiency,
      100
    )
  );
}

function buildConfidence(row: LandingPagePerformanceRow): number {
  const sessionsConfidence = clampUnit(safeDivide(row.sessions, 2500));
  const purchasesConfidence = clampUnit(safeDivide(row.purchases, 35));
  const checkoutConfidence = clampUnit(safeDivide(row.checkouts, 60));
  const completenessPenalty = row.dataCompleteness === "partial" ? 0.12 : 0;
  return clampUnit(
    sessionsConfidence * 0.45 + purchasesConfidence * 0.35 + checkoutConfidence * 0.2 - completenessPenalty
  );
}

function isTopOfFunnelArchetype(archetype: LandingPageArchetype): boolean {
  return archetype === "homepage" || archetype === "listing" || archetype === "content" || archetype === "campaign";
}

function hasOnlyDownstreamLeak(
  archetype: LandingPageArchetype,
  causeTags: LandingPageCauseTag[],
): boolean {
  if (!isTopOfFunnelArchetype(archetype)) return false;
  const hasOnPageIssue =
    causeTags.includes("tracking_gap") ||
    causeTags.includes("weak_above_fold") ||
    causeTags.includes("poor_product_discovery");
  const hasDownstreamIssue =
    causeTags.includes("weak_product_story") ||
    causeTags.includes("low_checkout_intent") ||
    causeTags.includes("late_checkout_friction");
  return !hasOnPageIssue && hasDownstreamIssue;
}

function primaryLeakStep(
  row: LandingPagePerformanceRow,
  archetype: LandingPageArchetype,
  causeTags: LandingPageCauseTag[],
): LandingPageFunnelStepKey | null {
  if (hasOnlyDownstreamLeak(archetype, causeTags)) return null;
  if (isTopOfFunnelArchetype(archetype) && row.largestDropOffStep) {
    if (
      row.largestDropOffStep === "add_to_cart" ||
      row.largestDropOffStep === "begin_checkout" ||
      row.largestDropOffStep === "add_shipping_info"
    ) {
      return null;
    }
  }
  return row.largestDropOffStep;
}

function toCauseTags(row: LandingPagePerformanceRow, archetype: LandingPageArchetype): LandingPageCauseTag[] {
  const tags: LandingPageCauseTag[] = [];

  if (row.engagementRate < 0.35 || row.scrollRate < 0.12) tags.push("weak_above_fold");
  if (row.sessionToViewItemRate < 0.16) tags.push("poor_product_discovery");
  if (archetype === "product" || archetype === "other") {
    if (row.viewItem > 0 && row.viewItemToCartRate < 0.08) tags.push("weak_product_story");
    if (row.addToCarts > 0 && row.cartToCheckoutRate < 0.2) tags.push("low_checkout_intent");
    if (row.checkouts > 0 && row.checkoutToShippingRate < 0.45) {
      tags.push("late_checkout_friction");
    }
  } else if (row.viewItem > 0 && row.viewItemToCartRate < 0.08) {
    tags.push("weak_product_story");
  }
  if (row.totalRevenue > 0 && row.purchases === 0) tags.push("tracking_gap");
  if (row.engagementRate >= 0.6) tags.push("healthy_engagement");
  if (row.viewItem > 0 && row.viewItemToCartRate >= 0.14) tags.push("healthy_purchase_intent");
  if (row.checkouts > 0 && row.checkoutToShippingRate >= 0.7) tags.push("strong_late_checkout");

  if (archetype === "content" && !tags.includes("poor_product_discovery") && row.sessionToViewItemRate < 0.22) {
    tags.push("poor_product_discovery");
  }

  return tags.slice(0, 4);
}

function toAction(
  row: LandingPagePerformanceRow,
  score: number,
  archetype: LandingPageArchetype,
  causeTags: LandingPageCauseTag[],
): LandingPageRuleAction {
  if (causeTags.includes("tracking_gap")) return "tracking_audit";
  if (score >= 78 && row.purchases >= 8 && row.sessionToPurchaseRate >= 0.01) return "scale";
  if (hasOnlyDownstreamLeak(archetype, causeTags)) return "watch";
  if (causeTags.includes("weak_above_fold") || causeTags.includes("poor_product_discovery")) {
    return row.sessionToViewItemRate < 0.16 ? "fix_product_discovery" : "fix_above_fold";
  }
  if ((archetype === "product" || archetype === "other") && causeTags.includes("weak_product_story")) {
    return "fix_product_story";
  }
  if ((archetype === "product" || archetype === "other") && causeTags.includes("low_checkout_intent")) {
    return "fix_checkout_intent";
  }
  if ((archetype === "product" || archetype === "other") && causeTags.includes("late_checkout_friction")) {
    return "fix_late_checkout";
  }
  return "watch";
}

function actionLabel(action: LandingPageRuleAction, language: AppLanguage = "en"): string {
  const labels: Record<AppLanguage, Record<LandingPageRuleAction, string>> = {
    en: {
      scale: "Scale",
      watch: "Watch",
      fix_above_fold: "Fix Above Fold",
      fix_product_discovery: "Fix Product Discovery",
      fix_product_story: "Fix Product Story",
      fix_checkout_intent: "Fix Checkout Intent",
      fix_late_checkout: "Fix Late Checkout",
      tracking_audit: "Audit Tracking",
    },
    tr: {
      scale: "Buyut",
      watch: "Izle",
      fix_above_fold: "Above Fold'u Duzelt",
      fix_product_discovery: "Ürün Kesfini Duzelt",
      fix_product_story: "Ürün Hikayesini Duzelt",
      fix_checkout_intent: "Checkout Niyetini Duzelt",
      fix_late_checkout: "Gec Checkout'u Duzelt",
      tracking_audit: "Tracking Denetimi",
    },
  };
  return labels[language][action];
}

function archetypeLabel(archetype: LandingPageArchetype, language: AppLanguage = "en"): string {
  const labels: Record<AppLanguage, Record<LandingPageArchetype, string>> = {
    en: {
      homepage: "Homepage",
      listing: "Listing",
      product: "Product",
      campaign: "Campaign",
      content: "Content",
      other: "Other",
    },
    tr: {
      homepage: "Anasayfa",
      listing: "Listeleme",
      product: "Ürün",
      campaign: "Kampanya",
      content: "İçerik",
      other: "Diger",
    },
  };
  return labels[language][archetype];
}

function primaryLeakLabel(step: LandingPageFunnelStepKey | null, language: AppLanguage = "en"): string {
  if (!step) return language === "tr" ? "huni" : "funnel";
  if (step === "sessions") return language === "tr" ? "oturumlar -> ürün görüntüleme" : "sessions -> view item";
  if (step === "view_item") return language === "tr" ? "ürün görüntüleme -> sepete ekleme" : "view item -> add to cart";
  if (step === "add_to_cart") return language === "tr" ? "sepete ekleme -> checkout baslangici" : "add to cart -> begin checkout";
  if (step === "begin_checkout") return language === "tr" ? "checkout baslangici -> kargo bilgisi" : "begin checkout -> add shipping info";
  if (step === "add_shipping_info") return language === "tr" ? "kargo bilgisi -> satın alma" : "add shipping info -> purchase";
  if (step === "add_payment_info") return "add payment info -> purchase";
  return step.replaceAll("_", " ");
}

function issueList(row: LandingPagePerformanceRow, archetype: LandingPageArchetype, causeTags: LandingPageCauseTag[], language: AppLanguage = "en"): string[] {
  const issues: string[] = [];
  if (causeTags.includes("tracking_gap")) {
    issues.push(language === "tr"
      ? "Gelir ve satın alma sinyalleri uyumsuz görünüyor; bu nedenle daha derin CRO kararlarından önce bu sayfanın analytics denetimine ihtiyacı var."
      : "Revenue and purchase signals look misaligned, so this page needs an analytics audit before deeper CRO decisions.");
  }
  if (causeTags.includes("weak_above_fold")) {
    issues.push(language === "tr"
      ? "Kullanicilar sayfaya geliyor ancak ilk etkilesim zayıf; bu da hero, ilk CTA veya mesaj uyumunda çalışma gerektigini gösteriyor."
      : "Users are landing, but early engagement is weak, which suggests the hero, first CTA, or message match needs work.");
  }
  if (causeTags.includes("poor_product_discovery")) {
    issues.push(
      archetype === "content"
        ? language === "tr"
          ? "Ziyaretçiler icerigi tuketiyor ancak ürün kesfine yeterince hızlı gecemiyor."
          : "Visitors are consuming content but not bridging into product exploration fast enough."
        : language === "tr"
          ? "Cok az oturum açılış asamasindan ürün kesfine ilerliyor."
          : "Too few sessions progress from landing to product exploration."
    );
  }
  if (causeTags.includes("weak_product_story")) {
    issues.push(
      isTopOfFunnelArchetype(archetype)
        ? language === "tr"
          ? "Ziyaretçiler ürün detay sayfalarina ulasiyor ancak ana yavaslama bu sayfa trafiği asagi akış tarafina devrettikten sonra ortaya cikiyor."
          : "Visitors are reaching product detail pages, but the main slowdown appears after this page hands traffic off downstream."
        : language === "tr"
          ? "Ürün ilgisi var ancak sayfa bu ilgiyi sepete ekleme niyetine ceviremiyor."
          : "Product interest is present, but the page is not converting that attention into add-to-cart intent."
    );
  }
  if (causeTags.includes("low_checkout_intent")) {
    issues.push(
      isTopOfFunnelArchetype(archetype)
        ? language === "tr"
          ? "Kullanicilar bu sayfadan ayrıldiktan sonra asagi akış cart ve checkout ivmesi daha zayıf görünüyor; ana sorun PDP veya cart UX'te olabilir."
          : "Downstream cart and checkout momentum looks weaker after users leave this page, so the main issue may live in PDP or cart UX."
        : language === "tr"
          ? "Cart oluşuyor ancak kullanıcılar checkout'a geçmeden önce ivme keskin şekilde düşüyor."
          : "Cart creation is happening, but momentum drops sharply before users commit to checkout."
    );
  }
  if (causeTags.includes("late_checkout_friction")) {
    issues.push(
      isTopOfFunnelArchetype(archetype)
        ? language === "tr"
          ? "Gec huni sürtünmesi bu sayfanın handoff'undan sonra ortaya cikiyor; bu durum sorunun açılış sayfasından cok checkout tarafinda olduğunu gösteriyor."
          : "Late-funnel friction appears after this page's handoff, which points more to checkout execution than this landing page itself."
        : language === "tr"
          ? "Kullanicilar satın alma niyetini gösterdikten sonra gec huni sürtünmesi dönüşumleri baskiliyor."
          : "Late-funnel friction is suppressing conversions after users have already shown buying intent."
    );
  }
  return issues.slice(0, 3);
}

function strengthList(row: LandingPagePerformanceRow, causeTags: LandingPageCauseTag[], language: AppLanguage = "en"): string[] {
  const strengths: string[] = [];
  if (causeTags.includes("healthy_engagement")) {
    strengths.push(language === "tr"
      ? "Etkilesim yeterince güçlü; ana darbo-gaz trafik kalitesi veya mesaj uyumu değil."
      : "Engagement is strong enough that traffic quality or message match is not the main bottleneck.");
  }
  if (causeTags.includes("healthy_purchase_intent")) {
    strengths.push(language === "tr"
      ? "Ziyaretçiler ürüne ulastiginda sepete ekleme niyeti sağlıklı."
      : "Once visitors reach a product, add-to-cart intent is healthy.");
  }
  if (causeTags.includes("strong_late_checkout")) {
    strengths.push(language === "tr"
      ? "Müşteriler yapili checkout adimlarina basladiginda ilerleme sağlıklı kaliyor."
      : "Checkout progression stays healthy once shoppers begin the structured checkout steps.");
  }
  if (row.sessionToPurchaseRate >= 0.015) {
    strengths.push(language === "tr"
      ? "Session-to-purchase verimliligi mevcut kazananlari korumayi destekleyecek kadar güçlü."
      : "Session-to-purchase efficiency is strong enough to justify protecting current winners.");
  }
  return strengths.slice(0, 3);
}

function recommendationList(action: LandingPageRuleAction, archetype: LandingPageArchetype, language: AppLanguage = "en"): string[] {
  const recommendations: Record<LandingPageRuleAction, string[]> = {
    scale: [
      language === "tr" ? "Mevcut kazanan yapıyı koruyun ve agresif yeniden tasarım yerine trafiği kademeli büyütün." : "Protect the current winning structure and scale traffic gradually instead of redesigning aggressively.",
      language === "tr" ? "Mevcut kontrol etrafında başlık, merchandising veya teklif değişikliklerini kademeli test edin." : "Test incremental headline, merchandising, or offer changes around the existing control.",
      language === "tr" ? "Bu sayfayı ayni arketipteki diger sayfalar için benchmark olarak kullanin." : "Use this page as a benchmark for other pages in the same archetype.",
    ],
    watch: [
      isTopOfFunnelArchetype(archetype)
        ? language === "tr"
          ? "Aşağı akış checkout davranışını bu sayfaya yüklemeden önce bu sayfayı giriş ve keşif yüzeyi olarak değerlendirin."
          : "Treat this page primarily as an entry and discovery surface before blaming downstream checkout behavior on it."
        : language === "tr"
          ? "Daha geniş layout değişikliklerinden önce bu sayfayı izleyin."
          : "Monitor this page before making broader layout changes.",
      isTopOfFunnelArchetype(archetype)
        ? language === "tr"
          ? "Bu sayfanın trafik gonderdigi hedef ürün sayfalarini ve cart akisini inceleyin."
          : "Inspect the destination product pages and cart flow that this page hands traffic into."
        : language === "tr"
          ? "Mevcut akışı bozmadan netliği artıran hafif testlere öncelik verin."
          : "Prioritize lightweight tests that improve clarity without disrupting the current flow.",
      language === "tr" ? "Bu sayfayı yalnızca ayni arketipteki diger sayfalarla karşılastirin." : "Compare this page only against others in the same archetype.",
    ],
    fix_above_fold: [
      language === "tr" ? "Teklif, kategori veya sonraki adimi hemen netlestirecek şekilde hero alanini yeniden yazin." : "Rewrite the hero to make the offer, category, or next step immediately obvious.",
      language === "tr" ? "Ilk CTA'yi guclendirin ve above fold alandaki dikkat dagiticilari azaltin." : "Tighten the first CTA and reduce distractions above the fold.",
      language === "tr" ? "Reklamlar, arama niyeti ve açılış bölümü arasindaki mesaj uyumunu denetleyin." : "Audit message match between ads, search intent, and the opening section.",
    ],
    fix_product_discovery: [
      archetype === "content"
        ? language === "tr"
          ? "Sayfanin daha erken kisimlarinda daha güçlü ürün kopruleri, inline CTA'lar ve gorunur ürün modulleri ekleyin."
          : "Introduce stronger product bridges, inline CTAs, and visible product modules earlier in the page."
        : language === "tr"
          ? "Ziyaretçilerin ürünlere daha hızlı ulaşması için gezinme, ürün modülleri ve ilk tık yolunu iyileştirin."
          : "Improve navigation, product modules, and first-click paths so visitors reach products faster.",
      language === "tr" ? "Keşif CTA'larından önce gelen çıkmaz içerik bloklarını azaltın." : "Reduce dead-end content blocks ahead of discovery CTAs.",
      language === "tr" ? "İlk ticari adımı mobilde ve sayfanın üst kısımlarında daha belirgin hale getirin." : "Make the first commerce step more obvious on mobile and near the top of the page.",
    ],
    fix_product_story: [
      language === "tr" ? "Birincil CTA yakınında fiyatlama, teklif çerçevesi, güven unsurları ve ürün faydalarını güçlendirin." : "Strengthen pricing, offer framing, trust cues, and product benefits near the primary CTA.",
      language === "tr" ? "Varyant sürtünmesini azaltın ve sepete ekleme yolunu daha doğrudan hale getirin." : "Reduce variant friction and make the add-to-cart path more direct.",
      language === "tr" ? "Daha fazla trafik göndermeden önce daha ikna edici ürün hikayesi test edin." : "Test more persuasive product storytelling before sending more traffic.",
    ],
    fix_checkout_intent: [
      language === "tr" ? "Shipping sürprizleri, güven boşlukları ve dikkat dağıtan cross-sell'ler için cart deneyimini denetleyin." : "Audit the cart experience for shipping surprises, trust gaps, and distracting cross-sells.",
      language === "tr" ? "Checkout CTA'larını daha belirgin yapın ve cart içindeki tereddüdü azaltın." : "Make checkout CTAs more prominent and reduce hesitation in the cart.",
      language === "tr" ? "Promosyonların, shipping'in veya vergilerin fiyat şoku yaratacak şekilde davranıp davranmadığını kontrol edin." : "Check whether promotions, shipping, or taxes are creating sticker shock.",
    ],
    fix_late_checkout: [
      language === "tr" ? "Shipping, validation hataları ve güven mesajları etrafında checkout UX'i inceleyin." : "Review checkout UX around shipping, validation errors, and trust messaging.",
      language === "tr" ? "Son adımları basitleştirin ve yüksek niyetli müşterileri kesen geç aşama sürtünmesini kaldırın." : "Simplify the final steps and remove late-stage friction that interrupts high-intent shoppers.",
      language === "tr" ? "Deneyleri yargılamadan önce checkout ve shipping adımlarındaki tracking'in tam olduğunu doğrulayın." : "Verify that checkout and shipping step tracking is complete before judging experiments.",
    ],
    tracking_audit: [
      language === "tr" ? "Bu sayfanın huni verisine göre aksiyon almadan önce satın alma ve gelir enstrümantasyonunu doğrulayın." : "Validate purchase and revenue instrumentation before acting on this page's funnel data.",
      language === "tr" ? "Checkout, shipping ve purchase event'lerinin tutarlı şekilde tetiklenip tetiklenmediğini kontrol edin." : "Check whether checkout, shipping, and purchase events are firing consistently.",
      language === "tr" ? "Analytics kapsamı güvenilir olana kadar büyük CRO değişikliklerini erteleyin." : "Hold off on major CRO changes until analytics coverage is trustworthy.",
    ],
  };
  return recommendations[action];
}

function riskList(
  row: LandingPagePerformanceRow,
  archetype: LandingPageArchetype,
  confidence: number,
  causeTags: LandingPageCauseTag[],
  language: AppLanguage = "en",
): string[] {
  const risks: string[] = [];
  if (confidence < 0.45) risks.push(language === "tr" ? "Bu sayfanın hacmi sınırlı; bu nedenle karar güveni hâlâ orta-düşük seviyede." : "This page has limited volume, so verdict confidence is still moderate to low.");
  if (causeTags.includes("tracking_gap")) risks.push(language === "tr" ? "Tracking tutarsızlıkları gerçek huni sızıntısını gizliyor olabilir." : "Tracking inconsistencies may be masking the real funnel leak.");
  if (row.largestDropOffStep === "sessions") risks.push(language === "tr" ? "Keşif iyileşmeden trafiği büyütmek boşa giden oturumları artırabilir." : "Scaling more traffic now may amplify wasted sessions before discovery improves.");
  if (row.largestDropOffStep === "view_item") risks.push(language === "tr" ? "Ürün hikayesini düzeltmeden daha fazla ürün trafiği göndermek getiriyi zayıflatabilir." : "Sending more product traffic without fixing product story will likely dilute return.");
  if (row.largestDropOffStep === "add_to_cart") {
    risks.push(
      isTopOfFunnelArchetype(archetype)
        ? language === "tr"
          ? "Aşağı akış ürün sayfaları veya cart akışları zayıfsa bu sayfa gerçekte olduğundan daha kötü görünebilir."
          : "If downstream product pages or cart flows are weak, this page can look worse than it really is."
        : language === "tr"
          ? "Üst huni trafiği sağlıklı görünse bile cart sürtünmesi geliri baskılayabilir."
          : "Cart friction can suppress revenue even when top-of-funnel traffic looks healthy."
    );
  }
  return risks.slice(0, 3);
}

function summaryFor(report: {
  title: string;
  action: LandingPageRuleAction;
  archetype: LandingPageArchetype;
  primaryLeak: LandingPageFunnelStepKey | null;
  causeTags: LandingPageCauseTag[];
  language: AppLanguage;
}): string {
  if (hasOnlyDownstreamLeak(report.archetype, report.causeTags)) {
    return report.language === "tr"
      ? `${report.title}, kullanıcılari ileri tasima anlaminda ana ${archetypeLabel(report.archetype, report.language).toLowerCase()} görevini yerine getiriyor; ancak daha zayıf dönüşum sinyali kullanıcılar bu sayfadan ürün veya cart akislarina gectikten sonra ortaya cikiyor.`
      : `${report.title} is doing its main ${archetypeLabel(report.archetype, report.language).toLowerCase()} job of moving visitors forward, but the weaker conversion signal appears after users leave this page for product or cart flows.`;
  }
  const archetypeText = archetypeLabel(report.archetype, report.language).toLowerCase();
  const leakText = primaryLeakLabel(report.primaryLeak, report.language);
  return report.language === "tr"
    ? `${report.title}, su anda "${actionLabel(report.action, report.language)}" dikkati gerektiren bir ${archetypeText} sayfası gibi davranıyor ve ana sizinti ${leakText} etrafında toplanıyor.`
    : `${report.title} is behaving like a ${archetypeText} page that currently needs "${actionLabel(report.action, report.language)}" attention, with the main leak centered around ${leakText}.`;
}

export function buildLandingPageRuleReport(row: LandingPagePerformanceRow, language: AppLanguage = "en"): LandingPageRuleReport {
  const archetype = detectArchetype(row.path);
  const scoreBreakdown = buildScoreBreakdown(row, archetype);
  const score = overallScore(scoreBreakdown, archetype);
  const confidence = buildConfidence(row);
  const causeTags = toCauseTags(row, archetype);
  const primaryLeak = primaryLeakStep(row, archetype, causeTags);
  const action = toAction(row, score, archetype, causeTags);
  const strengths = strengthList(row, causeTags, language);
  const issues = issueList(row, archetype, causeTags, language);
  const actions = recommendationList(action, archetype, language);
  const risks = riskList(row, archetype, confidence, causeTags, language);

  return {
    path: row.path,
    title: row.title,
    archetype,
    action,
    score,
    confidence,
    primaryLeak,
    causeTags,
    strengths,
    issues,
    actions,
    risks,
    summary: summaryFor({ title: row.title, action, archetype, primaryLeak, causeTags, language }),
    scoreBreakdown,
  };
}

export function formatLandingPageActionLabel(action: LandingPageRuleAction, language: AppLanguage = "en"): string {
  return actionLabel(action, language);
}

export function formatLandingPageArchetypeLabel(archetype: LandingPageArchetype, language: AppLanguage = "en"): string {
  return archetypeLabel(archetype, language);
}
