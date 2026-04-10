# Google Ads Advisor Action Contract

## Goal

The Google Ads advisor is operator-first and manual-plan-first.

The first thing on every recommendation card must be the exact recommended move.

Narrative explanation is secondary.

AI commentary is optional tertiary context and never the source of truth.

Write-back remains disabled.

## Canonical payload surface

The canonical structured surface lives on each recommendation:

- `recommendation.operatorActionCard`

The response-level contract state lives in metadata:

- `metadata.actionContract.version`
- `metadata.actionContract.source`
- `metadata.actionContract.note`
- `metadata.aggregateIntelligence`

Current version:

- `google_ads_advisor_action_v1`

Current sources:

- `native`
- `compatibility_derived`

`native` means the payload was generated with the action contract attached during report generation.

`compatibility_derived` means the payload came from a legacy snapshot and the action card was rebuilt deterministically from older recommendation fields. The UI must say this explicitly and should prompt the operator to refresh the decision snapshot.

## Primary operator card shape

Required fields on `operatorActionCard`:

- `contractVersion`
- `contractSource`
- `recommendationType`
- `primaryAction`
- `scope`
- `exactChanges`
- `exactChangePayload`
- `expectedEffect`
- `whyThisNow`
- `evidence`
- `validation`
- `rollback`
- `blockedBecause`

Optional field:

- `coachNote`

Required top-of-card render order:

- Primary action
- Scope
- Exact changes
- Expected effect
- Why this now
- Evidence
- Validation
- Rollback
- Blocked because

Narrative fields such as `whatHappened`, `whyItHappened`, and `whatToDo` must be collapsed or visually demoted whenever `operatorActionCard` exists.

## Field rules

`primaryAction`

- One sentence.
- Must be directive and operator-facing.
- Must not imply autonomous execution.

`scope`

- Must name the governed entity or decision surface.
- If the scope is portfolio or shared-budget governed, show that directly.
- If the scope is not fully known, say so directly.

`exactChanges`

- Must be list-shaped and copyable.
- Must show exact queries, SKUs, asset groups, assets, campaigns, budgets, or target values when they are available.
- Must not replace explicit unknowns with prose guesses.

`expectedEffect`

- Must state the effect summary.
- Must state one of:
  - bounded range
  - heuristic only
  - directional only
  - not confidently estimable
  - blocked
- Exact revenue or efficiency numbers may only be shown when they already exist in deterministic product logic.

`blockedBecause`

- Must show direct blockers.
- Must not wrap blockers in soft narrative.

`coachNote`

- Optional.
- May summarize the structured move.
- Must not invent new exact queries, SKUs, budgets, target values, or uplift numbers.

## Deterministic product logic vs optional AI commentary

Deterministic product logic:

- `operatorActionCard`
- `exactChangePayload`
- `exactChanges`
- `expectedEffect`
- `blockedBecause`
- `validation`
- `rollback`
- all mutate preview fields already produced by product logic
- persisted weekly top-query and daily cluster aggregate support, when attached through `metadata.aggregateIntelligence` and the recommendation evidence stack

Optional AI commentary:

- `coachNote`
- `recommendation.aiCommentary`

AI commentary may summarize or rephrase.

AI commentary may not become the source of truth when it conflicts with the structured action card.

## Estimation rules

Allowed as bounded:

- `potentialContribution.estimatedRevenueLiftRange`
- `potentialContribution.estimatedWasteRecoveryRange`
- `potentialContribution.estimatedEfficiencyLiftRange`
- exact previewed budget deltas
- exact previewed tROAS or tCPA deltas

Must remain unknown or blocked:

- campaign-level source or destination when no safe preview exists
- proposed target value when the portfolio or joint allocator preview is blocked
- business impact sizing when code or data does not bound it

Aggregate-support rule:

- Persisted weekly top-query and daily cluster aggregates may strengthen recurring-support evidence.
- They may not be turned into fake forecast precision.
- If aggregate support is unavailable, the advisor must say so honestly and fall back to the core window set.

## Exact change payloads by recommendation family

### 1. Query governance

Payload kind:

- `negative_keyword_cleanup`

Required fields:

- `matchType`
- `addNow`
- `suppressed`
- `suppressionReasonLabels`
- `negativeGuardrails`
- `policy`

Render requirements:

- separate `Add exact negatives now`
- separate `Suppressed from negative action`
- separate suppression reasons

### 2. Keyword buildout

Payload kind:

- `keyword_buildout`

Required fields:

- `addAsExact`
- `addAsPhrase`
- `keepAsBroadTheme`
- `doNotPromoteYet`
- `seedExact`
- `seedPhrase`
- `seedBroadThemes`
- `negativeGuardrails`

Render requirements:

- separate `Add as exact`
- separate `Add as phrase`
- separate `Keep as broad discovery theme`
- separate `Do not promote yet`

### 3. Shopping launch or split

Payload kind:

- `shopping_structure`

Required fields:

- `launchMode`
- `recommendedStructure`
- `isolateClusters`
- `heroClusters`
- `startingClusters`

Render requirements:

- show the recommended shopping structure directly
- show the clusters to isolate directly

### 4. Asset group restructuring

Payload kind:

- `asset_group_restructure`

Required fields:

- `splitAssetGroups`
- `keepSeparateAssetGroups`
- `replaceAssets`
- `replacementAngles`

Render requirements:

- separate `Asset groups to split`
- separate `Asset groups to keep separate`
- separate `Assets to replace`
- separate `New angle directions`

### 5. Product allocation

Payload kind:

- `product_allocation`

Required fields:

- `isolateClusters`
- `scaleClusters`
- `reduceClusters`
- `hiddenWinnerClusters`

Render requirements:

- separate isolate
- separate scale
- separate reduce
- separate hidden winners

### 6. Budget reallocation

Payload kind:

- `budget_reallocation`

Required fields:

- `sourceCampaigns`
- `destinationCampaigns`
- `budgetBand`
- `estimateMode`
- `netDelta`

Render requirements:

- show source lane or campaign directly
- show destination lane or campaign directly
- show exact budget deltas when previewed
- otherwise say that the move is heuristic only

### 7. Target strategy adjustment

Payload kind:

- `target_strategy_adjustment`

Required fields:

- `state`
- `previewMode`
- `currentTargetType`
- `currentTargetValue`
- `proposedTargetValue`
- `deltaPercent`
- `governedScope`
- `boundedDelta`
- `safeBecause`
- `blockedBecause`

Optional fields when joint allocator preview exists:

- `budgetActionType`
- `budgetPreviousAmount`
- `budgetProposedAmount`
- `budgetDeltaPercent`

Render requirements:

- show current target
- show proposed target when safely previewed
- show governed scope
- show why safe or why blocked
- if preview is unavailable, say `directional only` or `blocked`

### 8. Blocked or insufficient evidence

Payload kind:

- `blocked_or_insufficient_evidence`

Required fields:

- `reasons`

Render requirements:

- do not fabricate exact change lists
- lead with the blocker

## Snapshot compatibility and versioning

Transition rules:

- old snapshots may be returned before refresh
- old snapshots must not silently masquerade as native action-contract snapshots
- `metadata.actionContract.source = compatibility_derived` marks that state
- `refresh=1` must regenerate and return `source = native`

UI rules:

- if `source = compatibility_derived`, show a compatibility note
- still render the action-first card deterministically
- keep the old narrative collapsed under secondary details

## Examples

### A. Exact negative keyword cleanup

```json
{
  "primaryAction": "Add 2 exact negative keywords now.",
  "exactChangePayload": {
    "kind": "negative_keyword_cleanup",
    "matchType": "exact",
    "addNow": ["refund policy", "free replacement part"],
    "suppressed": ["brand refund policy"],
    "suppressionReasonLabels": ["Branded query"],
    "negativeGuardrails": ["brand", "sku"]
  }
}
```

### B. Keyword buildout

```json
{
  "primaryAction": "Promote proven search terms into exact and phrase control.",
  "exactChangePayload": {
    "kind": "keyword_buildout",
    "addAsExact": ["carry on backpack"],
    "addAsPhrase": ["weekender bag"],
    "keepAsBroadTheme": ["travel backpack"],
    "doNotPromoteYet": [],
    "negativeGuardrails": ["cheap"]
  }
}
```

### C. Shopping launch or split

```json
{
  "primaryAction": "Launch a hero-SKU Shopping control campaign.",
  "exactChangePayload": {
    "kind": "shopping_structure",
    "launchMode": "hero_sku_shopping",
    "recommendedStructure": "Launch a hero-SKU Shopping control campaign.",
    "isolateClusters": ["Hero Backpack", "Carry-On Pack"]
  }
}
```

### D. Asset group restructuring

```json
{
  "primaryAction": "Split weak asset groups and keep low-signal groups separate.",
  "exactChangePayload": {
    "kind": "asset_group_restructure",
    "splitAssetGroups": ["Winter Themes"],
    "keepSeparateAssetGroups": ["Sale Themes"],
    "replaceAssets": ["Image Asset 1"],
    "replacementAngles": ["Durability proof"]
  }
}
```

### E. Product allocation

```json
{
  "primaryAction": "Separate winners, hidden winners, and laggards before moving more product budget.",
  "exactChangePayload": {
    "kind": "product_allocation",
    "isolateClusters": ["Hero Backpack", "Hidden Winner Sling"],
    "scaleClusters": ["Hero Backpack"],
    "reduceClusters": ["Clearance Tote"],
    "hiddenWinnerClusters": ["Hidden Winner Sling"]
  }
}
```

### F. Budget reallocation

```json
{
  "primaryAction": "Move budget from the lower-priority source campaign into the destination campaign shown below.",
  "exactChangePayload": {
    "kind": "budget_reallocation",
    "budgetBand": "10-15%",
    "estimateMode": "bounded_preview",
    "sourceCampaigns": [
      {
        "id": "c1",
        "name": "Brand Search",
        "previousAmount": 100,
        "proposedAmount": 90
      }
    ],
    "destinationCampaigns": [
      {
        "id": "c2",
        "name": "Non-Brand Search",
        "previousAmount": 50,
        "proposedAmount": 60
      }
    ]
  }
}
```

### G. Target strategy adjustment with safe preview

```json
{
  "primaryAction": "Review the tROAS preview before making the manual target change.",
  "exactChangePayload": {
    "kind": "target_strategy_adjustment",
    "state": "preview_available",
    "previewMode": "portfolio_target",
    "currentTargetType": "tROAS",
    "currentTargetValue": 300,
    "proposedTargetValue": 270,
    "deltaPercent": -10,
    "boundedDelta": true,
    "governedScope": [
      { "id": "c1", "name": "PMax Scale" },
      { "id": "c2", "name": "PMax Prospecting" }
    ]
  }
}
```

### H. Blocked or insufficient evidence

```json
{
  "primaryAction": "Do not change the tCPA target yet. Resolve the blocker first.",
  "exactChangePayload": {
    "kind": "target_strategy_adjustment",
    "state": "blocked",
    "previewMode": "directional_only",
    "currentTargetType": "tCPA",
    "currentTargetValue": 45,
    "proposedTargetValue": null,
    "blockedBecause": [
      "portfolio_target_blocked: the target surface is not yet eligible for a safe native preview."
    ]
  }
}
```
