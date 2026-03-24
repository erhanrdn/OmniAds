import type { MetaCampaignRow } from "@/app/api/meta/campaigns/route";

export type MetaCampaignLaneLabel = "Scaling" | "Validation" | "Test";
export type MetaCampaignLaneReason =
  | "strong_efficiency"
  | "balanced_validation"
  | "hard_test"
  | "exploratory_test";
export type MetaCampaignLaneConfidence = "high" | "medium";
export interface MetaCampaignLaneSignal {
  lane: MetaCampaignLaneLabel;
  family: MetaCampaignFamily;
  reason: MetaCampaignLaneReason;
  confidence: MetaCampaignLaneConfidence;
}
export interface MetaCampaignLaneFamilySummary {
  family: MetaCampaignFamily;
  familyLabel: string;
  scalingCount: number;
  validationCount: number;
  testCount: number;
  unclassifiedCount: number;
  eligibleForBudgetShift: boolean;
}
export type MetaCampaignFamily =
  | "purchase_value"
  | "mid_funnel"
  | "lead"
  | "awareness"
  | "engagement"
  | "other";

function normalizeGoal(value: string | null | undefined) {
  return (value ?? "").toLowerCase().trim();
}

export function resolveMetaCampaignFamily(row: Pick<MetaCampaignRow, "optimizationGoal" | "objective">): MetaCampaignFamily {
  const goal = normalizeGoal(row.optimizationGoal);
  const objective = normalizeGoal(row.objective);

  if (
    goal.includes("purchase") ||
    goal.includes("value") ||
    goal.includes("offsite conversions") ||
    goal.includes("offsite_conversion") ||
    objective.includes("outcome_sales") ||
    objective.includes("sales")
  ) {
    return "purchase_value";
  }
  if (
    goal.includes("add to cart") ||
    goal.includes("initiate checkout") ||
    goal.includes("checkout") ||
    goal.includes("landing page") ||
    goal.includes("conversion")
  ) {
    return "mid_funnel";
  }
  if (goal.includes("lead") || goal.includes("registration")) {
    return "lead";
  }
  if (
    goal.includes("thruplay") ||
    goal.includes("reach") ||
    goal.includes("video") ||
    goal.includes("awareness") ||
    goal.includes("traffic")
  ) {
    return "awareness";
  }
  if (
    goal.includes("engagement") ||
    goal.includes("message") ||
    goal.includes("messaging") ||
    goal.includes("post")
  ) {
    return "engagement";
  }
  return "other";
}

export function metaCampaignFamilyLabel(family: MetaCampaignFamily) {
  if (family === "purchase_value") return "purchase/value";
  if (family === "mid_funnel") return "mid-funnel conversion";
  if (family === "lead") return "lead generation";
  if (family === "awareness") return "awareness/video";
  if (family === "engagement") return "engagement/messaging";
  return "other";
}

export function isScalingCampaignFamily(family: MetaCampaignFamily) {
  return family === "purchase_value" || family === "mid_funnel" || family === "lead";
}

export function comparableMetaIntentKey(row: Pick<MetaCampaignRow, "optimizationGoal" | "objective">) {
  const optimization = normalizeGoal(row.optimizationGoal);
  if (optimization) {
    return `optimization:${optimization}`;
  }

  const objective = normalizeGoal(row.objective);
  if (objective) {
    return `objective:${objective}`;
  }

  return `family:${resolveMetaCampaignFamily(row)}`;
}

export function comparableMetaIntentLabel(row: Pick<MetaCampaignRow, "optimizationGoal" | "objective">) {
  if (row.optimizationGoal) return row.optimizationGoal;
  if (row.objective) return row.objective;
  return metaCampaignFamilyLabel(resolveMetaCampaignFamily(row));
}

function averagePositive(values: number[]) {
  const filtered = values.filter((value) => Number.isFinite(value) && value > 0);
  if (filtered.length === 0) return 0;
  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

function buildFamilyLaneAnalysis(family: MetaCampaignFamily, familyRows: MetaCampaignRow[]) {
  const avgRoas = averagePositive(familyRows.map((row) => row.roas));
  const avgSpend = averagePositive(familyRows.map((row) => row.spend));
  const roasSpread =
    familyRows.length > 1
      ? Math.max(...familyRows.map((row) => row.roas)) - Math.min(...familyRows.map((row) => row.roas))
      : 0;

  const strongRows = familyRows.filter(
    (row) => row.purchases >= 10 && row.roas >= Math.max(avgRoas * 1.1, 2)
  );
  const lowSignalRows = familyRows.filter(
    (row) => row.purchases < 8 || row.spend <= Math.max(avgSpend * 0.75, 0)
  );
  const hardTestRows = familyRows.filter(
    (row) => row.purchases < 5 && row.roas <= Math.max(avgRoas * 0.7, 1.2)
  );
  const validationRows = familyRows.filter((row) => {
    const hasMeaningfulSignal = row.purchases >= 8 || row.spend > Math.max(avgSpend * 0.75, 0);
    const hasAcceptableRoas = row.roas >= Math.max(avgRoas * 0.9, 1.6);
    return hasMeaningfulSignal && hasAcceptableRoas;
  });

  return {
    family,
    familyLabel: metaCampaignFamilyLabel(family),
    avgRoas,
    avgSpend,
    roasSpread,
    strongRows,
    lowSignalRows,
    hardTestRows,
    validationRows,
  };
}

export function buildMetaCampaignLaneSignals(rows: MetaCampaignRow[]) {
  const grouped = new Map<MetaCampaignFamily, MetaCampaignRow[]>();
  for (const row of rows) {
    const family = resolveMetaCampaignFamily(row);
    if (!isScalingCampaignFamily(family) || row.status !== "ACTIVE") continue;
    grouped.set(family, [...(grouped.get(family) ?? []), row]);
  }

  const laneMap = new Map<string, MetaCampaignLaneSignal>();

  for (const [family, familyRows] of grouped) {
    if (familyRows.length < 2) continue;

    const { avgRoas, roasSpread, strongRows, lowSignalRows, hardTestRows, validationRows } =
      buildFamilyLaneAnalysis(family, familyRows);

    if (strongRows.length === 0) continue;
    const homogeneousMatureFamily =
      strongRows.length === familyRows.length && roasSpread < 0.35;
    const lowDifferentiationFamily =
      roasSpread < 0.35 && hardTestRows.length === 0 && lowSignalRows.length < 2;
    const noRealOperatingSplit =
      strongRows.length === 1 && validationRows.length === 0 && lowSignalRows.length === 0;

    if (homogeneousMatureFamily || lowDifferentiationFamily || noRealOperatingSplit) continue;

    for (const row of strongRows) {
      laneMap.set(row.id, {
        lane: "Scaling",
        family,
        reason: "strong_efficiency",
        confidence: row.purchases >= 15 || row.roas >= Math.max(avgRoas * 1.25, 2.5) ? "high" : "medium",
      });
    }

    for (const row of hardTestRows) {
      if (!laneMap.has(row.id)) {
        laneMap.set(row.id, {
          lane: "Test",
          family,
          reason: "hard_test",
          confidence: "high",
        });
      }
    }

    for (const row of validationRows) {
      if (laneMap.has(row.id)) continue;
      laneMap.set(row.id, {
        lane: "Validation",
        family,
        reason: "balanced_validation",
        confidence: row.purchases >= 12 ? "high" : "medium",
      });
    }

    if (lowSignalRows.length >= 2) {
      for (const row of lowSignalRows) {
        if (!laneMap.has(row.id)) {
          laneMap.set(row.id, {
            lane: "Test",
            family,
            reason: "exploratory_test",
            confidence: "medium",
          });
        }
      }
    }
  }

  return laneMap;
}

export function buildMetaCampaignLaneSummary(rows: MetaCampaignRow[]) {
  const signals = buildMetaCampaignLaneSignals(rows);
  const grouped = new Map<MetaCampaignFamily, MetaCampaignRow[]>();
  for (const row of rows) {
    const family = resolveMetaCampaignFamily(row);
    if (!isScalingCampaignFamily(family) || row.status !== "ACTIVE") continue;
    grouped.set(family, [...(grouped.get(family) ?? []), row]);
  }

  const summaries = new Map<MetaCampaignFamily, MetaCampaignLaneFamilySummary>();
  for (const [family, familyRows] of grouped) {
    const familySignals = familyRows
      .map((row) => signals.get(row.id))
      .filter((signal): signal is MetaCampaignLaneSignal => Boolean(signal));

    const scalingCount = familySignals.filter((signal) => signal.lane === "Scaling").length;
    const validationCount = familySignals.filter((signal) => signal.lane === "Validation").length;
    const testCount = familySignals.filter((signal) => signal.lane === "Test").length;
    const unclassifiedCount = Math.max(familyRows.length - familySignals.length, 0);

    summaries.set(family, {
      family,
      familyLabel: metaCampaignFamilyLabel(family),
      scalingCount,
      validationCount,
      testCount,
      unclassifiedCount,
      eligibleForBudgetShift: scalingCount >= 1 && validationCount >= 1,
    });
  }

  return summaries;
}

export function buildMetaCampaignLaneMap(rows: MetaCampaignRow[]) {
  const signals = buildMetaCampaignLaneSignals(rows);
  return new Map([...signals.entries()].map(([id, signal]) => [id, signal.lane]));
}
