/**
 * Faz F — Production audit on IwaStore + TheSwaf
 * Extracts the FULL signal set a real media buyer would consult, not just ROAS.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { Pool } from "pg";

const BUSINESSES = [
  { id: "f8a3b5ac-588c-462f-8702-11cd24ff3cd2", label: "IwaStore" },
  { id: "172d0ab8-495b-4679-a4c6-ffa404c389d3", label: "TheSwaf" },
];

const OUT_DIR = path.resolve(
  "docs/team-comms/happy-harbor/audit-F-iwastore-theswaf",
);

const num = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? v : 0;
const nullableNum = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
  });

  const allRaw: any[] = [];
  const allLabels: any[] = [];

  for (const biz of BUSINESSES) {
    const r = await pool.query(
      "SELECT generated_at, payload FROM creative_decision_os_snapshots WHERE business_id::text=$1 AND status='ready' ORDER BY generated_at DESC LIMIT 1",
      [biz.id],
    );
    if (r.rows.length === 0) continue;
    const payload =
      typeof r.rows[0].payload === "string"
        ? JSON.parse(r.rows[0].payload)
        : r.rows[0].payload;
    const creatives: any[] = payload.creatives ?? [];
    console.log(
      `${biz.label}: ${creatives.length} creatives (${r.rows[0].generated_at.toISOString()})`,
    );

    for (const c of creatives) {
      const rowId = `${biz.label}|${c.creativeId}`;
      const m = c.benchmark?.metrics ?? {};
      const bench = c.relativeBaseline ?? {};
      const fat = c.fatigue ?? {};
      const econ = c.economics ?? {};
      const trust = c.trust ?? {};
      const delivery = c.deliveryContext ?? {};
      const pattern = c.pattern ?? {};
      const policy = c.policy ?? {};

      const aov = c.purchases > 0 ? num(c.purchaseValue) / c.purchases : null;

      allRaw.push({
        rowId,
        business: biz.label,
        creativeId: c.creativeId,
        creativeName: c.name,
        creativeFormat: c.creativeFormat ?? null,
        creativeAgeDays: nullableNum(c.creativeAgeDays),
        // Identity
        campaignName: delivery.campaignName ?? null,
        adSetName: delivery.adSetName ?? null,
        // Aggregate metrics
        spend: num(c.spend),
        purchases: num(c.purchases),
        purchaseValue: num(c.purchaseValue),
        roas: num(c.roas),
        cpa: num(c.cpa),
        ctr: num(c.ctr),
        impressions: num(c.impressions),
        linkClicks: num(c.linkClicks),
        aov,
        // Benchmark (peer cohort)
        benchmarkRoas: nullableNum(m.roas?.benchmark),
        benchmarkCpa: nullableNum(m.cpa?.benchmark),
        benchmarkCtr: nullableNum(m.ctr?.benchmark),
        roasDeltaPct: nullableNum(m.roas?.deltaPct),
        cpaDeltaPct: nullableNum(m.cpa?.deltaPct),
        ctrDeltaPct: nullableNum(m.ctr?.deltaPct),
        roasVsBenchStatus: m.roas?.status ?? null,
        // Hook rate (attention) + funnel
        attentionCurrent: nullableNum(m.attention?.current),
        attentionBenchmark: nullableNum(m.attention?.benchmark),
        attentionDeltaPct: nullableNum(m.attention?.deltaPct),
        clickToPurchaseCurrent: nullableNum(m.clickToPurchase?.current),
        clickToPurchaseBenchmark: nullableNum(m.clickToPurchase?.benchmark),
        clickToPurchaseDeltaPct: nullableNum(m.clickToPurchase?.deltaPct),
        // Baseline (business-wide)
        baselineMedianRoas: nullableNum(bench.medianRoas),
        baselineMedianCpa: nullableNum(bench.medianCpa),
        baselineMedianSpend: nullableNum(bench.medianSpend),
        baselineReliability: bench.reliability ?? null,
        baselineSampleSize: nullableNum(bench.sampleSize),
        // Fatigue compound
        fatigueStatus: fat.status ?? null,
        roasDecay: nullableNum(fat.roasDecay),
        ctrDecay: nullableNum(fat.ctrDecay),
        clickToPurchaseDecay: nullableNum(fat.clickToPurchaseDecay),
        fatigueConfidence: nullableNum(fat.confidence),
        winnerMemory: Boolean(fat.winnerMemory),
        frequencyPressure: nullableNum(fat.frequencyPressure),
        spendConcentration: nullableNum(fat.spendConcentration),
        // Economics
        targetRoas: nullableNum(econ.targetRoas),
        breakEvenRoas: nullableNum(econ.breakEvenRoas),
        roasFloor: nullableNum(econ.roasFloor),
        targetCpa: nullableNum(econ.targetCpa),
        breakEvenCpa: nullableNum(econ.breakEvenCpa),
        // Trust
        trustState: trust.truthState ?? "unknown",
        // Delivery
        activeDelivery: Boolean(delivery.activeDelivery),
        pausedDelivery: Boolean(delivery.pausedDelivery),
        campaignStatus: delivery.campaignStatus ?? null,
        adSetStatus: delivery.adSetStatus ?? null,
        campaignIsTestLike: Boolean(delivery.campaignIsTestLike),
        // Creative pattern
        hookPattern: pattern.hook ?? null,
        anglePattern: pattern.angle ?? null,
        formatPattern: pattern.format ?? null,
        // Policy / objective
        metaFamily: policy.metaFamily ?? null,
        bidRegime: policy.bidRegime ?? null,
      });

      allLabels.push({
        rowId,
        verdictPhase: c.verdict?.phase ?? null,
        verdictHeadline: c.verdict?.headline ?? null,
        verdictAction: c.verdict?.action ?? null,
        verdictReadiness: c.verdict?.actionReadiness ?? null,
        verdictPhaseSource: c.verdict?.phaseSource ?? null,
        legacyAction: c.legacyAction ?? null,
        legacyLifecycleState: c.legacyLifecycleState ?? null,
        primaryAction: c.primaryAction ?? null,
        lifecycleState: c.lifecycleState ?? null,
        score: c.score ?? null,
        adsecuteConfidence: c.confidence ?? null,
      });
    }
  }

  await pool.end();
  fs.writeFileSync(
    path.join(OUT_DIR, "raw-metrics.json"),
    JSON.stringify(
      { generatedAt: new Date().toISOString(), rows: allRaw },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    path.join(OUT_DIR, "_adsecute-labels.private.json"),
    JSON.stringify(
      { generatedAt: new Date().toISOString(), rows: allLabels },
      null,
      2,
    ),
  );
  console.log(`Wrote ${allRaw.length} rows`);
}

main().catch((e) => {
  console.error("error:", e.message);
  process.exit(1);
});
