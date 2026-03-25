import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCurrencySymbol, getCurrencySymbol } from "@/hooks/use-currency";
import type { AppLanguage } from "@/lib/i18n";
import { usePreferencesStore } from "@/store/preferences-store";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  GoogleAssetRow,
  GoogleProductRow,
  GoogleRecommendation,
  GoogleSearchTermRow,
  ShopifyProductPerformance,
} from "@/src/services/google";
import { MetricsRow, PlatformLevel, PlatformTableRow } from "@/src/types";

export type MainTab = "campaigns" | "adGroups" | "ads" | "insights";
export type InsightsTab = "recommendations" | "searchTerms" | "products" | "assets";
export type SortDirection = "asc" | "desc";
export type StatusFilter = "all" | "active" | "paused";
export type MetricColumn = keyof Pick<
  MetricsRow,
  "spend" | "purchases" | "revenue" | "roas" | "cpa" | "ctr" | "cpm"
>;
export type SortColumn = "name" | "status" | MetricColumn;
export type DateRange = "7" | "14" | "30" | "custom";
export type OptimizationScope =
  | "account"
  | "campaign"
  | "assetGroup"
  | "country"
  | "productCategory"
  | "productLevel";
export type RecommendationCategory = "optimization" | "growth";

export interface GrowthRecommendation extends GoogleRecommendation {
  category: RecommendationCategory;
}

export type DrawerPayload =
  | { type: "recommendation"; data: GrowthRecommendation }
  | { type: "searchTerm"; data: GoogleSearchTermRow }
  | { type: "product"; data: GoogleProductRow }
  | { type: "asset"; data: GoogleAssetRow }
  | null;

export const DATE_RANGE = {
  startDate: "2026-02-01",
  endDate: "2026-03-01",
};

export const TAB_TO_LEVEL: Record<Exclude<MainTab, "insights">, PlatformLevel> = {
  campaigns: PlatformLevel.CAMPAIGN,
  adGroups: PlatformLevel.AD_SET,
  ads: PlatformLevel.AD,
};

export const DEFAULT_COLUMNS: MetricColumn[] = [
  "spend",
  "purchases",
  "revenue",
  "roas",
  "cpa",
  "ctr",
  "cpm",
];

function tr(language: AppLanguage, english: string, turkish: string) {
  return language === "tr" ? turkish : english;
}

export function getScopeLabels(language: AppLanguage): Record<OptimizationScope, string> {
  return {
    account: tr(language, "Account", "Hesap"),
    campaign: tr(language, "Campaign", "Kampanya"),
    assetGroup: tr(language, "Asset group", "Asset grubu"),
    country: tr(language, "Country", "Ulke"),
    productCategory: tr(language, "Product category", "Ürün kategorisi"),
    productLevel: tr(language, "Product level", "Ürün seviyesi"),
  };
}

export function getExtraGrowthRecommendations(language: AppLanguage): GoogleRecommendation[] {
  return [
    {
      id: "rec-g-product-scale",
      title: tr(language, "Product scaling opportunity", "Ürün ölçekleme fırsati"),
      description: tr(
        language,
        "Identify high-margin SKUs that can absorb incremental budget safely.",
        "Ek bütçeyi verimli şekilde tasiyabilecek yüksek marjli SKU'lari belirleyin."
      ),
      impact: "High",
      summary: language === "tr"
        ? [
            "Üç SKU güçlü marj yapısı ve istikrarlı conversion hızı gösteriyor.",
            "Bu kazanan SKU'larin mevcut spend payi optimal dağılımin altında kaliyor.",
            "Bu SKU'lari ölçekleme, verimliligi fazla bozmadan karliligi artirabilir.",
          ]
        : [
            "Three SKUs have strong margin and stable conversion velocity.",
            "Current spend share on these winners is below optimal allocation.",
            "Scaling these SKUs can increase profit with limited efficiency risk.",
          ],
      evidence: language === "tr"
        ? [
            { label: "Olcege hazir SKU'lar", value: "3" },
            { label: "Marj benchmark'i", value: "42%" },
            { label: "Tahmini kar artisi", value: "$1,480" },
          ]
        : [
            { label: "Scale-ready SKUs", value: "3" },
            { label: "Margin benchmark", value: "42%" },
            { label: "Projected profit lift", value: "$1,480" },
          ],
    },
    {
      id: "rec-g-geo-expand",
      title: tr(language, "Geo expansion opportunity", "Geo genisleme fırsati"),
      description: tr(
        language,
        "Expand budget into high-ROAS regions with under-served impression share.",
        "Impression share'i yeterince kullanılmayan yüksek ROAS bölgelere bütçe genişletin."
      ),
      impact: "Med",
      summary: language === "tr"
        ? [
            "Iki bolge kısıtli spend ile güçlü conversion value üretiyor.",
            "Search talebi buyurken CPC hesap ortalamasinin altında kaliyor.",
            "Geo genisleme, verimliligi bozmadan ek ölçek yaratabilir.",
          ]
        : [
            "Two regions show strong conversion value with constrained spend.",
            "Search demand is growing while CPC remains below account average.",
            "Geo expansion can improve incremental scale without harming efficiency.",
          ],
      evidence: language === "tr"
        ? [
            { label: "Aday bolgeler", value: "2" },
            { label: "Ort. bolgesel ROAS", value: "4.06" },
            { label: "Tahmini bosluk", value: "$3,200" },
          ]
        : [
            { label: "Candidate regions", value: "2" },
            { label: "Avg regional ROAS", value: "4.06" },
            { label: "Headroom estimate", value: "$3,200" },
          ],
    },
    {
      id: "rec-g-creative-op",
      title: tr(language, "Creative opportunity", "Creative fırsati"),
      description: tr(
        language,
        "Deploy new headline/visual angles in underperforming asset groups.",
        "Düşük performanslı asset group'larda yeni headline ve gorsel acilarini test edin."
      ),
      impact: "Med",
      summary: language === "tr"
        ? [
            "Mevcut creative set, zayıf farklilasmayla ayni jenerik iddialari tekrarliyor.",
            "En iyi conversion getiren search dili, ad mesajlarina yeterince yansimiyor.",
            "Yeni açı testleri CTR'yi ve aşağı akıştaki conversion rate'i artırabilir.",
          ]
        : [
            "Current creative set repeats generic claims with weak differentiation.",
            "Top-converting search language is not reflected in ad messaging.",
            "New angle testing can lift CTR and improve downstream conversion rate.",
          ],
      evidence: language === "tr"
        ? [
            { label: "Düşük performanslı asset'ler", value: "8" },
            { label: "CTR iyileşme potansiyeli", value: "+0.38%" },
            { label: "Beklenen ROAS artisi", value: "+0.22" },
          ]
        : [
            { label: "Low-performing assets", value: "8" },
            { label: "CTR improvement potential", value: "+0.38%" },
            { label: "Expected ROAS lift", value: "+0.22" },
          ],
    },
  ];
}

export function formatMetricCell(column: MetricColumn, row: PlatformTableRow, sym = "$") {
  const value = row.metrics[column];
  if (typeof value !== "number") return "-";
  if (column === "spend" || column === "revenue" || column === "cpa" || column === "cpm") {
    return `${sym}${value.toLocaleString()}`;
  }
  if (column === "roas") return value.toFixed(2);
  if (column === "ctr") return `${value.toFixed(2)}%`;
  return value.toLocaleString();
}

export function RecommendationCard({
  recommendation,
  scopeLabel,
  onOpen,
}: {
  recommendation: GrowthRecommendation;
  scopeLabel: string;
  onOpen: () => void;
}) {
  const language = usePreferencesStore((state) => state.language);
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold">{recommendation.title}</h3>
        <Badge
          variant={
            recommendation.impact === "High"
              ? "destructive"
              : recommendation.impact === "Med"
                ? "secondary"
                : "outline"
          }
        >
          {recommendation.impact}
        </Badge>
      </div>
      <Badge variant="outline" className="mt-2">
        {tr(language, "Scope", "Kapsam")}: {scopeLabel}
      </Badge>
      <p className="mt-2 text-xs text-muted-foreground">{recommendation.description}</p>
      <Button className="mt-4" variant="outline" size="sm" onClick={onOpen}>
        {tr(language, "View details", "Detaylari gor")}
      </Button>
    </div>
  );
}

export function calculateGrowthScore(recommendations: GrowthRecommendation[]) {
  const impactPoints = recommendations.reduce((sum, rec) => {
    if (rec.impact === "High") return sum + 14;
    if (rec.impact === "Med") return sum + 9;
    return sum + 5;
  }, 0);
  const optimizationPenalty = recommendations.filter((rec) => rec.category === "optimization").length;
  const score = Math.max(35, Math.min(96, 100 - optimizationPenalty * 9 + impactPoints / 6));
  const upsideLevel = score >= 75 ? "High" : score >= 55 ? "Medium" : "Low";
  return {
    score: Math.round(score),
    upsideLevel,
    priorityIssues: optimizationPenalty,
  };
}

export function GoogleInsightsDrawer({
  payload,
  dateRange,
  optimizationScope,
  selectedProductSku,
  shopifyProducts,
  onClose,
  onToast,
}: {
  payload: DrawerPayload;
  dateRange: DateRange;
  optimizationScope: OptimizationScope;
  selectedProductSku: string;
  shopifyProducts: ShopifyProductPerformance[];
  onClose: () => void;
  onToast: (message: string) => void;
}) {
  const sym = useCurrencySymbol();
  const language = usePreferencesStore((state) => state.language);
  return (
    <Sheet open={Boolean(payload)} onOpenChange={(open) => (open ? null : onClose())}>
      <SheetContent side="right" className="w-full sm:max-w-2xl">
        {payload && (
          <>
            <SheetHeader>
              <SheetTitle>
                {payload.type === "recommendation"
                  ? payload.data.title
                  : payload.type === "searchTerm"
                    ? tr(language, "Term analysis", "Terim analizi")
                    : payload.type === "product"
                      ? tr(language, "Product efficiency analysis", "Ürün verimlilik analizi")
                      : tr(language, "Asset improvement suggestions", "Asset iyileştirme önerileri")}
              </SheetTitle>
              <SheetDescription>
                {tr(language, `Date range: last ${dateRange} days`, `Tarih aralığı: son ${dateRange} gün`)}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-4 overflow-y-auto px-4 pb-6">
              {payload.type === "recommendation" && (
                <RecommendationDrawerContent
                  recommendation={payload.data}
                  optimizationScope={optimizationScope}
                  selectedProductSku={selectedProductSku}
                  shopifyProducts={shopifyProducts}
                  onToast={onToast}
                />
              )}

              {payload.type === "searchTerm" && (
                <section className="rounded-xl border p-4 text-sm">
                  <h3 className="font-semibold">{payload.data.search_term}</h3>
                  <p className="mt-2 text-muted-foreground">
                    {payload.data.roas < 1.2
                      ? tr(language, "Low return and high CPA suggest this term should be added as negative.", "Düşük getiri ve yüksek CPA, bu term'in negative olarak eklenmesi gerektigini gösteriyor.")
                      : tr(language, "Strong return profile suggests this term should be promoted as exact/phrase.", "Güçlü getiri profili, bu term'in exact/phrase olarak terfi ettirilmesini destekliyor.")}
                  </p>
                  <ul className="mt-3 space-y-1">
                    <li>- {tr(language, "Match type", "Match type")}: {payload.data.match_type}</li>
                    <li>- ROAS: {payload.data.roas.toFixed(2)}</li>
                    <li>- CPA: {sym}{payload.data.cpa.toFixed(2)}</li>
                  </ul>
                </section>
              )}

              {payload.type === "product" && (
                <section className="rounded-xl border p-4 text-sm">
                  <h3 className="font-semibold">{payload.data.title}</h3>
                  <p className="mt-2 text-muted-foreground">
                    {payload.data.roas < 1.5
                      ? tr(language, "This product is likely leaking budget. Consider bid down or temporary exclusion.", "Bu ürün büyük ihtimalle bütçe sızdırıyor. Bid düşürme veya geçici dışlama düşünülebilir.")
                      : tr(language, "This product is efficient. Consider scaling with dedicated asset coverage.", "Bu ürün verimli çalışıyor. Ayrılmış asset coverage ile ölçekleme düşünülebilir.")}
                  </p>
                  <ul className="mt-3 space-y-1">
                    <li>- {tr(language, "Brand", "Marka")}: {payload.data.brand}</li>
                    <li>- ROAS: {payload.data.roas.toFixed(2)}</li>
                    <li>- {tr(language, "Cost", "Maliyet")}: {sym}{payload.data.cost.toLocaleString()}</li>
                    <li>- {tr(language, "Conversion value", "Conversion value")}: {sym}{payload.data.conv_value.toLocaleString()}</li>
                  </ul>
                </section>
              )}

              {payload.type === "asset" && (
                <section className="rounded-xl border p-4 text-sm">
                  <h3 className="font-semibold">{payload.data.asset_name}</h3>
                  <p className="mt-2 text-muted-foreground">
                    {payload.data.performance_label === "Low"
                      ? tr(language, "Refresh this asset with sharper value proposition and clearer visual hierarchy.", "Bu asset'i daha net bir value proposition ve daha güçlü gorsel hiyerarsi ile yenileyin.")
                      : tr(language, "Keep this asset in rotation and test close variants to prevent fatigue.", "Bu asset'i rotasyonda tutun ve yorgunlugu onlemek için yakin varyantlarini test edin.")}
                  </p>
                  <ul className="mt-3 space-y-1">
                    <li>- {tr(language, "Asset group", "Asset grubu")}: {payload.data.asset_group}</li>
                    <li>- {tr(language, "Type", "Tur")}: {payload.data.asset_type}</li>
                    <li>- {tr(language, "Performance", "Performans")}: {payload.data.performance_label}</li>
                    <li>- ROAS: {payload.data.roas.toFixed(2)}</li>
                  </ul>
                </section>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function RecommendationDrawerContent({
  recommendation,
  optimizationScope,
  selectedProductSku,
  shopifyProducts,
  onToast,
}: {
  recommendation: GoogleRecommendation;
  optimizationScope: OptimizationScope;
  selectedProductSku: string;
  shopifyProducts: ShopifyProductPerformance[];
  onToast: (message: string) => void;
}) {
  if (recommendation.id === "rec-1") {
    return <NegativeKeywordDrawer recommendation={recommendation} onToast={onToast} />;
  }
  if (recommendation.id === "rec-3" || recommendation.id === "rec-2") {
    return <SearchThemeDrawer recommendation={recommendation} onToast={onToast} />;
  }
  if (recommendation.id === "rec-5") {
    return (
      <ProductWasteDrawer
        recommendation={recommendation}
        optimizationScope={optimizationScope}
        selectedProductSku={selectedProductSku}
        shopifyProducts={shopifyProducts}
      />
    );
  }
  if (recommendation.id.startsWith("rec-g-")) {
    return <GrowthOpportunityDrawer recommendation={recommendation} />;
  }
  return <AssetImprovementDrawer recommendation={recommendation} />;
}

function NegativeKeywordDrawer({
  recommendation,
  onToast,
}: {
  recommendation: GoogleRecommendation;
  onToast: (message: string) => void;
}) {
  const language = usePreferencesStore((state) => state.language);
  const negativePack = getNegativeKeywordPack(recommendation.title);
  return (
    <>
      <SectionSummary summary={recommendation.summary} />
      <SectionEvidence evidence={recommendation.evidence} />
      <SectionSimulation recommendation={recommendation} />
      <SectionSuggestedActions
        actions={[
          tr(language, "Review candidates by campaign intent", "Adaylari campaign intent'e göre gözden geçirin"),
          tr(language, "Apply list in shared negative keyword set", "Listeyi shared negative keyword set içinde uygulayin"),
          tr(language, "Monitor conversion rate and query mix for 7 days", "7 gün boyunca conversion rate ve query mix'i izleyin"),
        ]}
      />
      <SectionReadyToCopy
        title={tr(language, "Ready to copy", "Kopyalamaya hazır")}
        subtitle={`${tr(language, "Campaign type", "Campaign type")}: ${negativePack.campaignType}`}
        lines={negativePack.keywords}
        onToast={onToast}
      />
      <DrawerDisclaimer />
    </>
  );
}

function SearchThemeDrawer({
  recommendation,
  onToast,
}: {
  recommendation: GoogleRecommendation;
  onToast: (message: string) => void;
}) {
  const language = usePreferencesStore((state) => state.language);
  const themeClusters = [
    tr(language, "Eco detergent alternatives", "Ekolojik deterjan alternatifleri"),
    tr(language, "Sensitive skin laundry", "Hassas cilt için camasir bakimi"),
    tr(language, "Plastic-free cleaning products", "Plastiksiz temizlik ürünleri"),
    tr(language, "Bulk subscription savings", "Toplu abonelik tasarrufu"),
  ];
  return (
    <>
      <SectionSummary summary={recommendation.summary} />
      <SectionEvidence evidence={recommendation.evidence} />
      <section className="rounded-xl border p-4">
        <h3 className="text-sm font-semibold">{tr(language, "Root Cause", "Temel Neden")}</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {tr(language, "Existing PMax search themes are broad and miss high-intent cluster coverage.", "Mevcut PMax search theme'leri fazla geniş ve yüksek intent'li cluster kapsamasini kaciriyor.")}
        </p>
      </section>
      <section className="rounded-xl border p-4">
        <h3 className="text-sm font-semibold">{tr(language, "Theme clusters", "Theme cluster'lari")}</h3>
        <ul className="mt-2 space-y-1 text-sm">
          {themeClusters.map((cluster) => (
            <li key={cluster}>- {cluster}</li>
          ))}
        </ul>
      </section>
      <SectionSimulation recommendation={recommendation} />
      <SectionSuggestedActions
        actions={[
          tr(language, "Create new search themes from top clusters", "En güçlü cluster'lardan yeni search theme'leri üretin"),
          tr(language, "Map one theme per asset group", "Her asset group için bir ana theme esleyin"),
          tr(language, "Align headlines with cluster intent language", "Headline'lari cluster intent diliyle hizalayin"),
        ]}
      />
      <SectionReadyToCopy
        title={tr(language, "Ready to copy", "Kopyalamaya hazır")}
        subtitle={tr(language, "Theme list", "Theme listesi")}
        lines={themeClusters}
        onToast={onToast}
      />
      <DrawerDisclaimer />
    </>
  );
}

function ProductWasteDrawer({
  recommendation,
  optimizationScope,
  selectedProductSku,
  shopifyProducts,
}: {
  recommendation: GoogleRecommendation;
  optimizationScope: OptimizationScope;
  selectedProductSku: string;
  shopifyProducts: ShopifyProductPerformance[];
}) {
  const sym = useCurrencySymbol();
  const language = usePreferencesStore((state) => state.language);
  const selectedProduct =
    shopifyProducts.find((product) => product.sku === selectedProductSku) ?? shopifyProducts[0];
  const scopeRows =
    optimizationScope === "productLevel" && selectedProduct
      ? [selectedProduct]
      : shopifyProducts.filter((row) => row.revenue < row.adSpend * 1.2);
  const metrics = calculateProductWasteMetrics(scopeRows);
  const simulation = generateProductWasteSimulation(metrics);
  return (
    <>
      <SectionSummary summary={recommendation.summary} />
      <section className="rounded-xl border p-4">
        <h3 className="text-sm font-semibold">{tr(language, "Evidence", "Kanitlar")}</h3>
        <table className="mt-2 min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2">SKU</th>
              <th className="py-2">Spend</th>
              <th className="py-2">{tr(language, "Revenue", "Gelir")}</th>
              <th className="py-2">{tr(language, "Margin", "Marj")}</th>
              <th className="py-2">{tr(language, "Profit", "Kar")}</th>
              <th className="py-2">{tr(language, "Profit ROAS", "Profit ROAS")}</th>
            </tr>
          </thead>
          <tbody>
            {scopeRows.map((row) => {
              const margin = row.revenue - row.cogs - row.refunds;
              const profit = margin - row.adSpend;
              const profitRoas = profit / Math.max(row.adSpend, 1);
              return (
                <tr key={row.sku} className="border-b last:border-0">
                  <td className="py-2">{row.sku}</td>
                  <td className="py-2">{sym}{row.adSpend.toLocaleString()}</td>
                  <td className="py-2">{sym}{row.revenue.toLocaleString()}</td>
                  <td className="py-2">{sym}{margin.toLocaleString()}</td>
                  <td className="py-2">{sym}{profit.toLocaleString()}</td>
                  <td className="py-2">{profitRoas.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <section className="rounded-xl border p-4">
        <h3 className="text-sm font-semibold">{tr(language, "Root Cause", "Temel Neden")}</h3>
        <ul className="mt-2 space-y-1 text-sm">
          <li>- {tr(language, "Shopify margin data indicates weak gross margin after COGS and refunds.", "Shopify marj verisi, COGS ve refund sonrasinda brut marjin zayıf kaldigini gösteriyor.")}</li>
          <li>- {tr(language, "Low-margin SKUs absorb paid traffic without sufficient unit economics.", "Düşük marjli SKU'lar, yeterli birim karlılık olusmadan paid traffic tuketiyor.")}</li>
          <li>- {tr(language, "Current bid strategy over-indexes on low-profit query/product mixes.", "Mevcut bid stratejisi, düşük karli query ve product karmalarina fazla ağırlık veriyor.")}</li>
        </ul>
      </section>
      <section className="rounded-xl border p-4">
        <h3 className="text-sm font-semibold">{tr(language, "Simulation", "Simülasyon")}</h3>
        <table className="mt-2 min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2">{tr(language, "Metric", "Metrik")}</th>
              <th className="py-2">{tr(language, "Current", "Mevcut")}</th>
              <th className="py-2">{tr(language, "Simulated", "Simule")}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b">
              <td className="py-2">{tr(language, "Profit", "Kar")}</td>
              <td className="py-2">{sym}{simulation.currentProfit.toLocaleString()}</td>
              <td className="py-2">{sym}{simulation.simulatedProfit.toLocaleString()}</td>
            </tr>
            <tr>
              <td className="py-2">Profit ROAS</td>
              <td className="py-2">{simulation.currentProfitRoas.toFixed(2)}</td>
              <td className="py-2">{simulation.simulatedProfitRoas.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
        <div className="mt-3">
          <Badge variant="default">
            Profit ROAS +{simulation.profitRoasImprovement.toFixed(2)}
          </Badge>
        </div>
      </section>
      <SectionSuggestedActions
        actions={[
          tr(language, "Reduce bids", "Bid'leri azalt"),
          tr(language, "Exclude SKU", "SKU'yu haric tut"),
          tr(language, "Increase bids on high margin products", "Yüksek marjlı ürünlerde bid'leri artır"),
        ]}
      />
      <DrawerDisclaimer />
    </>
  );
}

function AssetImprovementDrawer({ recommendation }: { recommendation: GoogleRecommendation }) {
  const language = usePreferencesStore((state) => state.language);
  const lowAssets = [
    { name: "UGC Demo Cut v2", type: "video", roas: 1.11 },
    { name: "Headline - Best Soap Ever", type: "text", roas: 1.24 },
    { name: "Image - Plain Product Shot", type: "image", roas: 1.38 },
  ];
  return (
    <>
      <SectionSummary summary={recommendation.summary} />
      <section className="rounded-xl border p-4">
        <h3 className="text-sm font-semibold">{tr(language, "Evidence", "Kanitlar")}</h3>
        <table className="mt-2 min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2">{tr(language, "Asset", "Asset")}</th>
              <th className="py-2">{tr(language, "Type", "Tur")}</th>
              <th className="py-2">ROAS</th>
            </tr>
          </thead>
          <tbody>
            {lowAssets.map((asset) => (
              <tr key={asset.name} className="border-b last:border-0">
                <td className="py-2">{asset.name}</td>
                <td className="py-2 capitalize">{asset.type}</td>
                <td className="py-2">{asset.roas.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="rounded-xl border p-4">
        <h3 className="text-sm font-semibold">{tr(language, "Root Cause", "Temel Neden")}</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {tr(language, "Repeated generic messaging and low-contrast imagery reduce engagement in prospecting traffic.", "Tekrarlayan jenerik mesajlar ve düşük kontrastlı görseller, prospecting trafikte engagement'i düşürüyor.")}
        </p>
      </section>
      <SectionSimulation recommendation={recommendation} />
      <section className="rounded-xl border p-4">
        <h3 className="text-sm font-semibold">{tr(language, "Suggested Actions", "Önerilen Aksiyonlar")}</h3>
        <ul className="mt-2 space-y-1 text-sm">
          <li>- {tr(language, 'Test headline variant: "Zero Plastic Laundry in 1 Sheet"', 'Su headline varyantini test edin: "Zero Plastic Laundry in 1 Sheet"')}</li>
          <li>- {tr(language, "Replace static packshots with in-use lifestyle context", "Statik packshot'lari kullanim baglamini gösteren lifestyle gorsellerle değiştirin")}</li>
          <li>- {tr(language, "Add offer-forward description for first 90 characters", "Ilk 90 karakterde teklifi daha net one cikaracak bir açıklama ekleyin")}</li>
        </ul>
      </section>
      <DrawerDisclaimer />
    </>
  );
}

function GrowthOpportunityDrawer({ recommendation }: { recommendation: GoogleRecommendation }) {
  const language = usePreferencesStore((state) => state.language);
  return (
    <>
      <SectionSummary summary={recommendation.summary} />
      <SectionEvidence evidence={recommendation.evidence} />
      <section className="rounded-xl border p-4">
        <h3 className="text-sm font-semibold">{tr(language, "Root Cause", "Temel Neden")}</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {tr(language, "Current allocation under-weights this growth vector relative to conversion quality and incremental demand potential.", "Mevcut dağılım, conversion kalitesi ve ek talep potansiyeline göre bu büyüme eksenine gerektiginden az ağırlık veriyor.")}
        </p>
      </section>
      <SectionSimulation recommendation={recommendation} />
      <SectionSuggestedActions
        actions={[
          tr(language, "Reallocate 10-15% budget toward this opportunity", "Butcenin %10-15'ini bu fırsata kaydırin"),
          tr(language, "Track incremental conversion value by cohort", "Ek conversion value'yu cohort bazında takip edin"),
          tr(language, "Promote winning entities into dedicated campaigns", "Kazanan varlıkları dedicated campaign'lere taşıyın"),
        ]}
      />
      <DrawerDisclaimer />
    </>
  );
}

function SectionSummary({ summary }: { summary: string[] }) {
  const language = usePreferencesStore((state) => state.language);
  return (
    <section className="rounded-xl border p-4">
      <h3 className="text-sm font-semibold">{tr(language, "AI Summary", "AI Ozeti")}</h3>
      <ul className="mt-2 space-y-1 text-sm">
        {summary.map((item) => (
          <li key={item}>- {item}</li>
        ))}
      </ul>
    </section>
  );
}

function SectionEvidence({ evidence }: { evidence: Array<{ label: string; value: string }> }) {
  const language = usePreferencesStore((state) => state.language);
  return (
    <section className="rounded-xl border p-4">
      <h3 className="text-sm font-semibold">{tr(language, "Evidence", "Kanitlar")}</h3>
      <table className="mt-2 min-w-full text-sm">
        <tbody>
          {evidence.map((row) => (
            <tr key={row.label} className="border-b last:border-0">
              <td className="py-2 text-muted-foreground">{row.label}</td>
              <td className="py-2 text-right">{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function SectionSimulation({ recommendation }: { recommendation: GoogleRecommendation }) {
  const sym = useCurrencySymbol();
  const language = usePreferencesStore((state) => state.language);
  const simulation = generateSimulationImpact(recommendation);
  return (
    <section className="rounded-xl border p-4">
      <h3 className="text-sm font-semibold">{tr(language, "Simulation", "Simülasyon")}</h3>
      <table className="mt-2 min-w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2">{tr(language, "Metric", "Metrik")}</th>
            <th className="py-2">{tr(language, "Current", "Mevcut")}</th>
            <th className="py-2">{tr(language, "Simulated", "Simule")}</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b">
            <td className="py-2">Spend</td>
            <td className="py-2">{sym}{simulation.current.spend.toLocaleString()}</td>
            <td className="py-2">{sym}{simulation.simulated.spend.toLocaleString()}</td>
          </tr>
          <tr className="border-b">
            <td className="py-2">{tr(language, "Revenue", "Gelir")}</td>
            <td className="py-2">{sym}{simulation.current.revenue.toLocaleString()}</td>
            <td className="py-2">{sym}{simulation.simulated.revenue.toLocaleString()}</td>
          </tr>
          <tr>
            <td className="py-2">ROAS</td>
            <td className="py-2">{simulation.current.roas.toFixed(2)}</td>
            <td className="py-2">{simulation.simulated.roas.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge variant="default">ROAS +{simulation.impact.roasLift.toFixed(2)}</Badge>
        <Badge variant="secondary">{tr(language, "Efficiency", "Verimlilik")} +{simulation.impact.efficiencyPct.toFixed(1)}%</Badge>
        <Badge variant="outline">{tr(language, "Waste removed", "Temizlenen israf")} ${simulation.impact.wasteRemoved.toLocaleString()}</Badge>
      </div>
      <div className="mt-3 inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs">
        <span className="text-muted-foreground">{tr(language, "Prediction confidence", "Tahmin güveni")}</span>
        <Badge
          variant={
            simulation.confidence === "High"
              ? "default"
              : simulation.confidence === "Medium"
                ? "secondary"
                : "outline"
          }
        >
          {simulation.confidence === "High"
            ? tr(language, "High", "Yüksek")
            : simulation.confidence === "Medium"
              ? tr(language, "Medium", "Orta")
              : tr(language, "Low", "Düşük")}
        </Badge>
      </div>
    </section>
  );
}

function SectionSuggestedActions({ actions }: { actions: string[] }) {
  const language = usePreferencesStore((state) => state.language);
  return (
    <section className="rounded-xl border p-4">
      <h3 className="text-sm font-semibold">{tr(language, "Suggested Actions", "Önerilen Aksiyonlar")}</h3>
      <ul className="mt-2 space-y-1 text-sm">
        {actions.map((action) => (
          <li key={action}>- {action}</li>
        ))}
      </ul>
    </section>
  );
}

function SectionReadyToCopy({
  title,
  subtitle,
  lines,
  onToast,
}: {
  title: string;
  subtitle?: string;
  lines: string[];
  onToast: (message: string) => void;
}) {
  const language = usePreferencesStore((state) => state.language);
  return (
    <section className="rounded-xl border p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
      <pre className="mt-3 overflow-auto rounded-md border bg-muted/20 p-3 text-xs">
{lines.join("\n")}
      </pre>
      <Button
        size="sm"
        className="mt-3"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(lines.join("\n"));
            onToast(tr(language, "List copied", "Liste kopyalandi"));
          } catch {
            onToast(tr(language, "Could not copy list", "Liste kopyalanamadi"));
          }
        }}
      >
        {tr(language, "Copy list", "Listeyi kopyala")}
      </Button>
    </section>
  );
}

function DrawerDisclaimer() {
  const language = usePreferencesStore((state) => state.language);
  return (
    <p className="px-1 text-xs text-muted-foreground">
      {tr(language, "Recommendations are not applied automatically. Review and apply them inside Google Ads.", "Öneriler otomatik uygulanmaz. Gözden gecirip Google Ads içinde manuel olarak uygulayin.")}
    </p>
  );
}

export function reweightRecommendationForScope(
  recommendation: GoogleRecommendation,
  scope: OptimizationScope,
  context: string,
  language: AppLanguage
) {
  const multipliers: Record<OptimizationScope, number> = {
    account: 1,
    campaign: 0.92,
    assetGroup: 0.86,
    country: 0.95,
    productCategory: 0.9,
    productLevel: 0.88,
  };

  const multiplier = multipliers[scope];
  const evidence = recommendation.evidence.map((row) => ({
    ...row,
    value: scaleEvidenceValue(row.value, multiplier),
  }));

  return {
    ...recommendation,
    description: `${recommendation.description} ${tr(language, "Scope", "Kapsam")}: ${context}.`,
    evidence,
  };
}

function scaleEvidenceValue(value: string, multiplier: number) {
  const money = value.match(/^[^\d]*([\d,.]+)$/);
  if (money) {
    const sym = getCurrencySymbol();
    const amount = Number(money[1].replace(/,/g, ""));
    return `${sym}${Math.round(amount * multiplier).toLocaleString()}`;
  }

  const percent = value.match(/^([+-]?[\d.]+)%$/);
  if (percent) {
    return `${(Number(percent[1]) * multiplier).toFixed(1)}%`;
  }

  const numeric = value.match(/^[\d.]+$/);
  if (numeric) {
    const scaled = Number(numeric[0]) * multiplier;
    return Number.isInteger(Number(numeric[0])) ? String(Math.round(scaled)) : scaled.toFixed(2);
  }

  return value;
}

function getNegativeKeywordPack(recommendationTitle: string): {
  campaignType: "Search" | "PMAX" | "Shopping";
  keywords: string[];
} {
  const normalized = recommendationTitle.toLowerCase();

  if (normalized.includes("pmax")) {
    return {
      campaignType: "PMAX",
      keywords: ["free", "cheap", "manual", "download", "template", '"free trial"', '"cheap alternative"', "[brand manual]", "[cheap product]", '"how to use"'],
    };
  }

  if (normalized.includes("product")) {
    return {
      campaignType: "Shopping",
      keywords: ["free", "cheap", "manual", "download", "template", '"free trial"', '"cheap alternative"', "[brand manual]", "[cheap product]", '"used"'],
    };
  }

  return {
    campaignType: "Search",
    keywords: ["free", "cheap", "manual", "download", "template", '"free trial"', '"cheap alternative"', "[brand manual]", "[cheap product]"],
  };
}

function generateSimulationImpact(_: GoogleRecommendation): {
  current: { spend: number; revenue: number; roas: number };
  simulated: { spend: number; revenue: number; roas: number };
  impact: { roasLift: number; efficiencyPct: number; wasteRemoved: number };
  confidence: "Low" | "Medium" | "High";
} {
  const currentSpend = 10000;
  const simulatedSpend = 8760;
  const currentRevenue = 32000;
  const simulatedRevenue = 32000;
  const currentRoas = currentRevenue / currentSpend;
  const simulatedRoas = simulatedRevenue / simulatedSpend;

  return {
    current: {
      spend: currentSpend,
      revenue: currentRevenue,
      roas: Number(currentRoas.toFixed(2)),
    },
    simulated: {
      spend: simulatedSpend,
      revenue: simulatedRevenue,
      roas: Number(simulatedRoas.toFixed(2)),
    },
    impact: {
      roasLift: Number((simulatedRoas - currentRoas).toFixed(2)),
      efficiencyPct: Number((((currentSpend - simulatedSpend) / currentSpend) * 100).toFixed(1)),
      wasteRemoved: currentSpend - simulatedSpend,
    },
    confidence: "Medium",
  };
}

function calculateProductWasteMetrics(rows: ShopifyProductPerformance[]) {
  const spend = rows.reduce((sum, row) => sum + row.adSpend, 0);
  const revenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const margin = rows.reduce((sum, row) => sum + (row.revenue - row.cogs - row.refunds), 0);
  const profit = margin - spend;
  const profitRoas = profit / Math.max(spend, 1);
  return { spend, revenue, margin, profit, profitRoas };
}

function generateProductWasteSimulation(current: {
  spend: number;
  revenue: number;
  margin: number;
  profit: number;
  profitRoas: number;
}) {
  const simulatedSpend = current.spend * 0.86;
  const simulatedRevenue = current.revenue * 0.98;
  const simulatedMargin = current.margin * 0.97;
  const simulatedProfit = simulatedMargin - simulatedSpend;
  const simulatedProfitRoas = simulatedProfit / Math.max(simulatedSpend, 1);

  return {
    currentProfit: Math.round(current.profit),
    simulatedProfit: Math.round(simulatedProfit),
    currentProfitRoas: Number(current.profitRoas.toFixed(2)),
    simulatedProfitRoas: Number(simulatedProfitRoas.toFixed(2)),
    profitRoasImprovement: Number((simulatedProfitRoas - current.profitRoas).toFixed(2)),
  };
}
