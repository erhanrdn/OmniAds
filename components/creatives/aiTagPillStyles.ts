import { MetaAiTagKey } from "@/components/creatives/metricConfig";

export type AiTagPillTone = {
  className: string;
};

const BASE_NONE_TONE: AiTagPillTone = {
  className: "border-slate-200 bg-slate-50 text-slate-600",
};

const AI_TAG_COLOR_MAP: Partial<Record<MetaAiTagKey, Record<string, AiTagPillTone>>> = {
  assetType: {
    Animation: { className: "border-pink-200 bg-pink-50 text-pink-700" },
    UGC: { className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
    "Product Image": { className: "border-lime-200 bg-lime-50 text-lime-700" },
    "Product Image with Text": { className: "border-rose-200 bg-rose-50 text-rose-700" },
    Hybrid: { className: "border-blue-200 bg-blue-50 text-blue-700" },
    Other: { className: "border-violet-200 bg-violet-50 text-violet-700" },
    None: BASE_NONE_TONE,
  },
  visualFormat: {
    "Cinematic B-Roll": { className: "border-amber-200 bg-amber-50 text-amber-700" },
    Headline: { className: "border-purple-200 bg-purple-50 text-purple-700" },
    Demo: { className: "border-cyan-200 bg-cyan-50 text-cyan-700" },
    Montage: { className: "border-teal-200 bg-teal-50 text-teal-700" },
    Founder: { className: "border-lime-200 bg-lime-50 text-lime-800" },
    "Time Lapse": { className: "border-sky-200 bg-sky-50 text-sky-700" },
    "Behind The Scenes": { className: "border-yellow-200 bg-yellow-50 text-yellow-700" },
    None: { className: "border-emerald-100 bg-emerald-50 text-emerald-700" },
  },
  intendedAudience: {
    Founder: { className: "border-indigo-200 bg-indigo-50 text-indigo-700" },
    "Ecommerce Shopper": { className: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700" },
    "First-time Buyer": { className: "border-blue-200 bg-blue-50 text-blue-700" },
    None: BASE_NONE_TONE,
  },
  messagingAngle: {
    Nostalgia: { className: "border-orange-200 bg-orange-50 text-orange-700" },
    "Problem Solution": { className: "border-sky-200 bg-sky-50 text-sky-700" },
    "Social Proof": { className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
    Benefit: { className: "border-violet-200 bg-violet-50 text-violet-700" },
    None: BASE_NONE_TONE,
  },
  seasonality: {
    Holiday: { className: "border-red-200 bg-red-50 text-red-700" },
    Summer: { className: "border-yellow-200 bg-yellow-50 text-yellow-700" },
    Winter: { className: "border-sky-200 bg-sky-50 text-sky-700" },
    Evergreen: { className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
    None: BASE_NONE_TONE,
  },
  offerType: {
    Discount: { className: "border-rose-200 bg-rose-50 text-rose-700" },
    Bundle: { className: "border-purple-200 bg-purple-50 text-purple-700" },
    "Free Shipping": { className: "border-cyan-200 bg-cyan-50 text-cyan-700" },
    "Limited Time": { className: "border-amber-200 bg-amber-50 text-amber-700" },
    None: BASE_NONE_TONE,
  },
  hookTactic: {
    "Question Hook": { className: "border-indigo-200 bg-indigo-50 text-indigo-700" },
    "Pattern Interrupt": { className: "border-pink-200 bg-pink-50 text-pink-700" },
    "Shock Statement": { className: "border-red-200 bg-red-50 text-red-700" },
    "Before/After": { className: "border-teal-200 bg-teal-50 text-teal-700" },
    None: BASE_NONE_TONE,
  },
  headlineTactic: {
    "Benefit Headline": { className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
    "Curiosity Headline": { className: "border-violet-200 bg-violet-50 text-violet-700" },
    "How To": { className: "border-blue-200 bg-blue-50 text-blue-700" },
    "Number Headline": { className: "border-amber-200 bg-amber-50 text-amber-700" },
    None: BASE_NONE_TONE,
  },
};

const CATEGORY_FALLBACK_TONES: Record<MetaAiTagKey, AiTagPillTone> = {
  assetType: { className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  visualFormat: { className: "border-sky-200 bg-sky-50 text-sky-700" },
  intendedAudience: { className: "border-indigo-200 bg-indigo-50 text-indigo-700" },
  messagingAngle: { className: "border-violet-200 bg-violet-50 text-violet-700" },
  seasonality: { className: "border-amber-200 bg-amber-50 text-amber-700" },
  offerType: { className: "border-rose-200 bg-rose-50 text-rose-700" },
  hookTactic: { className: "border-pink-200 bg-pink-50 text-pink-700" },
  headlineTactic: { className: "border-teal-200 bg-teal-50 text-teal-700" },
};

function normalizeTagValue(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function getAiTagPillStyles(category: MetaAiTagKey, value: string): AiTagPillTone {
  const entries = AI_TAG_COLOR_MAP[category];
  if (!entries) return CATEGORY_FALLBACK_TONES[category];

  const exact = entries[value];
  if (exact) return exact;

  const normalizedValue = normalizeTagValue(value);
  const normalizedMatch = Object.entries(entries).find(
    ([key]) => normalizeTagValue(key) === normalizedValue
  )?.[1];

  return normalizedMatch ?? CATEGORY_FALLBACK_TONES[category];
}
