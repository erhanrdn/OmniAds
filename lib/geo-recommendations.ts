/**
 * GEO Intelligence Recommendation Engine — v2
 *
 * Structured templates for all recommendation types.
 * Each template is deterministic: given signals, it produces
 * a consistent title, reason, expected outcome, and effort.
 */

import {
  type RecommendationType,
  type Effort,
  type Priority,
  type Confidence,
  assignEffort,
} from "./geo-scoring";
import type { AppLanguage } from "@/lib/i18n";

// ── Types ────────────────────────────────────────────────────────────

export interface GeoRecommendation {
  type: RecommendationType;
  title: string;
  reason: string;
  expectedOutcome: string;
  effort: Effort;
  priority: Priority;
  confidence: Confidence;
  /** Impact label for UI (e.g. "+15–30% AI traffic") */
  impact: string;
  /** Short label for the target entity (page path or query or topic name) */
  target: string;
  /** Evidence string shown to the user to justify the recommendation */
  evidence: string;
  /** 1-2 sentence "why this matters" for context */
  whyItMatters: string;
}

// ── Template Builders ────────────────────────────────────────────────

export function buildRewriteTitleRec(opts: {
  target: string;
  evidence: string;
  priority: Priority;
  confidence: Confidence;
  position: number;
  language?: AppLanguage;
}): GeoRecommendation {
  const type: RecommendationType = "rewrite_title";
  const language = opts.language ?? "en";
  return {
    type,
    title: language === "tr" ? "AI snippet görünürlüğü için title tag'i yeniden yaz" : "Rewrite title tag for AI snippet inclusion",
    reason: language === "tr"
      ? `Sayfa ${opts.position.toFixed(1)} pozisyonunda ama title yeterince açık olmadigi veya anahtar kelime dolduruldugu için AI motorlari tarafindan alintilanma ihtimali düşük.`
      : `The page ranks at position ${opts.position.toFixed(1)} but is unlikely to be cited by AI engines due to a non-descriptive or keyword-stuffed title.`,
    expectedOutcome: language === "tr"
      ? "Belirli bir soruya cevap veren title'lar AI asistanları tarafından yaklaşık 2-3 kat daha fazla alıntılanır."
      : "Titles that answer a specific question are cited ~2–3× more often by AI assistants.",
    effort: assignEffort(type),
    priority: opts.priority,
    confidence: opts.confidence,
    impact: "+20–40% AI citation rate",
    target: opts.target,
    evidence: opts.evidence,
    whyItMatters:
      language === "tr"
        ? "AI motorları, cevabı title seviyesinde açıkça sinyal veren sayfaları önceliklendirir. Daha direkt ve cevap odaklı bir title, AI cevaplarına çekilme şansını artırır."
        : "AI engines prioritize pages whose title clearly signals the answer. A more direct, question-answering title improves the odds of being pulled into AI responses.",
  };
}

export function buildAddFaqRec(opts: {
  target: string;
  evidence: string;
  priority: Priority;
  confidence: Confidence;
  queryCount: number;
  language?: AppLanguage;
}): GeoRecommendation {
  const type: RecommendationType = "add_faq";
  const language = opts.language ?? "en";
  return {
    type,
    title: language === "tr" ? "En yaygin sorulari cevaplayan bir FAQ bölümü ekle" : "Add FAQ section to answer top questions",
    reason: language === "tr"
      ? `Bu sayfa veya konu ${opts.queryCount} adet bilgilendirici sorgu aliyor; bunlarin her biri AI motorlarinin aktif olarak cevaplamaya çalıştığı sorular.`
      : `This page or topic has ${opts.queryCount} informational queries — each is a question AI engines are actively trying to answer.`,
    expectedOutcome: language === "tr"
      ? "FAQ schema ve satir ici Soru-Cevap formati, long-tail sorgularda AI alintilanma sıklığıni artırır."
      : "FAQ schema + inline Q&A formatting increases AI assistant citation frequency for long-tail queries.",
    effort: assignEffort(type),
    priority: opts.priority,
    confidence: opts.confidence,
    impact: "+15–25% long-tail AI visibility",
    target: opts.target,
    evidence: opts.evidence,
    whyItMatters:
      language === "tr"
        ? "AI cevap motorlari, yanitlarini kurarken yapı landirilmis Soru-Cevap çiftlerini kullanir. Özel bir FAQ bölümü, onlara hazir bir kaynak sunar ve sayfanizin alintilanma olasiligini artırır."
        : "AI answer engines extract structured Q&A pairs to build responses. A dedicated FAQ section gives them a ready-made source, increasing the probability your page is cited.",
  };
}

export function buildExpandGuideRec(opts: {
  target: string;
  evidence: string;
  priority: Priority;
  confidence: Confidence;
  impressions: number;
  language?: AppLanguage;
}): GeoRecommendation {
  const type: RecommendationType = "expand_guide";
  const language = opts.language ?? "en";
  return {
    type,
    title: language === "tr" ? "Icerigi kapsamli bir guide'a genişlet" : "Expand into a comprehensive guide",
    reason: language === "tr"
      ? `Konu ${opts.impressions.toLocaleString()} impression aliyor ama içerik kapsamı zayıf. AI motorlari yuzeysel sayfalar yerine kapsamli guide'lari tercih eder.`
      : `The topic has ${opts.impressions.toLocaleString()} impressions but thin content coverage. Comprehensive guides are preferred by AI engines over shallow pages.`,
    expectedOutcome: language === "tr"
      ? "Derin ve kapsamli guide'lar, ayni konudaki ince sayfalara göre AI tarafinda 3-5 kat daha fazla alıntılanır."
      : "Deep, comprehensive guides are cited by AI 3–5× more often than thin pages on the same topic.",
    effort: assignEffort(type),
    priority: opts.priority,
    confidence: opts.confidence,
    impact: "+30–60% topic authority",
    target: opts.target,
    evidence: opts.evidence,
    whyItMatters:
      language === "tr"
        ? "AI asistanlari karmasik sorulari cevaplarken otoriter ve derin kaynaklari tercih eder. Ince icerigi tam bir guide'a dönüşturmek konu sahipligini guclendirir."
        : "AI assistants prefer authoritative, in-depth sources when answering complex questions. Expanding thin content into a full guide establishes topic ownership.",
  };
}

export function buildBuildClusterRec(opts: {
  target: string;
  evidence: string;
  priority: Priority;
  confidence: Confidence;
  queryCount: number;
  language?: AppLanguage;
}): GeoRecommendation {
  const type: RecommendationType = "build_cluster";
  const language = opts.language ?? "en";
  return {
    type,
    title: language === "tr" ? "Bu konu etrafında bir content cluster kur" : "Build a content cluster around this topic",
    reason: language === "tr"
      ? `${opts.queryCount} iliskili sorgu var ama bunlar daginik veya ince sayfalar tarafindan karşılaniyor. Hub page iceren bir content cluster, AI motorlarina konu otoritesi sinyali verir.`
      : `${opts.queryCount} related queries exist but are served by scattered or thin pages. A content cluster with a hub page signals topic authority to AI engines.`,
    expectedOutcome: language === "tr"
      ? "Content cluster'lar, AI sistemlerinde entity tanimayi iyileştirir ve konu genelinde daha tutarlı alintilanmaya yol acar."
      : "Content clusters improve entity recognition in AI systems, leading to more consistent citation across the topic.",
    effort: assignEffort(type),
    priority: opts.priority,
    confidence: opts.confidence,
    impact: "+40–80% topic-level AI visibility",
    target: opts.target,
    evidence: opts.evidence,
    whyItMatters:
      language === "tr"
        ? "AI motorlari entity knowledge graph'lari kurar. Bir konuda cluster ve ic link yapisi güçlü siteler daha otoriter kabul edilir ve daha genis alıntılanır."
        : "AI engines build entity knowledge graphs. Sites with clustered, interlinked content on a topic are recognized as authoritative sources and cited more broadly.",
  };
}

export function buildAddStructuredDataRec(opts: {
  target: string;
  evidence: string;
  priority: Priority;
  confidence: Confidence;
}): GeoRecommendation {
  const type: RecommendationType = "add_structured_data";
  return {
    type,
    title: "Add structured data (schema.org markup)",
    reason:
      "This page lacks machine-readable structured data, making it harder for AI crawlers to extract facts, prices, or reviews reliably.",
    expectedOutcome: "Schema markup improves AI extraction accuracy and increases rich snippet eligibility.",
    effort: assignEffort(type),
    priority: opts.priority,
    confidence: opts.confidence,
    impact: "+10–20% extraction accuracy",
    target: opts.target,
    evidence: opts.evidence,
    whyItMatters:
      "AI answer engines parse structured data first. Adding Article, Product, FAQ, or HowTo schema gives AI engines a clear, structured signal to cite from.",
  };
}

export function buildImproveMetaRec(opts: {
  target: string;
  evidence: string;
  priority: Priority;
  confidence: Confidence;
}): GeoRecommendation {
  const type: RecommendationType = "improve_meta";
  return {
    type,
    title: "Improve meta description for AI snippet extraction",
    reason:
      "The meta description is either missing, too short, or doesn't summarize the page's answer clearly.",
    expectedOutcome: "Well-crafted meta descriptions are often used verbatim by AI engines as summaries.",
    effort: assignEffort(type),
    priority: opts.priority,
    confidence: opts.confidence,
    impact: "+5–15% AI citation quality",
    target: opts.target,
    evidence: opts.evidence,
    whyItMatters:
      "AI engines frequently pull from meta descriptions when generating summaries. A concise, answer-first description increases the likelihood of accurate citation.",
  };
}

export function buildComparisonTableRec(opts: {
  target: string;
  evidence: string;
  priority: Priority;
  confidence: Confidence;
}): GeoRecommendation {
  const type: RecommendationType = "add_comparison_table";
  return {
    type,
    title: "Add a comparison table",
    reason:
      "Comparison-intent queries are landing on this page but there is no structured comparison content. AI engines prefer tabular comparisons for 'X vs Y' queries.",
    expectedOutcome: "Comparison tables are extracted by AI engines for side-by-side answer generation.",
    effort: assignEffort(type),
    priority: opts.priority,
    confidence: opts.confidence,
    impact: "+25–45% comparison query visibility",
    target: opts.target,
    evidence: opts.evidence,
    whyItMatters:
      "When users ask AI assistants to compare options, the AI looks for structured tables. Adding a comparison table directly on the ranking page makes it the preferred source.",
  };
}

export function buildHubPageRec(opts: {
  target: string;
  evidence: string;
  priority: Priority;
  confidence: Confidence;
  queryCount: number;
}): GeoRecommendation {
  const type: RecommendationType = "build_hub_page";
  return {
    type,
    title: "Create a topic hub page",
    reason: `${opts.queryCount} queries cluster around "${opts.target}" but there is no central hub page linking the content together.`,
    expectedOutcome: "Hub pages act as an authoritative entry point that AI engines reference when the topic is queried broadly.",
    effort: assignEffort(type),
    priority: opts.priority,
    confidence: opts.confidence,
    impact: "+35–65% topic authority",
    target: opts.target,
    evidence: opts.evidence,
    whyItMatters:
      "AI systems build topic hierarchies. A hub page that links to all subtopics becomes the canonical reference point for the topic, boosting citation frequency.",
  };
}

export function buildInternalLinksRec(opts: {
  target: string;
  evidence: string;
  priority: Priority;
  confidence: Confidence;
}): GeoRecommendation {
  const type: RecommendationType = "improve_internal_links";
  return {
    type,
    title: "Improve internal linking to this page",
    reason:
      "This page has strong GEO signals but receives few internal links, limiting how AI crawlers discover and weight it within the site's knowledge graph.",
    expectedOutcome: "Better internal linking increases crawl frequency and topical authority signals for AI indexers.",
    effort: assignEffort(type),
    priority: opts.priority,
    confidence: opts.confidence,
    impact: "+10–20% crawl authority",
    target: opts.target,
    evidence: opts.evidence,
    whyItMatters:
      "AI crawlers use internal link graphs to understand content relationships. Pages with more internal links are perceived as more authoritative within the site.",
  };
}

export function buildAuthorBioRec(opts: {
  target: string;
  evidence: string;
  priority: Priority;
  confidence: Confidence;
}): GeoRecommendation {
  const type: RecommendationType = "add_author_bio";
  return {
    type,
    title: "Add author bio with expertise signals",
    reason:
      "AI engines use E-E-A-T signals (Experience, Expertise, Authoritativeness, Trustworthiness). Pages lacking author credentials are less likely to be cited for authoritative claims.",
    expectedOutcome: "Author bios with credentials improve citation trustworthiness in AI responses.",
    effort: assignEffort(type),
    priority: opts.priority,
    confidence: opts.confidence,
    impact: "+5–15% citation trust",
    target: opts.target,
    evidence: opts.evidence,
    whyItMatters:
      "LLMs are trained to prefer sources with clear authorship for factual claims. Adding expertise signals increases the page's perceived authority.",
  };
}

export function buildRefreshRec(opts: {
  target: string;
  evidence: string;
  priority: Priority;
  confidence: Confidence;
  avgPosition: number;
  language?: AppLanguage;
}): GeoRecommendation {
  const type: RecommendationType = "refresh_outdated";
  const language = opts.language ?? "en";
  return {
    type,
    title: language === "tr" ? "Eskiyen icerigi güncelle ve yenile" : "Refresh and update outdated content",
    reason: language === "tr"
      ? `Bu sayfa ${opts.avgPosition.toFixed(1)} pozisyonunda ama engagement sinyalleri icerigin arama niyetini artik tam karşılamadigini gösteriyor olabilir.`
      : `This page ranks at position ${opts.avgPosition.toFixed(1)} but engagement signals suggest the content may no longer fully satisfy searcher intent.`,
    expectedOutcome: language === "tr"
      ? "Taze ve güncel içerik AI crawler'lari tarafindan yeniden indexlenir ve daha iyi alintilanma oranlari gorur."
      : "Fresh, updated content gets re-indexed by AI crawlers and sees improved citation rates.",
    effort: assignEffort(type),
    priority: opts.priority,
    confidence: opts.confidence,
    impact: "+15–35% freshness signals",
    target: opts.target,
    evidence: opts.evidence,
    whyItMatters:
      language === "tr"
        ? "AI motorlari zaman hassasiyetli sorgularda içerik tazeligine giderek daha fazla ağırlık verir. Istatistikleri, ornekleri ve önerileri güncellemek sayfayı rekabetci tutar."
        : "AI engines increasingly weight content freshness for time-sensitive queries. Refreshing statistics, examples, and recommendations keeps the page competitive.",
  };
}

export function buildDataVisualsRec(opts: {
  target: string;
  evidence: string;
  priority: Priority;
  confidence: Confidence;
}): GeoRecommendation {
  const type: RecommendationType = "add_data_visuals";
  return {
    type,
    title: "Add data, statistics, and visuals",
    reason:
      "AI engines cite data-rich pages more often because they can extract specific facts and numbers to anchor answers.",
    expectedOutcome: "Pages with original data, statistics, and charts are cited 2–4× more by AI assistants.",
    effort: assignEffort(type),
    priority: opts.priority,
    confidence: opts.confidence,
    impact: "+25–50% AI citation depth",
    target: opts.target,
    evidence: opts.evidence,
    whyItMatters:
      "LLMs are trained to attribute specific claims to sources. Including unique data points and statistics makes your page the authoritative source for those facts.",
  };
}

// ── Opportunity Builder ───────────────────────────────────────────────

export type OpportunityType = "content" | "traffic" | "conversion" | "coverage";

export interface GeoOpportunityV2 {
  type: OpportunityType;
  priority: Priority;
  effort: Effort;
  confidence: Confidence;
  impact: string;
  title: string;
  target: string;
  evidence: string;
  recommendation: string;
  whyItMatters: string;
}

/**
 * Build a structured opportunity from a GeoRecommendation.
 * Maps recommendation type → opportunity type.
 */
export function recommendationToOpportunity(
  rec: GeoRecommendation
): GeoOpportunityV2 {
  const TYPE_MAP: Record<RecommendationType, OpportunityType> = {
    rewrite_title: "content",
    add_faq: "content",
    expand_guide: "content",
    build_cluster: "coverage",
    add_structured_data: "content",
    improve_meta: "content",
    add_comparison_table: "content",
    build_hub_page: "coverage",
    improve_internal_links: "traffic",
    add_author_bio: "content",
    refresh_outdated: "content",
    add_data_visuals: "content",
  };

  return {
    type: TYPE_MAP[rec.type] ?? "content",
    priority: rec.priority,
    effort: rec.effort,
    confidence: rec.confidence,
    impact: rec.impact,
    title: rec.title,
    target: rec.target,
    evidence: rec.evidence,
    recommendation: rec.expectedOutcome,
    whyItMatters: rec.whyItMatters,
  };
}
