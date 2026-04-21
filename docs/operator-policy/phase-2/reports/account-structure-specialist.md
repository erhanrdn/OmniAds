# Account Structure Specialist Policy

Scope: Adsecute Phase 2 Meta operator policy for campaign and ad set structure. This is a read-only policy report. It does not implement code, change Creatives, expose secrets, or expand provider write-back support.

## Platform References

- Meta Marketing API campaign docs describe campaigns as the highest organizational level and state that a campaign should represent a single advertiser objective; campaign objective selection validates compatible ad sets and ads. https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group
- Meta Marketing API ad set docs expose ad set controls such as `campaign_id`, `optimization_goal`, `billing_event`, `daily_budget`, `lifetime_budget`, `targeting`, `promoted_object`, and status. https://developers.facebook.com/docs/marketing-api/reference/ad-campaign
- Meta Marketing API targeting specs define ad set targeting structure, including `geo_locations`, age/gender, audience inclusions/exclusions, publisher platforms, platform positions, devices, and related targeting fields. https://developers.facebook.com/docs/marketing-api/audiences/reference/targeting-specs
- Meta Advantage+ campaign budget, formerly campaign budget optimization, distributes one campaign budget across ad sets in real time and expects eligible ad sets to share compatible budget type, bid strategy, and delivery type. https://www.facebook.com/business/ads/meta-advantage-plus/budget
- Meta ad objectives guidance says the auction uses the chosen objective to find people likely to take the related action, and that optimization goals can appear under multiple objectives. https://www.facebook.com/business/ads/ad-objectives
- Meta Advantage+ placements guidance says automated placements give Meta more places to find cost-effective opportunities across Facebook, Instagram, Messenger, and Audience Network. https://www.facebook.com/business/ads/meta-advantage-plus/placements
- Meta budget guidance distinguishes daily and lifetime budgets and recommends enough budget over at least seven days for delivery learning; daily budgets are average daily amounts, not strict same-hour caps. https://www.facebook.com/business/ads/pricing
- Meta delivery status guidance says learning/preparing is less stable and significant edits can restart learning. https://www.facebook.com/help/messenger-app/650774041651557

## Local Contract Inputs

- Decision OS contract: `docs/phase-03-meta-action-contract.md`
- Decision OS structure notes: `docs/phase-03-meta-decision-os.md`
- Action queue contract: `docs/phase-05-action-queue-contract.md`
- Execution contract: `docs/phase-06-executor-contract.md`
- Meta page contract: `docs/meta-page-ui-contract.md`
- Meta historical window contract: `lib/meta/contract.ts`
- Config normalization and mixed-config fields: `lib/meta/configuration.ts`
- Execution live-state budget owner resolver: `lib/meta/execution.ts`

Current Adsecute structure fields and related decision fields:

- Campaign: `campaignId`, `campaignName`, `status`, `objective`, `budgetLevel`, `dailyBudget`, `lifetimeBudget`, `bidStrategyType`, `bidStrategyLabel`, `optimizationGoal`, mixed config flags.
- Ad set: `adSetId`, `adSetName`, `campaignId`, `campaignName`, `status`, `optimizationGoal`, `dailyBudget`, `lifetimeBudget`, `budgetLevel`, `bidStrategyLabel`, mixed config flags.
- Breakdowns: location/country rows and placement rows from `meta_breakdown_daily`, exposed through `geoDecisions` and `placementAnomalies`.
- Policy metadata: `objectiveFamily`, `bidRegime`, `primaryDriver`, `secondaryDrivers`, `winnerState`, `surfaceLane`, `truthState`, `operatorDisposition`, confidence, guardrails, and evidence.

## Push Eligibility Levels

- `P0 blocked`: do not surface as an action.
- `P1 report_only`: explain in report or diagnostic only; no Command Center action.
- `P2 watchlist`: visible as watchlist-only operator context.
- `P3 manual_handoff`: queueable for human review, but no native Meta apply path.
- `P4 execution_preview`: native preview may be shown only for an already supported provider-backed action.
- `P5 apply_candidate`: human-approved, current supported Meta apply path may run after live preflight, stale-preview rejection, canary gates, and post-apply validation.

Current Phase 2 posture:

- Account structure policy can recommend diagnose, hold, consolidate, split/test, broaden, merge, duplicate, rebuild, objective review, optimization review, GEO review, and placement exception review.
- Structure changes themselves are not provider-backed apply candidates in Phase 2.
- A recommendation can reach `P5 apply_candidate` only when the final mutation is already supported by the Phase 06 contract, such as a live Meta ad set daily-budget/status action that passes all budget, status, trust, approval, preview, canary, and validation gates.
- CBO campaign-budget changes, objective changes, optimization-event changes, targeting changes, audience changes, geo splits/cuts, placement edits, and campaign rebuilds cannot exceed `P3 manual_handoff` in Phase 2.

## Core Structure Semantics

### Campaign Objective

Campaign objective is a structural decision, not only a reporting label. It defines the business goal Meta should optimize toward and constrains compatible ad set setup. The Account Structure Specialist must treat objective mismatch as a structure problem before recommending budget or bid movement.

Allowed examples:

- Sales/catalog campaign optimized toward purchases, value, or catalog conversion can enter lower-funnel scale, reduce, pause, or consolidation logic when signal and commercial truth are sufficient.
- Lead campaign can be judged on lead quality, qualified lead cost, downstream conversion, or CRM truth when available.
- Awareness, traffic, or engagement campaign should not be judged primarily by purchase ROAS unless the policy explicitly labels purchase data as secondary/incidental.

Blocked examples:

- Do not scale an awareness or traffic campaign as if it were a sales campaign based on selected-range ROAS alone.
- Do not solve an objective mismatch by changing budget first.
- Do not recommend an objective switch without current objective, current optimization goal, conversion location/promoted object evidence, and test/rebuild plan.

### Optimization Event

Optimization event is the ad set-level delivery instruction. It must match the campaign objective, conversion location, promoted object, and available signal quality.

The policy must distinguish:

- Objective: campaign-level business goal.
- Optimization event/goal: ad set-level delivery event, such as purchase, value, lead, landing page view, reach, or ThruPlay.
- Reported conversion: observed attribution metric, not proof that the structure is optimized for that event.

When optimization event is missing, mixed, incompatible, or too shallow for the claimed action, direct scale is blocked and the action routes to review, switch-optimization handoff, rebuild, broaden, or monitor.

### CBO / Advantage+ Campaign Budget Structures

CBO means campaign-level budget ownership. Meta distributes one campaign budget across eligible ad sets. Child ad set spend share is allocator output, not direct child budget intent.

Structure implications:

- Direct ad set budget writes are invalid when the live target resolves to `budgetLevel=campaign`.
- Ad set-level winner/loser observations inside CBO can support campaign-level reasoning, no-touch protection, or manual restructuring, but not direct child budget mutation.
- CBO works best when child ad sets are structurally comparable enough for pooled allocation: compatible objective/optimization, budget type, bid regime, delivery type, and non-conflicting constraints.
- CBO with many tiny, overlapping, or mixed-purpose ad sets should favor consolidation or rebuild review over more segmentation.

### ABO Structures

ABO means ad set-level budget ownership. Ad set budgets can isolate tests and force spend distribution across audiences, geos, placements, or optimization hypotheses.

Structure implications:

- ABO is appropriate for controlled tests where equal or bounded spend is needed to compare cells.
- ABO is appropriate when campaign-level allocation would starve a strategically necessary validation lane.
- ABO is not automatically safer than CBO. Too many ad sets, overlapping audiences, low budgets, or thin event volume can fragment learning and produce false winners/losers.
- Current native push eligibility can only apply to a live ad set daily-budget/status subset after all Phase 06 checks; ABO targeting, objective, optimization, and structure edits remain manual handoff.

### Audience / Geo / Placement Structure

Audience, geo, and placement are structural levers. They should be changed only when they are the diagnosed bottleneck or the controlled test dimension.

Audience:

- Prefer broad or pooled structures when similar ad sets overlap, under-spend, or split limited signal across too many cells.
- Split audiences only when each segment has a different hypothesis, economics, creative fit, compliance requirement, lifecycle role, or clear signal depth.
- Do not split merely because a selected range shows a temporary difference.

Geo:

- Split or isolate a country/region only when materiality, serviceability, country economics, and signal support an independent decision.
- Pool thin or similar geos when signal is too sparse for country-specific action.
- Cut or deprioritize geos only with material loss, serviceability block, or commercial country economics.

Placement:

- Default posture is automation-first. Placement anomalies should trigger exception review, not a manual placement dashboard.
- Placement splits are appropriate only for persistent, material, format-specific performance or compliance constraints and must account for creative compatibility.
- Advantage+ placements or broad placements should not be narrowed from a single-day or selected-range anomaly.

### Stable Operator Windows vs UI Reporting Range

Adsecute separates the selected UI reporting range from operator authority:

- `analyticsWindow`: selected reporting range, used for inspection and explanation only.
- `recent7d`: recent complete provider days, used for trend, volatility, cooldown, and veto checks.
- `primary30d`: primary operator decision window for scale, reduce, stop, duplicate, consolidate, split, and rebuild recommendations.
- `baseline90d`: historical memory for variance, previous tests, seasonality, and recurring structure failure.
- `decisionAsOf`: provider platform date anchor when available.

The UI reporting range can explain what the operator is looking at. It cannot authorize today's structure action by itself. Structure actions must be anchored to complete provider-day decision windows, current/live structure state for any apply-adjacent flow, and explicit freshness/truth metadata.

## When Ad Set Level Actions Are Invalid

Ad set-level action is invalid or capped when:

- The live budget owner is campaign-level CBO/Advantage+ campaign budget.
- The requested action changes campaign objective, CBO setting, campaign budget, campaign bid strategy, or campaign status.
- The ad set is inside a pooled campaign where changing one child would destabilize allocation without solving the campaign-level issue.
- The target has mixed objective, optimization goal, budget, bid strategy, or bid value flags.
- The action requires targeting, geo, placement, conversion location, promoted object, or optimization-event mutation; these are not current Phase 06 native apply paths.
- The ad set has thin signal, recent significant edit, learning instability, stale truth, partial breakdowns, or selected-range-only evidence.
- The campaign role is promo, retargeting, existing-customer, validation, or test and the action would disrupt the intended structure without explicit role-aware evidence.

## When Campaign-Level Action Is More Appropriate

Campaign-level action or campaign-level manual handoff is more appropriate when:

- Budget owner is campaign-level CBO.
- Objective mismatch applies across the campaign.
- Multiple ad sets share the same structural problem: duplicated audiences, mixed optimization goals, overlapping geos, narrow placements, or learning fragmentation.
- The recommendation is to consolidate ad sets, rebuild the campaign, change objective, change CBO/ABO posture, change campaign budget, or protect a campaign-level no-touch winner.
- Ad set-level symptoms are allocator effects inside CBO rather than independently controlled ad set failures.
- Geo or placement findings are account/campaign allocation issues, not isolated child ad set issues.

## Consolidate, Split/Test, And Over-Segmentation Rules

Consolidate when:

- Similar ad sets compete for the same audience, geo, or placement inventory.
- Each ad set lacks enough event volume to learn or make reliable decisions.
- CBO allocator is forced to choose among many redundant cells.
- Geo/audience splits are thin and have no distinct economics or creative fit.
- Mixed or legacy structure prevents clean objective/optimization/budget interpretation.

Split or test when:

- A hypothesis is explicit and isolatable: new geo, lifecycle audience, objective, optimization event, creative format, or compliance constraint.
- Each cell has enough budget and time to reach a predeclared evidence floor.
- The incumbent winner should be protected from disruptive edits.
- CBO would starve a necessary validation lane.
- Country economics, serviceability, or margin materially differ by geo.

Do not over-segment when:

- The only reason is a noisy selected reporting range.
- Spend and purchase/event volume are too low to support cell-level decisions.
- Segments overlap heavily and compete in the same auction.
- The structure creates many tiny ad sets with insufficient budget.
- Creative and landing experience are not distinct enough to justify separate cells.
- The campaign already has a clean pooled setup and no material constraint.

## Policy And Action Matrix

| ID | Policy / action | Allowed contexts | Blocked contexts | Minimum evidence | Required fields | Confidence requirements | Explanation requirements | Push eligibility |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `AS-01` | Structure classification | Any campaign/ad set with current or warehouse config. | Missing entity id, missing account assignment, no objective/budget/optimization evidence, partial route with no parent context. | Current row plus parent/child config fallback when available. | `campaignId`, `adSetId` where applicable, `objective`, `optimizationGoal`, `budgetLevel`, `dailyBudget`, `lifetimeBudget`, `status`, mixed flags. | `>=0.70` for report; `>=0.85` before feeding action policy. | State CBO/ABO/unknown, objective family, optimization event, role, and mixed-config state. | `P1`; may feed downstream policy only when `>=0.85`. |
| `AS-02` | Campaign objective fit review | Campaign objective must match business goal and campaign role. | Missing objective, unsupported/legacy objective ambiguity, selected-range ROAS only, no commercial target, special/compliance constraints not inspected. | Objective, role, observed conversion path, commercial target, optimization event summary. | `campaignId`, `objective`, `objectiveFamily`, `role`, `optimizationGoal`, `spend`, `revenue`, `purchases` or lead/event metric, target pack. | `>=0.72` for review; `>=0.86` for manual handoff. | Explain whether objective is aligned, too upper-funnel, wrong lifecycle, or incompatible with reported success metric. | `P1` to `P3`; never `P5`. |
| `AS-03` | Optimization event fit review | Ad set or campaign has optimization event evidence and objective context. | Missing promoted-object/conversion-location evidence where required, mixed optimization goals, thin event signal, objective mismatch unresolved. | Objective, optimization event, conversion/event volume, bid regime, campaign role. | `adSetId`, `campaignId`, `objective`, `optimizationGoal`, `isOptimizationGoalMixed`, `bidStrategyType`, `spend`, `purchases` or optimization events, `cpa`, `roas`. | `>=0.72` for watch/review; `>=0.84` for `switch_optimization` manual handoff. | Distinguish objective from optimization event and name the current delivery event. | `P1` to `P3`; optimization mutation never `P5`. |
| `AS-04` | CBO / Advantage+ campaign budget structure | Campaign-level budget owner, multiple child ad sets, or ad set live state falls back to campaign budget. | Direct ad set budget write, incompatible child budget/bid/delivery setup, mixed objective/optimization, unknown campaign budget, stale config. | Campaign budget, child ad set count, child performance distribution, child config consistency. | `campaignId`, `budgetLevel=campaign`, `dailyBudget` or `lifetimeBudget`, child `adSetIds`, child spend/events, `isBudgetMixed`, `isBidStrategyMixed`, `isOptimizationGoalMixed`. | `>=0.75` for report; `>=0.88` for manual campaign-level handoff. | Explain pooled allocation and why child spend share is not child budget intent. | `P1` to `P3`; never direct ad set `P5`. |
| `AS-05` | ABO ad set structure | Ad set-owned daily/lifetime budgets and explicit test or scale cell. | Campaign-level budget owner, no budget, overlapping duplicate cells, too many thin cells, recent edit, mixed config, lifetime budget without schedule analysis. | Ad set budget owner, cell hypothesis or role, performance depth, parent campaign context. | `adSetId`, `campaignId`, `budgetLevel=adset`, `dailyBudget`, `lifetimeBudget`, `status`, `role`, `spend`, `events`, mixed flags. | `>=0.75` for watch/review; `>=0.88` plus live trust before any supported daily-budget/status apply candidate. | Explain why ad set-level control is valid and whether it is scale, validation, or test structure. | `P2` to `P5` only if final action is existing supported ad set daily-budget/status. |
| `AS-06` | Ad set action invalidity guard | Any ad set recommendation. | Budget owner campaign-level, action requires objective/optimization/targeting/placement mutation, mixed config, stale live state, selected-range-only authority, recent learning reset. | Live execution-state read for apply-adjacent actions; config/freshness for all others. | `adSetId`, `campaignId`, `requestedAction`, `budgetLevel`, `objective`, `optimizationGoal`, `status`, `freshness`, `truthState`, mixed flags. | Any invalidity condition caps confidence for push below `0.68`; `>=0.82` to block with high confidence. | State the exact invalidating condition and the safer level: campaign review, manual handoff, watchlist, or report. | `P0` to `P2`; blocks `P5`. |
| `AS-07` | Campaign-level handoff | Structure problem is campaign-owned or affects multiple ad sets. | Single ABO child issue that can be handled without campaign change, insufficient parent context, missing campaign id, no objective/budget evidence. | Campaign role, objective, budget owner, child config/performance summary. | `campaignId`, `objective`, `budgetLevel`, `dailyBudget`, `lifetimeBudget`, child count, child roles, mixed flags, confidence. | `>=0.78` for `P3`; lower confidence remains watchlist/report. | Explain why campaign-level action is more appropriate than ad set-level action. | `P2` to `P3`; never `P5` in Phase 2. |
| `AS-08` | Consolidate overlapping ad sets | Similar ad sets overlap by audience, geo, placement, objective, optimization, or role and each lacks distinct signal or purpose. | Distinct country economics, separate lifecycle roles, compliance constraints, active planned test cells, protected winner cell, unavailable overlap evidence. | At least two comparable cells, overlap or redundancy signal, thin or fragmented performance, no distinct hypothesis. | `campaignId`, `adSetIds`, role labels, objective/optimization, budgets, spend/events per cell, geo/audience/placement labels where available, mixed flags. | `>=0.72` for watchlist; `>=0.84` for manual handoff. | Explain what is redundant, what should be pooled, and what evidence would justify keeping cells separate. | `P2` to `P3`; never `P5`. |
| `AS-09` | Split or duplicate controlled test | Clear hypothesis needs isolation and incumbent structure should not be disrupted. | No hypothesis, insufficient budget/time, thin incumbent signal, selected-range-only spike, overlapping cells, commercial truth missing for aggressive test, recent edit cooldown. | Hypothesis, test cell, control/incumbent context, budget floor, success/loss criteria, decision window. | `campaignId`, source `adSetId` when duplicating, proposed test dimension, objective, optimizationGoal, target metric, budget, duration/window, guardrails. | `>=0.70` for test idea; `>=0.82` for manual handoff. | Name hypothesis, cell, expected learning, measurement window, and rollback/stop condition. | `P2` to `P3`; never native duplicate/apply in Phase 2. |
| `AS-10` | Over-segmentation guard | Many ad sets or campaigns split by minor audience/geo/placement differences with thin signal. | Distinct economics or compliance constraints, strong material signal per cell, planned experimental design, platform-mandated separation. | Count of cells, spend/events per cell, overlap/redundancy indicators, role/objective consistency. | `campaignId`, `adSetCount`, per-cell spend/events, `objective`, `optimizationGoal`, budgets, targeting/geo/placement labels where available. | `>=0.68` for warning; `>=0.82` to block split/scale and recommend consolidation. | Explain how segmentation fragments learning or creates false comparisons. | `P1` to `P3`; blocks push of split actions. |
| `AS-11` | Audience broadening / pooling | Demand-limited or fragmented audience structure, low spend despite budget, or too-narrow test cell after evidence window. | Compliance/special category constraints, deliberate narrow retargeting, high-frequency but profitable protected lane, missing targeting evidence, creative/offer mismatch as primary bottleneck. | Audience role, spend/budget utilization, event depth, overlap/thin-signal diagnosis, objective fit. | `adSetId`, `campaignId`, audience label or inferred role, `spend`, `budget`, `frequency` if available, `ctr`, `events`, `objective`, `optimizationGoal`. | `>=0.72` for review; `>=0.84` for manual handoff. | Explain why broadening/pooling is the correct lever rather than budget, bid, or creative. | `P2` to `P3`; targeting mutation never `P5`. |
| `AS-12` | GEO isolate / validate / pool / cut | GEO decision uses material country/region performance plus serviceability and country economics. | Partial or stale geo freshness for action-core, missing country economics for scale/isolate, thin signal for cut, selected-range-only country spike, overlapping campaign roles. | Location rows, materiality, serviceability, economics, spend/events, target/break-even comparison. | `geoKey`, `geoLabel`, `campaignId` if scoped, spend, revenue, events, ROAS/CPA, `geoFreshness`, `countryEconomics`, `serviceability`, materiality. | `>=0.70` for watchlist; `>=0.84` for manual handoff; missing economics caps scale/isolate at watchlist. | State action: isolate, validate, pool, cut, or monitor; explain materiality and economics. | `P1` to `P3`; no native geo mutation in Phase 2. |
| `AS-13` | Placement exception review | Placement concentration and underperformance persist enough to warrant review. | One-day anomaly, selected-range-only anomaly, creative format incompatibility unresolved, broad placement setup performing within target, missing placement freshness. | Placement rows, spend share, performance vs account/campaign average, creative compatibility/context when available. | `placementKey`, `placementLabel`, spend, revenue/events, ROAS/CPA, impressions, clicks, `freshness`, objective, optimizationGoal. | `>=0.70` for anomaly; `>=0.84` for manual exception review. | Explain that placements remain automation-first and why this is an exception, not a placement dashboard. | `P1` to `P3`; placement mutation never `P5`. |
| `AS-14` | Objective / optimization rebuild | Existing campaign/ad set structure is materially incompatible with business goal or current delivery event. | Clean current structure, insufficient signal, missing commercial truth, no proposed objective/event, active winner that should be protected, recent edit cooldown. | Objective mismatch, optimization mismatch, performance impact, rebuild hypothesis, incumbent protection plan. | `campaignId`, `adSetId` where applicable, current objective, current optimizationGoal, proposed objective/event, role, spend/events, target pack, guardrails. | `>=0.76` for review; `>=0.86` for manual rebuild handoff. | Explain why rebuild is safer than editing the incumbent and how success will be measured. | `P2` to `P3`; never `P5`. |
| `AS-15` | Protect stable structure / no-touch | Stable winner, clean structure, no current bottleneck, or recent change needs absorption. | Clear high-signal loser, serviceability block, urgent waste, stale truth too severe to label stable. | Stable performance across primary and recent windows, clean config, role fit, no recent unresolved issue. | `campaignId`, `adSetId`, objective, optimizationGoal, budget owner, spend, events, ROAS/CPA, targets, previous change timestamps, mixed flags. | `>=0.78` for no-touch; lower confidence becomes watchlist hold. | Explain why the safest structure action is no action and what would reopen scale, split, consolidate, or rebuild. | `P2`; no provider mutation. |
| `AS-16` | Stable-window firewall | Any structure recommendation influenced by UI-selected date range. | Selected range is the only evidence, custom range includes partial current day, range conflicts with provider decision windows, live state unavailable for apply-adjacent action. | `analyticsWindow` plus independent `recent7d`, `primary30d`, `baseline90d`, freshness, and current config authority. | `startDate`, `endDate`, `decisionWindows`, `decisionAsOf`, `truthState`, `freshness`, current objective/budget/optimization state. | Required for all structure actions; missing firewall caps confidence at `0.69`. | Explain selected range as context only and name the actual authority window. | Missing proof caps at `P1`; with proof downstream policy decides. |

## Decision Defaults

- If campaign objective is unknown, cap objective-sensitive actions at `P1 report_only`.
- If optimization event is unknown, mixed, or incompatible with objective, block scale and route to review, switch-optimization handoff, rebuild, or monitor.
- If budget owner is campaign-level, direct ad set budget action is invalid; campaign-level handoff or CBO explanation is the maximum structure path.
- If budget owner is ad set-level but the requested action changes targeting, geo, placement, objective, optimization event, or promoted object, cap at `P3 manual_handoff`.
- If structure is mixed across budget, bid, optimization, or objective, block native push and prefer consolidate, rebuild, or review.
- If ad sets are thin and overlapping, prefer consolidation/pooling over split/test.
- If a split/test lacks a named hypothesis, budget floor, success metric, stop condition, and decision window, do not recommend it.
- If GEO materiality is thin, prefer pool, validate, or monitor over isolate/cut.
- If placement evidence is anomalous but not persistent or material, keep automation-first and monitor.
- If the selected UI range is the only support, no structure action can exceed `P1`.
- If current-day live data is unavailable, do not create any apply-adjacent structure recommendation.
- If recent significant structure, budget, bid, creative, targeting, or optimization changes occurred within roughly 3 complete provider days, do not stack another structural change unless the current issue is a hard block.

## Required Explanation Pattern

Every account-structure output must include:

1. Structure owner: campaign-level, ad set-level, pooled/CBO, ABO, mixed, or unknown.
2. Campaign objective and objective family.
3. Optimization event and whether it fits the objective and business goal.
4. Budget ownership: CBO/campaign budget or ABO/ad set budget, plus daily/lifetime type where available.
5. Audience/GEO/placement posture: broad, pooled, split, isolated, constrained, unknown, or exception-review.
6. Evidence window: recent trend, primary decision window, baseline memory, and selected reporting range boundary.
7. Signal depth: spend, events/purchases/leads, CPA/ROAS or objective-specific metric, and target/break-even comparison when relevant.
8. Structure diagnosis: aligned, fragmented, over-segmented, objective-mismatched, optimization-mismatched, demand-limited, or allocator-owned.
9. Recommended operator action and why the level is campaign, ad set, GEO, placement, or account level.
10. Push eligibility level and exact blocker for any action below `P5`.
11. What would change the decision.

## Native Push Gate

Account structure policy does not introduce new native apply surfaces.

A structure-related recommendation can reach `P5 apply_candidate` only when all are true:

- The deterministic source is Meta Decision OS or approved Command Center workflow, not AI commentary.
- The final mutation is already supported by Phase 06, such as the existing Meta ad set status/daily-budget subset.
- The target is an ad set and live execution state resolves to `budgetLevel=adset`.
- The live target has a finite daily budget when the action changes budget; no lifetime budget is present.
- The action does not require objective, optimization event, targeting, geo, placement, CBO, campaign budget, campaign status, or promoted-object mutation.
- No mixed budget/config/optimization/bid flags are present.
- Current provider account is accessible and live state is fresh.
- The action is human-approved, preview hash is current, preflight passes, canary gates allow apply, and post-apply validation can verify the exact change.

All other account-structure policies remain report, watchlist, or manual handoff.
