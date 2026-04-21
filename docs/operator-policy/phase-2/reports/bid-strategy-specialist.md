# Bid Strategy Specialist Report: Adsecute Phase 2

## 1. Scope

This report defines Meta bid and control policy only. It does not implement code, does not change Creatives, and does not authorize write-back actions. Bid recommendations are bounded estimates, never certainty claims.

Primary official Meta references:

- Meta Marketing API campaign `bid_strategy` enum and behavior: `LOWEST_COST_WITHOUT_CAP`, `LOWEST_COST_WITH_BID_CAP`, `COST_CAP`, and `LOWEST_COST_WITH_MIN_ROAS`; Meta states campaign-level bid strategy applies when campaign budget optimization is enabled, otherwise bid strategy should be read at ad set level. https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group
- Meta Bid Strategy Guide: official business guidance for automatic bidding/highest volume, cost cap, bid cap, highest value, and minimum ROAS tradeoffs. https://www.facebook.com/business/m/one-sheeters/facebook-bid-strategy-guide

Current Adsecute field contract evidence:

- Live/current config reads request `daily_budget`, `lifetime_budget`, `bid_strategy`, `bid_amount`, and `bid_constraints{roas_average_floor}` at campaign and ad set levels in `lib/api/meta.ts`.
- Adsecute normalizes Meta bid strategies in `lib/meta/configuration.ts`: `LOWEST_COST_WITHOUT_CAP` -> `lowest_cost`, `LOWEST_COST_WITH_BID_CAP` -> `bid_cap`, `COST_CAP` -> `cost_cap`, and `LOWEST_COST_WITH_MIN_ROAS` -> `target_roas`.
- The Meta page contract exposes ad set drilldown fields for optimization goal, bid strategy label, current bid value, previous bid value, spend, ROAS, CPA, and CTR in `docs/meta-page-ui-contract.md`.
- Decision OS command readiness is trust-gated by live confident authority, complete evidence, fresh data, stable read reliability, and unsuppressed action class in `components/meta/meta-decision-os.tsx`.

## 2. Operating Principles

- Automatic bid / highest volume means open delivery under `LOWEST_COST_WITHOUT_CAP`: use it when volume and budget spend are higher priority than strict CPA/ROAS control. Meta says it is designed to get the most results for budget without limiting bid amount, while average costs may be less stable as spend rises.
- Cost cap / cost per result goal style controls use `COST_CAP` plus `bid_amount`. They aim to keep average cost per optimization event near or below the control. A tight cost cap can slow spend; that underdelivery is evidence to inspect the control before increasing budget.
- Bid cap uses `LOWEST_COST_WITH_BID_CAP` plus `bid_amount`. It limits auction bid, not reported CPA. It is appropriate only when the operator has a defendable marginal bid model or strong historical conversion economics.
- ROAS goal / target ROAS uses `LOWEST_COST_WITH_MIN_ROAS` with `bid_constraints.roas_average_floor`. It is a value control, not a volume guarantee. If the floor is too restrictive, delivery can stop or materially slow.
- Highest value is value optimization without a ROAS floor. Use it when passing reliable purchase values and when spending the budget while seeking higher conversion value matters more than maintaining a hard ROAS floor.
- Budget increase is the wrong fix when delivery is constrained by a bid cap, cost cap, ROAS floor, mixed config, limited audience, rejected/limited delivery status, recent learning reset, stale truth, or missing conversion/value signal.
- Bid/control adjustment is appropriate when current delivery and economics indicate the control is the binding constraint, not when the selected UI range simply looks good or bad.
- A new cost cap, bid cap, or ROAS-goal test is appropriate only as an isolated, bounded experiment with predeclared success, loss, and rollback rules.

## 3. Required Inputs For Any Bid Recommendation

Every bid recommendation must include:

- Entity identity: business id, provider account id, campaign id, ad set id where applicable, campaign/ad set names.
- Scope and status: campaign/ad set status, effective status, objective, optimization goal, account currency, account timezone, buying type if available, budget scope if known.
- Current controls: `bid_strategy`, normalized `bidStrategyType`, `bidStrategyLabel`, `bid_amount` / `manualBidAmount`, `bid_constraints.roas_average_floor` / target ROAS, `daily_budget`, `lifetime_budget`.
- Config quality: whether campaign/ad set config is mixed, whether budget is mixed, whether optimization goal is mixed, whether bid strategy or bid value is mixed, current and previous bid/budget values, captured-at timestamps.
- Performance evidence: spend, revenue, ROAS, CPA, CTR, purchases/conversions, impressions, clicks, reach/frequency when available, current period and comparison window.
- Commercial truth: break-even ROAS, target CPA or cost per result goal, gross margin contribution, AOV or value distribution, LTV assumptions if used, inventory/fulfillment constraints, target countries and country economics when relevant.
- Data authority: truth state, completeness, freshness, read reliability, source health, missing inputs, selected range, canonical decision window, attribution lag policy.
- Experiment context: whether this is an existing control, a proposed adjustment, or a new test; prior test outcomes; cooldown since last meaningful edit.

Missing any required control field blocks push eligibility above review-only. Missing commercial truth blocks any cost cap, bid cap, or ROAS-goal numeric recommendation.

## 4. Confidence And Push Levels

- `L0 context only`: may explain observations; cannot enter action queue.
- `L1 review candidate`: can be shown to an operator as a hypothesis; requires human review before action.
- `L2 command-ready recommendation`: can be queued as an operator action candidate when Decision OS authority is live confident, complete, fresh, stable, and the action class is not suppressed.
- `L3 write-eligible`: reserved for a future execution system; Phase 2 does not grant this level.

Confidence rules:

- `>= 0.82`: eligible for `L2` if all authority, evidence, and explanation gates pass.
- `0.68-0.81`: max `L1`; use cautious language and require operator confirmation.
- `< 0.68`: max `L0`; no bid/control recommendation, only monitoring or missing-input request.
- Any stale, partial, mismatched, demo, snapshot-fallback, or selected-range-only evidence caps push eligibility at `L0` or `L1` as noted below.

## 5. Action Policy Matrix

| Action | Allowed contexts | Blocked contexts | Minimum evidence | Required fields | Confidence requirements | Explanation requirements | Push eligibility level |
|---|---|---|---|---|---|---|---|
| Hold automatic bid / highest volume | Current strategy is `LOWEST_COST_WITHOUT_CAP` or normalized `lowest_cost`; objective and optimization goal match business goal; spend is healthy enough to learn; CPA/ROAS volatility is within tolerated band; no strict cost or ROAS mandate exists. | Business has hard CPA/ROAS constraints; spend is wasteful against break-even with material conversions; data is stale; selected UI range is the only evidence; recent major edit is still in cooldown. | At least one canonical decision window plus comparison window; material spend; enough conversions for directional read or explicit thin-signal cap. | Strategy, optimization goal, budget, spend, revenue, ROAS, CPA, purchases, break-even/target, freshness, read reliability. | `>=0.68` for review, `>=0.82` for command-ready hold/no-touch. | Must say open bidding prioritizes volume and budget spend over strict unit economics; state cost volatility risk. | `L1`; `L2` only as no-touch/hold, not a write. |
| Increase budget on automatic/highest volume | Open bidding is spending near budget, performance is above target across canonical windows, no freshness or learning cooldown issue, and marginal economics remain acceptable. | Underdelivery exists; current control is cost cap, bid cap, or ROAS floor; budget is not being spent; CPA/ROAS is below target; commercial truth is missing; current day only. | Stable performance over canonical ready window; previous budget change age; delivery near budget ceiling; bounded marginal estimate. | Daily/lifetime budget, previous budget and captured-at, spend-to-budget ratio, ROAS/CPA, purchases, target/break-even, authority. | `>=0.82` for `L2`; otherwise `L1`. | Must explain why budget is binding rather than bid/control/audience/signal; include bounded estimate range and rollback threshold. | `L1-L2`; never `L3` in Phase 2. |
| Do not increase budget because a restrictive control is binding | Campaign/ad set underdelivers while cost cap, bid cap, or ROAS goal is present; spend is materially below available budget; performance looks efficient but volume is throttled. | Open bidding with no delivery constraint; missing current control fields; delivery issue caused by policy/rejection/status; budget already fully spending. | Current control and budget evidence; underdelivery persists beyond same-day noise; no status blocker. | Bid strategy, bid value, ROAS floor if present, budget, spend, status/effective status, optimization goal, previous control value. | `>=0.68` for review; `>=0.82` for command-ready "budget increase wrong fix" guardrail. | Must state that raising budget may not increase delivery if the bid/control remains restrictive; identify the suspected binding control. | `L1-L2` as guardrail only. |
| Loosen cost cap / cost per result goal | Current `COST_CAP`; spend is below budget or unstable; CPA target is realistic but cap appears tighter than observed auction conditions; commercial target allows a bounded higher CPA. | Cap is already above commercial tolerance; poor conversion quality; missing target CPA/break-even; recent edit cooldown; underdelivery caused by audience/status/creative rather than control. | Material underdelivery plus historical CPA distribution; comparison to target CPA; previous cap change age. | `bid_amount`, `bidStrategyType=cost_cap`, budget, spend, CPA, purchases, target CPA, previous bid value/captured-at, freshness. | `>=0.68` max `L1` if evidence is directional; `>=0.82` for `L2`. | Must frame as bounded loosening test, not guaranteed volume recovery; include allowed range, stop loss, and measurement window. | `L1-L2`. |
| Tighten or introduce cost cap / cost per result goal | Automatic/open bidding is spending materially with CPA above allowed cost; conversion signal is sufficient; business has a firm cost per result target; test can be isolated. | Thin conversions; volatile AOV/value mix where ROAS is the real constraint; missing target CPA; existing delivery already underdelivers; selected UI range only. | Canonical window showing CPA above target with material spend/conversions; expected volume tradeoff acknowledged. | Current strategy, proposed `COST_CAP`, `bid_amount`, optimization goal, spend, CPA, purchases, target CPA, budget, authority. | New control test requires `>=0.74` for `L1`; `>=0.82` for `L2` only if all commercial inputs are complete. | Must explain that cost cap may slow spend; give bounded target range and rollback conditions. | `L1-L2`; new tests default `L1` unless authority is complete. |
| Loosen bid cap | Current `LOWEST_COST_WITH_BID_CAP`; spend is below budget; cap is below observed or modeled marginal value; performance target can tolerate a higher auction bid. | No marginal bid model; cap already above allowed unit economics; reported CPA alone is treated as bid cap proof; insufficient conversions; recent edit cooldown. | Historical bid/cost observations, conversion rate or value model, underdelivery evidence, previous cap age. | `bid_amount`, bid strategy, budget, spend, CPA/ROAS, purchases, conversion rate or value assumptions, target CPA/ROAS, previous bid. | `>=0.74` for `L1`; `>=0.82` for `L2` only with commercial model present. | Must clarify bid cap limits auction bid and does not directly cap reported CPA; include range and uncertainty. | `L1-L2`. |
| Tighten or introduce bid cap | Operator has internal bid/LTV model and wants auction-level bid control; open or cost-cap delivery is spending into unprofitable auctions; test is isolated. | No internal bid model; objective lacks reliable conversion/value data; goal is simply to reduce reported CPA; account is in learning volatility; mixed bid configs. | Material spend with unfavorable economics; modeled maximum bid; enough conversion evidence to estimate win/loss tradeoff. | Proposed `LOWEST_COST_WITH_BID_CAP`, `bid_amount`, optimization goal, spend, conversion rate, value/LTV, CPA/ROAS, budget. | `>=0.82` for `L2`; otherwise `L1`. | Must state bid cap can starve delivery and requires frequent review; never promise CPA result. | `L1-L2`; default `L1` for new tests. |
| Loosen ROAS goal / target ROAS | Current `LOWEST_COST_WITH_MIN_ROAS` / `target_roas`; spend is constrained; floor is above recent achievable value; business can tolerate lower ROAS for more volume. | Purchase value signal is unreliable; break-even ROAS unknown; floor is already at or below break-even; underdelivery caused by status/audience; current day only. | Value-event quality check; revenue and purchase count; spend below budget; floor vs actual ROAS distribution; previous floor age. | `bid_constraints.roas_average_floor`, bid strategy, budget, spend, revenue, ROAS, purchases, value source, break-even ROAS. | `>=0.74` for `L1`; `>=0.82` for `L2`. | Must explain lower floor may increase spend and lower average ROAS; include acceptable ROAS band and stop loss. | `L1-L2`. |
| Tighten or introduce ROAS goal / target ROAS | Value optimization is needed; purchase values are reliable; current open/highest value spend is below break-even or below target ROAS with material volume; test is isolated. | Missing or noisy purchase values; low purchase count; AOV distribution too sparse; strict budget spend is the priority; no break-even ROAS. | Canonical value window with material revenue/purchases; reliable `action_values`/purchase value; commercial ROAS floor. | Proposed `LOWEST_COST_WITH_MIN_ROAS`, `roas_average_floor`, spend, revenue, ROAS, purchases, AOV/value distribution, budget. | `>=0.82` for `L2`; `0.74-0.81` max `L1`. | Must state ROAS floor can reduce or stop delivery if Meta cannot find enough value at the floor. | `L1-L2`; new tests default `L1`. |
| Use or hold highest value | Sales/value objective has reliable purchase values; goal is to spend budget while biasing toward higher-value conversions; hard ROAS floor is not required. | Purchase value signal missing/untrusted; strict ROAS floor is required; revenue is sparse; selected range only shows one-off high AOV. | Value-event reliability, purchase count, AOV distribution, spend and revenue over canonical window. | Optimization goal/value objective, purchase values/action values, spend, revenue, ROAS, purchases, budget, commercial target. | `>=0.68` for `L1`; `>=0.82` for `L2` hold/no-touch. | Must distinguish highest value from target ROAS: highest value seeks value within budget; it is not a ROAS guarantee. | `L1`; `L2` only as hold/no-touch or review candidate. |
| Create a new cost cap, bid cap, or ROAS-goal test | Existing strategy has a clear failure mode; commercial target is known; test can be isolated by campaign/ad set; rollback and measurement window are explicit. | Account-wide bulk change; mixed configs obscure attribution; insufficient signal; recent major edit; no commercial target; no ability to measure against canonical windows. | Pre/post baseline, target metric, minimum spend/conversions, proposed control value, expected downside, rollback threshold. | All current control fields, proposed control, budget, objective, optimization goal, spend/revenue/conversions, target CPA/ROAS, previous config. | `>=0.74` for `L1`; `>=0.82` plus full authority for `L2`. | Must name hypothesis, test cell, control value, duration/window, success threshold, stop loss, and what would change the decision. | `L1` by default; `L2` only for narrow operator-approved queue candidate. |
| Block bid action from selected reporting range only | UI selected range suggests a bid move but canonical authority, comparison window, current config, or commercial truth is missing. | None; this block applies whenever selected range is the only driver. | Evidence that recommendation depends on selected range alone or range mismatch exists. | Selected range, canonical window availability, authority state, config freshness, missing inputs. | Any confidence is capped below `0.68` unless independent canonical evidence exists. | Must explain that selected reporting range is for inspection and hypothesis generation, not direct bid execution. | `L0`. |

## 6. Underdelivery Diagnosis

Underdelivery can justify a bid/control review, not an automatic budget increase.

Check in this order:

1. Status blockers: campaign/ad set/ad effective status, policy limits, learning or recent edit cooldown.
2. Budget actually binding: spend near daily/lifetime budget and no restrictive control.
3. Restrictive control: cost cap, bid cap, or ROAS floor present with spend materially below available budget.
4. Signal density: conversions/purchases/value events too sparse for the control.
5. Market/audience constraints: narrow audience, geo, placement, or objective limitations.
6. Data authority: current-day lag, attribution lag, stale sync, mixed config, or selected-range mismatch.

If a restrictive control is likely binding, the eligible action is to review, loosen, remove, or test the control within bounded ranges. Increasing budget first is blocked because the extra budget may remain unspent or push unstable delivery only after the control is changed.

## 7. Bounded Estimate Language

Allowed language:

- "The evidence suggests the cap may be restricting delivery."
- "A 10-15% loosening test is a bounded starting range if commercial CPA still fits."
- "Expected impact is uncertain; evaluate after the agreed spend/conversion window."

Blocked language:

- "This will increase delivery."
- "This cap guarantees CPA."
- "Target ROAS will hold profitability."
- "Budget increase will fix underdelivery."
- "Selected range proves the bid should change."

## 8. Selected Reporting Range Rule

The UI selected reporting range must not directly drive bid action because it can be partial, stale, attribution-lagged, cherry-picked, or mismatched to the live config state. Meta's API supports arbitrary `date_preset` and `time_range` reporting windows, but bid controls operate on current delivery settings and auction conditions. A selected range is therefore evidence for investigation only.

A bid/control action requires canonical decision windows, current campaign/ad set config, commercial truth, and Decision OS authority. If the selected range differs from the authoritative run context, or if the response range does not match the selected business/date range, push eligibility is capped at `L0`.

## 9. Final Policy

Bid strategy recommendations in Adsecute Phase 2 are explanation-first, evidence-gated, and control-aware. The agent may recommend holding, reviewing, loosening, tightening, or testing Meta bid controls only when required fields, commercial targets, data authority, and confidence gates are satisfied. It must never treat budget as the default fix for underdelivery under restrictive controls, and it must never convert a UI-selected reporting range directly into a bid action.
