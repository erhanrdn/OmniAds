# Funnel & Profitability Analyst Policy

## Scope

This policy governs the Phase 2 Funnel & Profitability Analyst for Adsecute. The analyst translates commercial truth into profitability-safe operating guidance for Meta Decision OS, Creative Decision OS, Command Center, and execution previews.

The analyst is documentation and decision policy only. It does not implement code, change creative assets, reveal secrets, or create provider write paths.

## Source Contracts

- Commercial truth snapshot: `BusinessCommercialTruthSnapshot`
- Target pack: target CPA, target ROAS, break-even CPA, break-even ROAS, contribution margin assumption, AOV assumption, new-customer weight, default risk posture
- Country economics: economics multiplier, margin modifier, serviceability, priority tier, scale override
- Operating constraints: site, checkout, tracking, feed, stock, landing-page, merchandising, manual do-not-scale
- Calibration profiles: channel, objective family, bid regime, multipliers, confidence caps, action ceilings
- Decision trust: `DecisionTrustMetadata`, `DecisionEvidenceEnvelope`, `DecisionSurfaceAuthority`
- Queue contract: deterministic Meta and Creative outputs only; AI Commentary is not workflow authority
- Execution contract: provider-backed apply is limited to the supported Meta ad set subset and remains human-approved, canary-gated, preflighted, and rollback-aware

## Profitability Truth Model

The analyst must treat profitability as explicit business truth, not inferred optimism.

Required commercial concepts:

- AOV: configured `aovAssumption` or a reliable observed order-value aggregate for the same business, currency, attribution scope, and decision window.
- Gross margin: configured cost or margin truth, including `contributionMarginAssumption`, country `marginModifier`, and cost model context when available.
- Contribution margin: revenue after COGS, shipping, fees, and fixed per-order cost where the business has configured those inputs. If only contribution margin assumption exists, label it as assumption-backed.
- Target CPA: the maximum acquisition cost the business wants to pay for an order or customer, after risk posture and calibration multipliers.
- Target ROAS: the desired revenue-to-spend efficiency, after risk posture and calibration multipliers.
- Break-even CPA: maximum CPA at which contribution profit is zero before customer LTV or new-customer weighting.
- Break-even ROAS: minimum ROAS at which contribution profit is zero before customer LTV or new-customer weighting.
- Payback window: the maximum days allowed for contribution profit or accepted LTV-weighted recovery to cover acquisition cost.

Derived formulas are allowed only when the required inputs are configured, fresh, same-currency, and same-scope:

- `contribution_margin_value = AOV * contribution_margin_rate`
- `break_even_cpa = contribution_margin_value`
- `break_even_roas = 1 / contribution_margin_rate`
- `target_cpa = break_even_cpa * risk_discount`
- `target_roas = break_even_roas / risk_discount`

`risk_discount` must be explicit and conservative. It may come from business risk posture or calibration profile. If no reliable risk discount exists, the analyst may show break-even values but must not derive target values.

## Reliability Gates

Commercial truth is reliable only when all of these are true:

- Target pack or derivation inputs are configured with `sourceLabel`, `updatedAt`, and non-null required values.
- Freshness is `fresh`, or the policy explicitly allows stale truth for read-only diagnosis.
- Currency, date window, attribution basis, and provider scope are compatible with the decision surface.
- Contribution margin inputs are positive, finite, and plausible.
- AOV is positive, finite, and from the same business and payback model.
- Operating constraints do not mark site, checkout, conversion tracking, feed, stock, landing page, merchandising, or manual do-not-scale as blocking.
- Country economics do not mark the target GEO as blocked, deprioritized, or serviceability-limited for scale.
- Decision evidence is at least `partial`; queue or execution promotion requires `complete`.

When reliability is not met, use the existing degraded truth model:

- `truthState`: `degraded_missing_truth`
- `operatorDisposition`: `review_hold`, `monitor_low_truth`, `degraded_no_scale`, or `profitable_truth_capped`
- `surfaceLane`: `watchlist` unless a reduce-only action is still safely action-core
- `aggressiveActionBlocked`: true
- `aggressiveActionBlockReasons`: explicit missing or stale inputs

## Confidence Bands

- High confidence: `>= 0.80`; complete evidence, fresh commercial truth, compatible operating constraints, material signal.
- Medium confidence: `0.65-0.79`; usable but partial evidence, minor freshness or context limitations, no blocking constraints.
- Low confidence: `< 0.65`; thin signal, missing inputs, stale inputs, conflicting windows, or operational blockers.

Aggressive actions require high confidence. Protective reductions may use medium confidence when loss evidence is material and explanation is complete. Missing commercial truth caps confidence at `0.68` for scale, budget increase, target relaxation, or creative promotion.

## Push Eligibility Levels

- `action_core`: deterministic recommendation may enter the default Command Center queue.
- `watchlist`: visible to operators, not default queue eligible.
- `manual_only`: operator may act manually after review; provider-backed apply must not appear available.
- `execution_preview_supported`: eligible for Phase 06 preview and apply only if the action family is supported, approved, fresh, canary-gated, preflight-passing, and still matches `previewHash`.
- `blocked`: not actionable until blockers clear.

Creative actions are never provider-backed execution eligible in this policy. GEO actions remain read-only unless a separate provider-validated execution contract exists.

## Projected Impact Rules

Projected impact must be bounded and labeled as an estimate.

Allowed estimate labels:

- `bounded_estimate`: uses existing deterministic move bands, current budgets, current CPA/ROAS, and explicit min/max assumptions.
- `directional_estimate`: direction is supported but exact commercial impact cannot be bounded.
- `not_confidently_estimable`: effect cannot be sized honestly.
- `blocked`: action is blocked and no impact claim is allowed.

Projected impact must include:

- baseline spend, revenue, purchases, CPA, ROAS, AOV, and contribution margin basis where available
- proposed spend or target delta as a bounded range
- estimated contribution profit delta as a range, never a point promise
- payback window used
- assumptions and missing inputs
- statement: `Estimate, not guaranteed outcome`

Do not publish uplift, profit, CAC, ROAS, or payback estimates from AI Commentary. AI may summarize deterministic estimates but may not invent numbers.

## Policy Actions

### 1. Profitability Readiness Assessment

Allowed contexts:

- Account, campaign, ad set, GEO, creative family, or Command Center queue summary
- Read-only diagnosis where commercial truth may be complete, partial, stale, or missing

Blocked contexts:

- Provider write-back
- Creative asset changes
- Secret, token, or credential inspection

Minimum evidence:

- Business id, decision window, commercial snapshot, decision trust metadata
- Target pack section metadata
- Operating constraints section metadata

Required fields:

- `businessId`
- `startDate`
- `endDate`
- `decisionAsOf`
- `commercialTruthCoverage`
- `missingInputs`
- `freshness`
- `completeness`
- `actionCeilings`
- `truthState`
- `operatorDisposition`

Confidence requirements:

- May run at any confidence
- Must label low-confidence or degraded assessments clearly

Explanation requirements:

- Explain which inputs are configured, stale, missing, or blocking
- Explain whether decisions are using configured targets or conservative fallback
- Explain which action classes are suppressed

Push eligibility level:

- `watchlist` for diagnosis only
- `blocked` for any attempt to treat readiness as execution authority

### 2. Break-Even CPA and ROAS Derivation

Allowed contexts:

- Target pack bootstrap
- Profitability diagnosis
- Read-only threshold explanation
- Conservative fallback comparison

Blocked contexts:

- Deriving thresholds from unreliable AOV, missing margin, mixed currency, stale cost model, or incompatible attribution windows
- Using fallback thresholds as if they are business-specific truth
- Deriving targets when only break-even can be computed

Minimum evidence:

- Reliable AOV
- Reliable contribution margin rate or cost model sufficient to compute it
- Currency and scope compatibility
- Freshness metadata

Required fields:

- `aov`
- `contributionMarginRate`
- `contributionMarginValue`
- `breakEvenCpa`
- `breakEvenRoas`
- `sourceLabel`
- `updatedAt`
- `derivationFormula`
- `assumptionStatus`

Confidence requirements:

- High confidence required to publish as configured or derived business truth
- Medium confidence may publish as `diagnostic_only`
- Low confidence must publish `not_confidently_estimable`

Explanation requirements:

- Show formula source and input provenance
- Label assumption-backed values
- State why the result is or is not eligible to govern decisions

Push eligibility level:

- `watchlist` when diagnostic
- `action_core` only as supporting evidence after reliability gates pass
- `blocked` when required inputs are missing

### 3. Target CPA and Target ROAS Recommendation

Allowed contexts:

- Suggesting initial target pack values after reliable break-even derivation
- Updating decision context with configured risk posture or calibration profile
- Read-only operator explanation

Blocked contexts:

- Missing AOV or contribution margin
- Missing risk posture or calibration basis
- Stale commercial truth
- Active conversion tracking issue
- Manual do-not-scale reason
- Any attempt to push aggressive Meta or Creative actions from suggested targets alone

Minimum evidence:

- Reliable break-even CPA and ROAS
- Business risk posture
- Channel/objective/bid-regime calibration when available
- Payback window
- Operating constraints

Required fields:

- `targetCpa`
- `targetRoas`
- `breakEvenCpa`
- `breakEvenRoas`
- `riskPosture`
- `calibrationProfile`
- `paybackWindowDays`
- `confidenceCap`
- `actionCeiling`
- `sourceLabel`

Confidence requirements:

- High confidence required for target suggestions to support scale or promotion
- Medium confidence may support hold, validate, or review-only guidance
- Low confidence blocks target suggestion and requests missing inputs

Explanation requirements:

- Explain the gap between break-even and target
- Explain risk posture and calibration multipliers
- Explain why suggested targets are safe or why they are withheld

Push eligibility level:

- `action_core` only when targets are reliable and used as supporting evidence, not as a standalone action
- `watchlist` for operator review
- `blocked` when commercial truth is missing or unreliable

### 4. Payback Window Classification

Allowed contexts:

- Campaign, ad set, GEO, creative, and budget shift review
- New-customer weighted analysis when configured
- Promo or launch period diagnosis

Blocked contexts:

- Missing payback window
- Missing or unreliable purchase/revenue timing
- Treating LTV assumptions as current-period profit without explicit label
- Conversion tracking issue status `critical`

Minimum evidence:

- Payback window in days
- Purchase and revenue attribution window
- Spend window
- New-customer weight if used
- Contribution margin basis

Required fields:

- `paybackWindowDays`
- `attributionWindow`
- `spendWindow`
- `revenueWindow`
- `newCustomerWeight`
- `contributionMarginBasis`
- `paybackStatus`
- `assumptionLabel`

Confidence requirements:

- High confidence required to justify scale
- Medium confidence may justify monitoring or validation
- Low confidence blocks payback-based actions

Explanation requirements:

- Explain whether payback is current-period, delayed, or LTV-weighted
- Explain any window mismatch
- Explain what would change the payback classification

Push eligibility level:

- `action_core` only when complete and fresh
- `watchlist` when partial
- `blocked` when payback cannot be evaluated

### 5. Scale or Budget-Increase Profit Gate

Allowed contexts:

- Meta ad set `scale_budget`, `broaden`, `recover`, or winner scale candidate review
- Creative `promote_to_scaling`
- GEO `scale` or `isolate`
- Budget shift destination validation

Blocked contexts:

- `degraded_missing_truth`
- `profitable_truth_capped`
- Missing target pack
- Missing country economics for GEO scale
- Serviceability `blocked` or scale override `deprioritize`
- Manual do-not-scale
- Stock pressure `blocked`
- Site, checkout, feed, or tracking issue `critical`
- Thin signal below materiality floor
- Recent change or mixed budget configuration that invalidates attribution

Minimum evidence:

- Fresh target CPA or target ROAS
- Break-even CPA or ROAS
- AOV and contribution margin basis
- Material spend and conversion signal
- Compatible operating constraints
- Decision trust `live_confident`

Required fields:

- `actionType`
- `entityId`
- `currentSpend`
- `currentRevenue`
- `currentPurchases`
- `currentCpa`
- `currentRoas`
- `targetCpa`
- `targetRoas`
- `breakEvenCpa`
- `breakEvenRoas`
- `contributionMargin`
- `paybackWindowDays`
- `suggestedMoveBand`
- `projectedImpact`
- `trust`

Confidence requirements:

- `>= 0.80`
- Evidence completeness must be `complete`
- Freshness must be `fresh`

Explanation requirements:

- Explain why current performance beats target and break-even
- Explain the bounded move band
- Explain downside guardrails and stop conditions
- Label projected impact as estimate

Push eligibility level:

- `action_core` for deterministic queue only when all gates pass
- `execution_preview_supported` only for supported Meta ad set budget increases after Command Center approval and Phase 06 preflight
- `watchlist` for Creative and GEO scale guidance
- `blocked` when any blocked context applies

### 6. Reduce, Pause, or Cut Profit Gate

Allowed contexts:

- Meta ad set `reduce_budget` or `pause`
- GEO `cut`
- Creative `block_deploy`, `refresh_replace`, or `keep_in_test`
- Budget shift source validation

Blocked contexts:

- Inactive or immaterial rows for action-core decisions
- Low signal that cannot distinguish loss from learning
- Conversion tracking issue that makes loss evidence untrustworthy
- Recent material config change still inside cooldown
- Protected stable winner handling

Minimum evidence:

- Spend above materiality floor
- CPA above break-even or ROAS below break-even
- Purchase/revenue signal sufficient for the action severity
- Fresh provider metrics
- Commercial truth or conservative fallback clearly labeled

Required fields:

- `actionType`
- `entityId`
- `currentSpend`
- `currentRevenue`
- `currentPurchases`
- `currentCpa`
- `currentRoas`
- `breakEvenCpa`
- `breakEvenRoas`
- `lossEvidence`
- `cooldownStatus`
- `projectedSpendAvoided`
- `projectedContributionRisk`
- `trust`

Confidence requirements:

- Pause/cut requires `>= 0.80`
- Reduce requires `>= 0.65` when loss is material and commercial truth is degraded but clearly labeled
- Low confidence can only produce monitor or review-hold

Explanation requirements:

- Explain why loss is below break-even, not merely below target
- Explain why learning, cooldown, or tracking uncertainty is not the primary cause
- Explain projected spend avoided as estimate
- Explain re-entry conditions

Push eligibility level:

- `action_core` for reduce-only when evidence is material
- `execution_preview_supported` only for supported Meta ad set pause, recover, or reduce after Command Center approval and Phase 06 preflight
- `watchlist` for Creative and GEO cut guidance
- `blocked` when loss evidence is not trustworthy

### 7. Commercial Truth Missing Fallback

Allowed contexts:

- Any decision surface where commercial truth is absent, partial, stale, or incompatible
- Bootstrap suggestions
- Operator explanation

Blocked contexts:

- Scale, target relaxation, budget increase, creative promotion, GEO isolate, or aggressive recovery
- Publishing derived targets as authoritative
- Provider-backed apply based on fallback thresholds

Minimum evidence:

- Section metadata showing missing or stale inputs
- Conservative fallback thresholds if used
- Decision trust fields

Required fields:

- `missingInputs`
- `fallbackThresholds`
- `fallbackSource`
- `truthState`
- `operatorDisposition`
- `actionCeilings`
- `bootstrapSuggestions`
- `aggressiveActionBlocked`
- `aggressiveActionBlockReasons`

Confidence requirements:

- Confidence cap `<= 0.68` for any action that would otherwise be aggressive
- Protective review-reduce may exceed cap only when provider loss evidence is material and explanation says commercial truth is incomplete

Explanation requirements:

- State that missing commercial truth does not block page visibility
- State that missing commercial truth blocks aggressive action
- List exact inputs to configure next

Push eligibility level:

- `watchlist`
- `manual_only` for human-reviewed protective reductions
- `blocked` for aggressive actions

### 8. Profitability-Aware Meta Interaction

Allowed contexts:

- Meta campaign role, ad set action, GEO action, placement anomaly, winner candidate, budget shift, and no-touch surfaces

Blocked contexts:

- Escalating a Meta action above the shared trust ceiling
- Turning `watchlist`, `archive_context`, `profitable_truth_capped`, or `degraded_no_scale` into queue-ready scale
- Expanding Phase 06 execution support beyond supported Meta ad set actions

Minimum evidence:

- Meta decision object
- Commercial truth coverage
- Trust metadata
- Supporting metrics
- Operating mode authority

Required fields:

- `policy.strategyClass`
- `policy.primaryDriver`
- `supportingMetrics`
- `commercialTruthCoverage`
- `trust`
- `guardrails`
- `whatWouldChangeThisDecision`
- `queueEligible`

Confidence requirements:

- Meta scale, broaden, recover, and winner scale require high confidence and `live_confident`
- Meta reduce can be medium confidence when break-even loss is material
- GEO queue eligibility requires material, non-archive, action-core trust

Explanation requirements:

- Tie Meta action to CPA/ROAS, break-even, target, AOV, contribution margin, and payback where available
- Explain commercial truth caps before operational reasons
- Explain whether Phase 06 execution is unsupported, manual-only, or preview-supported

Push eligibility level:

- `action_core` only when Meta trust lane is action core
- `execution_preview_supported` only for supported Meta ad set execution subset
- `watchlist` for GEO pool, validate, monitor, protected winners, and capped scale
- `blocked` for aggressive actions under degraded truth

### 9. Profitability-Aware Creative Interaction

Allowed contexts:

- Creative lifecycle, family, protected winner, supply plan, deployment matrix, and operator queues

Blocked contexts:

- Creative asset edits
- Creative provider write-back
- Promoting to scaling when commercial truth is degraded
- Letting AI Commentary create actions, targets, deployment changes, or profit estimates

Minimum evidence:

- Creative Decision OS object
- Lifecycle state
- Economics floors
- Benchmarks or fallback chain
- Deployment compatibility
- Commercial truth coverage
- Trust metadata

Required fields:

- `creativeId`
- `familyId`
- `primaryAction`
- `lifecycleState`
- `spend`
- `purchases`
- `roas`
- `cpa`
- `targetRoas`
- `breakEvenRoas`
- `targetCpa`
- `breakEvenCpa`
- `deployment.compatibility`
- `trust`
- `policyExplanation`

Confidence requirements:

- `promote_to_scaling` requires high confidence, economics floors, and `live_confident`
- `keep_in_test`, `hold_no_touch`, or `refresh_replace` may run at medium confidence
- Low confidence can only monitor or request missing context

Explanation requirements:

- Explain whether the creative cleared target or break-even floors
- Explain why deployment is compatible, limited, or blocked
- Explain family and benchmark provenance
- Explain that creative workflow actions require human deployment and review

Push eligibility level:

- `action_core` for deterministic queue-ready creative workflow items only
- `manual_only` for all deployment actions
- `watchlist` for capped or limited candidates
- `blocked` for degraded commercial truth scale promotion

### 10. Bounded Projected Profit Impact

Allowed contexts:

- Read-only action cards, Command Center summaries, execution previews, and operator reports

Blocked contexts:

- Missing baseline metrics
- Missing commercial truth required for contribution profit
- Unbounded budget or target movement
- AI-only estimates
- Any claim not labeled as estimate

Minimum evidence:

- Current spend, revenue, purchases, CPA, ROAS
- AOV and contribution margin basis
- Current and proposed budget or target range
- Payback window
- Attribution window

Required fields:

- `estimationMode`
- `baselineMetrics`
- `moveBand`
- `boundedDelta`
- `projectedRevenueRange`
- `projectedContributionProfitRange`
- `paybackWindowDays`
- `assumptions`
- `missingInputs`
- `estimateLabel`

Confidence requirements:

- Bounded estimate requires medium or high confidence
- Directional estimate may run at medium confidence
- Low confidence must use `not_confidently_estimable` or `blocked`

Explanation requirements:

- State range boundaries and assumptions
- State `Estimate, not guaranteed outcome`
- State why the estimate is bounded, directional, unavailable, or blocked

Push eligibility level:

- Same as parent action
- Never increases parent action eligibility
- `blocked` if projected impact is used as the sole justification

## Aggressive Action Blockers

Aggressive actions include scale, broaden, budget increase, target relaxation, creative promotion, GEO isolate, GEO scale, and recovery actions that increase spend exposure.

They must be blocked when any of these are true:

- Commercial truth is missing, stale, partial, incompatible, or conservative fallback only
- AOV is missing or unreliable
- Contribution margin is missing or unreliable
- Break-even CPA and ROAS cannot be computed or configured
- Target CPA and ROAS are absent and cannot be reliably suggested
- Payback window is absent for payback-dependent decisions
- Country economics are missing for GEO-specific scale or isolate
- Operating constraints contain critical site, checkout, tracking, feed, stock, landing-page, merchandising, or manual do-not-scale blockers
- Decision trust is not `live_confident`
- Evidence completeness is not `complete`
- Materiality is thin or immaterial
- Current provider data is stale, partial, timeout, or degraded
- The action is outside the current execution support matrix

## Missing Commercial Truth Procedure

When commercial truth is missing:

1. Keep the page and report visible.
2. Use conservative fallback thresholds only as explicit fallback, not business truth.
3. Set degraded trust and safe action ceilings.
4. Block aggressive actions.
5. Allow monitor, hold, review, and carefully explained protective reductions when provider evidence is material.
6. Produce bootstrap suggestions for target pack, country economics, operating constraints, calibration profiles, AOV, margin, contribution margin, and payback window.
7. Explain exactly which inputs unlock target derivation and action-core eligibility.

## Required Explanation Standard

Every analyst output must answer:

- What is the commercial truth source?
- Is it configured, derived, fallback, stale, or missing?
- Which CPA/ROAS target and break-even thresholds govern the decision?
- What AOV, margin, contribution margin, and payback assumptions are active?
- What evidence supports the action?
- What evidence blocks or caps the action?
- What is the confidence and why?
- What is the push eligibility level?
- Is projected impact bounded, directional, unavailable, or blocked?
- What would change the decision?

## Non-Goals

- No autonomous execution authority.
- No expansion of Meta execution support.
- No Creative code, asset, copy, or deployment changes.
- No AI-generated actions, targets, or projected impact numbers.
- No hidden use of secrets or credentials.
- No treating fallback thresholds as commercial truth.
