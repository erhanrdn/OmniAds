# Creative Decision Center V2.1 Migration Plan

## Recommendation

Choose Option A: extend V2 to V2.1.

Do not create a new core. Repo evidence does not justify it:

| Factor | Extend V2 | New core |
|---|---|---|
| Existing safety gate | Already present; passed 78 gold rows | Must rebuild |
| Primary decision contract | Already clean and narrow | Duplicates V2 |
| Current production surface | V1/operator, not V2 | Still needs migration either way |
| Risk of losing operator logic | Medium/high | Very high |
| Time to shadow MVP | 4-8 weeks | 10-16+ weeks |
| Safer path | Additive adapter + dual-run | New authority with more blast radius |

## Proposed Contracts

```ts
type V21PrimaryDecision = "Scale" | "Cut" | "Refresh" | "Protect" | "Test More" | "Diagnose";
type BuyerAction =
  | "scale" | "cut" | "refresh" | "protect" | "test_more"
  | "watch_launch" | "fix_delivery" | "fix_policy" | "diagnose_data";

interface CreativeDecisionOsV21Output {
  contractVersion: "creative-decision-os.v2.1";
  engineVersion: string;
  primaryDecision: V21PrimaryDecision;
  actionability: "direct" | "review_only" | "blocked" | "diagnose";
  confidence: number;
  maturity: "too_early" | "learning" | "actionable" | "mature";
  priority: "critical" | "high" | "medium" | "low";
  problemClass:
    | "performance" | "creative" | "fatigue" | "delivery" | "policy"
    | "data_quality" | "campaign_context" | "insufficient_signal" | "launch_monitoring";
  reasonTags: string[];
  evidenceSummary: string;
  blockerReasons: string[];
  missingData: string[];
  queueEligible: false;
  applyEligible: false;
}

interface CreativeDecisionCenterRowDecision {
  scope: "creative";
  creativeId: string;
  familyId?: string | null;
  engine: CreativeDecisionOsV21Output;
  buyerAction: BuyerAction;
  buyerLabel: string;
  uiBucket: BuyerAction;
  confidenceBand: "high" | "medium" | "low";
  priority: "critical" | "high" | "medium" | "low";
  oneLine: string;
  reasons: string[];
  nextStep: string;
}

interface CreativeDecisionCenterAggregateDecision {
  scope: "page" | "family";
  familyId?: string | null;
  action:
    | "brief_variation"
    | "creative_supply_warning"
    | "winner_gap"
    | "fatigue_cluster"
    | "unused_approved_creatives";
  priority: "critical" | "high" | "medium" | "low";
  confidence: number;
  oneLine: string;
  reasons: string[];
  affectedCreativeIds: string[];
  nextStep: string;
  missingData: string[];
}

interface DecisionCenterSnapshot {
  contractVersion: "creative-decision-center.v2.1";
  generatedAt: string;
  sourceSnapshotId?: string | null;
  rowDecisions: CreativeDecisionCenterRowDecision[];
  aggregateDecisions: CreativeDecisionCenterAggregateDecision[];
  todayBrief: Array<{ id: string; priority: string; text: string; rowIds: string[] }>;
  actionBoard: Record<BuyerAction, string[]>;
}

interface BuyerActionMappingRule {
  when: {
    primaryDecision?: V21PrimaryDecision;
    problemClass?: CreativeDecisionOsV21Output["problemClass"];
    reasonTagsAny?: string[];
    actionability?: CreativeDecisionOsV21Output["actionability"];
    requiredData?: string[];
  };
  output: {
    buyerAction: BuyerAction;
    buyerLabel: string;
    uiBucket: BuyerAction;
    nextStepTemplate: string;
  };
}

interface CreativeDecisionConfig {
  launchWindowHours: number;
  noSpendWindowHours: number;
  minSpendForMaturityMultiplier: number;
  minPurchasesForScale: number;
  minImpressionsForCtrReliability: number;
  fatigueCtrDropPct: number;
  fatigueCpmIncreasePct: number;
  fatigueFrequencyIncreasePct: number;
  maxCpaOverTargetForCut: number;
  minRoasOverTargetForScale: number;
  winnerGapDays: number;
  fatigueClusterTopN: number;
  benchmarkReliabilityMinimum: "strong" | "medium" | "weak";
  staleDataHours: number;
  minConfidenceForScale: number;
  minConfidenceForCut: number;
}
```

## Deterministic Adapter Rules

| input | output | guard |
|---|---|---|
| Diagnose + delivery + `active_no_spend_24h` | `fix_delivery` | requires active ad/campaign/adset + spend24h=0 + impressions24h=0 |
| Diagnose + policy + `disapproved_or_limited` | `fix_policy` | requires review/effective status or reason |
| Test More + launch_monitoring | `watch_launch` | requires firstSeenAt/firstSpendAt/launchAgeHours |
| Scale + performance | `scale` | review-only by default |
| Cut + performance | `cut` | review-only unless future policy says otherwise |
| Refresh + fatigue/creative | `refresh` | requires fatigue evidence for fatigue problemClass |
| Diagnose + data_quality | `diagnose_data` | default safe fallback |

The adapter must be table-driven. It must not score, rank, or invent a new primary decision.

## Backward-Compatible Response Shape

Current `CreativeDecisionOsSnapshotApiResponse` only has `contractVersion`, `status`, `scope`, `snapshot`, `decisionOs`, `error` (`lib/creative-decision-os-snapshots.ts` lines 75-82).

Safer additive shape:

```ts
{
  contractVersion,
  status,
  scope,
  snapshot,
  decisionOs,          // unchanged V1
  error,
  decisionCenter: null // or object behind flag
}
```

Do not replace `decisionOs` with `legacyDecisionOs` yet. That would break `src/services/data-service-ai.ts` and Creative page consumers.

## Config-As-Data

| Key | Safe default | Notes |
|---|---:|---|
| launchWindowHours | 72 | Conservative launch guard |
| noSpendWindowHours | 24 | Requires 24h window data |
| minSpendForMaturityMultiplier | 2 | Use target CPA if present |
| minPurchasesForScale | 5 | Prevent tiny-sample scale |
| minImpressionsForCtrReliability | 5000 | CTR trend reliability |
| fatigueCtrDropPct | 25 | Composite only |
| fatigueCpmIncreasePct | 20 | Composite only |
| fatigueFrequencyIncreasePct | 25 | Composite only |
| maxCpaOverTargetForCut | 1.8 | Review-only cut |
| minRoasOverTargetForScale | 1.25 | Review-only scale |
| winnerGapDays | 7 | Aggregate only |
| fatigueClusterTopN | 3 | Aggregate only |
| benchmarkReliabilityMinimum | medium | Scale/cut guard |
| staleDataHours | 36 | Hard diagnose guard |
| minConfidenceForScale | 70 | Adapter guard |
| minConfidenceForCut | 70 | Adapter guard |

Recommendation: start with a TS config module plus account/business override rows later. Do not scatter thresholds inside resolver branches.

## Minimal Safe PR Sequence

| PR | Scope |
|---:|---|
| 1 | Docs, vocabulary mapping, import graph, spike script artifacts |
| 2 | Golden fixtures + adapter/resolver tests only; allow failing tests if behavior not implemented |
| 3 | Read-only data readiness script with DB snapshot loader, guarded by `DATABASE_URL`, no writes |
| 4 | V2.1 contract types only, no behavior change |
| 5 | Deterministic buyer adapter in shadow mode |
| 6 | Add optional `decisionCenter` to snapshot response behind flag; keep `decisionOs` unchanged |
| 7 | Minimal drawer reads `decisionCenter.rowDecision` if present, V1 fallback otherwise |
| 8 | Today Brief + Action Board behind flag |
| 9 | Table badges migrate to `buyerAction` behind flag |
| 10 | Aggregate decisions behind flag after data proves readiness |

Explicitly do not do yet: route renames, runtime writes, automated queue/apply, row-level `brief_variation`, production default V2.1, deleting V1/operator surfaces.

