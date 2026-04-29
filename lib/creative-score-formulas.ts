export interface CreativeScoreFormulaInput {
  format?: string | null;
  thumbstop?: number | null;
  video25?: number | null;
  video50?: number | null;
  video100?: number | null;
  ctrAll?: number | null;
  seeMoreRate?: number | null;
  linkCtr?: number | null;
  clickToAddToCartRate?: number | null;
  clickToPurchaseRate?: number | null;
  atcToPurchaseRatio?: number | null;
  roas?: number | null;
  aiTags?: Partial<Record<string, string[]>> | null;
}

export interface CreativeFunnelSubScores {
  hook: number;
  watch: number;
  click: number;
  cta: number;
  offer: number;
  convert: number;
}

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function n(value: number | null | undefined, fallback = 0) {
  return finite(value) ? value : fallback;
}

export function clampCreativeScore(value: number, min = 0, max = 100) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function scaleCreativeMetricToScore(value: number | null | undefined, target: number): number {
  if (!finite(value) || target <= 0) return 0;
  return clampCreativeScore((value / target) * 100);
}

function hasAiTagValue(input: CreativeScoreFormulaInput, key: string, value?: string) {
  const values = input.aiTags?.[key] ?? [];
  if (!value) return values.length > 0;
  return values.some((entry) => entry.toLowerCase() === value.toLowerCase());
}

export function hasCreativeScoreVideoEvidence(input: CreativeScoreFormulaInput) {
  const format = input.format?.toLowerCase();
  return (
    format === "video" ||
    n(input.thumbstop) > 0 ||
    n(input.video25) > 0 ||
    n(input.video50) > 0 ||
    n(input.video100) > 0
  );
}

export function calculateCreativeHookScore(input: CreativeScoreFormulaInput): number {
  const videoFirstStop = scaleCreativeMetricToScore(input.thumbstop, 28);
  const videoEarlyHold = scaleCreativeMetricToScore(input.video25, 32);
  const imageClickPull = scaleCreativeMetricToScore(input.ctrAll, 2.8);
  const imageReadMore = scaleCreativeMetricToScore(input.seeMoreRate, 18);
  const base = hasCreativeScoreVideoEvidence(input)
    ? videoFirstStop * 0.7 + videoEarlyHold * 0.3
    : imageClickPull * 0.65 + imageReadMore * 0.35;
  const hookSignalBoost = hasAiTagValue(input, "hookTactic") ? 6 : 0;
  const headlineSignalBoost =
    hasAiTagValue(input, "headlineTactic", "Question Headline") ||
    hasAiTagValue(input, "headlineTactic", "Number Headline")
      ? 4
      : 0;
  return clampCreativeScore(base + hookSignalBoost + headlineSignalBoost);
}

export function calculateCreativeWatchScore(input: CreativeScoreFormulaInput): number {
  if (!hasCreativeScoreVideoEvidence(input)) return 0;
  const hookCarry = scaleCreativeMetricToScore(input.thumbstop, 28);
  const midWatch = scaleCreativeMetricToScore(input.video50, 18);
  const fullWatch = scaleCreativeMetricToScore(input.video100, 8);
  return clampCreativeScore(hookCarry * 0.2 + midWatch * 0.5 + fullWatch * 0.3);
}

export function calculateCreativeClickScore(input: CreativeScoreFormulaInput): number {
  const ctrAllScore = scaleCreativeMetricToScore(input.ctrAll, 2.8);
  const linkCtrScore = scaleCreativeMetricToScore(input.linkCtr, 2.2);
  const seeMoreScore = scaleCreativeMetricToScore(input.seeMoreRate, 18);
  return clampCreativeScore(ctrAllScore * 0.45 + linkCtrScore * 0.4 + seeMoreScore * 0.15);
}

export function calculateCreativeCtaScore(input: CreativeScoreFormulaInput): number {
  const linkCtrScore = scaleCreativeMetricToScore(input.linkCtr, 2.2);
  const clickToAtcScore = scaleCreativeMetricToScore(input.clickToAddToCartRate, 18);
  const clickToPurchaseScore = scaleCreativeMetricToScore(input.clickToPurchaseRate, 5.5);
  const ctaSignalBoost = hasAiTagValue(input, "headlineTactic", "CTA Headline") ? 8 : 0;
  return clampCreativeScore(
    linkCtrScore * 0.35 + clickToAtcScore * 0.4 + clickToPurchaseScore * 0.25 + ctaSignalBoost,
  );
}

export function calculateCreativeOfferScore(input: CreativeScoreFormulaInput): number {
  const roasScore = scaleCreativeMetricToScore(input.roas, 4);
  const clickToAtcScore = scaleCreativeMetricToScore(input.clickToAddToCartRate, 18);
  const atcToPurchaseScore = scaleCreativeMetricToScore(input.atcToPurchaseRatio, 42);
  const explicitOfferBoost =
    hasAiTagValue(input, "offerType") && !hasAiTagValue(input, "offerType", "No Explicit Offer") ? 10 : 0;
  return clampCreativeScore(
    roasScore * 0.35 + clickToAtcScore * 0.25 + atcToPurchaseScore * 0.4 + explicitOfferBoost,
  );
}

export function calculateCreativeConvertScore(input: CreativeScoreFormulaInput): number {
  const roasScore = scaleCreativeMetricToScore(input.roas, 4);
  const clickToPurchaseScore = scaleCreativeMetricToScore(input.clickToPurchaseRate, 5.5);
  const atcToPurchaseScore = scaleCreativeMetricToScore(input.atcToPurchaseRatio, 42);
  return clampCreativeScore(roasScore * 0.45 + clickToPurchaseScore * 0.3 + atcToPurchaseScore * 0.25);
}

export function calculateCreativeFunnelSubScores(input: CreativeScoreFormulaInput): CreativeFunnelSubScores {
  return {
    hook: calculateCreativeHookScore(input),
    watch: calculateCreativeWatchScore(input),
    click: calculateCreativeClickScore(input),
    cta: calculateCreativeCtaScore(input),
    offer: calculateCreativeOfferScore(input),
    convert: calculateCreativeConvertScore(input),
  };
}
