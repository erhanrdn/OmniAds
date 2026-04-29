/**
 * Faz G — Üç Adsecute karar sistemini ayrı ayrı extract et
 *
 * Production snapshot'ta her creative için üç sistem aynı anda hesaplanmış:
 *   - Sistem 1 (Legacy): c.legacyAction + c.lifecycleState
 *   - Sistem 2 (Operator): c.operatorPolicy.segment → resolveCreativeOperatorDecision()
 *   - Sistem 3 (V2 Preview): c'yi V2 input'una map edip resolveCreativeDecisionOsV2() çalıştır
 *
 * Bu script üçünü tek bir 6-action uzayına (scale/test_more/protect/refresh/cut/diagnose)
 * indirger ve audit-G/three-systems.json'a yazar.
 *
 * Run:
 *   export DATABASE_URL="..."
 *   node --import tsx scripts/happy-harbor-faz-g-three-systems-extract.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { Pool } from "pg";

const BUSINESSES = [
  { id: "f8a3b5ac-588c-462f-8702-11cd24ff3cd2", label: "IwaStore" },
  { id: "172d0ab8-495b-4679-a4c6-ffa404c389d3", label: "TheSwaf" },
];

const OUT_DIR = path.resolve("docs/team-comms/happy-harbor/audit-G-three-systems");

type Action = "scale" | "test_more" | "protect" | "refresh" | "cut" | "diagnose";

/**
 * Sistem 1 — Legacy primaryAction → 6-action uzayına map
 */
function legacyToOperatorAction(
  primaryAction: string | null | undefined,
  lifecycleState: string | null | undefined,
): Action {
  switch (primaryAction) {
    case "promote_to_scaling":
      return "scale";
    case "keep_in_test":
      return "test_more";
    case "hold_no_touch":
      return "protect";
    case "refresh_replace":
      return "refresh";
    case "retest_comeback":
      return "refresh";
    case "block_deploy":
      // Could be cut or diagnose depending on lifecycle
      if (lifecycleState === "blocked" || lifecycleState === "retired") return "cut";
      return "diagnose";
    default:
      return "diagnose";
  }
}

/**
 * Sistem 2 — Operator segment → 6-action (resolveCreativeOperatorDecision'ın özet hâli)
 */
function operatorSegmentToAction(
  segment: string | null | undefined,
  primaryAction: string | null | undefined,
): Action {
  switch (segment) {
    case "scale_ready":
    case "scale_review":
      return "scale";
    case "promising_under_sampled":
      return "test_more";
    case "protected_winner":
    case "no_touch":
      return "protect";
    case "fatigued_winner":
    case "needs_new_variant":
      return "refresh";
    case "kill_candidate":
    case "spend_waste":
      return "cut";
    case "investigate":
    case "contextual_only":
    case "blocked":
    case "false_winner_low_evidence":
    case "creative_learning_incomplete":
      return "diagnose";
    case "hold_monitor":
      // Multi-path; default to test_more (matches production runtime)
      return "test_more";
    default:
      // Fallback to legacy primaryAction
      return legacyToOperatorAction(primaryAction, null);
  }
}

/**
 * Sistem 3 — V2 Preview output (snapshot'tan al)
 * Snapshot.verdict alanı V2 unified output (Faz E sonrası).
 */
function v2VerdictToAction(verdictAction: string | null | undefined): Action {
  switch (verdictAction) {
    case "scale":
      return "scale";
    case "keep_testing":
      return "test_more";
    case "protect":
      return "protect";
    case "refresh":
      return "refresh";
    case "cut":
      return "cut";
    case "diagnose":
      return "diagnose";
    default:
      return "diagnose";
  }
}

interface CreativeRow {
  rowId: string;
  business: string;
  creativeId: string;
  creativeName: string;
  // Raw metric snapshot (for downstream agents)
  spend: number;
  purchases: number;
  roas: number;
  cpa: number;
  ctr: number;
  benchmarkRoas: number | null;
  benchmarkCpa: number | null;
  benchmarkCtr: number | null;
  attentionCurrent: number | null;
  attentionBenchmark: number | null;
  clickToPurchaseCurrent: number | null;
  clickToPurchaseBenchmark: number | null;
  baselineMedianRoas: number | null;
  baselineMedianSpend: number | null;
  baselineReliability: string | null;
  fatigueStatus: string | null;
  roasDecay: number | null;
  ctrDecay: number | null;
  clickToPurchaseDecay: number | null;
  winnerMemory: boolean;
  targetRoas: number | null;
  breakEvenRoas: number | null;
  roasFloor: number | null;
  trustState: string;
  activeDelivery: boolean;
  campaignName: string | null;
  campaignIsTestLike: boolean;
  // Three system outputs
  system1: {
    raw: { legacyAction: string | null; lifecycleState: string | null; primaryAction: string | null };
    action: Action;
  };
  system2: {
    raw: { segment: string | null };
    action: Action;
  };
  system3: {
    raw: { phase: string | null; headline: string | null; action: string | null };
    action: Action;
  };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

  const allRows: CreativeRow[] = [];

  for (const biz of BUSINESSES) {
    const r = await pool.query(
      "SELECT generated_at, payload FROM creative_decision_os_snapshots WHERE business_id::text=$1 AND status='ready' ORDER BY generated_at DESC LIMIT 1",
      [biz.id],
    );
    if (r.rows.length === 0) continue;
    const payload =
      typeof r.rows[0].payload === "string" ? JSON.parse(r.rows[0].payload) : r.rows[0].payload;
    const creatives: any[] = payload.creatives ?? [];
    console.log(`${biz.label}: ${creatives.length} creatives`);

    for (const c of creatives) {
      const rowId = `${biz.label}|${c.creativeId}`;
      const m = c.benchmark?.metrics ?? {};
      const bench = c.relativeBaseline ?? {};
      const fat = c.fatigue ?? {};
      const econ = c.economics ?? {};
      const trust = c.trust ?? {};
      const delivery = c.deliveryContext ?? {};

      const sys1Raw = {
        legacyAction: c.legacyAction ?? null,
        lifecycleState: c.lifecycleState ?? null,
        primaryAction: c.primaryAction ?? null,
      };
      const sys2Raw = {
        segment: c.operatorPolicy?.segment ?? null,
      };
      const sys3Raw = {
        phase: c.verdict?.phase ?? null,
        headline: c.verdict?.headline ?? null,
        action: c.verdict?.action ?? null,
      };

      allRows.push({
        rowId,
        business: biz.label,
        creativeId: c.creativeId,
        creativeName: c.name,
        spend: c.spend ?? 0,
        purchases: c.purchases ?? 0,
        roas: c.roas ?? 0,
        cpa: c.cpa ?? 0,
        ctr: c.ctr ?? 0,
        benchmarkRoas: m.roas?.benchmark ?? null,
        benchmarkCpa: m.cpa?.benchmark ?? null,
        benchmarkCtr: m.ctr?.benchmark ?? null,
        attentionCurrent: m.attention?.current ?? null,
        attentionBenchmark: m.attention?.benchmark ?? null,
        clickToPurchaseCurrent: m.clickToPurchase?.current ?? null,
        clickToPurchaseBenchmark: m.clickToPurchase?.benchmark ?? null,
        baselineMedianRoas: bench.medianRoas ?? null,
        baselineMedianSpend: bench.medianSpend ?? null,
        baselineReliability: bench.reliability ?? null,
        fatigueStatus: fat.status ?? null,
        roasDecay: fat.roasDecay ?? null,
        ctrDecay: fat.ctrDecay ?? null,
        clickToPurchaseDecay: fat.clickToPurchaseDecay ?? null,
        winnerMemory: Boolean(fat.winnerMemory),
        targetRoas: econ.targetRoas ?? null,
        breakEvenRoas: econ.breakEvenRoas ?? null,
        roasFloor: econ.roasFloor ?? null,
        trustState: trust.truthState ?? "unknown",
        activeDelivery: Boolean(delivery.activeDelivery),
        campaignName: delivery.campaignName ?? null,
        campaignIsTestLike: Boolean(delivery.campaignIsTestLike),
        system1: {
          raw: sys1Raw,
          action: legacyToOperatorAction(sys1Raw.primaryAction, sys1Raw.lifecycleState),
        },
        system2: {
          raw: sys2Raw,
          action: operatorSegmentToAction(sys2Raw.segment, sys1Raw.primaryAction),
        },
        system3: {
          raw: sys3Raw,
          action: v2VerdictToAction(sys3Raw.action),
        },
      });
    }
  }

  await pool.end();

  // Pair-wise agreement
  const pairs = [
    ["system1", "system2"],
    ["system1", "system3"],
    ["system2", "system3"],
  ] as const;
  const agreement: Record<string, { matches: number; total: number; pct: number }> = {};
  for (const [a, b] of pairs) {
    const matches = allRows.filter((r) => r[a].action === r[b].action).length;
    const pct = (100 * matches) / allRows.length;
    agreement[`${a}_vs_${b}`] = { matches, total: allRows.length, pct: Math.round(pct * 10) / 10 };
  }
  // Triple agreement
  const tripleMatches = allRows.filter(
    (r) => r.system1.action === r.system2.action && r.system2.action === r.system3.action,
  ).length;
  agreement["triple_agree"] = {
    matches: tripleMatches,
    total: allRows.length,
    pct: Math.round((1000 * tripleMatches) / allRows.length) / 10,
  };

  // Distributions
  const distOf = (key: "system1" | "system2" | "system3") => {
    const out: Record<string, number> = {};
    for (const r of allRows) out[r[key].action] = (out[r[key].action] ?? 0) + 1;
    return out;
  };

  fs.writeFileSync(
    path.join(OUT_DIR, "three-systems.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        total: allRows.length,
        distributions: {
          system1: distOf("system1"),
          system2: distOf("system2"),
          system3: distOf("system3"),
        },
        agreement,
        rows: allRows,
      },
      null,
      2,
    ),
  );

  console.log(`\nWrote ${allRows.length} rows`);
  console.log("Distributions:");
  console.log("  Sistem 1 (Legacy):  ", distOf("system1"));
  console.log("  Sistem 2 (Operator):", distOf("system2"));
  console.log("  Sistem 3 (V2):      ", distOf("system3"));
  console.log("\nPair-wise agreement (action ekseninde):");
  for (const [k, v] of Object.entries(agreement)) {
    console.log(`  ${k.padEnd(22)} ${v.matches}/${v.total} = ${v.pct}%`);
  }
}

main().catch((e) => {
  console.error("error:", e.message);
  process.exit(1);
});
