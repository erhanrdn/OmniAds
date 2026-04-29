/**
 * Faz F — Multi-signal Claude rating (IwaStore + TheSwaf)
 *
 * Real media-buyer disposition. Considers:
 *   - ROAS strength (vs break-even AND vs peer benchmark)
 *   - CTR strength (creative quality proxy)
 *   - Hook rate / attention (top-of-funnel)
 *   - Click-to-purchase ratio (mid/bottom funnel)
 *   - CPA efficiency
 *   - Compound fatigue (CTR decay + click-to-purchase decay + ROAS decay)
 *   - Frequency pressure / spend concentration
 *   - Winner memory + creative age
 *   - Naming convention (TEST/SCALE prefix)
 *   - Format (catalog/video/static)
 *   - Active vs paused
 *
 * Decision tree distinguishes:
 *   - Holistic winner (all signals strong) → scale
 *   - Creative-quality problem (low CTR/hook) → cut, even if ROAS marginal
 *   - Landing/offer problem (good CTR, bad click-to-purchase) → keep_testing or diagnose
 *   - Fatigue (multi-window decay) → refresh
 *   - Mature loser (low ROAS + spend > floor) → cut
 */
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

interface R {
  rowId: string;
  business: string;
  creativeName: string;
  campaignName: string | null;
  creativeFormat: string | null;
  creativeAgeDays: number | null;
  spend: number;
  purchases: number;
  purchaseValue: number;
  roas: number;
  cpa: number;
  ctr: number;
  impressions: number;
  linkClicks: number;
  aov: number | null;
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
  frequencyPressure: number | null;
  spendConcentration: number | null;
  targetRoas: number | null;
  breakEvenRoas: number | null;
  roasFloor: number | null;
  trustState: string;
  activeDelivery: boolean;
  pausedDelivery: boolean;
  campaignName_: string | null;
  campaignIsTestLike: boolean;
  hookPattern: string | null;
}

interface Rating {
  rowId: string;
  business: string;
  creativeName: string;
  phase: Phase;
  headline: Headline;
  action: Action;
  actionReadiness: Readiness;
  confidence: number;
  primaryReason: string;
  signals: {
    roasStrength: number;
    ctrStrength: number | null;
    hookStrength: number | null;
    funnelStrength: number | null;
    cpaEfficiency: number | null;
    fatigueScore: number;
    isCreativeProblem: boolean;
    isLandingProblem: boolean;
    isHolisticWinner: boolean;
    isHolisticLoser: boolean;
  };
}

function resolveBreakEven(r: R): { value: number; source: string } {
  if (r.breakEvenRoas && r.breakEvenRoas > 0)
    return { value: r.breakEvenRoas, source: "configured" };
  if (r.targetRoas && r.targetRoas > 0)
    return { value: r.targetRoas * 0.75, source: "target_proxy" };
  if (r.roasFloor && r.roasFloor > 0)
    return { value: r.roasFloor, source: "roas_floor" };
  if (r.baselineMedianRoas && r.baselineMedianRoas > 0.5)
    return { value: r.baselineMedianRoas * 0.7, source: "median_proxy" };
  return { value: 1.5, source: "default_floor" };
}

function ratio(a: number | null, b: number | null): number | null {
  if (a === null || b === null || b === 0) return null;
  return a / b;
}

function namingPhaseHint(name: string | null): Phase | null {
  if (!name) return null;
  const n = name.trim();
  if (/^(TEST[_\-\s]|T[_\-]\d|^TST_)/i.test(n) || /[_\-\s]TEST$/i.test(n)) return "test";
  if (/^(SCALE[_\-\s]|S[_\-]\d|CBO[_\-]|ABO[_\-])/i.test(n)) return "scale";
  return null;
}

function derivePhase(r: R): Phase {
  // Naming hint can override only if economics consistent
  const naming = namingPhaseHint(r.campaignName);
  const medSpend = r.baselineMedianSpend ?? 0;

  // Absolute scale economics
  if (r.spend >= 5_000 && r.purchases >= 10) return "scale";
  // Peer-relative scale
  if (medSpend > 0 && r.spend >= medSpend * 2 && r.purchases >= 8) return "scale";
  // Naming says SCALE but no economics yet → still test
  return naming === "scale" ? "test" : "test";
}

function rate(r: R): Rating {
  const { value: breakEven, source: bSource } = resolveBreakEven(r);

  // ============ COMPOSITE SIGNALS ============
  const roasStrength = breakEven > 0 ? r.roas / breakEven : 0;
  const ctrStrength = ratio(r.ctr, r.benchmarkCtr);
  const hookStrength = ratio(r.attentionCurrent, r.attentionBenchmark);
  const funnelStrength = ratio(r.clickToPurchaseCurrent, r.clickToPurchaseBenchmark);
  const cpaEfficiency = ratio(r.benchmarkCpa, r.cpa); // > 1 = our CPA is lower (better)

  const decays = [r.roasDecay, r.ctrDecay, r.clickToPurchaseDecay].filter(
    (v): v is number => v !== null,
  );
  const fatigueScore = decays.length > 0 ? Math.max(...decays) : 0;
  const isFatigued = r.fatigueStatus === "fatigued" || fatigueScore >= 0.4;
  const isWatching =
    r.fatigueStatus === "watch" || (fatigueScore >= 0.2 && fatigueScore < 0.4);

  // Quality flags
  const isStrongCreative =
    (ctrStrength === null || ctrStrength >= 0.85) &&
    (hookStrength === null || hookStrength >= 0.7);
  const isCreativeProblem =
    (ctrStrength !== null && ctrStrength < 0.7) &&
    (hookStrength !== null && hookStrength < 0.7);
  const isLandingProblem =
    ctrStrength !== null &&
    ctrStrength >= 1.0 &&
    funnelStrength !== null &&
    funnelStrength < 0.5;
  const isHolisticWinner =
    roasStrength >= 1.2 &&
    isStrongCreative &&
    (funnelStrength === null || funnelStrength >= 0.9);
  const isHolisticLoser =
    roasStrength < 0.7 &&
    ((ctrStrength !== null && ctrStrength < 0.7) ||
      (funnelStrength !== null && funnelStrength < 0.5));

  const signals = {
    roasStrength,
    ctrStrength,
    hookStrength,
    funnelStrength,
    cpaEfficiency,
    fatigueScore,
    isCreativeProblem,
    isLandingProblem,
    isHolisticWinner,
    isHolisticLoser,
  };

  // ============ BLOCKER ============
  // Real diagnose only when measurement is genuinely broken
  const truelyBroken =
    r.trustState === "degraded_missing_truth" &&
    r.spend < 50 &&
    r.purchases < 2;
  if (truelyBroken) {
    return {
      rowId: r.rowId,
      business: r.business,
      creativeName: r.creativeName,
      phase: "test",
      headline: "Needs Diagnosis",
      action: "diagnose",
      actionReadiness: "blocked",
      confidence: 0.4,
      primaryReason:
        "Trust degraded with negligible delivery — fix measurement before deciding.",
      signals,
    };
  }

  const phase = derivePhase(r);

  // Insufficient data shortcut
  if (r.spend < 30 || r.purchases < 1) {
    return {
      rowId: r.rowId,
      business: r.business,
      creativeName: r.creativeName,
      phase: "test",
      headline: "Test Inconclusive",
      action: "keep_testing",
      actionReadiness: "needs_review",
      confidence: 0.35,
      primaryReason: `Negligible delivery: $${r.spend.toFixed(0)} / ${r.purchases} purchases. Need data.`,
      signals,
    };
  }

  let headline: Headline;
  let action: Action;
  let primaryReason: string;

  // ============ ACTIVE CREATIVES ============
  if (r.activeDelivery) {
    if (phase === "scale") {
      // Fatigued scale winner: refresh if winner memory, cut if no memory
      if (isFatigued && roasStrength >= 0.5) {
        if (r.winnerMemory) {
          headline = "Scale Fatiguing";
          action = "refresh";
          primaryReason = `Scale fatigue (${(fatigueScore * 100).toFixed(0)}% max decay across ROAS/CTR/funnel). Was winner — refresh angle/format. ROAS ${r.roas.toFixed(2)} (${roasStrength.toFixed(2)}× break-even).`;
        } else {
          headline = "Scale Underperformer";
          action = "cut";
          primaryReason = `Decaying scale spend with no winner pedigree. Compound decay ${(fatigueScore * 100).toFixed(0)}%, ROAS ${r.roas.toFixed(2)}.`;
        }
      } else if (roasStrength >= 1.0 && isStrongCreative) {
        headline = "Scale Performer";
        action = "protect";
        primaryReason = `Healthy scaler: ROAS ${r.roas.toFixed(2)} (${roasStrength.toFixed(2)}× break-even ${breakEven.toFixed(2)}/${bSource}), CTR ${r.ctr.toFixed(2)}${ctrStrength !== null ? ` (${ctrStrength.toFixed(2)}× peer)` : ""}, $${r.spend.toFixed(0)} / ${r.purchases} purchases.`;
      } else if (isLandingProblem) {
        headline = "Scale Underperformer";
        action = "cut";
        primaryReason = `Landing/offer problem at scale: CTR ${ctrStrength?.toFixed(2)}× peer (creative pulling clicks), but click-to-purchase ${funnelStrength?.toFixed(2)}× — ROAS ${r.roas.toFixed(2)} insufficient. Cut creative, fix landing.`;
      } else if (roasStrength < 0.7) {
        headline = "Scale Underperformer";
        action = "cut";
        primaryReason = `Scale loser: ROAS ${r.roas.toFixed(2)} (${roasStrength.toFixed(2)}× break-even), $${r.spend.toFixed(0)} bleed.${isCreativeProblem ? " Creative quality also weak." : ""}`;
      } else {
        // marginal scale
        headline = "Scale Underperformer";
        action = "cut";
        primaryReason = `Marginal scale: ROAS ${r.roas.toFixed(2)} (${roasStrength.toFixed(2)}× break-even). Not enough margin to keep scaling at $${r.spend.toFixed(0)}.`;
      }
    } else {
      // ============ TEST PHASE ACTIVE ============
      if (r.spend < 50 || r.purchases < 2) {
        headline = "Test Inconclusive";
        action = "keep_testing";
        primaryReason = `Insufficient evidence: $${r.spend.toFixed(0)} / ${r.purchases} purchases.`;
      } else if (isHolisticWinner && r.purchases >= 5 && r.spend >= 100) {
        headline = "Test Winner";
        action = "scale";
        primaryReason = `Multi-signal winner: ROAS ${roasStrength.toFixed(2)}× break-even, CTR ${ctrStrength?.toFixed(2) ?? "n/a"}× peer, funnel ${funnelStrength?.toFixed(2) ?? "n/a"}× peer. ${r.purchases} purchases @ $${r.spend.toFixed(0)}.`;
      } else if (
        roasStrength >= 1.2 &&
        r.purchases >= 5 &&
        r.spend >= 100 &&
        !isCreativeProblem
      ) {
        headline = "Test Winner";
        action = "scale";
        primaryReason = `Test winner on outcome: ROAS ${r.roas.toFixed(2)} (${roasStrength.toFixed(2)}× break-even). ${r.purchases} purchases @ $${r.spend.toFixed(0)}.${ctrStrength !== null ? ` CTR ${ctrStrength.toFixed(2)}× peer.` : ""}`;
      } else if (isHolisticLoser && r.spend >= 200) {
        headline = "Test Loser";
        action = "cut";
        primaryReason = `Multi-signal loser: ROAS ${roasStrength.toFixed(2)}× break-even, ${ctrStrength !== null && ctrStrength < 0.7 ? `CTR ${ctrStrength.toFixed(2)}× peer (weak hook)` : "weak funnel"}. $${r.spend.toFixed(0)} mature spend.`;
      } else if (isCreativeProblem && r.spend >= 200) {
        headline = "Test Loser";
        action = "cut";
        primaryReason = `Creative-quality problem: CTR ${ctrStrength?.toFixed(2)}× peer + hook ${hookStrength?.toFixed(2)}× peer — even if ROAS marginal (${r.roas.toFixed(2)}), creative is the bottleneck. $${r.spend.toFixed(0)} spend.`;
      } else if (isLandingProblem && r.spend >= 200) {
        headline = "Test Inconclusive";
        action = "keep_testing";
        primaryReason = `Landing/offer problem: CTR ${ctrStrength?.toFixed(2)}× peer (good hook) but funnel ${funnelStrength?.toFixed(2)}× peer (lost mid-funnel). Don't kill creative — fix landing/offer first.`;
      } else if (roasStrength < 0.6 && r.spend >= 200) {
        headline = "Test Loser";
        action = "cut";
        primaryReason = `Test loser: ROAS ${r.roas.toFixed(2)} (${roasStrength.toFixed(2)}× break-even ${breakEven.toFixed(2)}) on $${r.spend.toFixed(0)}.`;
      } else if (roasStrength < 0.85 && r.spend >= 500) {
        headline = "Test Loser";
        action = "cut";
        primaryReason = `Marginal test: ROAS ${r.roas.toFixed(2)} (${roasStrength.toFixed(2)}× break-even). $${r.spend.toFixed(0)} spent without break-out.`;
      } else if (isFatigued && r.winnerMemory) {
        headline = "Scale Fatiguing";
        action = "refresh";
        primaryReason = `Compound fatigue (${(fatigueScore * 100).toFixed(0)}%) with winner memory. Refresh angle even though spend below scale threshold.`;
      } else {
        headline = "Test Inconclusive";
        action = "keep_testing";
        primaryReason = `Mixed signal: ROAS ${r.roas.toFixed(2)} (${roasStrength.toFixed(2)}× break-even)${ctrStrength !== null ? `, CTR ${ctrStrength.toFixed(2)}× peer` : ""}${funnelStrength !== null ? `, funnel ${funnelStrength.toFixed(2)}× peer` : ""}. Need more evidence at $${r.spend.toFixed(0)} / ${r.purchases} purchases.`;
      }
    }
  } else {
    // ============ PAUSED CREATIVES ============
    if (roasStrength >= 1.2 && r.purchases >= 5 && isStrongCreative) {
      if (isFatigued) {
        headline = "Scale Fatiguing";
        action = "refresh";
        primaryReason = `Paused historical winner with fatigue (${(fatigueScore * 100).toFixed(0)}% decay). Refresh angle before reactivating.`;
      } else {
        headline = "Scale Performer";
        action = "protect";
        primaryReason = `Paused historical winner: $${r.spend.toFixed(0)} / ${r.purchases} purchases @ ROAS ${r.roas.toFixed(2)} (${roasStrength.toFixed(2)}× break-even). Reactivation candidate.`;
      }
    } else if (roasStrength < 0.6 && r.spend >= 200) {
      headline = "Test Loser";
      action = "cut";
      primaryReason = `Paused confirmed loser: ROAS ${r.roas.toFixed(2)} on $${r.spend.toFixed(0)} — confirm cut.`;
    } else if (isCreativeProblem && r.spend >= 200) {
      headline = "Test Loser";
      action = "cut";
      primaryReason = `Paused creative-quality loser: CTR ${ctrStrength?.toFixed(2)}× peer, hook weak. Confirm cut.`;
    } else {
      headline = "Test Inconclusive";
      action = "keep_testing";
      primaryReason = `Paused with marginal data: ROAS ${r.roas.toFixed(2)} (${roasStrength.toFixed(2)}× break-even), $${r.spend.toFixed(0)} / ${r.purchases} purchases. Needs context for reactivation.`;
    }
  }

  // ============ READINESS ============
  let readiness: Readiness;
  if (!r.activeDelivery && action !== "cut") {
    readiness = "needs_review";
  } else if (r.trustState === "degraded_missing_truth" && action === "scale") {
    readiness = "needs_review";
  } else if (action === "cut" && r.purchases >= 5) {
    readiness = "ready";
  } else if (action === "cut" || action === "refresh" || action === "protect") {
    readiness = "ready";
  } else {
    readiness = "needs_review";
  }

  // ============ CONFIDENCE ============
  let confidence = 0.2;
  if (r.purchases >= 8 && r.spend >= 200) confidence += 0.3;
  else if (r.purchases >= 3) confidence += 0.15;
  if (Math.abs(roasStrength - 1) >= 0.5) confidence += 0.15;
  else if (Math.abs(roasStrength - 1) >= 0.2) confidence += 0.08;
  // Multi-signal confidence boost
  const signalCount = [ctrStrength, hookStrength, funnelStrength].filter(
    (s) => s !== null,
  ).length;
  confidence += signalCount * 0.05;
  if (r.trustState === "live_confident") confidence += 0.2;
  else if (r.trustState === "degraded_missing_truth") confidence += 0.05;
  if (r.baselineReliability === "strong") confidence += 0.1;
  else if (r.baselineReliability === "medium") confidence += 0.05;
  confidence = Math.min(0.95, Math.max(0.3, Math.round(confidence * 100) / 100));

  return {
    rowId: r.rowId,
    business: r.business,
    creativeName: r.creativeName,
    phase,
    headline,
    action,
    actionReadiness: readiness,
    confidence,
    primaryReason,
    signals,
  };
}

const RAW_PATH = path.resolve(
  "docs/team-comms/happy-harbor/audit-F-iwastore-theswaf/raw-metrics.json",
);
const OUT_PATH = path.resolve(
  "docs/team-comms/happy-harbor/audit-F-iwastore-theswaf/claude-rating.json",
);

const raw = JSON.parse(fs.readFileSync(RAW_PATH, "utf-8"));
const ratings: Rating[] = raw.rows.map(rate);

const phases: Record<string, number> = {};
const headlines: Record<string, number> = {};
const actions: Record<string, number> = {};
const readiness: Record<string, number> = {};
for (const r of ratings) {
  phases[r.phase] = (phases[r.phase] ?? 0) + 1;
  headlines[r.headline] = (headlines[r.headline] ?? 0) + 1;
  actions[r.action] = (actions[r.action] ?? 0) + 1;
  readiness[r.actionReadiness] = (readiness[r.actionReadiness] ?? 0) + 1;
}

fs.writeFileSync(
  OUT_PATH,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      rater:
        "Claude (Faz F multi-signal: ROAS + CTR + hook + funnel + fatigue compound + creative pattern + naming + format + active state)",
      total: ratings.length,
      distributions: { phase: phases, headline: headlines, action: actions, readiness },
      rows: ratings,
    },
    null,
    2,
  ),
);

console.log(`Rated ${ratings.length} creatives (multi-signal)`);
console.log("Phase:", phases);
console.log("Headline:", headlines);
console.log("Action:", actions);
console.log("Readiness:", readiness);
