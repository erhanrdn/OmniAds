import type {
  AiTagKey,
  CopyExtraction,
  CopySourceLabel,
  CreativeDebugInfo,
  CreativeType,
  MetaAdRecord,
  MetaAiTags,
  RawCreativeRow,
  StoryCopyPayload,
} from "@/lib/meta/creatives-types";
import { getLegacyCreativeTypeLabel } from "@/lib/meta/creative-taxonomy";

export function normalizeCopyText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!normalized) return null;
  if (normalized.length < 2) return null;
  return normalized;
}

export function uniqueNormalizedText(values: Array<unknown>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeCopyText(value);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

type CopyLike = {
  copy_text?: unknown;
  copy_variants?: Array<unknown>;
  headline_variants?: Array<unknown>;
  description_variants?: Array<unknown>;
};

export function hasCopyContent(row: CopyLike): boolean {
  return Boolean(
    normalizeCopyText(row.copy_text) ||
      uniqueNormalizedText(row.copy_variants ?? []).length > 0 ||
      uniqueNormalizedText(row.headline_variants ?? []).length > 0 ||
      uniqueNormalizedText(row.description_variants ?? []).length > 0
  );
}

export function hasSuspiciousCopyEmptyRows(rows: CopyLike[]): boolean {
  if (rows.length === 0) return false;
  return rows.every((row) => !hasCopyContent(row));
}

export function chooseBestCopyText(extraction: Pick<CopyExtraction, "copy_variants" | "headline_variants" | "description_variants">) {
  if (extraction.copy_variants.length > 0) return extraction.copy_variants[0];
  if (extraction.headline_variants.length > 0) return extraction.headline_variants[0];
  if (extraction.description_variants.length > 0) return extraction.description_variants[0];
  return null;
}

export function resolveCreativeCopyExtraction(creative: MetaAdRecord["creative"]): CopyExtraction {
  if (!creative) {
    return {
      copy_text: null,
      copy_variants: [],
      headline_variants: [],
      description_variants: [],
      copy_source: null,
    };
  }

  const assetFeedBodies = uniqueNormalizedText((creative.asset_feed_spec?.bodies ?? []).map((item) => item?.text));
  const assetFeedTitles = uniqueNormalizedText((creative.asset_feed_spec?.titles ?? []).map((item) => item?.text));
  const assetFeedDescriptions = uniqueNormalizedText((creative.asset_feed_spec?.descriptions ?? []).map((item) => item?.text));

  const objectMessages = uniqueNormalizedText([
    creative.object_story_spec?.link_data?.message,
    creative.object_story_spec?.video_data?.message,
    creative.object_story_spec?.photo_data?.message,
  ]);
  const objectHeadlines = uniqueNormalizedText([
    creative.object_story_spec?.link_data?.name,
    creative.object_story_spec?.video_data?.title,
  ]);
  const objectDescriptions = uniqueNormalizedText([
    creative.object_story_spec?.link_data?.description,
    creative.object_story_spec?.photo_data?.caption,
  ]);

  const directBodies = uniqueNormalizedText([creative.body, creative.text, creative.message]);
  const directHeadlines = uniqueNormalizedText([creative.title]);
  const directDescriptions = uniqueNormalizedText([creative.description]);

  const copyVariants = uniqueNormalizedText([
    ...assetFeedBodies,
    ...objectMessages,
    ...directBodies,
  ]);
  const headlineVariants = uniqueNormalizedText([
    ...assetFeedTitles,
    ...objectHeadlines,
    ...directHeadlines,
  ]);
  const descriptionVariants = uniqueNormalizedText([
    ...assetFeedDescriptions,
    ...objectDescriptions,
    ...directDescriptions,
  ]);

  const copyText = chooseBestCopyText({
    copy_variants: copyVariants,
    headline_variants: headlineVariants,
    description_variants: descriptionVariants,
  });

  let copySource: CopySourceLabel | null = null;
  if (copyText) {
    if (assetFeedBodies.includes(copyText)) copySource = "asset_feed_spec.bodies";
    else if (objectMessages.includes(copyText)) copySource = "object_story_spec.message";
    else if (directBodies.includes(copyText)) copySource = "creative.body";
    else if (assetFeedTitles.includes(copyText)) copySource = "asset_feed_spec.titles";
    else if (objectHeadlines.includes(copyText)) copySource = "object_story_spec.name";
    else if (directHeadlines.includes(copyText)) copySource = "creative.title";
    else if (assetFeedDescriptions.includes(copyText)) copySource = "asset_feed_spec.descriptions";
    else if (objectDescriptions.includes(copyText)) copySource = "object_story_spec.description";
    else if (directDescriptions.includes(copyText)) copySource = "creative.description";
  }

  return {
    copy_text: copyText,
    copy_variants: copyVariants,
    headline_variants: headlineVariants,
    description_variants: descriptionVariants,
    copy_source: copySource,
  };
}

export const AI_TAG_LABEL_TO_KEY: Record<string, AiTagKey> = {
  "asset type": "assetType",
  "visual format": "visualFormat",
  "intended audience": "intendedAudience",
  "messaging angle": "messagingAngle",
  seasonality: "seasonality",
  "offer type": "offerType",
  "hook tactic": "hookTactic",
  "headline tactic": "headlineTactic",
};

export function normalizeAiTags(rawTags: string[] | undefined): MetaAiTags {
  if (!Array.isArray(rawTags) || rawTags.length === 0) return {};

  const next: MetaAiTags = {};
  for (const rawTag of rawTags) {
    if (typeof rawTag !== "string") continue;
    const trimmed = rawTag.trim();
    if (!trimmed) continue;

    const separator = trimmed.includes(":") ? ":" : trimmed.includes("=") ? "=" : null;
    if (!separator) continue;
    const [rawLabel, rawValue] = trimmed.split(separator, 2);
    const key = AI_TAG_LABEL_TO_KEY[rawLabel.trim().toLowerCase()];
    const value = rawValue?.trim();
    if (!key || !value) continue;
    const canonical = canonicalizeAiTagValue(key, value);
    if (!canonical) continue;
    const existing = next[key] ?? [];
    if (!existing.includes(canonical)) existing.push(canonical);
    next[key] = existing;
  }

  return next;
}

type AiTagResolutionRow = {
  tags?: string[];
  ai_tags?: MetaAiTags;
  name: string;
  copy_text?: string | null;
  copy_variants?: string[];
  headline_variants?: string[];
  description_variants?: string[];
  launch_date?: string;
  is_catalog: boolean;
  preview: RawCreativeRow["preview"];
  format: RawCreativeRow["format"];
  creative_type: RawCreativeRow["creative_type"];
  creative_delivery_type: RawCreativeRow["creative_delivery_type"];
  creative_visual_format: RawCreativeRow["creative_visual_format"];
  creative_primary_type: RawCreativeRow["creative_primary_type"];
  creative_primary_label?: string | null;
  creative_secondary_type?: RawCreativeRow["creative_secondary_type"] | null;
  creative_secondary_label?: string | null;
};

function collectAiTagTextContext(row: AiTagResolutionRow) {
  const copyCandidates = uniqueNormalizedText([
    row.copy_text,
    ...(row.copy_variants ?? []),
    ...(row.description_variants ?? []),
  ]);
  const headlineCandidates = uniqueNormalizedText([
    ...(row.headline_variants ?? []),
    row.name,
  ]);
  const allCandidates = uniqueNormalizedText([...copyCandidates, ...headlineCandidates]);
  const normalizedCandidates = allCandidates.map((value) => value.toLowerCase());
  const leadingChunk = (source: string | null | undefined) => {
    if (!source) return "";
    const firstChunk =
      source
        .split(/\n|[.!]/)
        .map((part) => normalizeCopyText(part))
        .find((part): part is string => Boolean(part)) ?? source;
    return firstChunk.toLowerCase();
  };
  const hookCandidates = uniqueNormalizedText([
    leadingChunk(copyCandidates[0]),
    leadingChunk(headlineCandidates[0]),
  ]).map((value) => value.toLowerCase());
  const visualSignalTexts = uniqueNormalizedText([
    ...allCandidates,
    row.creative_primary_label,
    row.creative_secondary_label,
  ]).map((value) => value.toLowerCase());

  return {
    copyCandidates,
    headlineCandidates,
    allCandidates,
    normalizedCandidates,
    hookCandidates,
    visualSignalTexts,
  };
}

function hasAnyPhrase(texts: string[], phrases: string[]): boolean {
  return texts.some((text) => phrases.some((phrase) => text.includes(phrase)));
}

function matchesAnyPattern(texts: string[], patterns: RegExp[]): boolean {
  return texts.some((text) => patterns.some((pattern) => pattern.test(text)));
}

function normalizeAiTagToken(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function humanizeAiTagValue(value: string): string {
  return value
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => {
      if (part.length <= 3 && /^[a-z0-9]+$/.test(part)) {
        return part.toUpperCase();
      }
      return `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`;
    })
    .join(" ");
}

const AI_TAG_VALUE_ALIASES: Partial<Record<AiTagKey, Record<string, string>>> = {
  assetType: {
    static_image: "Static Image",
    product_image: "Product Image",
    product_image_with_text: "Product Image with Text",
    ugc: "UGC",
  },
  visualFormat: {
    product_focus: "Product Focus",
    lifestyle: "Lifestyle",
    cinematic_b_roll: "Cinematic B-Roll",
    behind_the_scenes: "Behind The Scenes",
    time_lapse: "Time Lapse",
  },
  intendedAudience: {
    first_time_buyer: "First-time Buyer",
    returning_customer: "Returning Customer",
    gift_shopper: "Gift Shopper",
    ecommerce_shopper: "Ecommerce Shopper",
  },
  messagingAngle: {
    problem_solution: "Problem Solution",
    social_proof: "Social Proof",
    story_led: "Story-led",
    utility: "Utility",
    promo: "Promotional",
  },
  seasonality: {
    black_friday: "Black Friday",
    cyber_monday: "Cyber Monday",
    back_to_school: "Back to School",
    valentines_day: "Valentine's Day",
    mothers_day: "Mother's Day",
    fathers_day: "Father's Day",
  },
  offerType: {
    free_shipping: "Free Shipping",
    free_trial: "Free Trial",
    limited_offer: "Limited Time",
    gift_with_purchase: "Gift With Purchase",
    no_offer: "No Explicit Offer",
    no_explicit_offer: "No Explicit Offer",
    none: "No Explicit Offer",
  },
  hookTactic: {
    before_after: "Before/After",
    question_hook: "Question Hook",
    list_hook: "List Hook",
    pattern_interrupt: "Pattern Interrupt",
    shock_statement: "Shock Statement",
  },
  headlineTactic: {
    how_to: "How To",
    question_headline: "Question Headline",
    number_headline: "Number Headline",
    social_proof_headline: "Social Proof Headline",
    cta_headline: "CTA Headline",
    benefit_headline: "Benefit Headline",
  },
};

function canonicalizeAiTagValue(key: AiTagKey, value: string): string | null {
  const normalized = normalizeCopyText(value);
  if (!normalized) return null;
  const token = normalizeAiTagToken(normalized);
  const alias = AI_TAG_VALUE_ALIASES[key]?.[token];
  if (alias) return alias;
  if (/^[a-z0-9_-]+$/.test(normalized)) {
    return humanizeAiTagValue(normalized);
  }
  return normalized;
}

function pushAiTagValue(next: MetaAiTags, key: AiTagKey, value: string) {
  const canonical = canonicalizeAiTagValue(key, value);
  if (!canonical) return;
  const existing = next[key] ?? [];
  if (!existing.includes(canonical)) {
    next[key] = [...existing, canonical];
  }
}

function pushAiTagValues(next: MetaAiTags, key: AiTagKey, values: string[]) {
  for (const value of values) {
    pushAiTagValue(next, key, value);
  }
}

function mergeAiTagMaps(target: MetaAiTags, incoming: MetaAiTags | undefined) {
  if (!incoming) return;
  for (const [rawKey, rawValues] of Object.entries(incoming)) {
    const key = rawKey as AiTagKey;
    if (!Array.isArray(rawValues) || rawValues.length === 0) continue;
    pushAiTagValues(
      target,
      key,
      rawValues
        .map((value) => canonicalizeAiTagValue(key, value))
        .filter((value): value is string => Boolean(value))
    );
  }
}

function hasQuestionShape(text: string): boolean {
  return (
    text.includes("?") ||
    /^(how|what|why|when|where|who|which|can|do|did|is|are|should|would|nasıl|neden|ne|hangi|kim)\b/.test(
      text
    )
  );
}

function hasNumberListShape(text: string): boolean {
  return (
    /^\d+\s*(\+|x)?\b/.test(text) ||
    /\b\d+\s+(ways|reasons|steps|tips|ideas|signs|hacks|things)\b/.test(text)
  );
}

function isCompactLead(text: string): boolean {
  if (!text) return false;
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return wordCount <= 18 && text.length <= 110;
}

function detectOfferTags(texts: string[]): string[] {
  const values: string[] = [];

  if (
    hasAnyPhrase(texts, [
      "free shipping",
      "ücretsiz kargo",
      "bedava kargo",
    ])
  ) {
    values.push("Free Shipping");
  }
  if (
    hasAnyPhrase(texts, [
      "free trial",
      "ücretsiz deneme",
      "demo request",
      "book a demo",
      "request a demo",
      "free sample",
    ])
  ) {
    values.push("Free Trial");
  }
  if (
    hasAnyPhrase(texts, ["bundle", "starter kit", "bundle and save"]) ||
    matchesAnyPattern(texts, [/\b\d+\s?-\s?pack\b/, /\bset of \d+\b/, /\bpaket\b/])
  ) {
    values.push("Bundle");
  }
  if (
    hasAnyPhrase(texts, [
      "buy one get one",
      "bogo",
      "1 al 1",
      "1+1",
    ])
  ) {
    values.push("BOGO");
  }
  if (
    hasAnyPhrase(texts, [
      "gift with purchase",
      "purchase gift",
      "free gift",
      "gift included",
    ])
  ) {
    values.push("Gift With Purchase");
  }
  if (
    hasAnyPhrase(texts, [
      "limited time",
      "today only",
      "ends tonight",
      "ending soon",
      "last chance",
      "sınırlı süre",
      "son şans",
      "yalnızca bugün",
    ])
  ) {
    values.push("Limited Time");
  }
  if (
    matchesAnyPattern(texts, [
      /(\d+\s?%|\b\d+\spercent\b).{0,12}(off|indirim)/,
      /\bsave\s+\d+\s?%/,
      /\bup to\s+\d+\s?%/,
      /\b\d+\s?% discount\b/,
    ]) ||
    hasAnyPhrase(texts, [
      "discount",
      "promo code",
      "coupon",
      "indirim",
      "kampanya",
      "fırsat",
    ])
  ) {
    values.push("Discount");
  }

  return values.length > 0 ? values : ["No Explicit Offer"];
}

function detectSeasonalityTags(texts: string[]): string[] {
  const values: string[] = [];
  const seasonalityRules: Array<{ value: string; phrases: string[] }> = [
    { value: "Black Friday", phrases: ["black friday", "bf sale"] },
    { value: "Cyber Monday", phrases: ["cyber monday"] },
    { value: "Holiday", phrases: ["holiday", "christmas", "xmas", "new year", "yılbaşı"] },
    { value: "Ramadan", phrases: ["ramadan", "ramazan"] },
    { value: "Eid", phrases: ["eid", "bayram"] },
    { value: "Valentine's Day", phrases: ["valentine", "sevgililer günü"] },
    { value: "Mother's Day", phrases: ["mother's day", "anneler günü"] },
    { value: "Father's Day", phrases: ["father's day", "babalar günü"] },
    { value: "Back to School", phrases: ["back to school", "okula dönüş"] },
    { value: "Summer", phrases: ["summer", "yaz"] },
    { value: "Winter", phrases: ["winter", "kış"] },
    { value: "Spring", phrases: ["spring", "bahar"] },
    { value: "Fall", phrases: ["fall", "autumn", "sonbahar"] },
  ];

  for (const rule of seasonalityRules) {
    if (hasAnyPhrase(texts, rule.phrases)) {
      values.push(rule.value);
    }
  }

  return values;
}

function detectHeadlineTactic(headlines: string[]): string[] {
  const normalizedHeadlines = headlines.map((headline) => headline.toLowerCase());

  for (const headline of normalizedHeadlines) {
    if (/^(how to|how you can|ways to|learn to|nasıl)\b/.test(headline)) {
      return ["How To"];
    }
    if (hasQuestionShape(headline)) {
      return ["Question Headline"];
    }
    if (hasNumberListShape(headline)) {
      return ["Number Headline"];
    }
    if (
      hasAnyPhrase([headline], [
        "trusted by",
        "loved by",
        "best seller",
        "best-selling",
        "top rated",
        "#1",
        "çok satan",
        "en sevilen",
        "güvenilen",
      ])
    ) {
      return ["Social Proof Headline"];
    }
    if (
      hasAnyPhrase([headline], [
        "shop now",
        "buy now",
        "get yours",
        "order now",
        "start now",
        "book now",
        "şimdi al",
        "satın al",
        "hemen keşfet",
        "incele",
      ])
    ) {
      return ["CTA Headline"];
    }
  }

  return [];
}

function detectAssetType(row: AiTagResolutionRow): string[] {
  if (
    row.is_catalog ||
    row.format === "catalog" ||
    row.creative_delivery_type === "catalog" ||
    row.creative_primary_type === "catalog"
  ) {
    return ["Catalog"];
  }
  if (row.creative_delivery_type === "flexible" || row.creative_primary_type === "flexible") {
    return ["Flexible"];
  }
  if (
    row.creative_visual_format === "carousel" ||
    row.creative_secondary_type === "carousel" ||
    row.creative_primary_type === "carousel"
  ) {
    return ["Carousel"];
  }
  if (
    row.creative_visual_format === "video" ||
    row.preview.render_mode === "video" ||
    row.format === "video" ||
    row.creative_type === "video" ||
    row.creative_primary_type === "video"
  ) {
    return ["Video"];
  }
  if (row.creative_visual_format === "mixed" || row.creative_primary_type === "mixed") {
    return ["Mixed"];
  }
  return ["Static Image"];
}

function detectVisualFormat(row: AiTagResolutionRow, texts: string[]): string[] {
  if (
    row.is_catalog ||
    row.format === "catalog" ||
    row.creative_delivery_type === "catalog" ||
    row.creative_primary_type === "catalog"
  ) {
    return ["Catalog"];
  }
  if (row.creative_delivery_type === "flexible" || row.creative_primary_type === "flexible") {
    return ["Flexible"];
  }
  if (
    row.creative_visual_format === "carousel" ||
    row.creative_secondary_type === "carousel" ||
    row.creative_primary_type === "carousel"
  ) {
    return ["Carousel"];
  }
  if (
    row.creative_visual_format === "video" ||
    row.preview.render_mode === "video" ||
    row.preview.video_url ||
    row.format === "video" ||
    row.creative_type === "video" ||
    row.creative_primary_type === "video" ||
    row.creative_secondary_type === "video"
  ) {
    return ["Video"];
  }
  if (row.creative_visual_format === "mixed" || row.creative_primary_type === "mixed") {
    return ["Mixed"];
  }
  if (
    hasAnyPhrase(texts, [
      "founder",
      "our founder",
      "from our founder",
      "our story",
      "behind the brand",
      "meet the founder",
    ])
  ) {
    return ["Founder"];
  }
  if (
    hasAnyPhrase(texts, [
      "review",
      "testimonial",
      "customers say",
      "loved by",
      "before and after",
      "müşteri yorumu",
    ])
  ) {
    return ["Testimonial"];
  }
  if (
    hasAnyPhrase(texts, [
      "how to",
      "tutorial",
      "demo",
      "watch how",
      "see how",
      "step by step",
      "nasıl",
    ])
  ) {
    return ["Demo"];
  }
  return ["Image"];
}

function detectHookTactic(texts: string[]): string[] {
  for (const text of texts) {
    if (!text) continue;
    if (/(before(\s+and\s+|\s*\/?\s*)after|öncesi(\s+ve\s+|\s*\/?\s*)sonrası)/.test(text)) {
      return ["Before/After"];
    }
    if (hasNumberListShape(text) && isCompactLead(text)) {
      return ["List Hook"];
    }
    if (hasQuestionShape(text) && isCompactLead(text)) {
      return ["Question Hook"];
    }
    if (
      hasAnyPhrase([text], [
        "stop",
        "wait",
        "don't buy",
        "you are doing it wrong",
        "nobody tells you",
        "avoid this",
        "dur",
        "bekle",
        "yanlış yapıyorsun",
        "kimse sana söylemiyor",
      ])
    ) {
      return ["Pattern Interrupt"];
    }
    if (
      hasAnyPhrase([text], [
        "shocking",
        "unbelievable",
        "finally",
        "never again",
        "worst mistake",
        "şok",
        "inanılmaz",
        "asla",
      ])
    ) {
      return ["Shock Statement"];
    }
  }
  return [];
}

function detectMessagingAngle(texts: string[], offerTags: string[]): string[] {
  if (
    hasAnyPhrase(texts, [
      "problem",
      "struggling",
      "fix",
      "solution",
      "tired of",
      "sorun",
      "çözüm",
      "problem çöz",
    ])
  ) {
    return ["Problem Solution"];
  }
  if (
    hasAnyPhrase(texts, [
      "review",
      "testimonial",
      "trusted by",
      "loved by",
      "customers say",
      "müşteri yorumu",
      "çok seviliyor",
    ])
  ) {
    return ["Social Proof"];
  }
  if (
    hasAnyPhrase(texts, [
      "how to",
      "tutorial",
      "guide",
      "learn",
      "nasıl",
      "rehber",
    ])
  ) {
    return ["Educational"];
  }
  if (
    hasAnyPhrase(texts, [
      "limited time",
      "last chance",
      "ending soon",
      "urgent",
      "sınırlı süre",
      "son şans",
    ])
  ) {
    return ["Urgency"];
  }
  if (
    hasAnyPhrase(texts, [
      "our story",
      "why we",
      "from our founder",
      "brand story",
    ])
  ) {
    return ["Story-led"];
  }
  if (
    offerTags.some((value) => value !== "No Explicit Offer") &&
    hasAnyPhrase(texts, [
      "discount",
      "promo code",
      "coupon",
      "indirim",
      "kampanya",
      "free shipping",
      "limited time",
      "today only",
    ])
  ) {
    return ["Promotional"];
  }
  return [];
}

function detectAudience(texts: string[], offerTags: string[]): string[] {
  if (
    hasAnyPhrase(texts, [
      "founder",
      "business owner",
      "small business",
      "shop owner",
      "kurucu",
      "iş sahibi",
    ])
  ) {
    return ["Founder"];
  }
  if (
    hasAnyPhrase(texts, [
      "first order",
      "first-time buyer",
      "new customer",
      "ilk sipariş",
      "ilk kez",
      "yeni müşteri",
    ])
  ) {
    return ["First-time Buyer"];
  }
  if (
    hasAnyPhrase(texts, [
      "returning customer",
      "reorder",
      "subscribe again",
      "yeniden sipariş",
      "geri gelen müşteri",
    ])
  ) {
    return ["Returning Customer"];
  }
  if (
    hasAnyPhrase(texts, [
      "gift",
      "gifting",
      "for her",
      "for him",
      "hediye",
    ])
  ) {
    return ["Gift Shopper"];
  }
  if (
    hasAnyPhrase(texts, [
      "mom",
      "moms",
      "parents",
      "parent",
      "anne",
      "ebeveyn",
    ])
  ) {
    return ["Parent"];
  }
  if (
    hasAnyPhrase(texts, [
      "student",
      "students",
      "öğrenci",
    ])
  ) {
    return ["Student"];
  }
  if (
    hasAnyPhrase(texts, [
      "homeowner",
      "home owners",
      "ev sahibi",
    ])
  ) {
    return ["Homeowner"];
  }
  if (
    offerTags.some((value) => value !== "No Explicit Offer") &&
    hasAnyPhrase(texts, [
      "new customers",
      "online shoppers",
      "ecommerce brands",
      "for shoppers",
      "online alışveriş",
      "online shopper",
    ])
  ) {
    return ["Ecommerce Shopper"];
  }
  return [];
}

export function resolveAiTagsForRow(row: AiTagResolutionRow): MetaAiTags {
  const explicit = normalizeAiTags(row.tags);
  mergeAiTagMaps(explicit, row.ai_tags);

  const textContext = collectAiTagTextContext(row);
  const normalizedTexts = textContext.normalizedCandidates;
  if (!explicit.assetType?.length) {
    pushAiTagValues(explicit, "assetType", detectAssetType(row));
  }
  if (!explicit.offerType?.length) {
    pushAiTagValues(explicit, "offerType", detectOfferTags(normalizedTexts));
  }
  if (!explicit.seasonality?.length) {
    pushAiTagValues(explicit, "seasonality", detectSeasonalityTags(normalizedTexts));
  }
  if (!explicit.headlineTactic?.length) {
    pushAiTagValues(explicit, "headlineTactic", detectHeadlineTactic(textContext.headlineCandidates));
  }
  if (!explicit.visualFormat?.length) {
    pushAiTagValues(
      explicit,
      "visualFormat",
      detectVisualFormat(row, textContext.visualSignalTexts)
    );
  }
  if (!explicit.hookTactic?.length) {
    pushAiTagValues(explicit, "hookTactic", detectHookTactic(textContext.hookCandidates));
  }
  if (!explicit.messagingAngle?.length) {
    pushAiTagValues(
      explicit,
      "messagingAngle",
      detectMessagingAngle(normalizedTexts, explicit.offerType ?? [])
    );
  }
  if (!explicit.intendedAudience?.length) {
    pushAiTagValues(
      explicit,
      "intendedAudience",
      detectAudience(normalizedTexts, explicit.offerType ?? [])
    );
  }

  return explicit;
}

export const CREATIVE_TYPE_LABELS: Record<CreativeType, string> = {
  feed: getLegacyCreativeTypeLabel("feed"),
  video: getLegacyCreativeTypeLabel("video"),
  flexible: getLegacyCreativeTypeLabel("flexible"),
  feed_catalog: getLegacyCreativeTypeLabel("feed_catalog"),
};

export function toCreativeTypeLabel(type: CreativeType): string {
  return CREATIVE_TYPE_LABELS[type] ?? getLegacyCreativeTypeLabel("feed");
}

export function resolveGroupedCreativeType(rows: RawCreativeRow[]): CreativeType {
  if (rows.some((row) => row.creative_type === "feed_catalog")) return "feed_catalog";
  if (rows.some((row) => row.creative_type === "flexible")) return "flexible";
  if (rows.some((row) => row.creative_type === "video")) return "video";
  return "feed";
}

export function mergeExtraction(base: CopyExtraction, partial: {
  copy_variants?: string[];
  headline_variants?: string[];
  description_variants?: string[];
  source?: CopySourceLabel;
}): CopyExtraction {
  const mergedCopyVariants = uniqueNormalizedText([...(base.copy_variants ?? []), ...(partial.copy_variants ?? [])]);
  const mergedHeadlineVariants = uniqueNormalizedText([...(base.headline_variants ?? []), ...(partial.headline_variants ?? [])]);
  const mergedDescriptionVariants = uniqueNormalizedText([
    ...(base.description_variants ?? []),
    ...(partial.description_variants ?? []),
  ]);
  const addedContent =
    mergedCopyVariants.length > (base.copy_variants?.length ?? 0) ||
    mergedHeadlineVariants.length > (base.headline_variants?.length ?? 0) ||
    mergedDescriptionVariants.length > (base.description_variants?.length ?? 0);
  const mergedText =
    chooseBestCopyText({
      copy_variants: mergedCopyVariants,
      headline_variants: mergedHeadlineVariants,
      description_variants: mergedDescriptionVariants,
    }) ?? null;
  return {
    copy_text: mergedText,
    copy_variants: mergedCopyVariants,
    headline_variants: mergedHeadlineVariants,
    description_variants: mergedDescriptionVariants,
    copy_source: base.copy_source ?? (addedContent ? partial.source ?? null : null),
  };
}

export function mergeDebugSources(base: string[] | undefined, incoming: string[] | undefined): string[] {
  const merged = new Set<string>([...(base ?? []), ...(incoming ?? [])]);
  return Array.from(merged);
}

export function applyExtractionToRow(
  row: RawCreativeRow,
  extraction: CopyExtraction,
  debugSource: string,
  unresolvedReason: string | null = null
): RawCreativeRow {
  const merged = mergeExtraction(
    {
      copy_text: row.copy_text ?? null,
      copy_variants: row.copy_variants ?? [],
      headline_variants: row.headline_variants ?? [],
      description_variants: row.description_variants ?? [],
      copy_source: row.copy_source ?? null,
    },
    {
      copy_variants: extraction.copy_variants,
      headline_variants: extraction.headline_variants,
      description_variants: extraction.description_variants,
      source: extraction.copy_source ?? undefined,
    }
  );
  const hasRecoveredCopy = Boolean(
    hasCopyContent(merged)
  );
  return {
    ...row,
    ...merged,
    copy_debug_sources: mergeDebugSources(row.copy_debug_sources, [debugSource]),
    unresolved_reason: hasRecoveredCopy ? null : unresolvedReason ?? row.unresolved_reason ?? null,
  };
}

export function extractVariantsFromPreviewHtml(html: string): {
  copy_variants: string[];
  headline_variants: string[];
  description_variants: string[];
} {
  const collectQuotedValues = (keys: string[]): string[] => {
    const values: string[] = [];
    for (const key of keys) {
      const re = new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "gi");
      let match: RegExpExecArray | null = re.exec(html);
      while (match) {
        const candidate = match[1];
        try {
          const decoded = JSON.parse(`"${candidate}"`);
          const normalized = normalizeCopyText(decoded);
          if (normalized) values.push(normalized);
        } catch {
          const normalized = normalizeCopyText(candidate);
          if (normalized) values.push(normalized);
        }
        match = re.exec(html);
      }
    }
    return uniqueNormalizedText(values);
  };

  return {
    copy_variants: collectQuotedValues(["message", "primary_text", "body", "text", "caption"]),
    headline_variants: collectQuotedValues(["headline", "title", "name"]),
    description_variants: collectQuotedValues(["description"]),
  };
}

export async function fetchStoryCopyMap(
  storyIds: string[],
  accessToken: string
): Promise<Map<string, StoryCopyPayload>> {
  const map = new Map<string, StoryCopyPayload>();
  const ids = Array.from(new Set(storyIds.map((id) => id.trim()).filter((id) => id.length > 0)));
  if (ids.length === 0) return map;

  for (let i = 0; i < ids.length; i += 40) {
    const chunk = ids.slice(i, i + 40);
    const url = new URL("https://graph.facebook.com/v25.0/");
    url.searchParams.set("ids", chunk.join(","));
    url.searchParams.set("fields", "message,name,description,story,attachments{title,description}");
    url.searchParams.set("access_token", accessToken);
    try {
      const res = await fetch(url.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) continue;
      const payload = (await res.json().catch(() => null)) as Record<string, Record<string, unknown>> | null;
      if (!payload || typeof payload !== "object") continue;
      for (const [id, value] of Object.entries(payload)) {
        const attachmentData = Array.isArray((value?.attachments as { data?: unknown[] } | undefined)?.data)
          ? (((value?.attachments as { data?: unknown[] }).data as unknown[]) ?? [])
          : [];
        const attachmentTitles = attachmentData
          .map((item) =>
            item && typeof item === "object" && "title" in (item as Record<string, unknown>)
              ? (item as Record<string, unknown>).title
              : null
          );
        const attachmentDescriptions = attachmentData
          .map((item) =>
            item && typeof item === "object" && "description" in (item as Record<string, unknown>)
              ? (item as Record<string, unknown>).description
              : null
          );
        const message = uniqueNormalizedText([value?.message, value?.story]);
        const headline = uniqueNormalizedText([value?.name, ...attachmentTitles]);
        const description = uniqueNormalizedText([value?.description, ...attachmentDescriptions]);
        if (message.length === 0 && headline.length === 0 && description.length === 0) continue;
        map.set(id, { message, headline, description });
      }
    } catch {
      // Story lookup is best-effort fallback.
    }
  }
  return map;
}

export function buildCreativeDebugInfo(input: {
  debug_stage_fetch_source?: string | null;
  debug_stage_has_raw_ad?: boolean;
  debug_stage_raw_ad_id?: string | null;
  debug_stage_raw_ad_creative?: boolean;
  debug_stage_raw_ad_creative_thumbnail_url?: string | null;
  debug_stage_enriched_ad_creative?: boolean;
  debug_stage_enriched_ad_creative_thumbnail_url?: string | null;
  debug_stage_row_input_thumbnail_url?: string | null;
  debug_stage_final_thumbnail_url?: string | null;
  debug_stage_null_reason?: string | null;
  debug_raw_creative_thumbnail_url?: string | null;
  debug_enriched_creative_thumbnail_url?: string | null;
  debug_resolved_thumbnail_source?: string | null;
  debug_resolution_stage?: string | null;
  debug_creative_object_type?: string | null;
  debug_creative_video_ids?: string[] | null;
  debug_creative_effective_object_story_id?: string | null;
  debug_creative_object_story_id?: string | null;
  debug_creative_object_story_video_id?: string | null;
  debug_creative_asset_video_ids?: string[] | null;
}): CreativeDebugInfo {
  return {
    stage_fetch_source: input.debug_stage_fetch_source ?? null,
    stage_has_raw_ad: input.debug_stage_has_raw_ad ?? false,
    stage_raw_ad_id: input.debug_stage_raw_ad_id ?? null,
    stage_raw_ad_creative: input.debug_stage_raw_ad_creative ?? false,
    stage_raw_ad_creative_thumbnail_url: input.debug_stage_raw_ad_creative_thumbnail_url ?? null,
    stage_enriched_ad_creative: input.debug_stage_enriched_ad_creative ?? false,
    stage_enriched_ad_creative_thumbnail_url: input.debug_stage_enriched_ad_creative_thumbnail_url ?? null,
    stage_row_input_thumbnail_url: input.debug_stage_row_input_thumbnail_url ?? null,
    stage_final_thumbnail_url: input.debug_stage_final_thumbnail_url ?? null,
    stage_null_reason: input.debug_stage_null_reason ?? null,
    raw_creative_thumbnail_url: input.debug_raw_creative_thumbnail_url ?? null,
    enriched_creative_thumbnail_url: input.debug_enriched_creative_thumbnail_url ?? null,
    resolved_thumbnail_source: input.debug_resolved_thumbnail_source ?? null,
    resolution_stage: input.debug_resolution_stage ?? null,
    creative_object_type: input.debug_creative_object_type ?? null,
    creative_video_ids: input.debug_creative_video_ids ?? null,
    creative_effective_object_story_id: input.debug_creative_effective_object_story_id ?? null,
    creative_object_story_id: input.debug_creative_object_story_id ?? null,
    creative_object_story_video_id: input.debug_creative_object_story_video_id ?? null,
    creative_asset_video_ids: input.debug_creative_asset_video_ids ?? null,
  };
}
