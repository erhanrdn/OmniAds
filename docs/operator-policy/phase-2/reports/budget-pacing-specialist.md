# Budget & Pacing Specialist Policy

Scope: Adsecute Phase 2 Meta operator policy for budget logic and spend pacing. This is a read-only policy report. It does not define Creatives behavior, secrets, or new implementation.

## Platform References

- Meta Advantage+ campaign budget, formerly campaign budget optimization, distributes one campaign budget across ad sets in real time and expects eligible ad sets to share the same budget type, bid strategy, and standard delivery type: https://www.facebook.com/business/ads/meta-advantage-plus/budget
- Meta budget and schedule guidance distinguishes daily budgets from lifetime budgets. Meta describes daily budget as an average daily amount and states daily spend can exceed the daily amount while averaging over the week; lifetime budget caps total spend across the scheduled run: https://www.facebook.com/business/ads/pricing
- Meta delivery status guidance says learning is less stable, CPAs are usually worse, and significant edits can cause ads or ad sets to re-enter preparing/learning: https://www.facebook.com/help/messenger-app/650774041651557
- Meta Marketing API campaign fields include `daily_budget`, `lifetime_budget`, `budget_remaining`, `bid_strategy`, `pacing_type`, `effective_status`, and CBO-related bid strategy notes: https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group
- Meta activity history can expose budget, bid, schedule, targeting, run-status, campaign, and ad set changes for operator audit context: https://www.facebook.com/help/messenger-app/289211751238030

## Local Contract Inputs

- Decision OS contract: `docs/phase-03-meta-action-contract.md`
- Execution guardrails: `docs/phase-06-safe-execution-layer.md`
- Campaign route shape: `app/api/meta/campaigns/route.ts`
- Ad set route shape: `app/api/meta/adsets/route.ts`
- Warehouse budget fields: `lib/meta/warehouse-types.ts`
- Live and warehouse budget serving: `lib/meta/live.ts`, `lib/meta/serving.ts`
- Execution live-state resolver: `lib/meta/execution.ts`
- Decision engine budget actions: `lib/meta/decision-os.ts`

Required budget fields already present in the Meta surface:

- `budgetLevel`: `campaign`, `adset`, or `null`
- `dailyBudget`, `lifetimeBudget`
- `previousDailyBudget`, `previousLifetimeBudget`, `previousBudgetCapturedAt`
- `isBudgetMixed`, `isConfigMixed`, `isOptimizationGoalMixed`, `isBidStrategyMixed`, `isBidValueMixed`
- `spend`, `revenue`, `roas`, `cpa`, `purchases`, `impressions`, `clicks`, `ctr`
- `bidStrategyType`, `bidStrategyLabel`, `optimizationGoal`, `status`
- Decision Trust fields on Decision OS objects: `surfaceLane`, `truthState`, `operatorDisposition`, reasons, evidence floors

## Push Eligibility Levels

- `P0 blocked`: do not surface as an action.
- `P1 report_only`: show in report or explanation only; no Command Center action.
- `P2 watchlist`: visible as watchlist-only queue context.
- `P3 manual_handoff`: queueable for human review, but no native Meta apply path.
- `P4 execution_preview`: native preview may be built, but apply remains blocked until all preflight checks pass.
- `P5 apply_candidate`: human-approved, current supported provider-backed apply path may run after live preflight, stale-preview rejection, canary gates, and post-apply validation.

Current Phase 2 posture: campaign-budget, Advantage+ campaign budget/CBO, lifetime-budget, mixed-config, and ambiguous ownership cases cannot exceed `P3 manual_handoff`. Only live ad set daily-budget changes that match the Phase 06 guardrails can reach `P5 apply_candidate`.

## Core Budget Semantics

### Campaign Budget vs Ad Set Budget

- Campaign budget means the spend control is owned by the campaign. This includes Advantage+ campaign budget/CBO behavior where Meta distributes campaign budget across ad sets.
- Ad set budget means the spend control is owned by the ad set. This is the only budget ownership level that Phase 06 currently allows for native Meta budget mutation.
- If a campaign row has `budgetLevel=campaign`, the operator must not infer that a specific child ad set has a directly editable spend cap.
- If an ad set row resolves to campaign budget fallback in `lib/meta/execution.ts`, the budget action is campaign-owned even if the original decision was attached to an ad set.

### CBO / Advantage+ Campaign Budget

- Treat CBO/Advantage+ campaign budget as pooled allocator logic. Meta may shift delivery among ad sets based on opportunity, so ad set spend share is not equal to ad set budget intent.
- Do not issue ad set budget increases/decreases inside campaign-budget-owned structures unless an explicit ad set spend limit/min-max control is part of the supported local contract. It is not part of the current Phase 2 execution contract.
- CBO recipient/donor decisions can be recommended as budget-shift reasoning, but not as direct ad set budget writes.

### ABO Structures

- ABO means ad set budget ownership. The policy may recommend scale or reduce actions on the ad set only when the live target has `budgetLevel=adset`, a finite `dailyBudget`, no `lifetimeBudget`, and no mixed config state.
- ABO does not automatically mean safe to push. Recent edits, learning instability, low signal, or delivery constraints can still block.

### Daily vs Lifetime Budgets

- Daily budgets are average daily controls. Spend utilization must be interpreted against account day progress and Meta pacing behavior, not as a strict linear hourly cap.
- Lifetime budgets are total-run controls. They require schedule, start/end time, remaining budget, and remaining delivery days before any action can be trusted.
- Current native execution only supports `dailyBudget` on ad sets. Lifetime-budget actions are manual-only.

### Spend vs Budget Utilization

- Spend is observed delivery. Budget is intended allowance. Utilization is a diagnostic, not proof of performance.
- Budget utilization can indicate budget binding only when the entity is active, the budget owner is known, spend is near the relevant budget allowance, and no stronger delivery constraint explains the behavior.
- Do not increase budget merely because spend is high. Require performance quality, signal depth, stable structure, and no recent-change cooldown.
- Do not decrease budget merely because selected-range spend is low. Require live delivery state and a constraint diagnosis.

### Budget Binding vs Delivery Constraint

- Budget binding means the entity is likely capped by available spend allowance.
- Delivery constraint means spend is limited by another cause, such as learning instability, bid/cost cap, audience size, objective mismatch, low estimated action rate, creative/landing constraints, account/payment issue, status issue, review issue, or schedule/lifetime remaining-budget limits.
- A budget increase is allowed only after the policy rules out delivery constraints strongly enough for the requested push level.

### Selected Reporting Range Boundary

The selected reporting range must not directly drive today's budget action.

Allowed use of selected range:

- Explain historical context.
- Compare trend, efficiency, and signal depth.
- Validate that the current decision is not contradicted by the selected range.
- Help the operator understand why the action appeared.

Blocked use of selected range:

- Multiplying today's budget by selected-range ROAS alone.
- Treating a 7-day, 30-day, month-to-date, or custom range as the current live budget state.
- Using a range that includes stale, partial, or pre-finalized days as an apply authority.
- Letting a promotional or anomalous selected window override live account-day status and recent config history.

Today's budget action must be anchored to current live provider state plus a stable decision window. The local Decision OS already separates the requested analytics range from `decisionWindows.primary30d`; this policy preserves that boundary.

## Policy and Action Matrix

| ID | Policy / action | Allowed contexts | Blocked contexts | Minimum evidence | Required fields | Confidence requirements | Explanation requirements | Push eligibility |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `BP-01` | Budget ownership classification | Any campaign or ad set with live or warehouse budget fields. | Missing entity id, missing account assignment, partial route with no budget fields, unknown `budgetLevel` plus no parent/child budget evidence. | Current row plus parent/child budget fallback when available. | `campaignId` or `adSetId`, `budgetLevel`, `dailyBudget`, `lifetimeBudget`, `isBudgetMixed`, `isConfigMixed`, `status`. | `>=0.70` for report; `>=0.85` before any downstream push. | State whether budget is campaign-owned, adset-owned, lifetime, mixed, or unknown. | `P1`; may feed higher policies only when `>=0.85`. |
| `BP-02` | CBO / Advantage+ campaign budget handling | Campaign-owned budget with multiple ad sets or campaign-level `dailyBudget`/`lifetimeBudget`; budget-shift board and allocator explanation. | Direct ad set budget mutation, mixed budget type across ad sets, unsupported min/max controls, unknown bid strategy, stale campaign config. | Campaign budget fields, child ad set spend distribution, bid strategy and budget type consistency. | `campaignId`, `dailyBudget` or `lifetimeBudget`, `bidStrategyType`, child ad set count, child spend, `isBudgetMixed`, `isBidStrategyMixed`. | `>=0.75` for budget-shift recommendation; `>=0.90` for manual handoff. | Explain pooled allocation and why child ad set spend is not a direct budget. | `P1` to `P3`; never `P5` in Phase 2. |
| `BP-03` | ABO ad set budget handling | Ad set-owned budget with `budgetLevel=adset`, finite `dailyBudget`, active/live target, no lifetime budget. | `budgetLevel=campaign`, `lifetimeBudget` present, no budget, mixed config, inactive or inaccessible provider account. | Live ad set execution-state read plus Decision OS decision. | `adSetId`, `campaignId`, `budgetLevel`, `dailyBudget`, `lifetimeBudget`, `status`, `providerAccessible`, mixed flags. | `>=0.80` for handoff; `>=0.88` and live-confident trust for apply candidate. | Explain exact current daily budget and why the owner is the ad set. | `P3` to `P5` if all Phase 06 checks pass. |
| `BP-04` | Daily budget pacing interpretation | Daily-budget campaign/ad set with account timezone and current account-day progress. | Lifetime budget, missing timezone, partial current-day live data, selected historical range only. | Same-day spend, current daily budget, account day progress, live status. | `accountTimezone`, `currentDateInTimezone`, `spend`, `dailyBudget`, `status`, `freshness`. | `>=0.70` for anomaly report; `>=0.85` before budget action. | Explain daily budget as average allowance, not strict hourly pacing. | `P1` to `P3`; cannot alone trigger `P5`. |
| `BP-05` | Lifetime budget pacing interpretation | Lifetime-budget campaign/ad set with known schedule and remaining budget. | Missing start/end schedule, no remaining budget, current Phase 06 native apply, campaign-owned ambiguity. | Lifetime budget, spend to date, schedule, days/hours remaining, status. | `lifetimeBudget`, `spend`, `start_time`, `end_time` or local equivalent, `budget_remaining` if available, `status`. | `>=0.75` for report; `>=0.90` for manual handoff. | Explain that total-run budget and schedule, not today's spend alone, govern pacing. | `P1` to `P3`; never `P5` in Phase 2. |
| `BP-06` | Spend vs budget utilization diagnosis | Entity has known budget owner and finalized or live-confident spend data. | Partial warehouse truth, current-day unavailable live data, unknown budget owner, mixed budgets. | Spend, budget, elapsed period, previous budget, status, delivery signal. | `spend`, `dailyBudget` or `lifetimeBudget`, `previousDailyBudget`, `previousLifetimeBudget`, `previousBudgetCapturedAt`, `status`, `truthState`. | `>=0.72` for diagnostic; `>=0.86` for action support. | Separate utilization from efficiency; state whether utilization is high, low, or inconclusive. | `P1` to `P3`; feeds `BP-07` and `BP-08`. |
| `BP-07` | Budget increase safety | ABO daily-budget ad set or manual campaign-budget handoff with clean winner evidence, active status, stable recent config, no stronger constraint, no commercial block. | CBO direct ad set mutation, lifetime budget, mixed config, recent budget/bid edit within 3 days, learning/preparing instability without enough signal, low signal, stock/manual do-not-scale/landing concern, bid-regime pressure not resolved. | Strong clean signal and efficiency: at least current Decision OS `scale_budget`, `truthState=live_confident`, `surfaceLane=action_core`, target met, signal depth, no recent edit. | `actionType`, `actionSize`, `confidence`, `trust`, `spend`, `revenue`, `roas`, `cpa`, `purchases`, `dailyBudget`, `bidStrategyLabel`, `optimizationGoal`, `previousBudgetCapturedAt`, mixed flags, commercial constraints. | `>=0.88` for `P5`; `>=0.80` for `P3`. Lower confidence downgrades to watchlist/report. | Explain why performance is not merely spend concentration, why the entity is not delivery constrained, proposed move band, and rollback/watch metric. | `P3` for campaign/CBO; `P5` only for live ABO daily-budget ad set with Phase 06 preflight. |
| `BP-08` | Budget decrease safety | Clear underperformance below break-even with strong signal, or controlled load reduction where pause is too aggressive. | Low-signal ambiguity, recent edit cooldown, budget not owner-resolved, lifetime budget without remaining-run analysis, account-wide pacing already under target, learning/preparing without high-signal loss. | Decision OS `reduce_budget` or downgraded pause under degraded truth, spend and conversion depth, break-even miss, no recent-change ambiguity. | `actionType`, `actionSize`, `confidence`, `spend`, `roas`, `cpa`, `purchases`, `dailyBudget`, `previousBudgetCapturedAt`, `status`, trust fields, mixed flags. | `>=0.80` for handoff; `>=0.86` for `P5` on live ABO daily-budget ad set. | Explain why reduction is safer than hold or pause, expected reduction band, and what would reverse the decision. | `P3` to `P5` if ABO daily-budget preflight passes; otherwise `P3`. |
| `BP-09` | Zero-sum budget reallocation | At least one clean donor and one clean recipient, both active/action-core, with recipient winner-scale candidate and donor pause/reduce evidence. | Same campaign donor/recipient pair, CBO ambiguity without manual review, missing winner, missing loser, mixed config, degraded commercial truth, selected-range-only evidence. | Donor Decision OS `pause` or `reduce_budget`; recipient `winnerScaleCandidates`; budget owner known for both; no recent-change conflict. | `fromCampaignId`, `toCampaignId`, donor and recipient confidence, roles, spend, ROAS/CPA, daily/lifetime budget fields, trust fields. | `>=0.82` average confidence for `P3`; never auto-apply as a pair in Phase 2. | Explain donor loss, recipient headroom, suggested move band, and why this is read-only/manual. | `P3`; never `P5` in Phase 2. |
| `BP-10` | Budget binding diagnosis | High utilization plus efficient performance, active status, clean budget owner, no stronger delivery constraint. | Low utilization, inactive status, learning/preparing with unstable results, cost cap/bid cap/ROAS floor pressure, limited audience/placements, review/payment/account issues, partial freshness. | Utilization, target met, bid regime, status, freshness, signal depth, recent changes. | `spend`, `dailyBudget`/`lifetimeBudget`, `roas`, `cpa`, `purchases`, `bidStrategyType`, `optimizationGoal`, `status`, `freshness`, `previousBudgetCapturedAt`. | `>=0.80` for diagnosis; `>=0.88` to support budget increase. | State why budget, not delivery quality, appears to be the binding constraint. | `P1` to `P3`; supports `BP-07`. |
| `BP-11` | Delivery constraint diagnosis | Low or uneven spend, high CPA, learning/preparing, constrained bid regime, objective mismatch, creative/landing/stock blocker, schedule/remaining-budget issue. | Clean budget-bound winner evidence. | At least one non-budget constraint signal plus budget owner and utilization context. | `status`, `bidStrategyType`, `bidValue`, `optimizationGoal`, `ctr`, `spend`, `budget`, commercial constraints, learning/status evidence where available. | `>=0.70` for report; `>=0.82` to block a budget increase. | Name the likely constraint and the next non-budget action or evidence needed. | `P1` to `P2`; blocks `P5`. |
| `BP-12` | Pacing anomaly: fast spend/front-loading | Current account-day daily-budget entity with spend materially ahead of expected elapsed-day pace. | Lifetime budget without schedule analysis, selected historical range only, missing account timezone, Meta current-day live data unavailable. | Same-day spend, daily budget, elapsed account-day percent, recent edit status, results quality. | `accountTimezone`, `currentDateInTimezone`, `spendToday`, `dailyBudget`, `status`, `previousBudgetCapturedAt`, `purchases`, `roas`, `cpa`. | `>=0.70` for anomaly; `>=0.85` before any reduce/pause handoff. | Explain that Meta may over/under spend against daily average and why this instance is abnormal or normal. | `P1` to `P3`; not direct `P5` unless `BP-08` independently passes. |
| `BP-13` | Pacing anomaly: underdelivery | Budgeted active entity spends materially below allowance while market window is open. | Inactive/paused/completed, account issue, schedule closed, lifetime budget already exhausted, no live current-day evidence. | Budget owner, spend-to-budget, status, delivery constraints, bid regime, learning state where available. | `status`, `effective_status`, `dailyBudget`/`lifetimeBudget`, `spend`, `bidStrategyType`, `optimizationGoal`, `freshness`, schedule fields when lifetime. | `>=0.72` for anomaly; `>=0.86` before recommending non-budget intervention. | Explain whether the issue is budget, bid, audience/objective, schedule, account status, or evidence gap. | `P1` to `P2`; rarely `P3`; never automatic budget increase by itself. |
| `BP-14` | Recent edit / learning disruption guard | Any entity with previous budget/bid capture time or activity-history evidence. | Missing previous config data does not prove safe; treat as unknown. | Previous budget or bid change age, delivery status, signal depth after change. | `previousBudgetCapturedAt`, `previousBidValueCapturedAt`, `status`, `purchases`, `spend`, `truthState`. | Any recent edit within 3 days blocks `P5`; confidence must be `>=0.90` to override to manual handoff only. | Explain the edit age and Meta learning risk. | `P1` to `P3`; blocks `P5`. |
| `BP-15` | Mixed config guard | Any campaign/ad set with mixed budget, bid, optimization, or config flags. | None; mixed config is always a safety concern until resolved. | Mixed flag source plus entity scope. | `isBudgetMixed`, `isConfigMixed`, `isOptimizationGoalMixed`, `isBidStrategyMixed`, `isBidValueMixed`, entity id. | Mixed config blocks native push regardless of action confidence. | State which mixed flag blocks the action and whether rebuild/review is more appropriate. | `P1` to `P3`; never `P5`. |
| `BP-16` | Selected-range action firewall | Any budget action derived from dashboard-selected date range. | Direct push from selected range; custom range containing partial current day; stale warehouse period; non-comparable promo window. | Stable decision window plus live current state independent of selected range. | `startDate`, `endDate`, `decisionWindows`, `decisionAsOf`, `freshness`, `truthState`, live current state for apply. | Required for all budget actions. If absent, confidence capped at `0.69`. | Explain selected range as context only and name the actual action authority window. | Missing firewall proof caps at `P1`; with proof, downstream policy decides. |

## Decision Defaults

- If budget owner is unknown, classify as `P1 report_only`.
- If the entity is campaign-budget-owned, classify direct ad set budget action as `P3 manual_handoff` at most.
- If the entity is lifetime-budget-owned, classify as `P3 manual_handoff` at most.
- If current-day live data is unavailable, do not create a today budget apply candidate.
- If warehouse truth is partial or stale, cap budget action confidence at `0.69` unless live state independently confirms the target and the action is manual-only.
- If commercial truth is degraded, scale actions collapse to hold/watchlist; reductions may remain manual review when high-signal loss exists.
- If recent edit age is less than 3 days, do not stack budget, bid, objective, targeting, or structure changes.
- If status is not active, do not increase budget. Recover actions are status actions, not spend-release actions.
- If performance is strong but signal is thin, prefer monitor, validate, or broaden over budget increase.
- If pacing looks abnormal but performance is profitable, diagnose before cutting spend.
- If pacing looks normal for Meta daily-budget behavior, explain it and avoid action.

## Required Explanation Pattern

Every budget or pacing output must include:

1. Budget owner: campaign, ad set, lifetime, mixed, or unknown.
2. Budget type: daily or lifetime.
3. Observed spend and budget utilization, with timeframe and account timezone.
4. Performance quality: ROAS, CPA, purchases, spend, and whether target or break-even was met.
5. Constraint diagnosis: budget-bound or delivery-constrained, with named evidence.
6. Recent-change status: previous budget/bid capture age or explicit unknown.
7. Learning risk: whether the action may disturb learning and why.
8. Action authority: live current-day state, stable decision window, and selected-range firewall.
9. Push eligibility level and reason.
10. What would change the decision.

## Native Push Gate

A budget action can reach `P5 apply_candidate` only when all are true:

- Source is deterministic Meta Decision OS or approved Command Center workflow, not AI commentary.
- Action is `scale_budget` or `reduce_budget`.
- Entity is an ad set and live execution state resolves to `budgetLevel=adset`.
- Live `dailyBudget` is finite and greater than zero.
- `lifetimeBudget` is null.
- No mixed budget/config/optimization/bid flags are present.
- Provider account is accessible.
- Workflow is human-approved.
- Preview hash is current and preflight passes.
- Apply gates, canary gates, and kill switches allow apply.
- Post-apply validation can confirm the exact target.

All other budget policies remain report, watchlist, or manual handoff.
