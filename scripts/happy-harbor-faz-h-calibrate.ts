import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_CREATIVE_CANONICAL_THRESHOLDS,
  resolveCreativeCanonicalDecisionForAuditRow,
  type CreativeCanonicalAction,
  type CreativeCanonicalThresholds,
} from "@/lib/creative-canonical-decision";
import { creativeDecisionOverrideSeverity } from "@/lib/creative-calibration-store";

interface LabeledRow {
  rowId?: string;
  creativeId?: string;
  raw?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
  userRating?: {
    action?: CreativeCanonicalAction | null;
  };
  userAction?: CreativeCanonicalAction | null;
  action?: CreativeCanonicalAction | null;
}

interface LabeledFile {
  rows: LabeledRow[];
}

const ACTIONS: CreativeCanonicalAction[] = [
  "scale",
  "test_more",
  "protect",
  "refresh",
  "cut",
  "diagnose",
];

function argValue(name: string, fallback: string) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function userAction(row: LabeledRow): CreativeCanonicalAction | null {
  const value = row.userRating?.action ?? row.userAction ?? row.action ?? null;
  return ACTIONS.includes(value as CreativeCanonicalAction) ? (value as CreativeCanonicalAction) : null;
}

function rawInput(row: LabeledRow): Record<string, unknown> {
  return {
    ...(row.raw ?? {}),
    ...(row.metrics ?? {}),
    rowId: row.rowId ?? row.raw?.rowId ?? row.metrics?.rowId,
    creativeId: row.creativeId ?? row.raw?.creativeId ?? row.metrics?.creativeId,
  };
}

function severePenalty(predicted: CreativeCanonicalAction, actual: CreativeCanonicalAction) {
  const severity = creativeDecisionOverrideSeverity({
    modelAction: predicted,
    modelReadiness: predicted === "diagnose" ? "blocked" : "ready",
    userAction: actual,
    userReadiness: actual === "diagnose" ? "blocked" : "ready",
  });
  if (
    (predicted === "scale" && actual === "cut") ||
    (predicted === "cut" && actual === "scale")
  ) {
    return 5;
  }
  if (severity === "critical") return 4;
  if (severity === "high") return 3;
  if (severity === "medium") return 1.5;
  if (
    (predicted === "refresh" && actual === "protect") ||
    (predicted === "protect" && actual === "refresh")
  ) {
    return 1.5;
  }
  return predicted === actual ? 0 : 1;
}

function candidateThresholds(): CreativeCanonicalThresholds[] {
  const candidates: CreativeCanonicalThresholds[] = [];
  for (const minSpendForDecision of [120, 180, 240, 300]) {
    for (const minPurchasesForScale of [3, 4, 6]) {
      for (const scaleScore of [74, 78, 82]) {
        for (const refreshFatigue of [0.45, 0.5, 0.55]) {
          for (const hardCutEconomicsRatio of [0.55, 0.65, 0.75]) {
            candidates.push({
              ...DEFAULT_CREATIVE_CANONICAL_THRESHOLDS,
              minSpendForDecision,
              minPurchasesForScale,
              minPurchasesForCut: 1,
              scaleScore,
              protectScore: Math.max(64, scaleScore - 10),
              refreshFatigue,
              hardCutEconomicsRatio,
              softCutEconomicsRatio: hardCutEconomicsRatio + 0.2,
              version: `grid-${minSpendForDecision}-${minPurchasesForScale}-${scaleScore}-${refreshFatigue}-${hardCutEconomicsRatio}`,
              lastCalibratedAt: new Date().toISOString(),
            });
          }
        }
      }
    }
  }
  return candidates;
}

function evaluate(rows: LabeledRow[], thresholds: CreativeCanonicalThresholds) {
  let weightedCost = 0;
  let exactMatches = 0;
  let severeErrors = 0;
  const confusion: Record<string, number> = {};
  for (const row of rows) {
    const actual = userAction(row);
    if (!actual) continue;
    const predicted = resolveCreativeCanonicalDecisionForAuditRow(rawInput(row), thresholds).action;
    if (predicted === actual) exactMatches += 1;
    const penalty = severePenalty(predicted, actual);
    weightedCost += penalty;
    if (penalty >= 3) severeErrors += 1;
    const key = `${actual}->${predicted}`;
    confusion[key] = (confusion[key] ?? 0) + 1;
  }
  const labeledCount = rows.filter((row) => userAction(row)).length;
  const maxCost = Math.max(1, labeledCount * 5);
  const weightedAgreement = labeledCount === 0 ? 0 : 1 - weightedCost / maxCost;
  return {
    labeledCount,
    exactAgreement: labeledCount === 0 ? 0 : exactMatches / labeledCount,
    weightedAgreement,
    severeErrorRate: labeledCount === 0 ? 0 : severeErrors / labeledCount,
    weightedCost,
    confusion,
  };
}

function clampDelta(
  oldThresholds: CreativeCanonicalThresholds,
  nextThresholds: CreativeCanonicalThresholds,
): CreativeCanonicalThresholds {
  const clampNumber = (oldValue: number, nextValue: number, pct = 0.05) => {
    const delta = oldValue * pct;
    return Math.max(oldValue - delta, Math.min(oldValue + delta, nextValue));
  };
  return {
    ...nextThresholds,
    minSpendForDecision: Math.round(clampNumber(oldThresholds.minSpendForDecision, nextThresholds.minSpendForDecision)),
    minPurchasesForScale: Math.round(clampNumber(oldThresholds.minPurchasesForScale, nextThresholds.minPurchasesForScale, 0.25)),
    scaleScore: Math.round(clampNumber(oldThresholds.scaleScore, nextThresholds.scaleScore)),
    protectScore: Math.round(clampNumber(oldThresholds.protectScore, nextThresholds.protectScore)),
    refreshFatigue: Number(clampNumber(oldThresholds.refreshFatigue, nextThresholds.refreshFatigue).toFixed(3)),
    hardCutEconomicsRatio: Number(clampNumber(oldThresholds.hardCutEconomicsRatio, nextThresholds.hardCutEconomicsRatio).toFixed(3)),
    softCutEconomicsRatio: Number(clampNumber(oldThresholds.softCutEconomicsRatio, nextThresholds.softCutEconomicsRatio).toFixed(3)),
  };
}

async function main() {
  const inputPath = argValue("input", "docs/team-comms/happy-harbor/audit-H/elrate-sample-50.json");
  const outputPath = argValue("output", "docs/team-comms/happy-harbor/audit-H/calibration-report.json");
  const raw = JSON.parse(await readFile(inputPath, "utf8")) as LabeledFile;
  const labeledRows = raw.rows.filter((row) => userAction(row));
  if (labeledRows.length === 0) {
    throw new Error("No labeled rows found. Fill userRating.action before calibration.");
  }
  const ranked = candidateThresholds()
    .map((thresholds) => ({
      thresholds,
      evaluation: evaluate(labeledRows, thresholds),
    }))
    .sort((left, right) =>
      right.evaluation.weightedAgreement - left.evaluation.weightedAgreement ||
      left.evaluation.severeErrorRate - right.evaluation.severeErrorRate,
    );
  const best = ranked[0]!;
  const clampedThresholds = clampDelta(DEFAULT_CREATIVE_CANONICAL_THRESHOLDS, best.thresholds);
  const payload = {
    generatedAt: new Date().toISOString(),
    input: inputPath,
    algorithm: "rule_based_grid_search_cost_sensitive",
    labeledCount: labeledRows.length,
    bestUnclamped: best,
    promotedThresholds: {
      ...clampedThresholds,
      version: `calibrated-${new Date().toISOString()}`,
    },
    promotedEvaluation: evaluate(labeledRows, clampedThresholds),
    safeguards: {
      severeErrorPenalty: "cut<->scale=5x, action distance>=2=3x",
      thresholdDeltaClamp: "about +/-5% per update for continuous thresholds",
      shrinkageStub: "when labels <20, keep defaults close to segment/global thresholds",
    },
  };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Wrote calibration report to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
