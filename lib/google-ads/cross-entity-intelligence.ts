type Row = Record<string, any>;
import type { AppLanguage } from "@/lib/i18n";

export interface CrossEntityInsightEntity {
  entityType: string;
  entityId: string;
  entityName: string;
}

export interface CrossEntityInsight {
  id: string;
  type: string;
  title: string;
  description: string;
  reasoning: string;
  confidence: number;
  impact: "low" | "medium" | "high";
  relatedEntities: CrossEntityInsightEntity[];
  metrics?: Record<string, number | string | null>;
}

export interface CampaignProductInsight extends CrossEntityInsight {
  type: "campaign_product";
}

export interface AssetGroupProductInsight extends CrossEntityInsight {
  type: "asset_group_product";
}

export interface SearchClusterProductInsight extends CrossEntityInsight {
  type: "search_cluster_product";
}

export interface AssetThemeAlignmentInsight extends CrossEntityInsight {
  type: "asset_theme_alignment";
}

export interface SpendConcentrationInsight extends CrossEntityInsight {
  type: "spend_concentration";
}

export interface RevenueDependencyInsight extends CrossEntityInsight {
  type: "revenue_dependency";
}

export interface ProductSupportInsight extends CrossEntityInsight {
  type: "product_support";
}

export interface MessagingMismatchInsight extends CrossEntityInsight {
  type: "messaging_mismatch";
}

export interface ScalePathInsight extends CrossEntityInsight {
  type: "scale_path";
}

export interface WasteConcentrationInsight extends CrossEntityInsight {
  type: "waste_concentration";
}

interface CrossEntityInput {
  campaigns: Row[];
  products: Row[];
  assets: Row[];
  assetGroups: Row[];
  searchTerms: Row[];
}

function num(value: unknown) {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function clamp(value: number) {
  return Number(Math.max(0.25, Math.min(0.95, value)).toFixed(2));
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

function overlapScore(a: string, b: string) {
  const aTokens = new Set(tokenize(a));
  const bTokens = new Set(tokenize(b));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  let hits = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) hits += 1;
  }
  return hits / Math.max(1, Math.min(aTokens.size, bTokens.size));
}

function topShare(rows: Row[], field: string, topN: number) {
  const total = rows.reduce((sum, row) => sum + num(row[field]), 0);
  if (!total) return 0;
  return Number(
    (
      rows
        .slice()
        .sort((a, b) => num(b[field]) - num(a[field]))
        .slice(0, topN)
        .reduce((sum, row) => sum + num(row[field]), 0) / total
    ).toFixed(2)
  );
}

function impactFromConfidence(confidence: number): "low" | "medium" | "high" {
  if (confidence >= 0.78) return "high";
  if (confidence >= 0.58) return "medium";
  return "low";
}

function makeInsight<T extends CrossEntityInsight>(insight: T): T {
  return insight;
}

export function buildCrossEntityIntelligence(input: CrossEntityInput, language: AppLanguage = "en") {
  const insights: CrossEntityInsight[] = [];
  const tr = (english: string, turkish: string) => (language === "tr" ? turkish : english);
  const products = input.products.slice().sort((a, b) => num(b.revenue) - num(a.revenue));
  const campaigns = input.campaigns.slice().sort((a, b) => num(b.spend) - num(a.spend));
  const assetGroups = input.assetGroups.slice().sort((a, b) => num(b.spend) - num(a.spend));
  const searchClusters = new Map<
    string,
    { clusterId: string; label: string; spend: number; revenue: number; conversions: number; rows: Row[] }
  >();

  for (const row of input.searchTerms) {
    const clusterId = String(row.clusterId ?? row.clusterKey ?? row.searchTerm ?? "cluster");
    const current = searchClusters.get(clusterId) ?? {
      clusterId,
      label: clusterId,
      spend: 0,
      revenue: 0,
      conversions: 0,
      rows: [],
    };
    current.spend += num(row.spend);
    current.revenue += num(row.revenue);
    current.conversions += num(row.conversions);
    current.rows.push(row);
    searchClusters.set(clusterId, current);
  }

  for (const campaign of campaigns.slice(0, 8)) {
    const candidateProducts = products
      .map((product) => {
        const overlap = overlapScore(String(campaign.campaignName ?? campaign.name ?? ""), String(product.productTitle ?? product.title ?? ""));
        const inferredSharedCampaign =
          Array.isArray(product.campaignIds) &&
          product.campaignIds.includes(String(campaign.campaignId ?? campaign.id));
        const score = inferredSharedCampaign ? 1 : overlap;
        return { product, score };
      })
      .filter((entry) => entry.score > 0.2)
      .sort((a, b) => b.score - a.score || num(b.product.revenue) - num(a.product.revenue))
      .slice(0, 3);
    if (candidateProducts.length === 0) continue;
    const dependencyScore = clamp(
      candidateProducts.reduce((sum, entry) => sum + (num(entry.product.revenueShare) || 0) / 100, 0) +
        candidateProducts[0].score * 0.3
    );
    insights.push(
      makeInsight<CampaignProductInsight>({
        id: `campaign-product-${campaign.campaignId ?? campaign.id}`,
        type: "campaign_product",
        title: tr(`${campaign.campaignName ?? campaign.name} is likely dependent on a small product set`, `${campaign.campaignName ?? campaign.name} az sayıda ürüne fazla bağımlı görünüyor`),
        description: tr("Best-effort campaign-to-product mapping suggests a concentrated product dependency.", "Tahmini campaign-product eşleşmesi, bu kampanyanın yükü az sayıda ürünün taşındığını gösteriyor."),
        reasoning:
          language === "tr"
            ? `En güçlü ürün eslesmeleri ${candidateProducts
                .map((entry) => entry.product.productTitle ?? entry.product.title)
                .join(", ")} tarafinda toplanıyor. Bu okuma isim ortusmesi ve mevcut ürün yoğunlugu sinyaline dayaniyor; kesin campaign-level ürün atamasi değil.`
            : `Top inferred product drivers are ${candidateProducts
                .map((entry) => entry.product.productTitle ?? entry.product.title)
                .join(", ")}. This is inferred from naming overlap and available product concentration, not exact campaign-level product attribution.`,
        confidence: clamp(0.42 + candidateProducts[0].score * 0.4),
        impact: impactFromConfidence(dependencyScore),
        relatedEntities: [
          {
            entityType: "campaign",
            entityId: String(campaign.campaignId ?? campaign.id),
            entityName: String(campaign.campaignName ?? campaign.name ?? "Campaign"),
          },
          ...candidateProducts.map((entry) => ({
            entityType: "product",
            entityId: String(entry.product.productItemId ?? entry.product.productId ?? entry.product.itemId),
            entityName: String(entry.product.productTitle ?? entry.product.title ?? "Product"),
          })),
        ],
        metrics: {
          campaignSpend: num(campaign.spend),
          dependencyScore,
        },
      })
    );
  }

  for (const assetGroup of assetGroups.slice(0, 8)) {
    const dominantProducts = products
      .map((product) => {
        const overlap =
          overlapScore(String(assetGroup.assetGroupName ?? assetGroup.name ?? ""), String(product.productTitle ?? product.title ?? "")) +
          (String(assetGroup.campaignId ?? "") !== "" &&
          Array.isArray(product.campaignIds) &&
          product.campaignIds.includes(String(assetGroup.campaignId))
            ? 0.5
            : 0);
        return { product, score: overlap };
      })
      .filter((entry) => entry.score > 0.2)
      .sort((a, b) => b.score - a.score || num(b.product.revenue) - num(a.product.revenue))
      .slice(0, 3);

    if (dominantProducts.length > 0) {
      insights.push(
        makeInsight<AssetGroupProductInsight>({
          id: `asset-group-product-${assetGroup.assetGroupId ?? assetGroup.id}`,
          type: "asset_group_product",
        title: tr(`${assetGroup.assetGroupName ?? assetGroup.name} is likely supported by a narrow product set`, `${assetGroup.assetGroupName ?? assetGroup.name} dar bir ürün grubuna bağımlı görünüyor`),
        description: tr("Asset-group naming and product patterns suggest a small set of dominant products.", "Asset group isimlendirmesi ve ürün pattern'leri, yukun az sayıda üründe toplandigini gösteriyor."),
          reasoning:
            language === "tr"
              ? `Tahmini eslesmede baskin ürünler ${dominantProducts
                  .map((entry) => entry.product.productTitle ?? entry.product.title)
                  .join(", ")} olarak görünüyor.`
              : `Dominant inferred product matches are ${dominantProducts
                  .map((entry) => entry.product.productTitle ?? entry.product.title)
                  .join(", ")}.`,
          confidence: clamp(0.45 + dominantProducts[0].score * 0.35),
          impact: impactFromConfidence(num(assetGroup.revenueShare) / 100 + 0.4),
          relatedEntities: [
            {
              entityType: "assetGroup",
              entityId: String(assetGroup.assetGroupId ?? assetGroup.id),
              entityName: String(assetGroup.assetGroupName ?? assetGroup.name ?? "Asset group"),
            },
            ...dominantProducts.map((entry) => ({
              entityType: "product",
              entityId: String(entry.product.productItemId ?? entry.product.productId ?? entry.product.itemId),
              entityName: String(entry.product.productTitle ?? entry.product.title ?? "Product"),
            })),
          ],
          metrics: {
            assetGroupSpend: num(assetGroup.spend),
            assetGroupDependencyScore: clamp(dominantProducts[0].score),
          },
        })
      );
    }

    if (num(assetGroup.spend) > 50 && dominantProducts.length === 0) {
      insights.push(
        makeInsight<AssetGroupProductInsight>({
          id: `asset-group-product-gap-${assetGroup.assetGroupId ?? assetGroup.id}`,
          type: "asset_group_product",
          title: tr(`${assetGroup.assetGroupName ?? assetGroup.name} has weak visible product support`, `${assetGroup.assetGroupName ?? assetGroup.name} tarafında net bir ürün desteği görünmüyor`),
          description: tr("The asset group is consuming budget without a clear product driver emerging from best-effort matching.", "Bu asset group harcama yapıyor ama tahmini eşleşmede arkayı taşıyan net bir ürün sinyali çıkmıyor."),
          reasoning: tr("Shared campaign, name overlap, and product title patterns did not reveal strong product support.", "Campaign ortakligi, isim ortusmesi ve product title pattern'leri güçlü bir ürün desteği göstermiyor."),
          confidence: 0.46,
          impact: "medium",
          relatedEntities: [
            {
              entityType: "assetGroup",
              entityId: String(assetGroup.assetGroupId ?? assetGroup.id),
              entityName: String(assetGroup.assetGroupName ?? assetGroup.name ?? "Asset group"),
            },
          ],
          metrics: {
            spend: num(assetGroup.spend),
            roas: num(assetGroup.roas),
          },
        })
      );
    }
  }

  for (const cluster of Array.from(searchClusters.values()).slice(0, 8)) {
    const matches = products
      .map((product) => ({
        product,
        score: overlapScore(cluster.label, String(product.productTitle ?? product.title ?? "")),
      }))
      .filter((entry) => entry.score > 0.2)
      .sort((a, b) => b.score - a.score || num(b.product.revenue) - num(a.product.revenue))
      .slice(0, 3);
    if (matches.length === 0) continue;
    insights.push(
      makeInsight<SearchClusterProductInsight>({
        id: `cluster-product-${cluster.clusterId}`,
        type: "search_cluster_product",
        title: tr(`${cluster.label} likely maps to specific products`, `${cluster.label} belirli ürünlerle eslesiyor olabilir`),
        description: tr("Search demand appears concentrated around a small set of products.", "Search talebi az sayıda ürün etrafında yoğunlaşıyor görünüyor."),
        reasoning:
          language === "tr"
            ? `Best-effort product hizalamasi, bu cluster'in ağırlıkla ${matches
                .map((entry) => entry.product.productTitle ?? entry.product.title)
                .join(", ")} tarafindan tasindigini gösteriyor.`
            : `Best-effort product alignment suggests ${matches
                .map((entry) => entry.product.productTitle ?? entry.product.title)
                .join(", ")} support this cluster.`,
        confidence: clamp(0.44 + matches[0].score * 0.4),
        impact: impactFromConfidence(cluster.revenue > cluster.spend * 2 ? 0.8 : 0.55),
        relatedEntities: matches.map((entry) => ({
          entityType: "product",
          entityId: String(entry.product.productItemId ?? entry.product.productId ?? entry.product.itemId),
          entityName: String(entry.product.productTitle ?? entry.product.title ?? "Product"),
        })),
        metrics: {
          clusterRevenue: Number(cluster.revenue.toFixed(2)),
          clusterSpend: Number(cluster.spend.toFixed(2)),
          clusterToProductConfidence: clamp(matches[0].score),
        },
      })
    );
  }

  for (const assetGroup of assetGroups) {
    const themes = Array.isArray(assetGroup.searchThemesConfigured)
      ? assetGroup.searchThemesConfigured
      : Array.isArray(assetGroup.searchThemes)
      ? assetGroup.searchThemes.map((theme: Row) => String(theme.text ?? ""))
      : [];
    if (themes.length === 0) continue;
    const groupAssets = input.assets.filter(
      (asset) => String(asset.assetGroupId ?? "") === String(assetGroup.assetGroupId ?? assetGroup.id)
    );
    const corpus = groupAssets
      .map((asset) => String(asset.assetText ?? asset.preview ?? ""))
      .join(" ")
      .toLowerCase();
    const missingThemes = themes.filter((theme) => overlapScore(theme, corpus) < 0.34);
    if (missingThemes.length === 0) continue;
    insights.push(
      makeInsight<AssetThemeAlignmentInsight>({
        id: `asset-theme-${assetGroup.assetGroupId ?? assetGroup.id}`,
        type: "asset_theme_alignment",
        title: tr(`${assetGroup.assetGroupName ?? assetGroup.name} has weak theme support in assets`, `${assetGroup.assetGroupName ?? assetGroup.name} tarafinda search theme desteği zayıf`),
        description: tr("Configured search themes are not strongly reflected in current asset messaging.", "Tanimli search theme'leri mevcut asset mesajlarina yeterince yansimiyor."),
        reasoning:
          language === "tr"
            ? `${missingThemes.slice(0, 3).join(", ")} gibi theme'ler headline ve description tarafinda yeterince gorunmuyor. Bu okuma mesaj uyumuna dayali; direkt theme performans atfı değil.`
            : `Themes like ${missingThemes.slice(0, 3).join(", ")} have low direct wording support in headlines and descriptions. This is inferred messaging alignment, not theme performance attribution.`,
        confidence: clamp(0.58 + missingThemes.length * 0.05),
        impact: "medium",
        relatedEntities: [
          {
            entityType: "assetGroup",
            entityId: String(assetGroup.assetGroupId ?? assetGroup.id),
            entityName: String(assetGroup.assetGroupName ?? assetGroup.name ?? "Asset group"),
          },
        ],
        metrics: {
          messagingAlignmentScore: num(assetGroup.messagingAlignmentScore),
          missingThemeCoverage: missingThemes.length,
        },
      })
    );
  }

  const top3CampaignSpend = topShare(campaigns, "spend", 3);
  const top3ProductSpend = topShare(products, "spend", 3);
  const top3AssetGroupSpend = topShare(assetGroups, "spend", 3);
  insights.push(
    makeInsight<SpendConcentrationInsight>({
      id: "spend-concentration",
      type: "spend_concentration",
      title: tr("Spend concentration risk is elevated", "Spend yoğunlasma riski yükseliyor"),
      description: tr("A small set of entities is carrying a large share of spend.", "Az sayıda alan toplam spend'in büyük kismini tasiyor."),
      reasoning:
        language === "tr"
          ? `Ilk 3 campaign toplam spend'in %${(top3CampaignSpend * 100).toFixed(0)}'ini, ilk 3 product %${(top3ProductSpend * 100).toFixed(0)}'ini ve ilk 3 asset group %${(top3AssetGroupSpend * 100).toFixed(0)}'ini tasiyor.`
          : `Top 3 campaigns hold ${(top3CampaignSpend * 100).toFixed(0)}% of spend, top 3 products hold ${(top3ProductSpend * 100).toFixed(0)}%, and top 3 asset groups hold ${(top3AssetGroupSpend * 100).toFixed(0)}%.`,
      confidence: 0.88,
      impact: top3CampaignSpend >= 0.6 || top3ProductSpend >= 0.6 ? "high" : "medium",
      relatedEntities: [],
      metrics: {
        campaignConcentrationRisk: top3CampaignSpend,
        productConcentrationRisk: top3ProductSpend,
        assetGroupConcentrationRisk: top3AssetGroupSpend,
      },
    })
  );

  const top2ProductRevenue = topShare(products, "revenue", 2);
  const top2CampaignRevenue = topShare(campaigns, "revenue", 2);
  insights.push(
    makeInsight<RevenueDependencyInsight>({
      id: "revenue-dependency",
      type: "revenue_dependency",
      title: tr("Revenue dependency is concentrated", "Gelir bağımlıligi belirli alanlarda toplanıyor"),
      description: tr("A small number of entities appear to carry a large share of revenue.", "Gelirin büyük kismi az sayıda alan tarafinda tasiniyor görünüyor."),
      reasoning:
        language === "tr"
          ? `Ilk 2 product gelirin %${(top2ProductRevenue * 100).toFixed(0)}'ini, ilk 2 campaign ise %${(top2CampaignRevenue * 100).toFixed(0)}'ini üretiyor.`
          : `Top 2 products drive ${(top2ProductRevenue * 100).toFixed(0)}% of revenue and top 2 campaigns drive ${(top2CampaignRevenue * 100).toFixed(0)}%.`,
      confidence: 0.9,
      impact: top2ProductRevenue >= 0.55 || top2CampaignRevenue >= 0.55 ? "high" : "medium",
      relatedEntities: [],
      metrics: {
        productDependencyRisk: top2ProductRevenue,
        campaignDependencyRisk: top2CampaignRevenue,
      },
    })
  );

  for (const product of products.slice(0, 8)) {
    const supportingCampaigns = campaigns
      .map((campaign) => ({
        campaign,
        score: overlapScore(String(product.productTitle ?? product.title ?? ""), String(campaign.campaignName ?? campaign.name ?? "")),
      }))
      .filter((entry) => entry.score > 0.2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);
    const supportingAssetGroups = assetGroups
      .map((assetGroup) => ({
        assetGroup,
        score: overlapScore(String(product.productTitle ?? product.title ?? ""), String(assetGroup.assetGroupName ?? assetGroup.name ?? "")),
      }))
      .filter((entry) => entry.score > 0.2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);
    if (supportingCampaigns.length === 0 && supportingAssetGroups.length === 0) continue;
    insights.push(
      makeInsight<ProductSupportInsight>({
        id: `product-support-${product.productItemId ?? product.productId ?? product.itemId}`,
        type: "product_support",
        title: tr(`${product.productTitle ?? product.title} appears to be supported by a narrow setup`, `${product.productTitle ?? product.title} dar bir kurguya bağlı görünüyor`),
        description: tr("Best-effort campaign and asset-group alignment suggests this product relies on a specific delivery path.", "Tahmini campaign ve asset group hizalamasi, bu ürünun belirli bir yayin hattina fazla yaslandigini gösteriyor."),
        reasoning:
          language === "tr"
            ? `Bu ürünu en cok destekleyen campaign'ler ${supportingCampaigns
                .map((entry) => entry.campaign.campaignName ?? entry.campaign.name)
                .join(", ") || "net değil"}; asset group tarafinda ise ${supportingAssetGroups
                .map((entry) => entry.assetGroup.assetGroupName ?? entry.assetGroup.name)
                .join(", ") || "net bir destek gorunmuyor"}.`
            : `Most likely supporting campaigns are ${supportingCampaigns
                .map((entry) => entry.campaign.campaignName ?? entry.campaign.name)
                .join(", ") || "unclear"}, with asset-group support from ${supportingAssetGroups
                .map((entry) => entry.assetGroup.assetGroupName ?? entry.assetGroup.name)
                .join(", ") || "unclear"}.`,
        confidence: clamp(
          0.4 + Math.max(supportingCampaigns[0]?.score ?? 0, supportingAssetGroups[0]?.score ?? 0) * 0.4
        ),
        impact: impactFromConfidence(num(product.roas) > 3 ? 0.8 : 0.55),
        relatedEntities: [
          {
            entityType: "product",
            entityId: String(product.productItemId ?? product.productId ?? product.itemId),
            entityName: String(product.productTitle ?? product.title ?? "Product"),
          },
          ...supportingCampaigns.map((entry) => ({
            entityType: "campaign",
            entityId: String(entry.campaign.campaignId ?? entry.campaign.id),
            entityName: String(entry.campaign.campaignName ?? entry.campaign.name ?? "Campaign"),
          })),
          ...supportingAssetGroups.map((entry) => ({
            entityType: "assetGroup",
            entityId: String(entry.assetGroup.assetGroupId ?? entry.assetGroup.id),
            entityName: String(entry.assetGroup.assetGroupName ?? entry.assetGroup.name ?? "Asset group"),
          })),
        ],
        metrics: {
          roas: num(product.roas),
          contributionProxy: num(product.contributionProxy),
        },
      })
    );
  }

  const scaleCampaign = campaigns.find((campaign) => num(campaign.revenueShare) > num(campaign.spendShare) && num(campaign.roas) >= 3);
  const scaleProduct = products.find((product) => num(product.hiddenWinnerState === "hidden_winner" ? 1 : 0) || num(product.roas) >= 3);
  const scaleAssetGroup = assetGroups.find((assetGroup) => String(assetGroup.scaleState ?? "") === "scale" || String(assetGroup.classification ?? "") === "scale_candidate");
  if (scaleCampaign && scaleProduct && scaleAssetGroup) {
    insights.push(
      makeInsight<ScalePathInsight>({
        id: "scale-path-primary",
        type: "scale_path",
        title: tr("A multi-entity scale path is visible", "Ölçekleme için hizalanan net bir yol görünüyor"),
        description: tr("Campaign, product, and asset-group signals are pointing in the same direction.", "Campaign, product ve asset group sinyalleri ayni yone bakiyor."),
        reasoning:
          language === "tr"
            ? `${scaleCampaign.campaignName ?? scaleCampaign.name} verimli çalışıyor, ${scaleProduct.productTitle ?? scaleProduct.title} güçlü bir ürün adayı gibi duruyor ve ${scaleAssetGroup.assetGroupName ?? scaleAssetGroup.name} bu ölçekleme hattını destekliyor.`
            : `${scaleCampaign.campaignName ?? scaleCampaign.name} is efficient, ${scaleProduct.productTitle ?? scaleProduct.title} is a strong product candidate, and ${scaleAssetGroup.assetGroupName ?? scaleAssetGroup.name} is supporting scale.`,
        confidence: 0.82,
        impact: "high",
        relatedEntities: [
          {
            entityType: "campaign",
            entityId: String(scaleCampaign.campaignId ?? scaleCampaign.id),
            entityName: String(scaleCampaign.campaignName ?? scaleCampaign.name ?? "Campaign"),
          },
          {
            entityType: "product",
            entityId: String(scaleProduct.productItemId ?? scaleProduct.productId ?? scaleProduct.itemId),
            entityName: String(scaleProduct.productTitle ?? scaleProduct.title ?? "Product"),
          },
          {
            entityType: "assetGroup",
            entityId: String(scaleAssetGroup.assetGroupId ?? scaleAssetGroup.id),
            entityName: String(scaleAssetGroup.assetGroupName ?? scaleAssetGroup.name ?? "Asset group"),
          },
        ],
        metrics: {
          campaignRoas: num(scaleCampaign.roas),
          productRoas: num(scaleProduct.roas),
          assetGroupRoas: num(scaleAssetGroup.roas),
        },
      })
    );
  }

  const weakCampaign = campaigns.find((campaign) => String(campaign.wasteState ?? "") === "waste");
  const weakAssetGroup = assetGroups.find((assetGroup) => String(assetGroup.weakState ?? "") === "weak");
  const weakProduct = products.find((product) => String(product.underperformingState ?? "") === "underperforming");
  const weakCluster = Array.from(searchClusters.values()).find((cluster) => cluster.spend > 50 && cluster.conversions === 0);
  if (weakCampaign || weakAssetGroup || weakProduct || weakCluster) {
    insights.push(
      makeInsight<WasteConcentrationInsight>({
        id: "waste-concentration-primary",
        type: "waste_concentration",
        title: tr("Waste appears concentrated across connected entities", "Boş harcama bağlı alanlarda toplanıyor gibi görünüyor"),
        description: tr("The same pockets of budget inefficiency are showing up in multiple entity layers.", "Butce verimsizligi birden fazla katmanda ayni bolgelerde tekrar ediyor."),
        reasoning:
          language === "tr"
            ? `Sinyal ${weakCampaign ? weakCampaign.campaignName ?? weakCampaign.name : "gurultulu campaign talebi"}, ${weakAssetGroup ? weakAssetGroup.assetGroupName ?? weakAssetGroup.name : "zayıf asset group desteği"}, ${weakProduct ? weakProduct.productTitle ?? weakProduct.title : "zayıf ürünler"} ve ${weakCluster ? weakCluster.label : "genel search talebi"} etrafında toplanıyor. Bu görünüm tahmini bir yoğunlasma okumasidir; kesin multi-touch attribution değildir.`
            : `Signals point to ${weakCampaign ? weakCampaign.campaignName ?? weakCampaign.name : "noisy campaign demand"}, ${weakAssetGroup ? weakAssetGroup.assetGroupName ?? weakAssetGroup.name : "weak asset-group support"}, ${weakProduct ? weakProduct.productTitle ?? weakProduct.title : "underperforming products"}, and ${weakCluster ? weakCluster.label : "generic search demand"}. This is a best-effort concentration view, not exact multi-touch attribution.`,
        confidence: 0.76,
        impact: "high",
        relatedEntities: [
          ...(weakCampaign
            ? [{
                entityType: "campaign",
                entityId: String(weakCampaign.campaignId ?? weakCampaign.id),
                entityName: String(weakCampaign.campaignName ?? weakCampaign.name ?? "Campaign"),
              }]
            : []),
          ...(weakAssetGroup
            ? [{
                entityType: "assetGroup",
                entityId: String(weakAssetGroup.assetGroupId ?? weakAssetGroup.id),
                entityName: String(weakAssetGroup.assetGroupName ?? weakAssetGroup.name ?? "Asset group"),
              }]
            : []),
          ...(weakProduct
            ? [{
                entityType: "product",
                entityId: String(weakProduct.productItemId ?? weakProduct.productId ?? weakProduct.itemId),
                entityName: String(weakProduct.productTitle ?? weakProduct.title ?? "Product"),
              }]
            : []),
        ],
        metrics: {
          weakSpendConcentration: top3CampaignSpend,
        },
      })
    );
  }

  return {
    rows: insights.sort((a, b) => b.confidence - a.confidence),
    byType: insights.reduce<Record<string, CrossEntityInsight[]>>((acc, insight) => {
      (acc[insight.type] ??= []).push(insight);
      return acc;
    }, {}),
    summary: {
      total: insights.length,
      scalePaths: insights.filter((insight) => insight.type === "scale_path").length,
      wasteConcentrations: insights.filter((insight) => insight.type === "waste_concentration").length,
      messagingMismatches: insights.filter((insight) => insight.type === "asset_theme_alignment").length,
    },
  };
}
