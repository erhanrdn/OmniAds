# Phase 03 - Meta Action Contract

## Route

- `GET /api/meta/decision-os?businessId&startDate&endDate`

## Response

```ts
interface MetaDecisionOsV1Response {
  contractVersion: "meta-decision-os.v1";
  generatedAt: string;
  businessId: string;
  startDate: string;
  endDate: string;
  summary: MetaDecisionOsSummary;
  campaigns: MetaCampaignDecision[];
  adSets: MetaAdSetDecision[];
  budgetShifts: MetaBudgetShift[];
  geoDecisions: MetaGeoDecision[];
  placementAnomalies: MetaPlacementAnomaly[];
  noTouchList: MetaNoTouchItem[];
  winnerScaleCandidates: MetaWinnerScaleCandidate[];
  commercialTruthCoverage: MetaCommercialTruthCoverage;
}
```

`contractVersion` remains `meta-decision-os.v1`. GEO V2 is additive only.
Meta Strategy Engine V2 is also additive only.

## Additive policy metadata

```ts
interface MetaDecisionPolicy {
  strategyClass:
    | MetaAdSetActionType
    | "review_hold"
    | "review_cost_cap"
    | "creative_refresh_required"
    | "stable_no_touch";
  objectiveFamily:
    | "sales"
    | "catalog"
    | "leads"
    | "traffic"
    | "awareness"
    | "engagement"
    | "unknown";
  bidRegime: "open" | "cost_cap" | "bid_cap" | "roas_floor" | "unknown";
  primaryDriver:
    | "constraint_pressure"
    | "roas_outperforming"
    | "cpa_efficiency"
    | "break_even_loss"
    | "signal_density"
    | "recent_change_cooldown"
    | "mixed_config"
    | "creative_fatigue"
    | "winner_stability"
    | "bid_regime_pressure"
    | "geo_validation"
    | "objective_upgrade"
    | "degraded_truth_cap"
    | "thin_signal";
  secondaryDrivers: string[];
  winnerState:
    | "scale_candidate"
    | "stable_no_touch"
    | "guarded"
    | "creative_refresh_required"
    | "recovering"
    | "not_a_winner"
    | "degraded";
}
```

## Campaign decision

```ts
interface MetaCampaignDecision {
  campaignId: string;
  campaignName: string;
  status: string;
  role:
    | "Promo / Clearance"
    | "Catalog / DPA"
    | "Retargeting"
    | "Existing Customer / LTV"
    | "Geo Expansion"
    | "Prospecting Scale"
    | "Prospecting Validation"
    | "Prospecting Test";
  primaryAction: MetaAdSetActionType;
  confidence: number;
  why: string;
  evidence: MetaDecisionEvidence[];
  guardrails: string[];
  noTouch: boolean;
  whatWouldChangeThisDecision: string[];
  adSetDecisionIds: string[];
  laneLabel: "Scaling" | "Validation" | "Test" | null;
  policy: MetaDecisionPolicy;
}
```

## Ad set decision

```ts
interface MetaAdSetDecision {
  decisionId: string;
  adSetId: string;
  adSetName: string;
  campaignId: string;
  campaignName: string;
  actionType:
    | "pause"
    | "recover"
    | "rebuild"
    | "scale_budget"
    | "reduce_budget"
    | "hold"
    | "duplicate_to_new_geo_cluster"
    | "merge_into_pooled_geo"
    | "switch_optimization"
    | "tighten_bid"
    | "broaden"
    | "monitor_only";
  actionSize: "none" | "small" | "medium" | "large";
  priority: "critical" | "high" | "medium" | "low";
  confidence: number;
  reasons: string[];
  guardrails: string[];
  relatedCreativeNeeds: string[];
  relatedGeoContext: string[];
  supportingMetrics: {
    spend: number;
    revenue: number;
    roas: number;
    cpa: number | null;
    ctr: number | null;
    purchases: number;
    impressions: number;
    clicks: number;
    bidStrategyLabel: string | null;
    optimizationGoal: string | null;
    dailyBudget: number | null;
    lifetimeBudget: number | null;
  };
  whatWouldChangeThisDecision: string[];
  noTouch: boolean;
  policy: MetaDecisionPolicy;
}
```

`strategyClass` is the Meta Strategy Engine V2 semantic layer.
`actionType` remains the operationally stable action family used by existing queue and execution compatibility code.

## Winner scale candidates

```ts
interface MetaWinnerScaleCandidate {
  candidateId: string;
  campaignId: string;
  campaignName: string;
  adSetId: string;
  adSetName: string;
  confidence: number;
  why: string;
  suggestedMoveBand: string;
  evidence: MetaDecisionEvidence[];
  guardrails: string[];
  supportingMetrics: {
    spend: number;
    revenue: number;
    roas: number;
    cpa: number | null;
    ctr: number | null;
    purchases: number;
    dailyBudget: number | null;
    bidStrategyLabel: string | null;
    optimizationGoal: string | null;
  };
  policy: MetaDecisionPolicy;
}
```

## Other decision objects

- `MetaBudgetShift`
  - explainable read-only movement from one campaign to another
  - includes `from`, `to`, `whyNow`, `riskLevel`, `expectedBenefit`, `suggestedMoveBand`
- `MetaGeoDecision`
  - operational GEO action with evidence, guardrails, change triggers, and additive GEO V2 metadata
  - additive fields:
    - `queueEligible`
    - `clusterKey`
    - `clusterLabel`
    - `grouped`
    - `groupMemberCount`
    - `groupMemberLabels`
    - `materiality`
    - `supportingMetrics`
    - `freshness`
    - `commercialContext`
- `MetaPlacementAnomaly`
  - automation-first anomaly object for exception review only
- `MetaNoTouchItem`
  - stable winner or protected path the operator should avoid disturbing
- `MetaCommercialTruthCoverage`
  - explains whether business-specific truth was available or conservative fallback was used

## GEO summary

`MetaDecisionOsSummary` now includes additive `geoSummary` fields:

- `actionCoreCount`
- `watchlistCount`
- `queuedCount`
- `pooledClusterCount`
- `sourceFreshness`
- `countryEconomics`

It also includes additive `winnerScaleSummary` fields:

- `candidateCount`
- `protectedCount`
- `headline`

## GEO queue semantics

- `queueEligible=true` means the GEO row is material, non-archive, and still in the deterministic action core.
- `queueEligible=false` GEO rows remain operator-visible on the Meta page but do not enter the default Command Center queue.
- Fingerprint format is unchanged; the intake is behaviorally narrower, not version-bumped.

## Non-goals

- No action execution
- No write-back
- No AI-generated decision objects
- No manual placement control surface
- No execution subset expansion beyond existing Phase 06 supported actions
