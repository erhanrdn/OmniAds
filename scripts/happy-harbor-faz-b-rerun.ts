import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  creativeActionToPrimaryDecision,
  resolveCreativeVerdict,
  type CreativeAction,
  type CreativeActionReadiness,
  type CreativePhase,
  type CreativeVerdictHeadline,
} from "@/lib/creative-verdict";
import { classifyV2MismatchSeverity } from "@/lib/creative-decision-os-v2-evaluation";

const AUDIT_A_DIR = "docs/team-comms/happy-harbor/audit-A";
const AUDIT_B_DIR = "docs/team-comms/happy-harbor/audit-B";
const SAMPLE_PATH = path.join(AUDIT_A_DIR, "sample-200.json");
const CODEX_RATING_PATH = path.join(AUDIT_A_DIR, "codex-rating.json");
const CLAUDE_RATING_PATH = path.join(AUDIT_A_DIR, "claude-rating.json");
const DATA_PATH = path.join(AUDIT_B_DIR, "faz-b-rerun.json");
const REPORT_PATH = path.join(AUDIT_B_DIR, "faz-b-rerun.md");

const HEADLINES = [
  "Test Winner",
  "Test Loser",
  "Test Inconclusive",
  "Scale Performer",
  "Scale Underperformer",
  "Scale Fatiguing",
  "Needs Diagnosis",
] as const satisfies readonly CreativeVerdictHeadline[];

const ACTIONS = [
  "scale",
  "keep_testing",
  "protect",
  "refresh",
  "cut",
  "diagnose",
] as const satisfies readonly CreativeAction[];

const READINESS = [
  "ready",
  "needs_review",
  "blocked",
] as const satisfies readonly CreativeActionReadiness[];

type Rating = {
  rowId: string;
  phase: CreativePhase;
  headline: CreativeVerdictHeadline;
  action: CreativeAction;
  actionReadiness: CreativeActionReadiness;
  confidence: number | null;
  primaryReason: string;
  blockers: string[];
};

type SampleRow = {
  rowId: string;
  business: {
    businessSpend30d: number;
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
    recent7d: { spend?: number | null; roas?: number | null; purchases?: number | null } | null;
    mid30d: { spend?: number | null; roas?: number | null; purchases?: number | null } | null;
    long90d: { spend?: number | null; roas?: number | null; purchases?: number | null } | null;
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
    businessValidationStatus: string;
  };
  context: {
    campaignIsTestLike: boolean;
    trustState: string;
    deploymentCompatibility: string;
  };
};

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

function fleissKappa<T extends string>(
  rows: Array<Record<"adsecute" | "codex" | "claude", Rating>>,
  axis: keyof Pick<Rating, "action" | "headline" | "actionReadiness">,
  categories: readonly T[],
) {
  const raters = ["adsecute", "codex", "claude"] as const;
  const n = raters.length;
  const N = rows.length;
  const categoryTotals = Object.fromEntries(categories.map((category) => [category, 0]));
  let observedSum = 0;
  for (const row of rows) {
    const counts = Object.fromEntries(categories.map((category) => [category, 0]));
    for (const rater of raters) {
      const value = row[rater][axis] as T;
      counts[value] += 1;
      categoryTotals[value] += 1;
    }
    observedSum += categories.reduce((sum, category) => sum + counts[category] ** 2, 0) - n;
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

function codexClaudeAgreement<T extends keyof Pick<Rating, "action" | "headline" | "actionReadiness">>(
  rows: Array<{ codex: Rating; claude: Rating }>,
  axis: T,
) {
  const matches = rows.filter((row) => row.codex[axis] === row.claude[axis]).length;
  const agreement = rows.length === 0 ? 0 : matches / rows.length;
  return {
    matches,
    total: rows.length,
    agreement,
    maxPossibleObservedFleissWithOneNewRater:
      agreement + (1 - agreement) / 3,
  };
}

function pairwiseAgreement(
  rows: Array<Record<"adsecute" | "codex" | "claude", Rating>>,
) {
  const pairs = [
    ["adsecute", "codex"],
    ["adsecute", "claude"],
    ["codex", "claude"],
  ] as const;
  const axes = ["action", "headline", "actionReadiness"] as const;
  return Object.fromEntries(
    pairs.map(([left, right]) => [
      `${left}_vs_${right}`,
      Object.fromEntries(
        axes.map((axis) => {
          const matches = rows.filter((row) => row[left][axis] === row[right][axis]).length;
          return [axis, { matches, total: rows.length, agreement: matches / rows.length }];
        }),
      ),
    ]),
  );
}

function verdictRating(row: SampleRow): Rating {
  const verdict = resolveCreativeVerdict({
    metrics: row.metrics,
    delivery: row.delivery,
    baseline: row.baseline,
    commercialTruth: {
      targetPackConfigured: row.commercialTruth.targetPackConfigured,
      targetRoas: null,
      businessValidationStatus: row.commercialTruth.businessValidationStatus,
    },
    context: row.context,
  });
  return {
    rowId: row.rowId,
    phase: verdict.phase,
    headline: verdict.headline,
    action: verdict.action,
    actionReadiness: verdict.actionReadiness,
    confidence: verdict.confidence,
    primaryReason: verdict.evidence.map((item) => `${item.weight}:${item.tag}`).join("; "),
    blockers: verdict.blockers,
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

function severityCounts(rows: Array<Record<"adsecute" | "codex" | "claude", Rating>>) {
  const pairs = [
    ["adsecute", "codex"],
    ["adsecute", "claude"],
    ["codex", "claude"],
  ] as const;
  return Object.fromEntries(
    pairs.map(([left, right]) => {
      const counts = { none: 0, low: 0, medium: 0, high: 0, severe: 0 };
      for (const row of rows) {
        const severity = classifyV2MismatchSeverity(
          creativeActionToPrimaryDecision(row[left].action),
          creativeActionToPrimaryDecision(row[right].action),
        );
        counts[severity] += 1;
      }
      return [`${left}_vs_${right}`, counts];
    }),
  );
}

function buildReport(data: ReturnType<typeof buildData>) {
  const fleissRows = Object.entries(data.fleiss).map(([axis, value]) => [
    axis,
    round(value.kappa, 4),
    pct(value.observedAgreement),
    pct(value.expectedAgreement),
  ]);
  const ceilingRows = Object.entries(data.codexClaudeCeiling).map(([axis, value]) => [
    axis,
    value.matches,
    value.total,
    pct(value.agreement),
    pct(value.maxPossibleObservedFleissWithOneNewRater),
  ]);
  const pairwiseRows = Object.entries(data.pairwiseAgreement).flatMap(([pair, axes]) =>
    Object.entries(axes).map(([axis, value]) => [
      pair,
      axis,
      value.matches,
      value.total,
      pct(value.agreement),
    ]),
  );
  return [
    "# Happy Harbor - Faz B Resolver Replay",
    "",
    `Generated at: ${data.generatedAt}`,
    `Rows: ${data.rowCount}`,
    `Literal acceptance met: ${data.acceptance.literalFleissAtLeast050 ? "yes" : "no"}`,
    "",
    "## Fleiss Kappa",
    "",
    markdownTable(["Axis", "Fleiss kappa", "Observed agreement", "Expected agreement"], fleissRows),
    "",
    "## Pairwise Agreement",
    "",
    markdownTable(["Pair", "Axis", "Matches", "Rows", "Agreement"], pairwiseRows),
    "",
    "## Codex-Claude Ceiling",
    "",
    "With Codex and Claude fixed from A.5, a third rater can only create full agreement on rows where Codex and Claude already agree; on disagreement rows the best possible per-row observed agreement is one matching pair out of three.",
    "",
    markdownTable(["Axis", "Codex-Claude matches", "Rows", "Agreement", "Max possible observed Fleiss"], ceilingRows),
    "",
    "## Distributions",
    "",
    "### New Adsecute Resolver",
    "",
    "```json",
    JSON.stringify(data.distributions.adsecute, null, 2),
    "```",
    "",
    "## Severity Counts",
    "",
    markdownTable(
      ["Pair", "Severe", "High", "Medium", "Low", "None"],
      Object.entries(data.severity.action).map(([pair, counts]) => [
        pair,
        counts.severe,
        counts.high,
        counts.medium,
        counts.low,
        counts.none,
      ]),
    ),
  ].join("\n");
}

function buildData() {
  const sample = readJson<{ rows: SampleRow[] }>(SAMPLE_PATH);
  const codex = readJson<{ rows: Rating[] }>(CODEX_RATING_PATH);
  const claude = readJson<{ rows: Rating[] }>(CLAUDE_RATING_PATH);
  const codexById = new Map(codex.rows.map((row) => [row.rowId, row]));
  const claudeById = new Map(claude.rows.map((row) => [row.rowId, row]));

  const rows = sample.rows.map((sampleRow) => {
    const codexRating = codexById.get(sampleRow.rowId);
    const claudeRating = claudeById.get(sampleRow.rowId);
    if (!codexRating || !claudeRating) {
      throw new Error(`Missing rating for ${sampleRow.rowId}`);
    }
    return {
      adsecute: verdictRating(sampleRow),
      codex: codexRating,
      claude: claudeRating,
    };
  });

  const fleiss = {
    action: fleissKappa(rows, "action", ACTIONS),
    headline: fleissKappa(rows, "headline", HEADLINES),
    actionReadiness: fleissKappa(rows, "actionReadiness", READINESS),
  };
  const codexClaudeRows = rows.map((row) => ({ codex: row.codex, claude: row.claude }));
  const codexClaudeCeiling = {
    action: codexClaudeAgreement(codexClaudeRows, "action"),
    headline: codexClaudeAgreement(codexClaudeRows, "headline"),
    actionReadiness: codexClaudeAgreement(codexClaudeRows, "actionReadiness"),
  };

  return {
    version: "happy-harbor.phaseB.rerun.v1",
    generatedAt: new Date().toISOString(),
    rowCount: rows.length,
    source: {
      samplePath: SAMPLE_PATH,
      codexRatingPath: CODEX_RATING_PATH,
      claudeRatingPath: CLAUDE_RATING_PATH,
      resolver: "lib/creative-verdict.ts:resolveCreativeVerdict",
    },
    acceptance: {
      literalFleissAtLeast050:
        fleiss.action.kappa >= 0.5 &&
        fleiss.headline.kappa >= 0.5 &&
        fleiss.actionReadiness.kappa >= 0.5,
      threshold: 0.5,
    },
    fleiss,
    pairwiseAgreement: pairwiseAgreement(rows),
    codexClaudeCeiling,
    severity: { action: severityCounts(rows) },
    distributions: {
      adsecute: distribution(rows.map((row) => row.adsecute)),
      codex: distribution(rows.map((row) => row.codex)),
      claude: distribution(rows.map((row) => row.claude)),
    },
    rows,
  };
}

export function runPhaseBRerun() {
  const data = buildData();
  writeJson(DATA_PATH, data);
  writeFileSync(REPORT_PATH, `${buildReport(data)}\n`, "utf8");
  return {
    dataPath: DATA_PATH,
    reportPath: REPORT_PATH,
    rowCount: data.rowCount,
    fleiss: Object.fromEntries(
      Object.entries(data.fleiss).map(([axis, value]) => [axis, round(value.kappa, 4)]),
    ),
    literalAcceptanceMet: data.acceptance.literalFleissAtLeast050,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(runPhaseBRerun(), null, 2));
}
