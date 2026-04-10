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
  commercialTruthCoverage: MetaCommercialTruthCoverage;
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
}
```

## Other decision objects

- `MetaBudgetShift`
  - explainable read-only movement from one campaign to another
  - includes `from`, `to`, `whyNow`, `riskLevel`, `expectedBenefit`, `suggestedMoveBand`
- `MetaGeoDecision`
  - operational GEO action with evidence, guardrails, and change triggers
- `MetaPlacementAnomaly`
  - automation-first anomaly object for exception review only
- `MetaNoTouchItem`
  - stable winner or protected path the operator should avoid disturbing
- `MetaCommercialTruthCoverage`
  - explains whether business-specific truth was available or conservative fallback was used

## Non-goals

- No action execution
- No write-back
- No AI-generated decision objects
- No manual placement control surface
