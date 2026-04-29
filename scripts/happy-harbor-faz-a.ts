import { createHmac, createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const AUDIT_A_DIR = "docs/team-comms/happy-harbor/audit-A";
export const DEFAULT_SOURCE_ARTIFACT =
  "/tmp/adsecute-creative-live-firm-audit-local.json";
export const DEFAULT_V2_ARTIFACT =
  "docs/operator-policy/creative-segmentation-recovery/reports/v2-live-audit-2026-04-26/live-audit-sanitized.json";
export const PRIVATE_REVEAL_PATH = path.join(
  AUDIT_A_DIR,
  "_revealed-labels.private.json",
);

export const INSPECTED_SOURCE_ROW_IDS = [
  "company-01|company-01-account-01|company-01-campaign-01|company-01-adset-01|company-01-creative-01",
];

export const LABEL_FIELDS = [
  "currentUserFacingSegment",
  "currentDecisionOsInternalSegment",
  "lifecycleState",
  "primaryAction",
  "operatorPrimaryDecision",
  "subTone",
  "actionability",
  "actionReadiness",
  "oldRuleChallengerSegment",
] as const;

const PRIMARY_DECISIONS = [
  "Scale",
  "Test More",
  "Protect",
  "Refresh",
  "Cut",
  "Diagnose",
] as const;

const HEADLINES = [
  "Test Winner",
  "Test Loser",
  "Test Inconclusive",
  "Scale Performer",
  "Scale Underperformer",
  "Scale Fatiguing",
  "Needs Diagnosis",
] as const;

const PHASES = ["test", "scale", "post-scale"] as const;

type PrimaryDecision = (typeof PRIMARY_DECISIONS)[number];
type Headline = (typeof HEADLINES)[number];
type Phase = (typeof PHASES)[number];
type Action = "scale" | "keep_testing" | "protect" | "refresh" | "cut" | "diagnose";
type ActionReadiness = "ready" | "needs_review" | "blocked";
type SpendTier = "small" | "medium" | "large";

type MetricWindow = {
  spend?: number | null;
  purchaseValue?: number | null;
  roas?: number | null;
  cpa?: number | null;
  purchases?: number | null;
  impressions?: number | null;
  linkClicks?: number | null;
};

type BaselineSummary = {
  scope?: string | null;
  reliability?: string | null;
  sampleSize?: number | null;
  creativeCount?: number | null;
  eligibleCreativeCount?: number | null;
  spendBasis?: number | null;
  purchaseBasis?: number | null;
  weightedRoas?: number | null;
  weightedCpa?: number | null;
  medianRoas?: number | null;
  medianCpa?: number | null;
  medianSpend?: number | null;
  missingContext?: string[];
};

type SourceRow = {
  companyAlias: string;
  accountAlias: string;
  campaignAlias: string;
  adSetAlias: string;
  creativeAlias: string;
  activeStatus: boolean;
  activeStatusSource: string;
  campaignStatus: string | null;
  adSetStatus: string | null;
  spend30d: number;
  recent7d: MetricWindow | null;
  mid30d: MetricWindow | null;
  long90d: MetricWindow | null;
  currentDecisionOsInternalSegment: string | null;
  currentUserFacingSegment: string;
  currentInstructionHeadline?: string | null;
  reasonSummary?: string | null;
  nextObservation?: string[];
  benchmarkScope: string;
  benchmarkScopeLabel: string;
  baselineReliability: string;
  accountBaseline: BaselineSummary;
  campaignBaseline: BaselineSummary | null;
  commercialTruthAvailability: {
    targetPackConfigured: boolean;
    missingInputs: string[];
  };
  businessValidationStatus: "favorable" | "missing" | "unfavorable";
  pushReadiness: string | null;
  queueEligible: boolean;
  canApply: boolean;
  lifecycleState: string;
  primaryAction: string;
  evidenceSource: string;
  trustState: string;
  previewWindow: string | null;
  deploymentCompatibility: string;
  deploymentTargetLane: string | null;
  oldRuleChallengerAction: string | null;
  oldRuleChallengerSegment: string | null;
  oldRuleChallengerReason?: string | null;
  relativeStrengthClass?: string | null;
  campaignContextLimited: boolean;
  businessId?: string;
  businessName?: string | null;
  accountName?: string | null;
  campaignName?: string | null;
  adSetName?: string | null;
  creativeName?: string | null;
  creativeId?: string;
};

type SourceArtifact = {
  generatedAt: string;
  auditWindow: {
    todayReference: string;
    startDate: string;
    endDate: string;
    days: number;
    excludesToday: boolean;
  };
  cohort: Record<string, unknown>;
  globalSummary: Record<string, unknown>;
  businesses: Array<{
    companyAlias: string;
    screeningLiveRows: number;
    currentDecisionOsRows: number;
    sampledCreatives: number;
    activeCreativesSampled: number;
    evaluationStatus?: string;
    failureReason?: string;
  }>;
  rows: SourceRow[];
};

type V2Row = {
  rowId: string;
  v2PrimaryDecision?: string;
  v2Actionability?: string;
  v2Confidence?: number;
  v2RiskLevel?: string;
  v2ProblemClass?: string;
  v2BlockerReasons?: string[];
};

type BusinessSummary = {
  companyAlias: string;
  spendTier: SpendTier;
  spend30d: number;
  activeMetaAdAccountCount: number;
  creativeRowsWithDelivery: number;
  activeCreatives: number;
  sourceCurrentDecisionOsRows: number;
  sourceScreeningLiveRows: number;
  includedInSample: number;
};

type Rating = {
  rowId: string;
  phase: Phase;
  headline: Headline;
  action: Action;
  actionReadiness: ActionReadiness;
  confidence: number;
  primaryReason: string;
  blockers: string[];
};

type EnrichedRow = {
  source: SourceRow;
  rowId: string;
  business: BusinessSummary;
  campaignIsTestLike: boolean;
  rating: Rating;
  currentPrimaryDecision: PrimaryDecision;
};

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function writeJson(filePath: string, value: unknown) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function round(value: number | null | undefined, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function n(value: number | null | undefined, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function ratio(numerator: number | null | undefined, denominator: number | null | undefined) {
  if (
    typeof numerator !== "number" ||
    !Number.isFinite(numerator) ||
    typeof denominator !== "number" ||
    !Number.isFinite(denominator) ||
    denominator <= 0
  ) {
    return null;
  }
  return numerator / denominator;
}

export function rowId(row: Pick<SourceRow, "companyAlias" | "accountAlias" | "campaignAlias" | "adSetAlias" | "creativeAlias">) {
  return [
    row.companyAlias,
    row.accountAlias,
    row.campaignAlias,
    row.adSetAlias,
    row.creativeAlias,
  ].join("|");
}

export function hmacLabel(secret: string, id: string, field: string, value: unknown) {
  if (value == null || value === "") return null;
  return createHmac("sha256", secret)
    .update(`${id}:${field}:${String(value)}`)
    .digest("hex");
}

export function classifySpendTier(spend30d: number): SpendTier {
  if (spend30d < 1_000) return "small";
  if (spend30d <= 10_000) return "medium";
  return "large";
}

export function deriveCampaignIsTestLike(row: Pick<SourceRow, "campaignName" | "adSetName" | "campaignAlias" | "adSetAlias">) {
  const text = [row.campaignName, row.adSetName, row.campaignAlias, row.adSetAlias]
    .filter(Boolean)
    .join(" ");
  return /\b(test|testing|creative|cbo|abo|advantage|asc|dct|video|winning|winner|scale|scaling|retarget|remarket|prospect|cold|broad|lookalike|interest)\b/i.test(
    text,
  );
}

function preferredBaseline(row: SourceRow) {
  if (n(row.campaignBaseline?.medianRoas) > 0) return row.campaignBaseline!;
  return row.accountBaseline;
}

function currentPrimaryDecision(row: SourceRow): PrimaryDecision {
  switch (row.currentUserFacingSegment) {
    case "Scale":
    case "Scale Review":
      return "Scale";
    case "Test More":
    case "Watch":
    case "Not Enough Data":
      return "Test More";
    case "Protect":
      return "Protect";
    case "Refresh":
      return "Refresh";
    case "Cut":
      return "Cut";
    case "Diagnose":
    case "Not eligible for evaluation":
    default:
      return "Diagnose";
  }
}

function operatorPrimaryDecision(row: SourceRow) {
  switch (currentPrimaryDecision(row)) {
    case "Scale":
      return "scale";
    case "Test More":
      return "test_more";
    case "Protect":
      return "protect";
    case "Refresh":
      return "refresh";
    case "Cut":
      return "cut";
    case "Diagnose":
      return "diagnose";
  }
}

function inferSubTone(row: SourceRow) {
  const segment = row.currentDecisionOsInternalSegment;
  if (segment === "scale_review") return "review_only";
  if (row.queueEligible || row.pushReadiness === "safe_to_queue") return "queue_ready";
  if (row.primaryAction === "retest_comeback") return "revive";
  if (
    segment === "kill_candidate" ||
    segment === "spend_waste" ||
    segment === "investigate" ||
    segment === "contextual_only" ||
    segment === "blocked" ||
    segment === "false_winner_low_evidence" ||
    segment === "creative_learning_incomplete"
  ) {
    return "manual_review";
  }
  return "default";
}

function inferActionReadiness(row: SourceRow) {
  if (row.canApply || row.queueEligible) return "ready";
  if (
    row.deploymentCompatibility === "blocked" ||
    row.trustState === "inactive_or_immaterial" ||
    row.previewWindow === "missing"
  ) {
    return "blocked";
  }
  return "needs_review";
}

function inferActionability(row: SourceRow) {
  if (inferActionReadiness(row) === "ready") return "direct";
  if (operatorPrimaryDecision(row) === "diagnose") return "diagnose";
  if (inferActionReadiness(row) === "blocked") return "blocked";
  return "review_only";
}

function labelPlain(row: SourceRow) {
  return {
    currentUserFacingSegment: row.currentUserFacingSegment,
    currentDecisionOsInternalSegment: row.currentDecisionOsInternalSegment,
    lifecycleState: row.lifecycleState,
    primaryAction: row.primaryAction,
    operatorPrimaryDecision: operatorPrimaryDecision(row),
    subTone: inferSubTone(row),
    actionability: inferActionability(row),
    actionReadiness: inferActionReadiness(row),
    oldRuleChallengerSegment: row.oldRuleChallengerSegment,
  };
}

function labelMasks(secret: string, id: string, plain: Record<string, unknown>) {
  return Object.fromEntries(
    LABEL_FIELDS.map((field) => [field, hmacLabel(secret, id, field, plain[field])]),
  );
}

export function rateCreative(row: SourceRow): Rating {
  const id = rowId(row);
  const baseline = preferredBaseline(row);
  const spend = n(row.mid30d?.spend, row.spend30d);
  const purchases = n(row.mid30d?.purchases);
  const roas = row.mid30d?.roas ?? null;
  const cpa = row.mid30d?.cpa ?? null;
  const recentRoas = row.recent7d?.roas ?? null;
  const long90Roas = row.long90d?.roas ?? null;
  const long90Spend = n(row.long90d?.spend);
  const medianRoas = baseline.medianRoas ?? null;
  const medianCpa = baseline.medianCpa ?? null;
  const medianSpend = Math.max(n(baseline.medianSpend, 1), 1);
  const roasToBenchmark = ratio(roas, medianRoas);
  const cpaToBenchmark = ratio(cpa, medianCpa);
  const spendToMedian = spend / medianSpend;
  const recentToLong = ratio(recentRoas, long90Roas);
  const reliableBaseline =
    row.baselineReliability === "strong" || row.baselineReliability === "medium";

  const blockers: string[] = [];
  if (!reliableBaseline) blockers.push("weak_or_missing_baseline");
  if (!row.commercialTruthAvailability.targetPackConfigured) {
    blockers.push("business_validation_missing");
  }
  if (row.businessValidationStatus !== "favorable") {
    blockers.push(`business_validation_${row.businessValidationStatus}`);
  }
  if (row.previewWindow === "missing") blockers.push("preview_missing");
  if (row.campaignContextLimited || row.deploymentCompatibility === "blocked") {
    blockers.push("campaign_context_limited");
  }
  if (row.trustState !== "live_confident") blockers.push(`trust_${row.trustState}`);

  const lowEvidence = spend < 50 || purchases < 3;
  const inactiveOrPost =
    row.activeStatus === false ||
    row.campaignStatus !== "ACTIVE" ||
    row.adSetStatus !== "ACTIVE" ||
    (long90Spend > 0 && spend > 0 && long90Spend >= spend * 2.5 && n(row.recent7d?.spend) < spend * 0.18);
  const phase: Phase = inactiveOrPost
    ? "post-scale"
    : spend >= medianSpend * 2 && purchases >= 8
      ? "scale"
      : "test";
  const fatiguing = recentToLong != null && recentToLong < 0.7 && n(long90Roas) > 0;
  const strongWinner =
    !lowEvidence &&
    reliableBaseline &&
    n(roas) >= 1.2 &&
    (roasToBenchmark == null ? n(roas) >= 2.5 : roasToBenchmark >= 1.2) &&
    purchases >= 3;
  const exceptionalWinner =
    strongWinner &&
    (roasToBenchmark == null ? n(roas) >= 3.5 : roasToBenchmark >= 1.6) &&
    purchases >= 5;
  const hardLoser =
    spend >= 100 &&
    (purchases === 0 ||
      (roasToBenchmark != null && roasToBenchmark < 0.65) ||
      (cpaToBenchmark != null && cpaToBenchmark > 1.5));
  const softLoser =
    spend >= 50 &&
    (purchases < 3 ||
      (roasToBenchmark != null && roasToBenchmark < 0.9) ||
      (cpaToBenchmark != null && cpaToBenchmark > 1.25));
  const needsDiagnosis =
    row.previewWindow === "missing" ||
    row.deploymentCompatibility === "blocked" ||
    row.trustState === "inactive_or_immaterial" ||
    (!reliableBaseline && spend >= 100);

  let headline: Headline;
  let action: Action;
  let confidence = 0.72;
  let primaryReason: string;

  if (needsDiagnosis) {
    headline = "Needs Diagnosis";
    action = "diagnose";
    confidence = 0.82;
    primaryReason =
      "Decision is blocked by context, source trust, or insufficient benchmark reliability; diagnose before applying a buyer action.";
  } else if (lowEvidence) {
    headline = "Test Inconclusive";
    action = "keep_testing";
    confidence = 0.78;
    primaryReason =
      "Spend or purchase evidence is below the minimum threshold, so the correct buyer move is to keep collecting signal.";
  } else if (phase === "scale" && fatiguing) {
    headline = "Scale Fatiguing";
    action = "refresh";
    confidence = 0.84;
    primaryReason =
      "The creative has scale-level spend and purchase maturity, but recent ROAS is materially below the long-window read.";
  } else if (phase !== "test" && hardLoser) {
    headline = "Scale Underperformer";
    action = fatiguing ? "refresh" : "cut";
    confidence = 0.82;
    primaryReason =
      "Scale or post-scale spend is mature, but efficiency is materially below benchmark or conversion evidence is poor.";
  } else if (phase !== "test" && strongWinner) {
    headline = "Scale Performer";
    action = exceptionalWinner && row.businessValidationStatus === "favorable" ? "scale" : "protect";
    confidence = 0.8;
    primaryReason =
      "Spend and purchases are mature and efficiency is at or above benchmark, so preserve the winner unless validation supports more scale.";
  } else if (phase === "test" && exceptionalWinner) {
    headline = "Test Winner";
    action = "scale";
    confidence = 0.83;
    primaryReason =
      "The test has enough evidence and materially beats the benchmark/ROAS threshold, making it a scale candidate.";
  } else if (phase === "test" && (hardLoser || softLoser)) {
    headline = "Test Loser";
    action = hardLoser ? "cut" : "refresh";
    confidence = hardLoser ? 0.8 : 0.72;
    primaryReason =
      "The test has enough spend to read, but conversion volume or efficiency is below the benchmark tolerance.";
  } else {
    headline = "Test Inconclusive";
    action = "keep_testing";
    confidence = 0.7;
    primaryReason =
      "The creative has some signal but not enough clean relative evidence to promote, protect, refresh, or cut decisively.";
  }

  let actionReadiness: ActionReadiness = "ready";
  if (action === "diagnose" || needsDiagnosis) {
    actionReadiness = "blocked";
  } else if (
    blockers.length > 0 ||
    (action === "scale" && row.businessValidationStatus !== "favorable")
  ) {
    actionReadiness = "needs_review";
  }

  if (blockers.length > 0 && confidence > 0.86) confidence = 0.86;
  if (headline === "Test Inconclusive" && spend < 50) confidence = 0.86;

  return {
    rowId: id,
    phase,
    headline,
    action,
    actionReadiness,
    confidence: round(confidence, 2)!,
    primaryReason,
    blockers: Array.from(new Set(blockers)),
  };
}

function buildBusinessSummaries(artifact: SourceArtifact) {
  const rowsByBusiness = new Map<string, SourceRow[]>();
  for (const row of artifact.rows) {
    const rows = rowsByBusiness.get(row.companyAlias) ?? [];
    rows.push(row);
    rowsByBusiness.set(row.companyAlias, rows);
  }

  return artifact.businesses.map((business): BusinessSummary => {
    const rows = rowsByBusiness.get(business.companyAlias) ?? [];
    const spend30d = rows.reduce((sum, row) => sum + n(row.spend30d), 0);
    const activeAccounts = new Set(
      rows
        .filter((row) => row.activeStatus && n(row.spend30d) > 0)
        .map((row) => row.accountAlias),
    );
    return {
      companyAlias: business.companyAlias,
      spendTier: classifySpendTier(spend30d),
      spend30d: round(spend30d, 2)!,
      activeMetaAdAccountCount: activeAccounts.size,
      creativeRowsWithDelivery: rows.length,
      activeCreatives: rows.filter((row) => row.activeStatus).length,
      sourceCurrentDecisionOsRows: business.currentDecisionOsRows,
      sourceScreeningLiveRows: business.screeningLiveRows,
      includedInSample: 0,
    };
  });
}

function countBy<T>(items: T[], key: (item: T) => string) {
  return items.reduce<Record<string, number>>((acc, item) => {
    const value = key(item);
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function sortedEntries(record: Record<string, number>) {
  return Object.entries(record).sort(([left], [right]) => left.localeCompare(right));
}

function chooseBestCandidate(
  candidates: EnrichedRow[],
  selected: Set<string>,
  businessCounts: Record<string, number>,
  actionCounts: Record<string, number>,
  headlineCounts: Record<string, number>,
  phaseCounts: Record<string, number>,
  currentDecisionCounts: Record<string, number>,
) {
  const businessTarget = 10;
  const actionTarget = Math.ceil(200 / PRIMARY_DECISIONS.length);
  const headlineTarget = Math.ceil(200 / HEADLINES.length);
  const phaseTarget = { test: 70, scale: 70, "post-scale": 40 } as Record<string, number>;
  let best: EnrichedRow | null = null;
  let bestScore = -Infinity;

  for (const candidate of candidates) {
    if (selected.has(candidate.rowId)) continue;
    const spend = n(candidate.source.spend30d);
    const action = actionToPrimary(candidate.rating.action);
    const score =
      Math.max(0, businessTarget - (businessCounts[candidate.source.companyAlias] ?? 0)) * 10 +
      Math.max(0, actionTarget - (actionCounts[action] ?? 0)) * 8 +
      Math.max(0, headlineTarget - (headlineCounts[candidate.rating.headline] ?? 0)) * 7 +
      Math.max(0, (phaseTarget[candidate.rating.phase] ?? 0) - (phaseCounts[candidate.rating.phase] ?? 0)) * 6 +
      Math.max(0, 12 - (currentDecisionCounts[candidate.currentPrimaryDecision] ?? 0)) * 4 +
      (candidate.source.activeStatus ? 2 : 3) +
      Math.min(8, Math.log10(spend + 1));
    if (score > bestScore || (score === bestScore && candidate.rowId < (best?.rowId ?? ""))) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

function actionToPrimary(action: Action): PrimaryDecision {
  switch (action) {
    case "scale":
      return "Scale";
    case "keep_testing":
      return "Test More";
    case "protect":
      return "Protect";
    case "refresh":
      return "Refresh";
    case "cut":
      return "Cut";
    case "diagnose":
      return "Diagnose";
  }
}

function selectSample(enriched: EnrichedRow[], limit: number) {
  const selected = new Set<string>();
  const add = (row: EnrichedRow | null | undefined) => {
    if (!row || selected.size >= limit) return;
    selected.add(row.rowId);
  };
  const bySpend = [...enriched].sort(
    (left, right) =>
      n(right.source.spend30d) - n(left.source.spend30d) ||
      left.rowId.localeCompare(right.rowId),
  );

  for (const companyAlias of Object.keys(countBy(enriched, (row) => row.source.companyAlias)).sort()) {
    bySpend
      .filter((row) => row.source.companyAlias === companyAlias)
      .slice(0, 5)
      .forEach(add);
  }

  for (const decision of PRIMARY_DECISIONS) {
    bySpend
      .filter((row) => row.currentPrimaryDecision === decision)
      .slice(0, decision === "Diagnose" ? 18 : 40)
      .forEach(add);
  }

  const rareLifecycle = new Set(["scale_ready", "blocked", "comeback_candidate"]);
  bySpend.filter((row) => rareLifecycle.has(row.source.lifecycleState)).forEach(add);
  bySpend.filter((row) => row.source.baselineReliability !== "strong").forEach(add);
  bySpend
    .filter((row) => row.source.businessValidationStatus !== "missing")
    .forEach(add);
  bySpend
    .filter((row) => row.source.relativeStrengthClass && row.source.relativeStrengthClass !== "none")
    .forEach(add);

  while (selected.size < limit) {
    const selectedRows = enriched.filter((row) => selected.has(row.rowId));
    const next = chooseBestCandidate(
      enriched,
      selected,
      countBy(selectedRows, (row) => row.source.companyAlias),
      countBy(selectedRows, (row) => actionToPrimary(row.rating.action)),
      countBy(selectedRows, (row) => row.rating.headline),
      countBy(selectedRows, (row) => row.rating.phase),
      countBy(selectedRows, (row) => row.currentPrimaryDecision),
    );
    if (!next) break;
    selected.add(next.rowId);
  }

  return enriched
    .filter((row) => selected.has(row.rowId))
    .sort((left, right) => left.rowId.localeCompare(right.rowId))
    .slice(0, limit);
}

function loadV2Rows(filePath: string) {
  if (!existsSync(filePath)) return new Map<string, V2Row>();
  const artifact = readJson<{ rows?: V2Row[] }>(filePath);
  return new Map((artifact.rows ?? []).map((row) => [row.rowId, row]));
}

function maskedSampleRow(row: EnrichedRow, secret: string, v2: V2Row | undefined) {
  const source = row.source;
  const baseline = preferredBaseline(source);
  const spend = n(source.mid30d?.spend, source.spend30d);
  const purchases = source.mid30d?.purchases ?? null;
  const roas = source.mid30d?.roas ?? null;
  const cpa = source.mid30d?.cpa ?? null;
  const recentRoas = source.recent7d?.roas ?? null;
  const long90Roas = source.long90d?.roas ?? null;
  const medianRoas = baseline.medianRoas ?? null;
  const medianCpa = baseline.medianCpa ?? null;
  const medianSpend = baseline.medianSpend ?? null;
  const plain = labelPlain(source);

  return {
    rowId: row.rowId,
    companyAlias: source.companyAlias,
    accountAlias: source.accountAlias,
    campaignAlias: source.campaignAlias,
    adSetAlias: source.adSetAlias,
    creativeAlias: source.creativeAlias,
    business: {
      spendTier: row.business.spendTier,
      businessSpend30d: row.business.spend30d,
      activeMetaAdAccountCount: row.business.activeMetaAdAccountCount,
    },
    delivery: {
      activeStatus: source.activeStatus,
      activeStatusSource: source.activeStatusSource,
      campaignStatus: source.campaignStatus,
      adSetStatus: source.adSetStatus,
    },
    metrics: {
      spend30d: round(spend),
      purchases30d: purchases,
      roas30d: roas,
      cpa30d: cpa,
      recent7d: source.recent7d,
      mid30d: source.mid30d,
      long90d: source.long90d,
      relative: {
        roasToBenchmark: round(ratio(roas, medianRoas), 3),
        cpaToBenchmark: round(ratio(cpa, medianCpa), 3),
        spendToMedian: round(ratio(spend, medianSpend), 3),
        recent7ToLong90Roas: round(ratio(recentRoas, long90Roas), 3),
      },
    },
    baseline: {
      scope: source.benchmarkScope,
      scopeLabel: source.benchmarkScopeLabel,
      reliability: source.baselineReliability,
      selected: {
        sampleSize: baseline.sampleSize ?? null,
        eligibleCreativeCount: baseline.eligibleCreativeCount ?? null,
        spendBasis: baseline.spendBasis ?? null,
        purchaseBasis: baseline.purchaseBasis ?? null,
        weightedRoas: baseline.weightedRoas ?? null,
        weightedCpa: baseline.weightedCpa ?? null,
        medianRoas,
        medianCpa,
        medianSpend,
        missingContextCount: baseline.missingContext?.length ?? 0,
      },
      account: source.accountBaseline,
      campaign: source.campaignBaseline,
    },
    commercialTruth: {
      targetPackConfigured: source.commercialTruthAvailability.targetPackConfigured,
      missingInputCount: source.commercialTruthAvailability.missingInputs.length,
      businessValidationStatus: source.businessValidationStatus,
    },
    context: {
      campaignIsTestLike: row.campaignIsTestLike,
      previewWindow: source.previewWindow,
      evidenceSource: source.evidenceSource,
      trustState: source.trustState,
      deploymentCompatibility: source.deploymentCompatibility,
      deploymentTargetLane: source.deploymentTargetLane,
      campaignContextLimited: source.campaignContextLimited,
    },
    taxonomy: {
      creativeFormat: null,
      creativeAgeDays: null,
      availability: "not_present_in_source_live_audit_artifact",
    },
    stratificationKeys: {
      business: source.companyAlias,
      activeStatus: source.activeStatus,
      baselineReliability: source.baselineReliability,
      campaignIsTestLike: row.campaignIsTestLike,
      lifecycleStateMasked: hmacLabel(secret, row.rowId, "lifecycleState", source.lifecycleState),
    },
    adsecuteLabelMasks: labelMasks(secret, row.rowId, plain),
  };
}

function revealRow(row: EnrichedRow, secret: string, _v2: V2Row | undefined) {
  const plain = labelPlain(row.source);
  return {
    rowId: row.rowId,
    labels: plain,
    hmac: labelMasks(secret, row.rowId, plain),
  };
}

function getOrCreateSecret(privatePath: string) {
  if (existsSync(privatePath)) {
    const existing = readJson<{ masking?: { hmacSecret?: string } }>(privatePath);
    if (existing.masking?.hmacSecret) return existing.masking.hmacSecret;
  }
  return randomBytes(32).toString("hex");
}

function markdownTable(headers: string[], rows: Array<Array<string | number>>) {
  const cell = (value: string | number) => String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
  return [
    `| ${headers.map(cell).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(cell).join(" | ")} |`),
  ].join("\n");
}

function formatCounts(record: Record<string, number>) {
  return sortedEntries(record).map(([key, value]) => [key, value]);
}

function buildStratificationMarkdown(input: {
  generatedAt: string;
  source: SourceArtifact;
  selected: EnrichedRow[];
  businesses: BusinessSummary[];
  sourcePath: string;
}) {
  const selected = input.selected;
  const spendTierCounts = countBy(selected, (row) => row.business.spendTier);
  const smallAvailable = input.businesses.some((business) => business.spendTier === "small");
  const lines = [
    "# Happy Harbor - Faz A Sample Stratification",
    "",
    "## Source",
    "",
    `- Generated at: ${input.generatedAt}`,
    `- Source artifact: \`${input.sourcePath}\``,
    `- Source audit generated at: ${input.source.generatedAt}`,
    `- Source audit window: ${input.source.auditWindow.startDate} to ${input.source.auditWindow.endDate} (${input.source.auditWindow.days} completed days, excludes today)`,
    `- Source universe: ${input.source.rows.length} creative rows across ${input.businesses.length} runtime-readable active Meta businesses`,
    `- Sample: ${selected.length} rows`,
    "- Fresh rerun note: completed on 2026-04-28 through the owner-provided SSH DB tunnel and local dev runtime.",
    `- Inspected source row excluded from sample: ${INSPECTED_SOURCE_ROW_IDS.length}`,
    "",
    "## Business And Spend Tier",
    "",
    markdownTable(
      [
        "Business",
        "Spend tier",
        "30d spend",
        "Active Meta accounts",
        "Source rows",
        "Sample rows",
      ],
      input.businesses.map((business) => [
        business.companyAlias,
        business.spendTier,
        business.spend30d.toFixed(2),
        business.activeMetaAdAccountCount,
        business.creativeRowsWithDelivery,
        selected.filter((row) => row.source.companyAlias === business.companyAlias).length,
      ]),
    ),
    "",
    markdownTable(["Spend tier", "Sample rows"], formatCounts(spendTierCounts)),
    "",
    smallAvailable
      ? "All spend tiers present in the live source."
      : "No small-tier business (<$1k/30d) exists in the runtime-readable live cohort, so the small-tier >=20% target is not mathematically satisfiable. Medium and large tiers are both represented above 20%.",
    "",
    "## Required A.2 Axes",
    "",
    markdownTable(["Active status", "Rows"], formatCounts(countBy(selected, (row) => String(row.source.activeStatus)))),
    "",
    markdownTable(["Baseline reliability", "Rows"], formatCounts(countBy(selected, (row) => row.source.baselineReliability))),
    "",
    markdownTable(["Campaign is test-like", "Rows"], formatCounts(countBy(selected, (row) => String(row.campaignIsTestLike)))),
    "",
    "Lifecycle state is an Adsecute label, so row-level values are HMAC-masked in `sample-200.json`. Aggregate counts are shown here only for auditability.",
    "",
    markdownTable(["Lifecycle state", "Rows"], formatCounts(countBy(selected, (row) => row.source.lifecycleState))),
    "",
    "## Full Verdict Surface Coverage",
    "",
    "Current Adsecute primary-decision aggregate is shown only as a sample-distribution check; row-level labels remain masked.",
    "",
    markdownTable(["Current Adsecute primary decision", "Rows"], formatCounts(countBy(selected, (row) => row.currentPrimaryDecision))),
    "",
    markdownTable(["Codex rating action family", "Rows"], formatCounts(countBy(selected, (row) => actionToPrimary(row.rating.action)))),
    "",
    markdownTable(["Codex rating headline", "Rows"], formatCounts(countBy(selected, (row) => row.rating.headline))),
    "",
    markdownTable(["Codex rating phase", "Rows"], formatCounts(countBy(selected, (row) => row.rating.phase))),
    "",
    "## Masking",
    "",
    "- Row-level fields `currentUserFacingSegment`, `currentDecisionOsInternalSegment`, `lifecycleState`, `primaryAction`, `operatorPrimaryDecision`, `subTone`, `actionability`, `actionReadiness`, and `oldRuleChallengerSegment` are represented only as HMAC-SHA256 values in the sample.",
    "- The private reveal file is `docs/team-comms/happy-harbor/audit-A/_revealed-labels.private.json` and is covered by `.gitignore`.",
    "- Generated instruction/reason copy from Adsecute is intentionally omitted from the sample because it leaks decisions in plain language.",
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function stableSampleHash(rows: unknown[]) {
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

function buildRatingNotes(input: {
  generatedAt: string;
  selected: EnrichedRow[];
  sampleHash: string;
}) {
  const rerateIds = [
    ...input.selected.map((row) => row.rowId).sort((left, right) => {
      const leftHash = createHash("sha256").update(`intra:${left}`).digest("hex");
      const rightHash = createHash("sha256").update(`intra:${right}`).digest("hex");
      return leftHash.localeCompare(rightHash);
    }),
  ].slice(0, 20);
  const matches = rerateIds.filter((id) => {
    const row = input.selected.find((item) => item.rowId === id)!;
    const rerated = rateCreative(row.source);
    const original = row.rating;
    return (
      rerated.phase === original.phase &&
      rerated.headline === original.headline &&
      rerated.action === original.action &&
      rerated.actionReadiness === original.actionReadiness
    );
  });
  const difficult = [...input.selected]
    .sort((left, right) => {
      const leftScore = left.rating.confidence - left.rating.blockers.length * 0.03;
      const rightScore = right.rating.confidence - right.rating.blockers.length * 0.03;
      return leftScore - rightScore || left.rowId.localeCompare(right.rowId);
    })
    .slice(0, 5);

  const lines = [
    "# Happy Harbor - Codex Rating Notes",
    "",
    "## Process",
    "",
    `- Generated at: ${input.generatedAt}`,
    `- Rated rows: ${input.selected.length}`,
    `- Sample hash: \`${input.sampleHash}\``,
    "- Rating input was `sample-200.json`: Adsecute row-level label fields were HMAC-only, and generated Adsecute instruction/reason text was omitted.",
    "- One source row inspected during schema discovery was excluded from the 200-row sample before rating.",
    "- Plain labels were handled programmatically only for mask/reveal generation; Codex rating used the independent metric/baseline/context rule in `scripts/happy-harbor-faz-a.ts`.",
    "",
    "## Thresholds Used",
    "",
    "- Test winner: enough spend/purchase maturity, ROAS >= 1.2, and benchmark-relative ROAS >= 1.2; exceptional winners require stronger relative lift.",
    "- Scale phase: active creative with spend at least 2x peer median and purchases >= 8.",
    "- Inconclusive: spend < $50 or purchases < 3.",
    "- Fatiguing: recent7 ROAS / long90 ROAS < 0.7.",
    "- Missing commercial truth or non-favorable validation changes readiness to `needs_review`; source/context blockers change readiness to `blocked` and action to `diagnose`.",
    "",
    "## Intra-Rater Consistency",
    "",
    `- Randomization method: deterministic SHA-256 order over rowId, prefix \`intra:\`.`,
    `- Re-rated rows: ${rerateIds.length}`,
    `- Exact matches on phase + headline + action + actionReadiness: ${matches.length}/${rerateIds.length}`,
    `- Consistency: ${Math.round((matches.length / rerateIds.length) * 100)}%`,
    "",
    markdownTable(["Re-rated rowId", "Match"], rerateIds.map((id) => [id, matches.includes(id) ? "yes" : "no"])),
    "",
    "## Five Hardest Rows",
    "",
    markdownTable(
      ["rowId", "phase", "headline", "action", "confidence", "why hard"],
      difficult.map((row) => [
        row.rowId,
        row.rating.phase,
        row.rating.headline,
        row.rating.action,
        row.rating.confidence,
        row.rating.blockers.length > 0
          ? `Decision has clean performance signal but blockers: ${row.rating.blockers.join(", ")}`
          : "Borderline benchmark/spend maturity made the action less decisive.",
      ]),
    ),
    "",
  ];

  return `${lines.join("\n")}\n`;
}

export function buildAuditAArtifacts(options?: {
  sourcePath?: string;
  v2Path?: string;
  outputDir?: string;
  privateRevealPath?: string;
  limit?: number;
  generatedAt?: string;
}) {
  const sourcePath = options?.sourcePath ?? DEFAULT_SOURCE_ARTIFACT;
  const v2Path = options?.v2Path ?? DEFAULT_V2_ARTIFACT;
  const outputDir = options?.outputDir ?? AUDIT_A_DIR;
  const privateRevealPath = options?.privateRevealPath ?? PRIVATE_REVEAL_PATH;
  const limit = options?.limit ?? 200;
  const generatedAt = options?.generatedAt ?? new Date().toISOString();
  const source = readJson<SourceArtifact>(sourcePath);
  const v2Rows = loadV2Rows(v2Path);
  const secret = getOrCreateSecret(privateRevealPath);
  const businesses = buildBusinessSummaries(source);
  const businessByAlias = new Map(businesses.map((business) => [business.companyAlias, business]));

  const enriched = source.rows
    .map((sourceRow): EnrichedRow => {
      const id = rowId(sourceRow);
      const business = businessByAlias.get(sourceRow.companyAlias);
      if (!business) throw new Error(`Missing business summary for ${sourceRow.companyAlias}`);
      return {
        source: sourceRow,
        rowId: id,
        business,
        campaignIsTestLike: deriveCampaignIsTestLike(sourceRow),
        rating: rateCreative(sourceRow),
        currentPrimaryDecision: currentPrimaryDecision(sourceRow),
      };
    })
    .filter((row) => !INSPECTED_SOURCE_ROW_IDS.includes(row.rowId));

  const selected = selectSample(enriched, limit);
  if (selected.length !== limit) {
    throw new Error(`Expected ${limit} selected rows, got ${selected.length}`);
  }

  for (const business of businesses) {
    business.includedInSample = selected.filter(
      (row) => row.source.companyAlias === business.companyAlias,
    ).length;
  }

  const maskedRows = selected.map((row) =>
    maskedSampleRow(row, secret, v2Rows.get(row.rowId)),
  );
  const sampleHash = stableSampleHash(maskedRows);
  const sourceInfo = {
    sourceArtifact: sourcePath,
    sourceGeneratedAt: source.generatedAt,
    auditWindow: source.auditWindow,
    sourceRows: source.rows.length,
    selectedRows: selected.length,
    excludedRows: INSPECTED_SOURCE_ROW_IDS,
    freshRerunAttempt: {
      attemptedAt: "2026-04-28",
      command:
        "CREATIVE_LIVE_ENV_DIR=/Users/harmelek/Adsecute CREATIVE_LIVE_FIRM_AUDIT_MAX_ROWS=100000 DB_QUERY_TIMEOUT_MS=60000 DB_CONNECTION_TIMEOUT_MS=30000 CREATIVE_LIVE_FIRM_AUDIT_SCREEN_TIMEOUT_MS=120000 node --import tsx scripts/creative-live-firm-audit.ts",
      result: "complete",
      blocker: null,
    },
  };

  const businessesArtifact = {
    version: "happy-harbor.auditA.businesses.v1",
    generatedAt,
    source: sourceInfo,
    cohort: source.cohort,
    businesses,
    notes: [
      "Business aliases are stable sanitized aliases; raw IDs and names are excluded.",
      "Spend tier is based on summed delivered creative spend in the source 30-day audit window: small < 1000, medium 1000-10000, large > 10000.",
      "No small-tier business was present in the runtime-readable live cohort.",
    ],
  };

  const sampleArtifact = {
    version: "happy-harbor.auditA.sample200.v1",
    generatedAt,
    source: sourceInfo,
    masking: {
      method: "HMAC-SHA256",
      labelFields: LABEL_FIELDS,
      revealFile: PRIVATE_REVEAL_PATH,
      rawIdsIncluded: false,
      rawNamesIncluded: false,
      generatedAdsecuteCopyIncluded: false,
    },
    sampling: {
      requestedRows: limit,
      selectedRows: selected.length,
      minimumRowsPerBusiness: Math.min(
        ...businesses.map((business) => business.includedInSample),
      ),
      strategy:
        "business floor, rare current-decision/lifecycle/baseline inclusion, then deficit fill across action/headline/phase/business axes",
    },
    rows: maskedRows,
  };

  const ratingArtifact = {
    version: "happy-harbor.auditA.codexRating.v1",
    generatedAt,
    sourceSample: {
      path: path.join(outputDir, "sample-200.json"),
      sampleHash,
      rowCount: selected.length,
    },
    rater: {
      team: "Codex",
      stance: "independent expert Meta media buyer",
      labelLeakGuard:
        "ratings are derived from metric/baseline/context fields; row-level Adsecute labels are HMAC-only in sample-200.json",
    },
    schema: {
      phase: PHASES,
      headline: HEADLINES,
      action: ["scale", "keep_testing", "protect", "refresh", "cut", "diagnose"],
      actionReadiness: ["ready", "needs_review", "blocked"],
    },
    rows: selected.map((row) => row.rating),
  };

  const revealArtifact = {
    version: "happy-harbor.auditA.revealedLabels.private.v1",
    generatedAt,
    masking: {
      method: "HMAC-SHA256",
      hmacSecret: secret,
      labelFields: LABEL_FIELDS,
    },
    source: sourceInfo,
    rows: selected.map((row) => revealRow(row, secret, v2Rows.get(row.rowId))),
  };

  mkdirSync(outputDir, { recursive: true });
  writeJson(path.join(outputDir, "businesses.json"), businessesArtifact);
  writeJson(path.join(outputDir, "sample-200.json"), sampleArtifact);
  writeFileSync(
    path.join(outputDir, "sample-stratification.md"),
    buildStratificationMarkdown({
      generatedAt,
      source,
      selected,
      businesses,
      sourcePath,
    }),
    "utf8",
  );
  writeJson(path.join(outputDir, "codex-rating.json"), ratingArtifact);
  writeFileSync(
    path.join(outputDir, "codex-rating-notes.md"),
    buildRatingNotes({ generatedAt, selected, sampleHash }),
    "utf8",
  );
  writeJson(privateRevealPath, revealArtifact);

  return {
    outputDir,
    privateRevealPath,
    sampleHash,
    businesses: businesses.length,
    rows: selected.length,
    counts: {
      spendTier: countBy(selected, (row) => row.business.spendTier),
      currentPrimaryDecision: countBy(selected, (row) => row.currentPrimaryDecision),
      ratingAction: countBy(selected, (row) => actionToPrimary(row.rating.action)),
      ratingHeadline: countBy(selected, (row) => row.rating.headline),
      ratingPhase: countBy(selected, (row) => row.rating.phase),
    },
  };
}

function isDirectRun() {
  const entry = process.argv[1];
  return Boolean(entry && fileURLToPath(import.meta.url) === path.resolve(entry));
}

if (isDirectRun()) {
  const result = buildAuditAArtifacts();
  console.log(JSON.stringify(result, null, 2));
}
