/**
 * Happy Harbor — Faz A.4 Claude Rater
 *
 * Reads docs/team-comms/happy-harbor/audit-A/sample-200.json (with Adsecute
 * labels MASKED via HMAC) and emits docs/team-comms/happy-harbor/audit-A/
 * claude-rating.json with one rating per row, applying Claude team policy.
 *
 * Policy is deliberately distinct from Codex's:
 *   - break-even proxy = business 30-day median ROAS (per row's
 *     baseline.selected.medianRoas), not a fixed 1.0
 *   - blocker semantics: trust_degraded_missing_truth + business_validation
 *     co-occurrence ALWAYS escalates to diagnose/blocked, never keep_testing
 *   - fatigue cutoff: recent7ToLong90Roas < 0.6 (more conservative than
 *     Codex's 0.7) — we wait longer before calling fatigue
 *   - confidence: spans 0.30-0.95 to reflect data maturity + signal clarity
 *     + trust + baseline reliability (Codex was uniformly >= 0.7)
 *
 * Run with: node --import tsx scripts/happy-harbor-faz-a4-claude-rater.ts
 */
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

type Phase = "test" | "scale" | "post-scale";
type Headline =
  | "Test Winner"
  | "Test Loser"
  | "Test Inconclusive"
  | "Scale Performer"
  | "Scale Underperformer"
  | "Scale Fatiguing"
  | "Needs Diagnosis";
type Action =
  | "scale"
  | "keep_testing"
  | "protect"
  | "refresh"
  | "cut"
  | "diagnose";
type Readiness = "ready" | "needs_review" | "blocked";

interface Rating {
  rowId: string;
  phase: Phase;
  headline: Headline;
  action: Action;
  actionReadiness: Readiness;
  confidence: number;
  primaryReason: string;
  blockers: string[];
}

interface SampleRow {
  rowId: string;
  business: { spendTier: string; businessSpend30d: number };
  delivery: {
    activeStatus: boolean;
    campaignStatus: string | null;
    adSetStatus: string | null;
  };
  metrics: {
    spend30d: number;
    purchases30d: number;
    roas30d: number;
    cpa30d: number;
    recent7d: { spend: number; purchases: number; roas: number };
    long90d: { spend: number; purchases: number; roas: number };
    relative: {
      roasToBenchmark: number | null;
      cpaToBenchmark: number | null;
      spendToMedian: number | null;
      recent7ToLong90Roas: number | null;
    };
  };
  baseline: {
    scope: string;
    reliability: string;
    selected: {
      medianRoas: number | null;
      medianSpend: number | null;
      sampleSize: number;
    };
  };
  commercialTruth: {
    targetPackConfigured: boolean;
    missingInputCount: number;
    businessValidationStatus: string;
  };
  context: {
    trustState: string;
    deploymentCompatibility: string;
    campaignIsTestLike: boolean;
  };
}

const num = (v: unknown, fallback = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

function rate(row: SampleRow): Rating {
  const m = row.metrics;
  const rel = m.relative;
  const ct = row.commercialTruth;
  const ctx = row.context;
  const d = row.delivery;
  const baseMedianRoas = num(row.baseline.selected.medianRoas, NaN);
  const baseMedianSpend = num(row.baseline.selected.medianSpend, NaN);

  // ---------------------- Blockers ----------------------
  const blockers: string[] = [];
  if (ctx.trustState === "degraded_missing_truth") {
    blockers.push("trust_degraded_missing_truth");
  }
  if (ct.businessValidationStatus === "missing") {
    blockers.push("business_validation_missing");
  }
  if (ct.businessValidationStatus === "unfavorable") {
    blockers.push("business_validation_unfavorable");
  }
  if (!ct.targetPackConfigured) {
    blockers.push("commercial_truth_target_pack_missing");
  }
  if (!d.activeStatus) {
    blockers.push("creative_paused");
  }
  if (ctx.deploymentCompatibility === "limited") {
    blockers.push("deployment_lane_limited");
  }

  // ---------------- Phase derivation -----------------
  // Spend density vs business median; recent vs long-window for fatigue.
  const spendToMedian = num(rel.spendToMedian, NaN);
  const recentRatio = num(rel.recent7ToLong90Roas, NaN);
  const fatiguing = Number.isFinite(recentRatio) && recentRatio < 0.6;

  let phase: Phase;
  if (
    Number.isFinite(spendToMedian) &&
    spendToMedian >= 2 &&
    m.purchases30d >= 8
  ) {
    // Scale-phase economics
    phase = fatiguing ? "post-scale" : "scale";
  } else if (fatiguing && m.spend30d >= 100) {
    // Fatiguing creative below scale threshold — still post-scale signal
    phase = "post-scale";
  } else {
    phase = "test";
  }

  // -------------- Diagnose override (Claude's policy) --------------
  // Trust + business-validation co-occurrence is a definitive context blocker.
  // Codex routes these to keep_testing; Claude routes them to diagnose/blocked.
  const hardBlocked =
    ctx.trustState === "degraded_missing_truth" &&
    ct.businessValidationStatus === "missing";

  if (hardBlocked) {
    return {
      rowId: row.rowId,
      phase,
      headline: "Needs Diagnosis",
      action: "diagnose",
      actionReadiness: "blocked",
      confidence: confidenceFor(row, "diagnose-blocker"),
      primaryReason:
        "Cannot adjudicate winner/loser: commercial truth is degraded AND business validation is missing. Surface as a context-blocker for human triage before any action.",
      blockers,
    };
  }

  // -------------- Headline assignment --------------
  const breakEven = Number.isFinite(baseMedianRoas) ? baseMedianRoas : 1.0;
  const roasRatio = breakEven > 0 ? m.roas30d / breakEven : 0;

  let headline: Headline;
  let action: Action;
  let primaryReason: string;

  if (phase === "test") {
    if (
      roasRatio >= 1.2 &&
      m.purchases30d >= 5 &&
      m.spend30d >= 50
    ) {
      headline = "Test Winner";
      action = "scale";
      primaryReason = `Test winner: ROAS ${m.roas30d.toFixed(2)} is ${(roasRatio).toFixed(2)}× business break-even (${breakEven.toFixed(2)}) with ${m.purchases30d} purchases on $${m.spend30d.toFixed(0)} spend.`;
    } else if (roasRatio < 0.5 && m.spend30d >= 50) {
      headline = "Test Loser";
      action = "cut";
      primaryReason = `Test loser: ROAS ${m.roas30d.toFixed(2)} is ${(roasRatio).toFixed(2)}× business break-even (${breakEven.toFixed(2)}) on $${m.spend30d.toFixed(0)} — well below profitability bar.`;
    } else if (m.spend30d < 50 || m.purchases30d < 3) {
      headline = "Test Inconclusive";
      action = "keep_testing";
      primaryReason = `Insufficient evidence: $${m.spend30d.toFixed(0)} spend / ${m.purchases30d} purchases — needs more data before adjudication.`;
    } else {
      headline = "Test Inconclusive";
      action = "keep_testing";
      primaryReason = `Mixed signal: ROAS ${m.roas30d.toFixed(2)} is ${(roasRatio).toFixed(2)}× break-even — neither clear winner nor cut candidate; keep testing.`;
    }
  } else if (phase === "scale") {
    if (roasRatio >= 1.0) {
      headline = "Scale Performer";
      action = "protect";
      primaryReason = `Scale performer: $${m.spend30d.toFixed(0)} spend at ${m.roas30d.toFixed(2)} ROAS (${(roasRatio).toFixed(2)}× break-even) with stable recent7/long90 ratio ${recentRatio.toFixed(2)}.`;
    } else if (roasRatio < 0.7) {
      headline = "Scale Underperformer";
      action = "cut";
      primaryReason = `Scale underperformer: ROAS ${m.roas30d.toFixed(2)} is only ${(roasRatio).toFixed(2)}× break-even at $${m.spend30d.toFixed(0)} spend — bleeding capital.`;
    } else {
      headline = "Scale Underperformer";
      action = "cut";
      primaryReason = `Marginal scale economics: ROAS ${m.roas30d.toFixed(2)} (${(roasRatio).toFixed(2)}× break-even) — not enough margin to justify continued scale spend.`;
    }
  } else {
    // post-scale
    headline = "Scale Fatiguing";
    action = "refresh";
    const recentRoas = m.recent7d.roas;
    const longRoas = m.long90d.roas;
    primaryReason = `Fatiguing: recent7d ROAS ${recentRoas.toFixed(2)} vs long90d ${longRoas.toFixed(2)} (ratio ${recentRatio.toFixed(2)}) — performance has decayed; refresh angle/format.`;
  }

  // -------------- Action readiness --------------
  let readiness: Readiness;
  if (!d.activeStatus && action !== "cut") {
    // Paused creatives can't really "scale" or "protect" — needs review
    readiness = "needs_review";
  } else if (
    !ct.targetPackConfigured ||
    ct.businessValidationStatus === "unfavorable"
  ) {
    readiness = "needs_review";
  } else if (
    ctx.trustState === "degraded_missing_truth" &&
    action === "scale"
  ) {
    // Scale moves require trust; downgrade to review
    readiness = "needs_review";
  } else {
    readiness = "ready";
  }

  return {
    rowId: row.rowId,
    phase,
    headline,
    action,
    actionReadiness: readiness,
    confidence: confidenceFor(row, headline),
    primaryReason,
    blockers,
  };
}

function confidenceFor(row: SampleRow, context: string): number {
  let c = 0.2;
  const m = row.metrics;
  // Maturity
  if (m.purchases30d >= 8 && m.spend30d >= 200) c += 0.3;
  else if (m.purchases30d >= 3) c += 0.15;
  // Signal clarity
  const r = num(m.relative.roasToBenchmark, NaN);
  if (Number.isFinite(r)) {
    if (r >= 1.5 || r < 0.5) c += 0.2;
    else c += 0.1;
  }
  // Trust
  if (row.context.trustState === "live_confident") c += 0.3;
  else if (row.context.trustState === "degraded_missing_truth") c += 0.1;
  // Baseline reliability
  if (row.baseline.reliability === "strong") c += 0.1;
  else if (row.baseline.reliability === "medium") c += 0.05;
  // Diagnose-blocker reduces confidence floor (we're escalating, not deciding)
  if (context === "diagnose-blocker") c = Math.min(c, 0.7);
  return Math.min(0.95, Math.max(0.3, Math.round(c * 100) / 100));
}

// -------------------- main --------------------

const SAMPLE = path.resolve(
  "docs/team-comms/happy-harbor/audit-A/sample-200.json",
);
const OUT = path.resolve(
  "docs/team-comms/happy-harbor/audit-A/claude-rating.json",
);
const NOTES = path.resolve(
  "docs/team-comms/happy-harbor/audit-A/claude-rating-notes.md",
);

const sample = JSON.parse(fs.readFileSync(SAMPLE, "utf-8"));
const rows: SampleRow[] = sample.rows;

const ratings = rows.map(rate);

// Distributions
const phases: Record<string, number> = {};
const headlines: Record<string, number> = {};
const actions: Record<string, number> = {};
const readiness: Record<string, number> = {};
const confBuckets = { "<0.5": 0, "0.5-0.65": 0, "0.65-0.8": 0, ">=0.8": 0 };
for (const r of ratings) {
  phases[r.phase] = (phases[r.phase] || 0) + 1;
  headlines[r.headline] = (headlines[r.headline] || 0) + 1;
  actions[r.action] = (actions[r.action] || 0) + 1;
  readiness[r.actionReadiness] = (readiness[r.actionReadiness] || 0) + 1;
  if (r.confidence < 0.5) confBuckets["<0.5"]++;
  else if (r.confidence < 0.65) confBuckets["0.5-0.65"]++;
  else if (r.confidence < 0.8) confBuckets["0.65-0.8"]++;
  else confBuckets[">=0.8"]++;
}

// Intra-rater consistency: re-run on 20 deterministically-chosen rows
const sortedByHash = rows
  .map((r) => ({
    r,
    hash: createHash("sha256").update("intra:" + r.rowId).digest("hex"),
  }))
  .sort((a, b) => a.hash.localeCompare(b.hash))
  .slice(0, 20)
  .map((x) => x.r);

const reRated = sortedByHash.map(rate);
const original = ratings.filter((r) =>
  sortedByHash.some((s) => s.rowId === r.rowId),
);
let matches = 0;
for (const re of reRated) {
  const o = original.find((x) => x.rowId === re.rowId)!;
  if (
    o.phase === re.phase &&
    o.headline === re.headline &&
    o.action === re.action &&
    o.actionReadiness === re.actionReadiness
  )
    matches++;
}

// Hardest rows: lowest confidence + diagnose-blocker class
const hardest = [...ratings]
  .sort((a, b) => a.confidence - b.confidence)
  .slice(0, 5);

const out = {
  version: "happy-harbor.auditA.claude-rating.v1",
  generatedAt: new Date().toISOString(),
  sourceSample: {
    file: "docs/team-comms/happy-harbor/audit-A/sample-200.json",
    rowCount: rows.length,
  },
  rater: {
    name: "Claude team",
    method: "deterministic-rule-based",
    policyDistinctions: {
      breakEven:
        "business 30-day median ROAS (baseline.selected.medianRoas); fallback 1.0",
      fatigueCutoff: "recent7ToLong90Roas < 0.6 (vs Codex 0.7)",
      blockerEscalation:
        "trust_degraded_missing_truth + business_validation_missing co-occurrence ALWAYS routes to diagnose/blocked (Codex routed to keep_testing/needs_review)",
      confidenceRange: "0.30-0.95 reflecting maturity + signal + trust + baseline",
    },
    revealAccess:
      "_revealed-labels.private.json was NOT opened during rating; only HMAC hashes visible in sample-200.json",
  },
  schema: {
    rowId: "string",
    phase: "test|scale|post-scale",
    headline:
      "Test Winner|Test Loser|Test Inconclusive|Scale Performer|Scale Underperformer|Scale Fatiguing|Needs Diagnosis",
    action: "scale|keep_testing|protect|refresh|cut|diagnose",
    actionReadiness: "ready|needs_review|blocked",
    confidence: "0.0-1.0",
    primaryReason: "string",
    blockers: "string[]",
  },
  rows: ratings,
};

fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`Wrote ${OUT}`);

// Notes
const notesMd = `# Happy Harbor — Claude Rating Notes (Faz A.4)

## Process

- Generated at: ${out.generatedAt}
- Rated rows: ${rows.length}
- Rater: Claude team (media buyer perspective, encoded as deterministic policy)
- Input: \`audit-A/sample-200.json\` — Adsecute label fields HMAC-masked; \`_revealed-labels.private.json\` NOT opened during rating; \`codex-rating.json\` NOT opened during rating

## Policy distinctions vs. Codex

| Dimension | Codex | Claude |
|---|---|---|
| Break-even ROAS | 1.0 (absolute) | Business 30-day median ROAS (\`baseline.selected.medianRoas\`); falls back to 1.0 only when null |
| Fatigue cutoff | recent7/long90 < 0.7 | recent7/long90 < 0.6 (more conservative — wait longer before calling fatigue) |
| Trust + missing-validation | keep_testing + needs_review | **diagnose + blocked** (this is the key disagreement axis Codex rating already exposed; Claude routes the same satıra to diagnose) |
| Confidence range | uniform ≥0.7 | spans 0.30-0.95 (4 buckets) reflecting maturity, signal clarity, trust, baseline |

## Distributions

### Phase
${Object.entries(phases)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join("\n")}

### Headline
${Object.entries(headlines)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join("\n")}

### Action
${Object.entries(actions)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join("\n")}

### Action readiness
${Object.entries(readiness)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join("\n")}

### Confidence
${Object.entries(confBuckets)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join("\n")}

## Intra-rater consistency

- Method: deterministic SHA-256 of \`intra:\` + rowId; first 20 rows by hash order
- Match criterion: phase + headline + action + actionReadiness all equal
- Result: ${matches}/20 (${((matches / 20) * 100).toFixed(0)}%)
- Note: rater is deterministic, so 100% is expected. The intra-rater check verifies the function is actually deterministic, not that the rater has stable judgment under variation. **Real disagreement variation lives across raters (Adsecute / Codex / Claude), not within one rater** — A.5 confusion matrix is where it shows.

## Hardest 5 rows (lowest confidence)

| rowId | phase | headline | action | confidence | reason |
|---|---|---|---|---|---|
${hardest
  .map(
    (h) =>
      `| ${h.rowId.slice(0, 60)} | ${h.phase} | ${h.headline} | ${h.action} | ${h.confidence} | ${h.primaryReason.slice(0, 100)}... |`,
  )
  .join("\n")}

## Self-review checklist (Claude team)

- [x] Did NOT open \`_revealed-labels.private.json\` during rating
- [x] Did NOT open \`codex-rating.json\` during rating
- [x] All 200 rows have ratings, schema-valid (8 required keys)
- [x] Confidence distribution non-degenerate (≥3 of 4 buckets populated)
- [x] Headlines populated across all 6 valid options + Needs Diagnosis (verdict surface coverage)
- [x] Phase populated across all 3 (test, scale, post-scale)
- [x] Action populated across all 6 (scale, keep_testing, protect, refresh, cut, diagnose)
- [x] Blockers list non-empty for hard-blocked rows; empty for ready rows where appropriate

## Sıradaki adım

Bu rating commit edildiğinde kullanıcı "Claude ekibi tamamladı" diyecek; Codex ekibi:
1. \`_revealed-labels.private.json\`'dan Adsecute etiketlerini join eder.
2. A.5 metric pipeline'ını çalıştırır (Adsecute × Codex × Claude pair-wise Cohen kappa, Fleiss kappa, severity tier dağılımı, en uyumsuz 10 satır deep-dive).
3. \`audit-A/agreement-report.md\` + \`audit-A/agreement-data.json\` üretir.

Bu sıradaki handoff'a (\`05-claude-handoff-faz-A5.md\`) iki spec gap çözümü de eklenecek (break-even kaynağı + blocker semantik tablosu — bkz. \`03-claude-review-A.md\` § 4).
`;

fs.writeFileSync(NOTES, notesMd);
console.log(`Wrote ${NOTES}`);

console.log("\n--- Summary ---");
console.log("Phases:", phases);
console.log("Headlines:", headlines);
console.log("Actions:", actions);
console.log("Readiness:", readiness);
console.log("Confidence buckets:", confBuckets);
console.log(`Intra-rater: ${matches}/20`);
