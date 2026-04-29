import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  creativeActionToPrimaryDecision,
  resolveCreativeVerdict,
  type CreativeVerdictInput,
} from "@/lib/creative-verdict";
import {
  CREATIVE_DECISION_OS_V2_PRIMARY_DECISIONS,
  type CreativeDecisionOsV2PrimaryDecision,
} from "@/lib/creative-decision-os-v2";
import {
  classifyV2MismatchSeverity,
  type CreativeDecisionOsV2MismatchSeverity,
} from "@/lib/creative-decision-os-v2-evaluation";

const GOLD_V1_PATH = "docs/team-comms/happy-harbor/audit-E/gold-v1.json";
const REPORT_ROOT =
  "docs/operator-policy/creative-segmentation-recovery/reports/agreement-weekly";
const MACRO_F1_MIN = 90;
const MAX_SEVERE = 0;
const MAX_HIGH = 5;

type GoldV1Row = {
  rowId: string;
  source: "sample-200-core" | "extended-live-cohort";
  resolverInput: CreativeVerdictInput;
  gold: {
    primaryDecision: CreativeDecisionOsV2PrimaryDecision;
    status: string;
  };
};

type GoldV1Artifact = {
  version: string;
  generatedAt: string;
  target: {
    requestedRows: number;
    actualRows: number;
    status: string;
  };
  rows: GoldV1Row[];
};

type AuditRow = {
  rowId: string;
  source: GoldV1Row["source"];
  goldDecision: CreativeDecisionOsV2PrimaryDecision;
  resolverDecision: CreativeDecisionOsV2PrimaryDecision;
  severity: CreativeDecisionOsV2MismatchSeverity;
  goldStatus: string;
};

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function writeJson(filePath: string, value: unknown) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(filePath: string, value: string) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, value, "utf8");
}

function todayIso() {
  return process.env.CREATIVE_AGREEMENT_AUDIT_DATE?.trim() || new Date().toISOString().slice(0, 10);
}

function zeroMatrix() {
  return Object.fromEntries(
    CREATIVE_DECISION_OS_V2_PRIMARY_DECISIONS.map((row) => [
      row,
      Object.fromEntries(CREATIVE_DECISION_OS_V2_PRIMARY_DECISIONS.map((col) => [col, 0])),
    ]),
  ) as Record<CreativeDecisionOsV2PrimaryDecision, Record<CreativeDecisionOsV2PrimaryDecision, number>>;
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function countBy<T>(items: T[], key: (item: T) => string) {
  return items.reduce<Record<string, number>>((acc, item) => {
    const value = key(item);
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function evaluate(rows: AuditRow[]) {
  const confusionMatrix = zeroMatrix();
  const mismatchCounts: Record<CreativeDecisionOsV2MismatchSeverity, number> = {
    severe: 0,
    high: 0,
    medium: 0,
    low: 0,
    none: 0,
  };

  for (const row of rows) {
    confusionMatrix[row.goldDecision][row.resolverDecision] += 1;
    mismatchCounts[row.severity] += 1;
  }

  const perDecision = CREATIVE_DECISION_OS_V2_PRIMARY_DECISIONS.map((decision) => {
    const tp = confusionMatrix[decision][decision];
    const fp = CREATIVE_DECISION_OS_V2_PRIMARY_DECISIONS.reduce(
      (sum, gold) => sum + (gold === decision ? 0 : confusionMatrix[gold][decision]),
      0,
    );
    const fn = CREATIVE_DECISION_OS_V2_PRIMARY_DECISIONS.reduce(
      (sum, predicted) => sum + (predicted === decision ? 0 : confusionMatrix[decision][predicted]),
      0,
    );
    const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    return {
      decision,
      tp,
      fp,
      fn,
      precision: round(precision * 100),
      recall: round(recall * 100),
      f1: round(f1 * 100),
    };
  });

  const macroF1 = round(
    perDecision.reduce((sum, row) => sum + row.f1, 0) / perDecision.length,
  );
  const passed =
    macroF1 >= MACRO_F1_MIN &&
    mismatchCounts.severe <= MAX_SEVERE &&
    mismatchCounts.high <= MAX_HIGH;

  return {
    macroF1,
    perDecision,
    confusionMatrix,
    mismatchCounts,
    passed,
    thresholds: {
      macroF1Min: MACRO_F1_MIN,
      maxSevere: MAX_SEVERE,
      maxHigh: MAX_HIGH,
    },
  };
}

function markdownTable(headers: string[], rows: Array<Array<string | number>>) {
  const cell = (value: string | number) => String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
  return [
    `| ${headers.map(cell).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(cell).join(" | ")} |`),
  ].join("\n");
}

function reportMarkdown(input: {
  generatedAt: string;
  gold: GoldV1Artifact;
  result: ReturnType<typeof evaluate>;
  rows: AuditRow[];
}) {
  const sections = [
    "# Creative Agreement Weekly Audit",
    "",
    "## Summary",
    "",
    `- Generated at: ${input.generatedAt}`,
    `- Gold artifact: ${GOLD_V1_PATH}`,
    `- Gold version: ${input.gold.version}`,
    `- Rows audited: ${input.rows.length}`,
    `- Gold target status: ${input.gold.target.status} (${input.gold.target.actualRows}/${input.gold.target.requestedRows})`,
    `- Status: ${input.result.passed ? "pass" : "fail"}`,
    `- Macro F1: ${input.result.macroF1}`,
    `- Mismatch counts: ${JSON.stringify(input.result.mismatchCounts)}`,
    "",
    "## Coverage",
    "",
    markdownTable(
      ["Source", "Rows"],
      Object.entries(countBy(input.rows, (row) => row.source)),
    ),
    "",
    markdownTable(
      ["Gold status", "Rows"],
      Object.entries(countBy(input.rows, (row) => row.goldStatus)),
    ),
    "",
    "## Per Decision",
    "",
    markdownTable(
      ["Decision", "TP", "FP", "FN", "Precision", "Recall", "F1"],
      input.result.perDecision.map((row) => [
        row.decision,
        row.tp,
        row.fp,
        row.fn,
        row.precision,
        row.recall,
        row.f1,
      ]),
    ),
    "",
    "## Mismatches",
    "",
  ];

  const mismatches = input.rows.filter((row) => row.severity !== "none").slice(0, 25);
  sections.push(
    mismatches.length === 0
      ? "No mismatches."
      : markdownTable(
          ["rowId", "source", "gold", "resolver", "severity"],
          mismatches.map((row) => [
            row.rowId,
            row.source,
            row.goldDecision,
            row.resolverDecision,
            row.severity,
          ]),
        ),
  );
  return `${sections.join("\n")}\n`;
}

function main() {
  const generatedAt = new Date().toISOString();
  const gold = readJson<GoldV1Artifact>(GOLD_V1_PATH);
  const rows = gold.rows.map((row): AuditRow => {
    const resolverDecision = creativeActionToPrimaryDecision(
      resolveCreativeVerdict(row.resolverInput).action,
    );
    return {
      rowId: row.rowId,
      source: row.source,
      goldDecision: row.gold.primaryDecision,
      resolverDecision,
      severity: classifyV2MismatchSeverity(row.gold.primaryDecision, resolverDecision),
      goldStatus: row.gold.status,
    };
  });
  const result = evaluate(rows);
  const date = todayIso();
  const outDir = path.join(REPORT_ROOT, date);
  const payload = {
    version: "creative-agreement-audit.v1",
    generatedAt,
    gold: {
      path: GOLD_V1_PATH,
      version: gold.version,
      generatedAt: gold.generatedAt,
      target: gold.target,
    },
    result,
    rows,
  };

  writeJson(path.join(outDir, "agreement-audit.json"), payload);
  writeText(path.join(outDir, "agreement-audit.md"), reportMarkdown({ generatedAt, gold, result, rows }));
  console.log(
    JSON.stringify(
      {
        outputDir: outDir,
        rows: rows.length,
        macroF1: result.macroF1,
        mismatchCounts: result.mismatchCounts,
        passed: result.passed,
      },
      null,
      2,
    ),
  );

  if (!result.passed) {
    process.exitCode = 1;
  }
}

main();
