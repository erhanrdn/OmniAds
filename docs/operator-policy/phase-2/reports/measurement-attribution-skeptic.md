# Measurement & Attribution Skeptic Policy

## Scope

This report defines the Phase 2 Measurement & Attribution Skeptic policy for Adsecute. It is doctrine only. It does not implement code, change Creatives, create write paths, expose secrets, or authorize provider mutations.

The skeptic agent exists to prevent false certainty. It may downgrade, block, or relabel recommendations from Meta Decision OS, Creative Decision OS, Command Center, and reporting views when measurement evidence is too thin, too delayed, too noisy, or too dependent on a selected reporting range.

## Local Contract Alignment

Adsecute already separates reporting context from operator authority:

- `analyticsWindow`: selected reporting range, role `analysis_only`
- `recent7d`: recent watch window, role `recent_watch`
- `primary30d`: stable operator decision authority, role `decision_authority`
- `baseline90d`: historical memory, role `historical_memory`
- `decisionAsOf`: platform-complete provider date when available

The skeptic policy must preserve this split. A dashboard-selected range can explain what the operator is looking at, but it cannot become the action authority. Operator actions need stable anchored decision windows because reporting/exploration ranges are easy to cherry-pick, may include partial days, may sit inside attribution lag, may be promo-specific, and may contradict longer memory. A stable `primary30d` window gives repeatable decisions; `recent7d` can veto or flag volatility; `baseline90d` protects against one-week anomalies and recurring scale failures.

Current local trust vocabulary remains authoritative:

- Surface lanes: `action_core`, `watchlist`, `archive_context`, `opportunity_board`
- Truth states: `live_confident`, `degraded_missing_truth`, `inactive_or_immaterial`
- Evidence completeness: `complete`, `partial`, `missing`
- Freshness states: `fresh`, `partial`, `stale`, `timeout`
- Operator dispositions: `standard`, `review_hold`, `review_reduce`, `monitor_low_truth`, `degraded_no_scale`, `profitable_truth_capped`, `protected_watchlist`, `archive_only`

## Official Meta Measurement References

Platform attribution and measurement behavior must be interpreted from official Meta documentation:

- Meta Marketing API Insights API: https://developers.facebook.com/docs/marketing-api/insights/
- Meta Ads Insights reference: https://developers.facebook.com/docs/marketing-api/reference/adgroup/insights/
- Meta campaign and bid/config reference: https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group
- Meta Conversions API measurement overview: https://www.facebook.com/business/help/AboutConversionsAPI
- Meta activity/off-Meta technologies context: https://www.facebook.com/help/2207256696182627/
- Meta delivery status and learning-phase behavior: https://www.facebook.com/help/messenger-app/650774041651557

Implications for this policy:

- Insights are reporting outputs over chosen date ranges and attribution settings; they are not proof of incrementality.
- Conversion metrics can move after the click/view event because attribution windows and event ingestion can lag.
- Reported Meta purchases may differ from Shopify, GA4, or server truth because attribution scope, view/click credit, deduplication, privacy controls, and event connectivity differ.
- Meta learning and recent edits can make short windows unstable; post-edit windows need enough complete days before action confidence recovers.

## Push Eligibility Levels

- `P0 none`: do not surface as a decision or queue candidate.
- `P1 report_only`: may appear in measurement notes or diagnostics only.
- `P2 board_only`: may appear on an opportunity or context board, never default queue.
- `P3 watchlist`: visible for operator monitoring; no default queue or provider apply.
- `P4 review_queue`: eligible for human review when deterministic source authority is intact.
- `P5 queue_ready`: eligible for default Command Center queue only; provider-backed execution still requires the separate Phase 06 support, approval, preflight, canary, stale-preview, and validation gates.

Skeptic downgrades are ceilings. If another specialist assigns a higher level, the skeptic ceiling wins.

## Confidence Bands

- `high`: `>= 0.82`; complete evidence, fresh source, stable decision windows, no material contradiction, no attribution caveat that can change the action.
- `medium`: `0.68-0.81`; usable directional evidence with named caveats, enough for review or watch.
- `low`: `0.45-0.67`; thin, noisy, delayed, or contradictory evidence; not queue-ready.
- `insufficient`: `< 0.45`; system must say `insufficient evidence` and withhold the action verdict.

The phrase `insufficient evidence` is required when the system cannot distinguish signal from measurement noise. It is not a failure state; it is the correct decision state when the risk of a false winner, false loser, or false creative verdict is material.

## Confidence Downgrade Rules

Apply all matching downgrades before push eligibility is computed:

- Low sample size: purchases below action floor, spend below materiality floor, or impressions/clicks too thin caps confidence at `0.67`.
- One lucky purchase: one purchase or one unusually high-AOV order driving most ROAS caps confidence at `0.55` and push at `P2`.
- Delayed conversions: any window ending inside the attribution/finalization buffer caps confidence at `0.68`; aggressive actions cap at `P3`.
- Attribution noise: missing attribution setting, mixed attribution basis, view-through-heavy signal, or Meta-vs-Shopify/GA4 mismatch above tolerance caps confidence at `0.64`.
- Short-term volatility: recent 7d contradicts primary 30d or one day drives more than 40% of conversions/revenue caps confidence at `0.70`.
- Selected date range bias: selected range is the only positive or negative proof caps confidence at `0.44` and requires `insufficient evidence`.
- Segment contradiction: account/campaign/ad set/creative/GEO segments disagree without a resolved parent context caps confidence at `0.66`.
- Weak campaign context: creative looks strong inside a weak, mismatched, learning, bid-limited, budget-owned, or commercially blocked campaign caps creative promotion at `P3`.
- Source freshness: `partial` caps at `0.74`, `stale` caps at `0.60`, `timeout` caps at `0.44`.
- Missing required fields: missing identity or date basis blocks the policy; missing commercial, attribution, freshness, or segment fields caps to low/watch unless explicitly allowed below.

## Policy Matrix

| ID | Policy / action | Allowed contexts | Blocked contexts | Minimum evidence | Required fields | Confidence requirements | Explanation requirements | Push eligibility level |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `MA-01` | Stable decision window firewall | Any Meta, Creative, GEO, budget, bid, or Command Center decision using selected report dates. | Direct action from selected range, partial current day, custom promo slice, MTD-only verdict, or date range chosen after seeing outcome. | `analyticsWindow`, `decisionWindows.recent7d`, `primary30d`, `baseline90d`, `decisionAsOf`; primary window available and source freshness not stale. | `startDate`, `endDate`, `analyticsWindow.role`, all decision windows, `decisionAsOf`, freshness, source health, selected-range reason. | Required for all push levels; absent firewall caps confidence at `0.44`. | State selected range is analysis-only, name the actual authority window, and say whether selected range confirms, contradicts, or merely explains. | `P5` only if downstream policy passes; missing firewall is `P1` max. |
| `MA-02` | Low sample size guard | Any apparent winner, loser, fatigue, GEO, segment, or creative claim with low spend, low purchases, or low clicks. | Scale, kill, pause, budget increase, creative promotion, or protected winner claim from thin sample. | For scale/promote: spend >= 200 and purchases >= 4 at creative level; ad set queue floor should meet the stronger local specialist floor when applicable. For loss: spend >= 150 or >= 1.5x target CPA with weak conversions. | Spend, purchases, revenue, ROAS, CPA, impressions, clicks, CTR, entity age, target/break-even values, benchmark cohort, window keys. | Below floor caps at `0.67`; below both spend and purchase floors caps at `0.55`. | Name the missing floor and explain that observed ROAS/CPA is directional, not decision-grade. | `P2` max below floor; `P3` if one floor is met and review value exists. |
| `MA-03` | One lucky purchase / outlier order guard | High ROAS, high purchase value, or low CPA caused by one purchase or one large order. | Scale, winner protection, bid loosening, budget increase, creative promotion, or GEO isolate from the outlier alone. | At least 3 additional purchases after excluding the outlier, or historical corroboration in `baseline90d`, or Shopify/profit validation that order value is normal. | Purchases, purchase value, AOV, order value distribution when available, revenue concentration, normal AOV/profit assumption, primary and baseline windows. | One purchase caps at `0.55`; one order >50% of revenue caps at `0.62`; high confidence blocked until corroborated. | Say whether performance survives removing the largest purchase; list the next evidence threshold. | `P2` max; `P3` only for watch/protection review, never scale. |
| `MA-04` | Attribution noise guard | Meta performance differs from Shopify, GA4, server/CAPI, or prior attribution basis; attribution setting unknown or changed. | Exact uplift claims, profit certainty, budget scale, creative kill, or segment winner call from unqualified Meta attribution. | Same attribution setting and action report basis across compared windows; reconciliation tolerance documented; conversion event and value event available. | Attribution setting/window, action report basis if available, event source, pixel/CAPI status when available, Meta purchases/revenue, Shopify/GA4/server orders/revenue, reconciliation delta. | Unknown basis caps at `0.64`; cross-source delta above tolerance caps at `0.60`; stable reconciled basis can recover to medium/high. | Explain the attribution basis, whether Meta is likely over/under-crediting, and which source governs commercial truth. | `P1` to `P3`; `P4` only when attribution basis is stable and reconciliation caveat is non-decisive. |
| `MA-05` | Delayed conversion and finalization lag guard | Recent performance windows, current-day reports, yesterday reports, post-click purchase cycles, offline/server events, or CAPI/pixel ingestion delays. | Same-day action authority, premature stop/scale before attribution buffer, or declaring a recent drop final. | Complete provider days only; attribution buffer appropriate to business purchase cycle; comparison against prior finalized days. | Window end date, provider account timezone, `decisionAsOf`, freshness, finalization status, event ingestion status, purchase cycle/payback notes. | Window inside lag buffer caps at `0.68`; current-day-only caps at `0.44`. | State that conversions may still accrue, name the finalized-through date, and define when the evidence becomes decision-grade. | `P1` for current-day; `P3` max for lagged watch; no `P5` until complete. |
| `MA-06` | Short-term volatility guard | Recent spikes/drops, one-day anomalies, holiday/promo days, budget/bid edits, learning changes, or uneven delivery. | Scale, pause, kill, or creative refresh based only on 1-3 days or one abnormal day. | Recent 7d plus primary 30d comparison; day-level distribution; recent edit/campaign status check; baseline volatility when available. | Daily spend, daily purchases, daily revenue, daily CPA/ROAS, recent config changes, learning/status, promo calendar, `recent7d`, `primary30d`, `baseline90d`. | One day >40% of conversions/revenue caps at `0.70`; recent 7d contradiction caps at `0.66` unless explained. | Identify the volatile day or driver, whether the 30d still supports the action, and the next review date. | `P2` to `P3`; `P4` only for reduce/hold review with material risk; no `P5` from volatility alone. |
| `MA-07` | Selected date range bias guard | Operator explores arbitrary 3d, 7d, 14d, MTD, custom, campaign launch, or promo windows. | Treating selected range as proof; comparing non-equivalent ranges; using a chosen range because it makes the case look better. | Selected range must be compared with anchored `primary30d` and `baseline90d`; reason for selected range must be explicit. | Selected start/end, selected range role, reason, primary/baseline comparison, missing days, promo/seasonality labels. | Selected-range-only evidence forces `insufficient` and caps confidence at `0.44`. | Say whether this is cherry-pick risk, exploration context, or confirmed by anchored windows. | `P1` max when selected-only; downstream level allowed only after anchored confirmation. |
| `MA-08` | Segment-level contradiction guard | Country, placement, age, gender, device, campaign, ad set, creative, or product/SKU segment analysis. | Scaling or cutting a segment when parent context, sibling segments, or commercial constraints contradict it. | Segment has material spend/conversions; parent campaign/ad set context known; sibling comparison available; no missing country economics for GEO scale. | Segment key, segment spend/revenue/purchases/ROAS/CPA, parent metrics, sibling metrics, share of spend, country economics, objective, optimization, attribution basis. | Material contradiction caps at `0.66`; missing parent context caps at `0.60`; thin segment caps at `0.55`. | Explain both sides of the contradiction and which level has authority today. | `P2` to `P3`; `P4` only for human review; `P5` blocked until contradiction is resolved. |
| `MA-09` | Creative performance inside weak campaign context guard | Creative appears strong/weak while campaign/ad set context is weak, learning, bid-limited, demand-limited, mismatched objective, promo/retargeting-heavy, or commercially blocked. | Creative scale/kill/fatigue verdict as if campaign context were clean; Creatives code or asset changes. | Creative evidence plus campaign/ad set role, objective, optimization goal, bid regime, budget ownership, lane, GEO mix, commercial constraints. | Creative id/name/family, spend, purchases, ROAS/CPA, CTR/attention/CVR, campaign/ad set ids, objective, optimization, bid strategy, budget level, lane, deployment compatibility, commercial truth. | Weak context caps creative promotion at `P3` and confidence at `0.68`; missing deployment context caps at `0.62`. | Distinguish "creative signal" from "current campaign delivered profitably"; say what clean test lane would validate it. | `P2` to `P3`; never direct provider push; `P4` only for planning review. |
| `MA-10` | Attribution-window consistency check | Comparing periods, entities, campaigns, ad sets, creatives, or source systems where attribution settings may differ. | Period-over-period winner/loser claim when attribution basis changed or is unknown. | Same attribution basis across compared data, or explicit normalized diagnostic that does not drive action. | Attribution setting/window, action breakdowns if used, action report basis, API version/source label, date range, entity ids, source freshness. | Unknown or changed basis caps at `0.64`; normalized diagnostic without action can be medium. | Name the attribution basis and state whether the comparison is apples-to-apples. | `P1` to `P3`; `P4` only if basis is stable; no `P5` on mismatched basis. |
| `MA-11` | Insufficient evidence outcome | Any case where evidence is missing, too thin, delayed, contradictory, stale, or not decision-grade. | Replacing uncertainty with AI commentary, generic advice, or confident action language. | Enough identity to state what is missing; no minimum performance evidence required. | Entity id/name when available, missing fields, failed floors, source health, freshness, window roles, confidence cap, blocked action classes. | Confidence `<0.45` requires exact state `insufficient evidence`; confidence `0.45-0.67` may use low-confidence watch only. | Say what cannot be concluded, why, what evidence is needed, and when to re-check. | `P0` or `P1`; `P2` only as board context with explicit missing evidence. |
| `MA-12` | Measurement confidence compiler | Any specialist output before it enters Command Center or operator action core. | Specialist confidence passing through without measurement downgrades; AI commentary raising confidence. | Run all applicable downgrade rules; preserve original specialist confidence and skeptic-adjusted confidence. | Original confidence, skeptic confidence, downgrade reasons, max push level, source authority, trust state, completeness, freshness, blocked classes. | Final confidence is the minimum of specialist confidence and all skeptic caps. | Show each downgrade reason and the resulting ceiling. | Ceiling decides: `P0`-`P5`; AI never raises level. |
| `MA-13` | Reporting-source reconciliation guard | Meta action/revenue metrics are used for profitability, budget, creative, or GEO decisions while commerce/server truth exists. | Treating Meta-reported revenue as net profit, assuming Meta equals Shopify orders, or ignoring refunds/returns/cancellations. | Reconciliation row or explicit unavailable state; commercial truth source selected; refund/return basis known when available. | Meta purchases/revenue, Shopify/server orders/revenue, refunds/returns, currency, attribution basis, commerce window, cost model, reconciliation delta. | Missing reconciliation caps profit claims at `0.68`; material mismatch caps action confidence at `0.60`. | State which source governs revenue/profit and whether Meta is directional or authoritative. | `P1` to `P3`; `P4` only when mismatch is non-decisive; no `P5` for profit moves without commercial authority. |
| `MA-14` | Post-change measurement cooldown | Campaign/ad set/creative has recent budget, bid, objective, targeting, status, placement, or creative deployment change. | Judging pre/post mixed data as stable; stacking another major change inside cooldown. | At least 3 complete provider days after minor config change; longer if purchases remain below floor or learning is unstable. | Change type, changedAt, previous/current budget or bid, status/learning, post-change spend, post-change purchases, post-change ROAS/CPA. | Inside cooldown caps at `0.66`; if post-change purchases <3 caps at `0.55`. | Explain the mixed pre/post window and what post-change evidence is still needed. | `P2` to `P3`; no `P5` until cooldown and evidence floors pass. |
| `MA-15` | Stable winner protection against noisy dips | Protected winner, profitable incumbent, or high-memory creative/ad set shows short-range decline. | Kill, pause, refresh, or reduce from selected-range dip, delayed conversions, or one bad day. | `baseline90d` winner memory plus current commercial truth; recent decline must be corroborated by engagement/funnel/frequency or primary-window loss before action. | Historical spend/purchases/ROAS/CPA, current primary and recent metrics, frequency/CTR/CVR where available, commercial targets, fatigue evidence, selected-range note. | Protected winner confidence can remain medium/high for hold; action against winner requires `>=0.82` and multiple decay signals. | Explain why the winner is protected, whether decline is final, and what would trigger fatigue/reduce review. | `P3 protected_watchlist`; `P4` for refresh review only with corroborated fatigue; no direct kill from noise. |

## Explanation Standard

Every skeptic intervention must include:

- The original action and original confidence.
- The skeptic-adjusted confidence and push ceiling.
- The exact downgrade rules that fired.
- The authority window used: `primary30d`, with `recent7d` and `baseline90d` roles stated when relevant.
- Whether the selected reporting range is confirmatory, contradictory, or analysis-only.
- Sample depth: spend, purchases, impressions, clicks, and whether one purchase/order dominates.
- Attribution basis and any known cross-source reconciliation issue.
- Freshness/finalization status and delayed-conversion risk.
- Segment contradictions or weak campaign context when present.
- The exact evidence that would move the item out of `insufficient evidence`, watchlist, or board-only status.

Blocked wording:

- "Meta proves this creative is the winner" when sample depth or campaign context is weak.
- "ROAS is up, scale now" without conversion depth, attribution basis, commercial truth, and stable windows.
- "Performance dropped, kill it" from selected range, current day, delayed attribution, or one bad day.
- "Expected uplift" unless deterministic bounded estimates already exist and measurement caveats do not decide the action.

## Final Policy

The Measurement & Attribution Skeptic must prefer honest uncertainty over false precision. It should downgrade aggressive actions when evidence is low-sample, attribution-noisy, delayed, volatile, cherry-picked, contradictory, or context-contaminated. The correct output in those cases is `insufficient evidence`, `board_only`, `watchlist`, or `review_hold`, not a confident queue action.
