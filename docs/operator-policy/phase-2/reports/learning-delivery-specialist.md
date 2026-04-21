# Learning & Delivery Specialist Policy

## Scope

This policy defines Adsecute Phase 2 Meta delivery-state and edit-safety doctrine. It is documentation only. It does not implement code, change Creatives, expose secrets, or authorize provider write-back.

The specialist protects delivery stability by separating learning state, delivery constraints, and true performance quality before any operator action is promoted. User examples are intent signals, not exhaustive rules.

## Official Meta References

- Meta delivery status guidance says Ads Manager delivery status can differ at campaign, ad set, and ad levels; learning is an ad set delivery state where performance is less stable and CPAs are usually worse; learning limited means the ad set did not generate enough results to exit learning; significant edits can re-enter preparing/learning: https://www.facebook.com/help/messenger-app/650774041651557
- Meta learning phase guidance states ad sets exit learning when performance stabilizes, usually after around 50 optimization events since the last significant edit, and recommends avoiding unnecessary edits while learning: https://www.facebook.com/business/help/112167992830700
- Meta performance guidance recommends combining ad sets and minimizing changes during learning so delivery can learn faster: https://www.facebook.com/business/ads/performance-marketing
- Meta budget guidance recommends sufficient budget over at least seven days so delivery can learn and says daily budgets are average daily amounts, not strict same-day caps: https://www.facebook.com/business/ads/pricing
- Meta activity history can expose budget, bid, audience, targeting, schedule, run-status, campaign, ad set, and ad changes for audit context: https://www.facebook.com/help/messenger-app/289211751238030
- Meta Marketing API campaign/ad set references expose status and current configuration fields used by Adsecute, including `status`, `effective_status`, `daily_budget`, `lifetime_budget`, `bid_strategy`, `optimization_goal`, and campaign/ad set hierarchy: https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group and https://developers.facebook.com/docs/marketing-api/reference/ad-campaign
- Meta Marketing API Insights supports arbitrary reporting windows such as `date_preset` and `time_range`; these are reporting slices, not proof that the current live delivery state should be edited: https://developers.facebook.com/docs/marketing-api/insights/

## Local Contract Inputs

Current Adsecute contracts already expose or depend on these delivery-safety inputs:

- Decision OS: `MetaDecisionOsV1Response`, ad set `actionType`, `confidence`, `reasons`, `guardrails`, `supportingMetrics`, `policy.primaryDriver`, `policy.bidRegime`, and `policy.winnerState` in `docs/phase-03-meta-action-contract.md`.
- Queue provenance: Command Center actions may only come from deterministic Meta or Creative decision outputs; AI Commentary is never workflow authority in `docs/phase-05-action-queue-contract.md`.
- Execution guardrails: Phase 06 provider-backed execution is limited to `pause`, `recover`, `scale_budget`, and `reduce_budget`; budget apply requires live ad set ownership, live `dailyBudget`, no `lifetimeBudget`, no mixed config, human approval, preflight, canary gates, and post-apply validation in `docs/phase-06-safe-execution-layer.md`.
- Meta page truth split: selected current day is `current_day_live`; historical non-today ranges are warehouse-backed; `pageReadiness` is the selected-range readiness contract; Decision OS is deterministic and read-only in `docs/meta-page-ui-contract.md`.
- Current Meta entity fields: `status`, `effective_status` where available in execution reads, `objective`, `optimizationGoal`, `dailyBudget`, `lifetimeBudget`, `budgetLevel`, `bidStrategyType`, `bidStrategyLabel`, `bidValue`, `manualBidAmount`, previous bid/budget values and captured-at timestamps, and mixed flags from `lib/api/meta.ts` and `lib/meta/execution.ts`.

## Push Eligibility Levels

- `P0 blocked`: do not surface as an action.
- `P1 report_only`: explain the delivery state or missing evidence; no queue action.
- `P2 watchlist`: operator-visible monitoring item; no default queue mutation.
- `P3 manual_handoff`: queueable for human review or manual provider inspection; no native apply.
- `P4 execution_preview`: future preview may be allowed only if the downstream action family is supported and all preflight inputs are present.
- `P5 apply_candidate`: Phase 2 only allows this for already-supported Meta execution actions after all Phase 06 gates pass. Learning or delivery diagnosis alone never creates `P5`.

## Core Semantics

Learning phase is not poor performance by itself. It is a delivery-learning state where Meta is still exploring delivery, so reported CPA, ROAS, and pacing are more volatile. A learning ad set can be healthy, risky, or wasteful only after the policy checks signal depth, edit history, objective fit, budget and bid context, and commercial truth.

Learning limited is a constraint signal, not a penalty and not a creative verdict. It usually means the ad set is unlikely to produce enough optimization events under the current setup. The correct next step is diagnosis: budget, bid or cost control, audience size, optimization event frequency, campaign structure, status blockers, or tracking quality.

Significant edits are delivery-disruptive. Budget, bid, optimization event, audience, targeting, placement, schedule, creative/ad changes, campaign objective, or structural changes can reset or disturb learning. Phase 2 must avoid stacking these edits unless the current structure is already unsafe and the recommendation explicitly chooses a rebuild/restructure path.

Delivery diagnostics precede performance actions. Underdelivery, low spend, low ROAS, high CPA, or attractive ROAS must first be classified as delivery state, constraint, or true performance result. A metric verdict without delivery-state diagnosis is incomplete.

Selected reporting range is analysis context only. Meta insights ranges can be arbitrary, partial, stale, attribution-lagged, and disconnected from current live config. They may generate hypotheses, but they must not directly drive edits.

## Required Inputs

Every delivery-state policy output must include:

- Identity: business id, provider account id, campaign id/name, ad set id/name, and ad id/name when relevant.
- Status stack: campaign, ad set, and ad `status` or `effective_status` where available; account/payment/review issue indicators when available.
- Delivery state: learning, learning limited, active, pending/preparing, inactive/off/completed, warning/limited delivery, or unknown, with source.
- Current configuration: objective, optimization goal, attribution or conversion setting when available, `budgetLevel`, `dailyBudget`, `lifetimeBudget`, `bidStrategyType`, `bidStrategyLabel`, `bidValue`, `manualBidAmount`, ROAS floor where available.
- Edit history: previous budget/bid values, `previousBudgetCapturedAt`, `previousBidValueCapturedAt`, activity-history evidence when available, and explicit unknowns.
- Performance evidence: spend, revenue, ROAS, CPA, purchases or optimization events, impressions, clicks, CTR, CPM when available, current window and comparison windows.
- Decision authority: `truthState`, freshness, completeness, read reliability, `decisionAsOf`, primary decision window, recent watch window, selected reporting range, and whether the selected range conflicts with authority windows.
- Commercial context: target CPA, target ROAS, break-even CPA/ROAS, AOV/margin assumptions, country/serviceability constraints, stock/feed/site/tracking/manual constraints.
- Structure context: campaign budget vs ad set budget, mixed budget/config/optimization/bid flags, number of sibling ad sets, audience/GEO/placement fragmentation where available.
- Explanation fields: confidence, push eligibility, allowed next review window, blocked edit classes, and what would change the decision.

If delivery state, status stack, current config, or edit history is missing, push eligibility is capped at `P1`. If commercial truth is missing, scale, loosen, or aggressive restructure actions are capped at `P2` or `P3` depending on risk.

## Confidence Requirements

- `>= 0.86`: eligible to support `P3` manual handoff or a downstream `P4/P5` action only when the downstream action's own policy gates pass.
- `0.74-0.85`: max `P2` or `P3` depending on whether the recommendation is diagnostic or manual review.
- `0.60-0.73`: max `P2`; use watchlist language.
- `< 0.60`: max `P1`; request missing evidence or monitor.

Learning, learning limited, recent edit, mixed config, selected-range-only evidence, stale truth, current-day partial data, or unknown status each caps confidence unless independently resolved by live current-state evidence.

## Policy Matrix

| ID | Policy / action | Allowed contexts | Blocked contexts | Minimum evidence | Required fields | Confidence requirements | Explanation requirements | Push eligibility |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `LD-01` | Learning phase classification | Any active or newly launched ad set with delivery state indicating learning, preparing, or unstable early delivery. | Missing entity id, unknown status at all levels, no delivery-state source, demo-only data presented as live. | Status stack, current config, spend/events since launch or last edit, edit age. | `campaignId`, `adSetId`, `status`/`effective_status`, objective, optimization goal, spend, purchases/events, previous edit timestamps, freshness. | `>=0.60` for classification; `>=0.74` to influence action suppression. | State that learning is expected exploration, not a verdict; identify missing event depth and last significant edit. | `P1-P2`; never direct apply. |
| `LD-02` | Learning limited diagnosis | Delivery state indicates learning limited or event volume is materially below the likely learning threshold after the last significant edit. | No optimization-event evidence, status inactive/off/completed, tracking unavailable, current-day-only inference, selected-range-only signal. | Optimization events or purchases since last significant edit, spend, budget, bid regime, audience/structure clues, tracking quality. | Delivery state, optimization goal, spend, purchases/events, daily/lifetime budget, bid strategy/value, objective, last edit timestamp, mixed flags. | `>=0.70` for watchlist; `>=0.82` for manual handoff. | Explain likely cause: low budget, restrictive bid/control, narrow audience, fragmented structure, rare optimization event, tracking issue, or unknown. | `P1-P3`; no `P5` by itself. |
| `LD-03` | Significant edit detection | Any candidate action where budget, bid, optimization, targeting, placement, creative/ad, schedule, status, or structure may change. | Missing current config, missing previous config, no ability to identify changed field, unrelated selected-range movement. | Current and previous config snapshots or activity-history evidence; field-level edit class and age. | Previous and current budget/bid/optimization/status fields, captured-at timestamps, action class, entity id, decisionAsOf. | `>=0.74` for edit-risk guard; missing timestamps cap at `P2`. | Name the edit type, why it may disturb learning, and whether the proposed edit stacks with another recent edit. | `P1-P3`; blocks downstream `P5` when recent. |
| `LD-04` | Recent edit cooldown guard | Last significant budget/bid/status/objective/optimization/targeting/creative/structure edit is within 3 complete provider days, or post-edit signal is not mature. | Urgent status recovery, policy/compliance blocker, explicit operator-approved rebuild of unsafe structure. | Last edit age, post-edit spend/events, current delivery state, action risk class. | `previousBudgetCapturedAt`, `previousBidValueCapturedAt`, activity-history timestamp if available, spend/events since edit, status, truth state. | Any recent significant edit blocks `P5`; `>=0.90` needed for manual override to `P3`. | Explain cooldown, post-edit evidence gap, and next review threshold. | `P1-P2`; `P3` only for manual override/restructure review. |
| `LD-05` | Hold during healthy learning | Ad set is learning but active, spending, events are accumulating, objective/config is clean, no severe commercial or tracking blocker. | High-signal loss below break-even, status error, no delivery, tracking broken, manual do-not-scale/stop, structurally unsafe setup. | Spend and event trajectory since launch/edit; no conflicting severe recent trend; clean status. | Status, delivery state, spend, purchases/events, budget, bid strategy, optimization goal, target/break-even, freshness. | `>=0.68` for hold; `>=0.80` for protected no-touch watchlist. | State why no disruptive edit is recommended and what evidence would trigger action. | `P1-P2`; hold/no-touch only. |
| `LD-06` | Block disruptive micro-edit | Proposed small budget, bid, audience, placement, creative/ad, or status tweak would disturb learning without enough expected benefit. | Explicit emergency stop, compliance/status recovery, operator-approved restructure after structural diagnosis. | Proposed edit type, current learning/recent-edit state, lack of material evidence for benefit. | Action type, delivery state, last edit age, spend/events, confidence, guardrails, selected-range firewall. | `>=0.70` to block queue promotion; lower confidence still requires warning. | Explain why the edit is likely noise-chasing or learning disruption; name safer alternative. | `P0-P2`; blocks `P5`. |
| `LD-07` | Delivery diagnostics before action | Any potential pause, recover, budget, bid, broaden, switch optimization, merge, duplicate, or rebuild action. | None; this is mandatory preflight. | Status stack, spend-to-budget, bid/control, signal density, learning/edit state, source freshness. | Status, effective status where available, budget, spend, bid strategy/value, optimization goal, purchases/events, truth state, mixed flags. | Required for all action classes; missing diagnostics cap confidence below `0.74`. | Classify issue as status-blocked, budget-bound, bid/control-bound, signal-limited, demand-limited, learning/cooldown, tracking-limited, or true performance. | Missing diagnostic proof caps at `P1`. |
| `LD-08` | Underdelivery diagnosis | Active budgeted entity spends materially below allowance or loses delivery unexpectedly. | Inactive/off/completed, schedule not open, lifetime budget exhausted, no current/live evidence, selected range only. | Budget owner, spend-to-budget, status stack, bid/control, learning state, tracking and account issue indicators. | `budgetLevel`, budget, spend, status/effective status, bid strategy/value, optimization goal, learning state, freshness, account timezone. | `>=0.72` for report; `>=0.82` to block budget increase or trigger manual review. | Separate low spend from poor performance; name the likely constraint and required next check. | `P1-P3`; never direct budget increase. |
| `LD-09` | Poor performance diagnosis | Entity has enough spend and conversion/event evidence to evaluate economics after delivery constraints are ruled out. | Learning/recent-edit without mature signal, underdelivery, tracking issue, status warning, objective mismatch, selected-range-only drop. | Material spend relative to target CPA/AOV, enough purchases/events, canonical window failure, no stronger delivery constraint. | Spend, ROAS, CPA, purchases/events, target/break-even, objective, optimization goal, status, delivery diagnosis, truth state. | `>=0.78` for reduce/pause handoff support; `>=0.86` for downstream apply support if action is supported. | Explain why this is not just learning volatility, underdelivery, or tracking lag; include what would reverse the verdict. | `P2-P5` only through downstream supported action gates. |
| `LD-10` | Do not confuse underdelivery with poor performance | Spend is low, budget is unspent, delivery is constrained, or status is limited, while efficiency metrics appear good or bad. | Sufficient delivery and mature signal show true economic failure or winner evidence. | Spend-to-budget, event depth, bid/control/status diagnosis. | Budget, spend, ROAS/CPA, events, status, bid strategy/value, learning state, objective. | `>=0.70` for guardrail; `>=0.82` to veto pause/scale from metric-only logic. | State that low delivery can inflate or distort ROAS/CPA and requires constraint resolution first. | `P1-P2`; vetoes aggressive action. |
| `LD-11` | Recover delivery status | Entity is off, paused by parent, pending review, disapproved, payment/account-blocked, no ads, completed, or otherwise unable to run, and business intent says it should run. | Unknown desired state, policy violation without remediation, completed scheduled campaign with no extension authority, demo/manual-only account, no live provider access. | Status stack at campaign/ad set/ad level, desired operating state, issue reason, provider accessibility. | `status`/`effective_status`, campaign/ad set/ad ids, providerAccessible, schedule fields if available, budget, objective, guardrails. | `>=0.82` for manual handoff; downstream `recover` apply must pass Phase 06. | Explain which level blocks delivery and whether recovery is status, schedule, account, policy, or ad-supply work. | `P2-P5` only for supported `recover` after execution gates. |
| `LD-12` | Pause or reduce for true waste | Mature evidence shows below break-even or above CPA ceiling after delivery and learning constraints are ruled out. | Learning/recent edit, learning limited without mature evidence, tracking issue, underdelivery, objective mismatch, validation lane within planned risk budget. | Canonical window loss, material spend, conversion/event depth, no status/tracking/learning alternative explanation. | Spend, purchases/events, ROAS, CPA, target/break-even, status, learning state, edit age, objective, bid regime, truth state. | `>=0.80` for manual handoff; `>=0.86` for downstream supported reduce/pause preview. | Explain why reduction/pause is safer than hold, refresh, broaden, or restructure; include stop-loss and reversal rule. | `P3-P5` only through supported action gates. |
| `LD-13` | Scale blocked by delivery instability | Candidate appears profitable but is learning, learning limited, recently edited, underdelivering, bid/control-bound, mixed-config, or thin-signal. | Mature, stable, budget-bound winner with clean config and no recent edit. | Winner evidence plus delivery-state veto reason. | ROAS/CPA, purchases/events, spend, delivery state, edit age, budget, bid regime, mixed flags, truth state. | `>=0.70` to cap scale; `>=0.82` to hard-block push eligibility. | State profitable signal and exact delivery safety blocker; provide next evidence threshold. | `P1-P2`; blocks scale `P5`. |
| `LD-14` | Restructure instead of micro-optimization | Persistent learning limited, fragmented ad sets/audiences, mixed objectives/optimization, overlapping small budgets, repeated cooldown resets, or incompatible CBO/ABO structure. | Single clean ad set with adequate signal where a targeted budget/bid edit is enough; no structural evidence; high-risk account-wide rebuild without operator approval. | Repeated learning/edit failures or fragmentation evidence across siblings; status and performance context; commercial target. | Campaign/ad set counts, objectives, optimization goals, budgets, bid regimes, mixed flags, learning states, spend/events, sibling overlap/fragmentation indicators where available. | `>=0.74` for restructure review; `>=0.86` for manual handoff. | Explain why structure blocks learning and why more small edits would extend instability; outline proposed restructure boundary without implementation. | `P2-P3`; never native apply in Phase 2. |
| `LD-15` | Broaden or switch optimization review | Learning limited or underdelivery appears caused by narrow audience, rare optimization event, low event density, or objective mismatch. | Missing objective/optimization fields, tracking unreliable, current structure already broad, commercial goal forbids higher-funnel event, recent edit cooldown. | Event density, objective/optimization fit, audience or delivery constraint indicators, commercial impact. | Objective, optimization goal, events, spend, CPA/ROAS, budget, status, tracking/commercial constraints, edit age. | `>=0.74` for watchlist/manual review; `>=0.86` for restructure handoff. | Explain tradeoff: more delivery signal may reduce lower-funnel precision; name measurement and rollback conditions. | `P2-P3`; no direct apply. |
| `LD-16` | Delivery warning / limited delivery handling | Meta delivery status or diagnostic warning indicates limited delivery, policy/review problem, no ads, pending, account/payment issue, or other status problem. | No warning source; warning is historical and current status is clean. | Warning label/reason, affected level, current status, whether impressions/spend resumed. | Status/effective status, warning reason when available, campaign/ad set/ad id, spend/impressions, provider accessibility, freshness. | `>=0.70` for report; `>=0.82` for manual handoff. | Explain the affected hierarchy level and whether performance metrics are invalid until delivery is restored. | `P1-P3`; downstream status action only if supported. |
| `LD-17` | Selected reporting range firewall | Any recommendation whose evidence starts from the UI-selected range. | Direct edit from selected range, custom range with partial current day, range mismatched to live config, cherry-picked promo window. | Independent canonical decision window, live current config, freshness and attribution-lag context. | Selected `startDate`/`endDate`, decision window, `decisionAsOf`, live config, truth state, freshness, missing inputs. | If firewall proof is absent, confidence capped at `0.59`. | State selected range is for inspection/hypothesis only and name the actual decision authority. | Missing proof caps at `P1`; with proof downstream policy decides. |
| `LD-18` | No-touch protected winner | Stable mature winner is active and commercially healthy, but proposed edit would risk resetting learning or disturbing allocation. | High-signal fatigue, severe delivery warning, business constraint, stock/site/tracking blocker, confirmed budget-bound scale opportunity with clean safety gates. | Stable primary window, supportive recent window, no recent edits, clean delivery state, commercial fit. | Spend, purchases/events, ROAS/CPA, target/break-even, status, learning state, edit age, budget/bid config, truth state. | `>=0.80` for protected watchlist. | Explain why preservation is the action and what evidence would reopen scale, refresh, or reduce. | `P2 watchlist`; no provider mutation. |

## Delivery Diagnostic Order

Run diagnostics in this order before recommending edits:

1. Status and hierarchy: campaign, ad set, and ad level can each block delivery.
2. Account and provider access: payment, review, policy, permissions, and provider accessibility.
3. Learning and edit state: learning, learning limited, preparing, last significant edit, and post-edit signal.
4. Budget owner and pacing: campaign vs ad set budget, daily vs lifetime, spend-to-budget, account timezone.
5. Bid and control constraints: cost cap, bid cap, ROAS floor, bid amount, mixed bid state.
6. Signal density: purchases or optimization events relative to objective and learning threshold.
7. Demand and structure: audience, GEO, placement, sibling fragmentation, overlapping or too-many ad sets.
8. Tracking and commercial truth: conversion/value reliability, attribution lag, target/break-even, operating blockers.
9. Performance verdict: only after the above do ROAS, CPA, CTR, and conversion depth become action evidence.

## Action Cooldowns

Default cooldowns are conservative decision gates, not implementation timers:

- Significant budget, bid, optimization, audience, placement, creative/ad, schedule, status, or structure edit: wait at least 3 complete provider days and enough post-edit signal before another disruptive edit.
- New ad set or learning restart: avoid performance verdicts until meaningful spend and event depth accrue; use learning/watch labels first.
- Learning limited after a recent edit: diagnose event density and structure before adding another edit.
- Emergency exceptions: policy/compliance issue, account/payment blocker, explicit operator stop, stock/site/manual block, or unsupported live state that makes continued delivery unsafe.

If edit timestamps are unknown, the policy must say so and cap aggressive action at `P2` unless live provider activity history or deterministic config snapshots prove stability.

## When Not To Make Disruptive Edits

Do not make or queue disruptive edits when:

- the ad set is in learning and accumulating signal without severe waste
- the last significant edit is inside cooldown
- the recommendation is based only on selected reporting range
- spend or purchases are too thin to distinguish variance from signal
- delivery is status-blocked, underdelivering, bid/control-bound, or learning limited without diagnosis
- commercial truth or tracking quality is degraded
- a stable winner is already serving profitably and no constraint requires intervention
- multiple change classes would be stacked at once, such as budget plus bid plus targeting
- mixed config makes ownership unclear

Allowed outputs in these cases are `hold`, `monitor_only`, `stable_no_touch`, `review_hold`, missing-input request, delivery diagnostic, or manual restructure review.

## When Restructure Beats Micro-Optimization

Recommend restructure review instead of repeated small edits when:

- multiple similar ad sets are each learning limited or too thin to learn
- budgets are fragmented across many low-event ad sets
- objectives, optimization goals, bid regimes, or budget ownership are mixed
- CBO/Advantage+ campaign budget allocation is being judged as if each child ad set had an independent budget
- repeated budget/bid/audience tweaks keep restarting learning
- the optimization event is too rare for the current budget and audience size
- audience, GEO, or placement fragmentation is the likely delivery ceiling

The explanation must name the structure problem, the proposed boundary of review, the evidence needed before any rebuild, and why more micro-edits would likely extend instability. Phase 2 restructure is manual handoff only.

## Underdelivery vs Poor Performance

Underdelivery means the entity is not getting enough delivery relative to its budget, schedule, or intended market opportunity. It is diagnosed from status, budget utilization, bid/control, audience, learning, and tracking context. Underdelivery can make ROAS look high because spend is throttled, or bad because the system is not finding enough qualified opportunities.

Poor performance means the entity received enough delivery under a clean state and still failed commercial targets. It requires mature spend and event evidence, clean or understood delivery state, objective fit, and target/break-even comparison.

Policy consequence:

- Underdelivery routes to diagnose, status recovery, bid/control review, broaden, switch optimization review, or restructure.
- Poor performance routes to reduce, pause, rebuild, creative refresh request, or no-touch depending on evidence and downstream policy.
- A low-spend ad set with ugly CPA is not automatically a loser.
- A low-spend ad set with high ROAS is not automatically scalable.

## Explanation Standard

Every Learning & Delivery Specialist output must include:

1. Delivery state and source.
2. Status stack across campaign, ad set, and ad when available.
3. Learning or learning-limited interpretation.
4. Last significant edit or explicit unknown.
5. Cooldown status.
6. Constraint diagnosis: status, budget, bid/control, signal density, demand/structure, tracking, or true performance.
7. Canonical decision window and selected-range firewall.
8. Required fields present and missing.
9. Confidence and reason for caps.
10. Push eligibility level and exact blocker list.
11. Recommended next safe action or no-touch reason.
12. What would change the decision.

## Blocked Language

Do not say:

- "Learning means the ad is failing."
- "Learning limited means pause it."
- "High ROAS in the selected range proves scale."
- "Low ROAS today proves stop."
- "Increase budget to fix underdelivery."
- "A small edit is harmless."
- "This will exit learning."
- "This delivery issue is a creative problem" without separating delivery from creative evidence.

Allowed language:

- "The ad set is still learning; performance is volatile and the current evidence is not mature enough for a disruptive edit."
- "Learning limited points to a signal or structure constraint; diagnose budget, bid/control, event density, and fragmentation before changing spend."
- "The selected range supports investigation, but the action authority is the rolling decision window plus live current config."
- "This looks delivery-constrained rather than performance-proven."

## Final Policy

Adsecute Phase 2 must treat Meta delivery state as a safety gate before performance actions. Learning, learning limited, significant edits, action cooldowns, delivery diagnostics, underdelivery, and selected-range boundaries are first-class constraints. The specialist may recommend diagnostics, holds, no-touch protection, manual recovery, broaden/switch/restructure review, or downstream supported actions only when required fields, confidence, explanation, and push eligibility rules are satisfied.
