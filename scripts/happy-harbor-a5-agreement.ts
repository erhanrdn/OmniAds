import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyV2MismatchSeverity,
  type CreativeDecisionOsV2MismatchSeverity,
} from "@/lib/creative-decision-os-v2-evaluation";
import type { CreativeDecisionOsV2PrimaryDecision } from "@/lib/creative-decision-os-v2";

const AUDIT_DIR = "docs/team-comms/happy-harbor/audit-A";
const SAMPLE_PATH = path.join(AUDIT_DIR, "sample-200.json");
const CODEX_RATING_PATH = path.join(AUDIT_DIR, "codex-rating.json");
const CLAUDE_RATING_PATH = path.join(AUDIT_DIR, "claude-rating.json");
const REVEAL_PATH = path.join(AUDIT_DIR, "_revealed-labels.private.json");
const AGREEMENT_DATA_PATH = path.join(AUDIT_DIR, "agreement-data.json");
const AGREEMENT_REPORT_PATH = path.join(AUDIT_DIR, "agreement-report.md");

const HEADLINES = [
  "Test Winner",
  "Test Loser",
  "Test Inconclusive",
  "Scale Performer",
  "Scale Underperformer",
  "Scale Fatiguing",
  "Needs Diagnosis",
] as const;

const ACTIONS = [
  "scale",
  "keep_testing",
  "protect",
  "refresh",
  "cut",
  "diagnose",
] as const;

const READINESS = ["ready", "needs_review", "blocked"] as const;
const PHASES = ["test", "scale", "post-scale"] as const;
const SEVERITIES = ["none", "low", "medium", "high", "severe"] as const;
const PAIRS = [
  ["adsecute", "codex"],
  ["adsecute", "claude"],
  ["codex", "claude"],
] as const;

type Headline = (typeof HEADLINES)[number];
type Action = (typeof ACTIONS)[number];
type Readiness = (typeof READINESS)[number];
type Phase = (typeof PHASES)[number];
type RaterKey = "adsecute" | "codex" | "claude";
type Axis = "headline" | "action" | "actionReadiness";

type Rating = {
  rowId: string;
  phase: Phase;
  headline: Headline;
  action: Action;
  actionReadiness: Readiness;
  confidence: number | null;
  primaryReason: string;
  blockers: string[];
};

type SampleRow = {
  rowId: string;
  companyAlias: string;
  accountAlias: string;
  campaignAlias: string;
  adSetAlias: string;
  creativeAlias: string;
  business: {
    spendTier: string;
    businessSpend30d: number;
    activeMetaAdAccountCount: number;
  };
  delivery: {
    activeStatus: boolean;
    campaignStatus: string | null;
    adSetStatus: string | null;
  };
  metrics: {
    spend30d: number | null;
    purchases30d: number | null;
    roas30d: number | null;
    cpa30d: number | null;
    recent7d: { roas?: number | null; purchases?: number | null; spend?: number | null } | null;
    long90d: { roas?: number | null; purchases?: number | null; spend?: number | null } | null;
    relative: {
      roasToBenchmark: number | null;
      cpaToBenchmark: number | null;
      spendToMedian: number | null;
      recent7ToLong90Roas: number | null;
    };
  };
  baseline: {
    reliability: string;
    selected: {
      medianRoas: number | null;
      medianCpa: number | null;
      medianSpend: number | null;
    };
  };
  commercialTruth: {
    targetPackConfigured: boolean;
    missingInputCount: number;
    businessValidationStatus: string;
  };
  context: {
    campaignIsTestLike: boolean;
    previewWindow: string | null;
    evidenceSource: string;
    trustState: string;
    deploymentCompatibility: string;
    campaignContextLimited: boolean;
  };
  adsecuteLabelMasks: Record<string, string | null>;
};

type RevealRow = {
  rowId: string;
  labels: {
    currentUserFacingSegment: string | null;
    currentDecisionOsInternalSegment: string | null;
    lifecycleState: string | null;
    primaryAction: string | null;
    operatorPrimaryDecision: string | null;
    subTone: string | null;
    actionability: string | null;
    actionReadiness: string | null;
    oldRuleChallengerSegment: string | null;
  };
  hmac: Record<string, string | null>;
};

type Matrix = Record<string, Record<string, number>>;

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function writeJson(filePath: string, value: unknown) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function round(value: number, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function pct(value: number) {
  return `${round(value * 100, 2)}%`;
}

function mdCell(value: string | number | null | undefined) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function markdownTable(headers: string[], rows: Array<Array<string | number | null | undefined>>) {
  return [
    `| ${headers.map(mdCell).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(mdCell).join(" | ")} |`),
  ].join("\n");
}

function zeroMatrix(rowCategories: readonly string[], colCategories = rowCategories): Matrix {
  return Object.fromEntries(
    rowCategories.map((row) => [
      row,
      Object.fromEntries(colCategories.map((col) => [col, 0])),
    ]),
  );
}

function confusionMatrix<T extends string>(
  rows: Array<Record<RaterKey, Rating>>,
  left: RaterKey,
  right: RaterKey,
  axis: Axis,
  categories: readonly T[],
) {
  const matrix = zeroMatrix(categories);
  let matches = 0;
  for (const row of rows) {
    const leftValue = row[left][axis];
    const rightValue = row[right][axis];
    matrix[leftValue][rightValue] += 1;
    if (leftValue === rightValue) matches += 1;
  }
  return {
    matrix,
    matches,
    total: rows.length,
    agreement: rows.length === 0 ? 0 : matches / rows.length,
  };
}

function cohenKappa<T extends string>(
  rows: Array<Record<RaterKey, Rating>>,
  left: RaterKey,
  right: RaterKey,
  axis: Axis,
  categories: readonly T[],
) {
  const matrixResult = confusionMatrix(rows, left, right, axis, categories);
  const total = matrixResult.total;
  if (total === 0) return { ...matrixResult, kappa: 0 };

  const observed = matrixResult.matches / total;
  const expected = categories.reduce((sum, category) => {
    const rowTotal = categories.reduce(
      (inner, col) => inner + matrixResult.matrix[category][col],
      0,
    );
    const colTotal = categories.reduce(
      (inner, row) => inner + matrixResult.matrix[row][category],
      0,
    );
    return sum + (rowTotal / total) * (colTotal / total);
  }, 0);
  const denominator = 1 - expected;
  const kappa = denominator === 0 ? (observed === 1 ? 1 : 0) : (observed - expected) / denominator;
  return {
    ...matrixResult,
    expectedAgreement: expected,
    kappa,
  };
}

function fleissKappa<T extends string>(
  rows: Array<Record<RaterKey, Rating>>,
  axis: Axis,
  categories: readonly T[],
) {
  const raters: RaterKey[] = ["adsecute", "codex", "claude"];
  const n = raters.length;
  const N = rows.length;
  if (N === 0) return { kappa: 0, observedAgreement: 0, expectedAgreement: 0 };

  const categoryTotals = Object.fromEntries(categories.map((category) => [category, 0]));
  let observedSum = 0;
  for (const row of rows) {
    const counts = Object.fromEntries(categories.map((category) => [category, 0]));
    for (const rater of raters) {
      const value = row[rater][axis] as T;
      counts[value] += 1;
      categoryTotals[value] += 1;
    }
    observedSum +=
      categories.reduce((sum, category) => sum + counts[category] ** 2, 0) - n;
  }

  const observedAgreement = observedSum / (N * n * (n - 1));
  const expectedAgreement = categories.reduce((sum, category) => {
    const proportion = categoryTotals[category] / (N * n);
    return sum + proportion ** 2;
  }, 0);
  const denominator = 1 - expectedAgreement;
  return {
    kappa:
      denominator === 0
        ? observedAgreement === 1
          ? 1
          : 0
        : (observedAgreement - expectedAgreement) / denominator,
    observedAgreement,
    expectedAgreement,
  };
}

function actionToV2Decision(action: Action): CreativeDecisionOsV2PrimaryDecision {
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

function normalizeAction(value: string | null | undefined): Action {
  switch (value) {
    case "scale":
      return "scale";
    case "test_more":
    case "keep_testing":
    case "watch":
      return "keep_testing";
    case "protect":
      return "protect";
    case "refresh":
      return "refresh";
    case "cut":
      return "cut";
    case "diagnose":
    default:
      return "diagnose";
  }
}

function normalizeReadiness(value: string | null | undefined): Readiness {
  if (value === "ready") return "ready";
  if (value === "blocked") return "blocked";
  return "needs_review";
}

function adsecutePhase(labels: RevealRow["labels"]): Phase {
  switch (labels.lifecycleState) {
    case "scale_ready":
    case "validating":
    case "incubating":
      return "test";
    case "stable_winner":
    case "fatigued_winner":
      return "scale";
    case "retired":
    case "comeback_candidate":
    case "blocked":
    default:
      return "post-scale";
  }
}

function adsecuteHeadline(labels: RevealRow["labels"]): Headline {
  const action = normalizeAction(labels.operatorPrimaryDecision);
  if (action === "diagnose" || labels.lifecycleState === "blocked") return "Needs Diagnosis";
  if (labels.lifecycleState === "scale_ready" || action === "scale") return "Test Winner";
  if (labels.lifecycleState === "stable_winner" || action === "protect") return "Scale Performer";
  if (labels.lifecycleState === "fatigued_winner" || labels.lifecycleState === "comeback_candidate") {
    return "Scale Fatiguing";
  }
  if (labels.lifecycleState === "retired" || action === "cut") return "Test Loser";
  if (action === "refresh") return "Scale Fatiguing";
  return "Test Inconclusive";
}

function adsecuteRating(reveal: RevealRow): Rating {
  const action = normalizeAction(reveal.labels.operatorPrimaryDecision);
  return {
    rowId: reveal.rowId,
    phase: adsecutePhase(reveal.labels),
    headline: adsecuteHeadline(reveal.labels),
    action,
    actionReadiness: normalizeReadiness(reveal.labels.actionReadiness),
    confidence: null,
    primaryReason: [
      `current=${reveal.labels.currentUserFacingSegment ?? "missing"}`,
      `lifecycle=${reveal.labels.lifecycleState ?? "missing"}`,
      `operator=${reveal.labels.operatorPrimaryDecision ?? "missing"}`,
      `subTone=${reveal.labels.subTone ?? "missing"}`,
    ].join("; "),
    blockers: reveal.labels.actionReadiness === "blocked" ? ["adsecute_action_blocked"] : [],
  };
}

function validateRating(row: Rating, rowId: string, rater: string) {
  const errors: string[] = [];
  if (row.rowId !== rowId) errors.push(`${rater}:${rowId}:rowId_mismatch`);
  if (!PHASES.includes(row.phase)) errors.push(`${rater}:${rowId}:bad_phase`);
  if (!HEADLINES.includes(row.headline)) errors.push(`${rater}:${rowId}:bad_headline`);
  if (!ACTIONS.includes(row.action)) errors.push(`${rater}:${rowId}:bad_action`);
  if (!READINESS.includes(row.actionReadiness)) errors.push(`${rater}:${rowId}:bad_readiness`);
  return errors;
}

function severityCounts(rows: Array<Record<RaterKey, Rating>>) {
  const result: Record<string, Record<CreativeDecisionOsV2MismatchSeverity, number>> = {};
  for (const [left, right] of PAIRS) {
    const key = `${left}_vs_${right}`;
    result[key] = { none: 0, low: 0, medium: 0, high: 0, severe: 0 };
    for (const row of rows) {
      const severity = classifyV2MismatchSeverity(
        actionToV2Decision(row[left].action),
        actionToV2Decision(row[right].action),
      );
      result[key][severity] += 1;
    }
  }
  return result;
}

function severityRank(severity: CreativeDecisionOsV2MismatchSeverity) {
  return { none: 0, low: 1, medium: 2, high: 3, severe: 4 }[severity];
}

function deepDiveRows(input: {
  joinedRows: Array<Record<RaterKey, Rating>>;
  sampleById: Map<string, SampleRow>;
}) {
  return input.joinedRows
    .map((ratings) => {
      const rowId = ratings.adsecute.rowId;
      const pairSeverities = PAIRS.map(([left, right]) => {
        const severity = classifyV2MismatchSeverity(
          actionToV2Decision(ratings[left].action),
          actionToV2Decision(ratings[right].action),
        );
        return {
          pair: `${left}_vs_${right}`,
          severity,
          leftAction: ratings[left].action,
          rightAction: ratings[right].action,
        };
      });
      const highOrSevere = pairSeverities.filter(
        (row) => row.severity === "high" || row.severity === "severe",
      );
      const sample = input.sampleById.get(rowId)!;
      return {
        rowId,
        maxSeverityRank: Math.max(...pairSeverities.map((row) => severityRank(row.severity))),
        highOrSevereCount: highOrSevere.length,
        pairSeverities,
        sample,
        ratings,
      };
    })
    .filter((row) => row.highOrSevereCount > 0)
    .sort(
      (left, right) =>
        right.maxSeverityRank - left.maxSeverityRank ||
        right.highOrSevereCount - left.highOrSevereCount ||
        (right.sample.metrics.spend30d ?? 0) - (left.sample.metrics.spend30d ?? 0) ||
        left.rowId.localeCompare(right.rowId),
    )
    .slice(0, 10)
    .map((row) => ({
      rowId: row.rowId,
      business: row.sample.companyAlias,
      aliases: {
        account: row.sample.accountAlias,
        campaign: row.sample.campaignAlias,
        adSet: row.sample.adSetAlias,
        creative: row.sample.creativeAlias,
      },
      performance: {
        spend30d: row.sample.metrics.spend30d,
        purchases30d: row.sample.metrics.purchases30d,
        roas30d: row.sample.metrics.roas30d,
        cpa30d: row.sample.metrics.cpa30d,
        recent7Roas: row.sample.metrics.recent7d?.roas ?? null,
        long90Roas: row.sample.metrics.long90d?.roas ?? null,
        roasToBenchmark: row.sample.metrics.relative.roasToBenchmark,
        recent7ToLong90Roas: row.sample.metrics.relative.recent7ToLong90Roas,
        baselineReliability: row.sample.baseline.reliability,
        businessValidationStatus: row.sample.commercialTruth.businessValidationStatus,
        trustState: row.sample.context.trustState,
      },
      pairSeverities: row.pairSeverities,
      ratings: row.ratings,
    }));
}

function buildReport(data: AgreementData) {
  const pairAxisRows: Array<Array<string | number>> = [];
  for (const [pair, axes] of Object.entries(data.pairwise)) {
    for (const axis of ["action", "headline", "actionReadiness"] as Axis[]) {
      pairAxisRows.push([
        pair,
        axis,
        axes[axis].matches,
        axes[axis].total,
        pct(axes[axis].agreement),
        round(axes[axis].kappa, 4),
      ]);
    }
  }

  const severityRows = Object.entries(data.severity.action).map(([pair, counts]) => [
    pair,
    counts.severe,
    counts.high,
    counts.medium,
    counts.low,
    counts.none,
  ]);

  const sections = [
    "# Happy Harbor - Faz A.5 Agreement Report",
    "",
    "## Summary",
    "",
    `- Generated at: ${data.generatedAt}`,
    `- Rows joined: ${data.integrity.rowCount}`,
    `- Reveal join: ${data.integrity.revealJoinMatched}/${data.integrity.rowCount}`,
    `- HMAC integrity: ${data.integrity.hmacMatched}/${data.integrity.expectedHmacChecks}`,
    `- Raters: Adsecute current labels, Codex rating, Claude rating`,
    "- Direction note: pair-wise severity uses the first rater as the reference argument to `classifyV2MismatchSeverity`; Adsecute is not treated as ground truth.",
    "",
    "## Kappa",
    "",
    markdownTable(["Pair", "Axis", "Matches", "Rows", "Agreement", "Cohen kappa"], pairAxisRows),
    "",
    markdownTable(
      ["Axis", "Fleiss kappa", "Observed agreement", "Expected agreement"],
      Object.entries(data.fleiss).map(([axis, value]) => [
        axis,
        round(value.kappa, 4),
        pct(value.observedAgreement),
        pct(value.expectedAgreement),
      ]),
    ),
    "",
    "## Action Severity",
    "",
    "Severity is computed on canonical action primary decisions with `classifyV2MismatchSeverity` from `lib/creative-decision-os-v2-evaluation.ts`.",
    "",
    markdownTable(["Pair", "Severe", "High", "Medium", "Low", "None"], severityRows),
    "",
    "## Confusion Matrices",
    "",
  ];

  for (const [pair, axes] of Object.entries(data.pairwise)) {
    sections.push(`### ${pair}`);
    sections.push("");
    for (const axis of ["action", "headline", "actionReadiness"] as Axis[]) {
      sections.push(`#### ${axis}`);
      sections.push("");
      const categories =
        axis === "action" ? ACTIONS : axis === "headline" ? HEADLINES : READINESS;
      sections.push(matrixMarkdown(axes[axis].matrix, categories, categories));
      sections.push("");
    }
  }

  sections.push("## Top-10 Severe/High Disagreements");
  sections.push("");
  sections.push(
    markdownTable(
      [
        "rowId",
        "business",
        "spend",
        "ROAS",
        "recent/long ROAS",
        "pair severities",
        "Adsecute",
        "Codex",
        "Claude",
      ],
      data.deepDives.map((row) => [
        row.rowId,
        row.business,
        row.performance.spend30d ?? "",
        row.performance.roas30d ?? "",
        row.performance.recent7ToLong90Roas ?? "",
        row.pairSeverities
          .filter((item) => item.severity === "high" || item.severity === "severe")
          .map((item) => `${item.pair}:${item.severity}`)
          .join(", "),
        compactRating(row.ratings.adsecute),
        compactRating(row.ratings.codex),
        compactRating(row.ratings.claude),
      ]),
    ),
  );
  sections.push("");
  sections.push("## Deep-Dive Notes");
  sections.push("");
  for (const row of data.deepDives) {
    sections.push(`### ${row.rowId}`);
    sections.push("");
    sections.push(
      `Business ${row.business}; spend ${row.performance.spend30d}; ROAS ${row.performance.roas30d}; recent/long ROAS ${row.performance.recent7ToLong90Roas}; validation ${row.performance.businessValidationStatus}; trust ${row.performance.trustState}.`,
    );
    sections.push("");
    sections.push(`- Adsecute: ${compactRating(row.ratings.adsecute)} — ${row.ratings.adsecute.primaryReason}`);
    sections.push(`- Codex: ${compactRating(row.ratings.codex)} — ${row.ratings.codex.primaryReason}`);
    sections.push(`- Claude: ${compactRating(row.ratings.claude)} — ${row.ratings.claude.primaryReason}`);
    sections.push(
      `- Severe/high pairs: ${row.pairSeverities
        .filter((item) => item.severity === "high" || item.severity === "severe")
        .map((item) => `${item.pair} ${item.leftAction}->${item.rightAction} (${item.severity})`)
        .join("; ")}`,
    );
    sections.push("");
  }

  return `${sections.join("\n")}\n`;
}

function matrixMarkdown(matrix: Matrix, rowCategories: readonly string[], colCategories: readonly string[]) {
  return markdownTable(
    ["ref \\ pred", ...colCategories],
    rowCategories.map((row) => [
      row,
      ...colCategories.map((col) => matrix[row]?.[col] ?? 0),
    ]),
  );
}

function compactRating(rating: Rating) {
  return `${rating.phase} / ${rating.headline} / ${rating.action} / ${rating.actionReadiness}${rating.confidence == null ? "" : ` / ${rating.confidence}`}`;
}

type AgreementData = ReturnType<typeof buildAgreementData>;

function buildAgreementData() {
  const generatedAt = new Date().toISOString();
  const sample = readJson<{ rows: SampleRow[]; masking: { labelFields: string[] } }>(SAMPLE_PATH);
  const codex = readJson<{ rows: Rating[] }>(CODEX_RATING_PATH);
  const claude = readJson<{ rows: Rating[] }>(CLAUDE_RATING_PATH);
  const reveal = readJson<{ rows: RevealRow[] }>(REVEAL_PATH);

  const sampleById = new Map(sample.rows.map((row) => [row.rowId, row]));
  const codexById = new Map(codex.rows.map((row) => [row.rowId, row]));
  const claudeById = new Map(claude.rows.map((row) => [row.rowId, row]));
  const revealById = new Map(reveal.rows.map((row) => [row.rowId, row]));

  const missing = {
    sampleMissingReveal: sample.rows.filter((row) => !revealById.has(row.rowId)).map((row) => row.rowId),
    sampleMissingCodex: sample.rows.filter((row) => !codexById.has(row.rowId)).map((row) => row.rowId),
    sampleMissingClaude: sample.rows.filter((row) => !claudeById.has(row.rowId)).map((row) => row.rowId),
  };

  const expectedHmacChecks = sample.rows.length * sample.masking.labelFields.length;
  let hmacMatched = 0;
  const hmacMismatches: Array<{ rowId: string; field: string }> = [];
  for (const row of sample.rows) {
    const revealRow = revealById.get(row.rowId);
    if (!revealRow) continue;
    for (const field of sample.masking.labelFields) {
      if (row.adsecuteLabelMasks[field] === revealRow.hmac[field]) {
        hmacMatched += 1;
      } else {
        hmacMismatches.push({ rowId: row.rowId, field });
      }
    }
  }

  if (
    missing.sampleMissingReveal.length ||
    missing.sampleMissingCodex.length ||
    missing.sampleMissingClaude.length ||
    hmacMismatches.length
  ) {
    throw new Error(
      `Agreement inputs failed integrity checks: ${JSON.stringify({
        missing,
        hmacMismatches: hmacMismatches.slice(0, 5),
      })}`,
    );
  }

  const joinedRows = sample.rows.map((sampleRow) => {
    const revealRow = revealById.get(sampleRow.rowId)!;
    const adsecute = adsecuteRating(revealRow);
    const codexRating = codexById.get(sampleRow.rowId)!;
    const claudeRating = claudeById.get(sampleRow.rowId)!;
    const errors = [
      ...validateRating(adsecute, sampleRow.rowId, "adsecute"),
      ...validateRating(codexRating, sampleRow.rowId, "codex"),
      ...validateRating(claudeRating, sampleRow.rowId, "claude"),
    ];
    if (errors.length > 0) {
      throw new Error(`Bad rating rows: ${errors.slice(0, 10).join(", ")}`);
    }
    return {
      adsecute,
      codex: codexRating,
      claude: claudeRating,
    };
  });

  const pairwise = Object.fromEntries(
    PAIRS.map(([left, right]) => [
      `${left}_vs_${right}`,
      {
        action: cohenKappa(joinedRows, left, right, "action", ACTIONS),
        headline: cohenKappa(joinedRows, left, right, "headline", HEADLINES),
        actionReadiness: cohenKappa(joinedRows, left, right, "actionReadiness", READINESS),
      },
    ]),
  ) as Record<string, Record<Axis, ReturnType<typeof cohenKappa>>>;

  const fleiss = {
    action: fleissKappa(joinedRows, "action", ACTIONS),
    headline: fleissKappa(joinedRows, "headline", HEADLINES),
    actionReadiness: fleissKappa(joinedRows, "actionReadiness", READINESS),
  };

  const severity = {
    action: severityCounts(joinedRows),
  };

  return {
    version: "happy-harbor.auditA.agreement.v1",
    generatedAt,
    source: {
      samplePath: SAMPLE_PATH,
      codexRatingPath: CODEX_RATING_PATH,
      claudeRatingPath: CLAUDE_RATING_PATH,
      revealPath: REVEAL_PATH,
      severityFunction: "lib/creative-decision-os-v2-evaluation.ts:classifyV2MismatchSeverity",
    },
    integrity: {
      rowCount: sample.rows.length,
      revealJoinMatched: sample.rows.length - missing.sampleMissingReveal.length,
      codexJoinMatched: sample.rows.length - missing.sampleMissingCodex.length,
      claudeJoinMatched: sample.rows.length - missing.sampleMissingClaude.length,
      expectedHmacChecks,
      hmacMatched,
      hmacMismatches,
    },
    pairwise,
    fleiss,
    severity,
    distributions: {
      adsecute: distribution(joinedRows.map((row) => row.adsecute)),
      codex: distribution(joinedRows.map((row) => row.codex)),
      claude: distribution(joinedRows.map((row) => row.claude)),
    },
    deepDives: deepDiveRows({ joinedRows, sampleById }),
    rows: joinedRows.map((row) => ({
      rowId: row.adsecute.rowId,
      adsecute: row.adsecute,
      codex: row.codex,
      claude: row.claude,
    })),
  };
}

function distribution(rows: Rating[]) {
  return {
    phase: countBy(rows, (row) => row.phase),
    headline: countBy(rows, (row) => row.headline),
    action: countBy(rows, (row) => row.action),
    actionReadiness: countBy(rows, (row) => row.actionReadiness),
  };
}

function countBy<T>(items: T[], key: (item: T) => string) {
  return items.reduce<Record<string, number>>((acc, item) => {
    const value = key(item);
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

export function runAgreement() {
  const data = buildAgreementData();
  writeJson(AGREEMENT_DATA_PATH, data);
  writeFileSync(AGREEMENT_REPORT_PATH, buildReport(data), "utf8");
  return {
    agreementDataPath: AGREEMENT_DATA_PATH,
    agreementReportPath: AGREEMENT_REPORT_PATH,
    rowCount: data.integrity.rowCount,
    hmacMatched: data.integrity.hmacMatched,
    expectedHmacChecks: data.integrity.expectedHmacChecks,
    actionKappas: Object.fromEntries(
      Object.entries(data.pairwise).map(([pair, axes]) => [pair, round(axes.action.kappa, 4)]),
    ),
    fleissAction: round(data.fleiss.action.kappa, 4),
    deepDiveRows: data.deepDives.length,
  };
}

function isDirectRun() {
  const entry = process.argv[1];
  return Boolean(entry && fileURLToPath(import.meta.url) === path.resolve(entry));
}

if (isDirectRun()) {
  console.log(JSON.stringify(runAgreement(), null, 2));
}
