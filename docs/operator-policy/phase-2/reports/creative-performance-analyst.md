# Creative Performance Analyst Policy

## Scope

This policy defines the Phase 2 creative decision logic for Adsecute's Creative Performance Analyst Agent. It is a decision policy only. It does not authorize code changes, creative edits, Meta writes, queue persistence, or secret disclosure.

The current Creative Decision OS contract is the governing local contract:

- Decision payload: `creative-decision-os.v1`
- Primary source: Creative Decision OS deterministic output
- Existing lifecycle states: `incubating`, `validating`, `scale_ready`, `stable_winner`, `fatigued_winner`, `blocked`, `retired`, `comeback_candidate`
- Existing primary actions: `promote_to_scaling`, `keep_in_test`, `hold_no_touch`, `refresh_replace`, `block_deploy`, `retest_comeback`
- Existing reporting split: selected reporting range is `analysis_only`; `primary30d` is the decision authority; `baseline90d` is historical memory

Meta platform behavior must be interpreted from official Meta documentation only. Relevant official references:

- Meta Marketing API Insights API: https://developers.facebook.com/docs/marketing-api/insights/
- Meta Ads Insights reference: https://developers.facebook.com/docs/marketing-api/reference/adgroup/insights/
- Meta Ad Creative reference: https://developers.facebook.com/docs/marketing-api/reference/ad-creative/
- Meta Ad Set reference for objective, optimization, and bid context: https://developers.facebook.com/docs/marketing-api/reference/ad-campaign/
- Meta delivery learning-phase help: https://www.facebook.com/business/help/112167992830700

## Decision Principles

ROAS alone is not enough. A creative with high ROAS on one purchase may be a statistical accident, a reporting-window artifact, or a campaign-mix artifact. A creative with modest ROAS may still be valuable if CPA is below target, AOV or contribution margin is strong, CVR is rising, or it is proving a new hook family. ROAS must always be interpreted with spend, conversion count, CPA, AOV, margin/profit context, campaign lane, creative age, frequency, and funnel diagnostics.

Spend and conversion evidence floors are mandatory. Scale recommendations require both enough spend to make the result material and enough conversion count to reduce false winners. Low-evidence winners should stay in test or watch states even when ROAS is attractive.

Commercial truth outranks cosmetic performance. Target CPA, target ROAS, break-even CPA, break-even ROAS, contribution margin, AOV assumptions, country economics, promo calendar, site/feed/checkout constraints, stock pressure, and manual do-not-scale constraints determine whether a creative can be promoted, protected, refreshed, or blocked.

Creative quality is not the same as campaign outcome. Campaign objective, optimization event, bid regime, budget limits, ad set audience, placement mix, country mix, and learning status can suppress or inflate a creative. The analyst must separate "creative likely works" from "current campaign delivered profitably."

The selected reporting range must not directly drive creative decisions. The selected range may explain visible movement, exports, and selected-period trend analysis. It must not promote, kill, or refresh a creative by itself. Decisions use the operator windows: recent 7d for watch pressure, primary 30d as decision authority, and baseline 90d/all-history as memory.

## Required Fields

Minimum required fields for any segment assignment:

- Identity: `creativeId`, `name`, `creativeFormat`
- Time context: `creativeAgeDays`, decision as-of date, `primary30d`, `recent7d`, `baseline90d`
- Commercial metrics: `spend`, `purchaseValue`, `roas`, `cpa`, `purchases`
- Delivery metrics: `impressions`, `linkClicks`, `ctr`, `frequency` when available
- Funnel metrics when available: `clickToPurchaseRate`, `atcToPurchaseRate`, CVR proxy
- Attention metrics when available: hook rate, thumbstop, video 25/50/75/100 rates, hold/watch rate
- Context: account operating mode, commercial truth coverage, campaign id/name, ad set id/name, objective, optimization goal, bid regime, campaign lane, country/GEO context
- Provenance: family id/source, benchmark cohort, benchmark fallback chain, missing context, preview status

If any required field is absent, the decision must either lower confidence, cap action eligibility, or fall back to `no_touch`, `hold_monitor`, or `creative_learning_incomplete`.

## Confidence Bands

- `high`: confidence >= 0.76, material spend and conversion floors met, commercial truth fresh, benchmark cohort not thin, no major missing context
- `medium`: confidence 0.62 to 0.75, material directional evidence exists but at least one context or deployment floor is limited
- `low`: confidence 0.45 to 0.61, evidence is thin, selected cohort fell back materially, or commercial truth is partial
- `insufficient`: confidence < 0.45, no push eligibility beyond board/watch context

Confidence cannot be high when purchase evidence is below floor, commercial truth is degraded, frequency is unavailable for a fatigue claim, or the benchmark is account-only because all narrower cohorts were too thin.

## Push Eligibility Levels

Creative Decision OS remains read-only. "Push eligibility" means future operator-surface eligibility, not permission to write to Meta.

- `none`: no push, no queue, no execution suggestion
- `board_only`: visible for analyst context; not default queue work
- `watchlist`: visible for monitoring or protection; not a change request
- `review_queue`: eligible for human operator review if evidence stays intact
- `queue_ready`: eligible for the default operator queue once the execution layer exists and policy gates remain met
- `blocked`: explicitly ineligible until listed blockers clear

## Segment Policies

### scale_ready

Definition: Creative has enough current evidence, commercial fit, and deployment compatibility to be considered for controlled scaling.

- Maps to: lifecycle `scale_ready`, primary action `promote_to_scaling`
- Allowed contexts: `Exploit`, `Stabilize`, or compatible `Peak / Promo`; lower-funnel or sales/catalog/lead family; compatible scaling lane; open or scale-safe bid regime; fresh commercial truth
- Blocked contexts: `Recovery`; degraded commercial truth; site/checkout/feed critical issue; stock blocked; incompatible objective; blocked/limited deployment lane; restrictive bid cap or ROAS floor without headroom
- Minimum evidence: spend >= 200, purchases >= 4, impressions >= 5,000, primary 30d ROAS at or above target ROAS; if no target ROAS, at or above break-even ROAS + 0.15; if no commercial target, fallback requires spend >= 250, purchases >= 5, ROAS >= 2.0
- Required fields: spend, purchases, ROAS, CPA, target/break-even thresholds, campaign/ad set context, benchmark cohort, deployment compatibility, creative age, CTR or attention metric, click-to-purchase/CVR proxy
- Confidence requirements: medium minimum for `review_queue`; high for `queue_ready`
- Explanation requirements: name the evidence floors passed, benchmark cohort, CPA/ROAS commercial fit, campaign lane, deployment compatibility, and what would invalidate scale
- Push eligibility: `queue_ready` only when deployment is compatible, confidence is high, and commercial truth is fresh; otherwise `review_queue` or `board_only`

### promising_under_sampled

Definition: Creative shows positive early signs but lacks enough spend or conversion evidence for scale.

- Maps to: lifecycle `incubating` or `validating`, primary action `keep_in_test`
- Allowed contexts: test, validation, or exploration lane; new creative age; low-to-moderate spend; strong CTR/hook/thumbstop/CVR signals; commercial truth not blocking continued test
- Blocked contexts: critical commercial constraints, severe tracking gaps, zero delivery with no diagnostics, already fatigued historical winner
- Minimum evidence: impressions >= 1,000 or spend >= 40; at least one positive leading signal such as CTR, hook rate, thumbstop, video hold, click-to-purchase, or ATC-to-purchase above benchmark
- Required fields: spend, impressions, link clicks, CTR, creative age, family/source, benchmark status, at least one attention or funnel signal
- Confidence requirements: low to medium; cannot be high until spend and purchase floors are met
- Explanation requirements: identify the promising leading signal and the exact missing evidence floor
- Push eligibility: `board_only`; never `queue_ready`

### false_winner_low_evidence

Definition: Creative appears to win on ROAS or purchase value but evidence is too thin to trust.

- Maps to: lifecycle `validating` or `incubating`, primary action `keep_in_test`
- Allowed contexts: one or two conversions, very low spend, unusually high AOV, short recent spike, selected-range-only outperformance
- Blocked contexts: scale, budget increase, protected winner classification, kill decision based only on volatility
- Minimum evidence: no positive push until spend >= 200 and purchases >= 4; if AOV is materially above normal, require additional conversion depth or profit validation
- Required fields: spend, purchases, purchase value, ROAS, CPA, AOV or purchase value per purchase, account AOV/profit assumptions, selected-range note, primary 30d and historical memory
- Confidence requirements: low unless the creative has corroborating historical windows
- Explanation requirements: state why ROAS is likely overstated, list missing spend/conversion floors, and describe the next test threshold
- Push eligibility: `board_only`

### fatigued_winner

Definition: Creative has winner memory but current signals show decay that should trigger refresh or replacement rather than more spend.

- Maps to: lifecycle `fatigued_winner`, primary action `refresh_replace`
- Allowed contexts: prior strong windows, current CTR/CVR/ROAS decay, high family spend concentration, elevated frequency, declining click-to-purchase, mature creative age
- Blocked contexts: no historical winner memory, missing current signal, low delivery that cannot prove decay, campaign-level issue that explains decline better than creative fatigue
- Minimum evidence: at least two historical winner windows or prior protected/stable status; current 7d/30d decay in at least two of CTR, click-to-purchase/CVR, ROAS, attention/hold; spend concentration or frequency pressure strengthens confidence
- Required fields: historical windows, current ROAS/CPA/CTR/CVR, frequency if available, creative age, family spend concentration, campaign status
- Confidence requirements: medium for `review_queue`; high requires frequency or another delivery pressure signal plus historical memory
- Explanation requirements: distinguish fatigue from campaign suppression, list decay metrics, identify the winning family to refresh, and state not to redeploy the same asset unchanged
- Push eligibility: `review_queue` for refresh planning; `queue_ready` only for replacement planning, not Meta write-back

### kill_candidate

Definition: Creative has enough downside evidence to block deployment or retire from active testing.

- Maps to: lifecycle `blocked` or `retired`, primary action `block_deploy`
- Allowed contexts: material spend with weak ROAS and high CPA, poor click-to-purchase, weak CTR/hook, no winner memory, commercial constraints, incompatible deployment, repeated failure across windows
- Blocked contexts: low-spend learning, selected-range-only drop, campaign tracking issue, objective mismatch that prevents judging creative quality, active protected winner
- Minimum evidence: spend >= 150 and purchases <= 1 with ROAS and CPA worse than benchmark, or spend >= target CPA times 2 with zero purchases, or commercial/tracking/stock blocker that makes deployment unsafe
- Required fields: spend, purchases, ROAS, CPA, benchmark status, objective/optimization context, commercial truth blockers, historical memory, creative age
- Confidence requirements: medium minimum for review; high requires repeated window failure and no campaign-level alternative explanation
- Explanation requirements: show material spend wasted, benchmark underperformance, why it is not just learning incomplete, and what evidence would reverse the block
- Push eligibility: `blocked`; can appear in `review_queue` only as a human review item

### protected_winner

Definition: Creative is already a stable winner and should not be disturbed by new tests, short-range dips, or automated promotion logic.

- Maps to: lifecycle `stable_winner`, primary action `hold_no_touch`
- Allowed contexts: stable historical performance, commercial fit, no active fatigue, important family or campaign anchor, operating mode allows maintaining proven winners
- Blocked contexts: severe fatigue, critical commercial constraints, tracking unreliability, selected-range-only winner without history
- Minimum evidence: spend >= 250, purchases >= 5, at least two supportive historical windows, CPA within ceiling or ROAS above target/break-even, no material fatigue status
- Required fields: historical windows, spend, purchases, ROAS, CPA, target/break-even thresholds, fatigue status, campaign lane, family identity
- Confidence requirements: medium to high; high requires stable history and fresh commercial truth
- Explanation requirements: state why the winner is protected, what would trigger fatigue review, and that it stays out of promotion queue work
- Push eligibility: `watchlist`; not `queue_ready`

### hold_monitor

Definition: Creative is meaningful enough to monitor but does not justify a scale, kill, refresh, or retest action.

- Maps to: primary action `hold_no_touch` or `keep_in_test` depending on lifecycle
- Allowed contexts: mixed evidence, stable but unspectacular results, partial commercial truth, benchmark fallback, low confidence, temporary promo or country-mix noise
- Blocked contexts: clear scale eligibility, clear fatigue, clear kill evidence, critical blocker requiring explicit `block_deploy`
- Minimum evidence: any material delivery that cannot be safely classified into another segment; if evidence is tiny, prefer `no_touch`
- Required fields: current metrics, benchmark fallback chain, missing context, commercial truth status, campaign/ad set context
- Confidence requirements: low to medium
- Explanation requirements: identify the missing evidence or conflicting signal and the metric threshold that would move the creative
- Push eligibility: `watchlist` or `board_only`

### needs_new_variant

Definition: Existing concept family has useful signal but needs new hook, angle, format, or offer variants to continue learning or avoid saturation.

- Maps to: supply plan `new_test_concepts`, `expand_angle_family`, or `refresh_existing_winner`; primary action usually `keep_in_test` or `refresh_replace`
- Allowed contexts: winning family with shallow variant depth, promising but under-sampled family, fatigued winner family needing refresh, strong hook with weak CVR, strong CVR with weak hook/CTR
- Blocked contexts: no meaningful signal, kill candidate with no reusable learning, catalog/flexible creative where variant identity is too ambiguous without provenance
- Minimum evidence: family spend >= 150 or one member with strong leading signal; for refresh, winner memory or fatigue watch evidence
- Required fields: family id/source, family provenance confidence, hook/angle tags, format, top hooks/angles, attention and funnel metrics, fatigue evidence, creative age
- Confidence requirements: medium for variant planning; low allowed only as board context
- Explanation requirements: specify which component needs a variant: hook, visual format, offer, audience angle, copy, landing promise, or refresh of same family
- Push eligibility: `review_queue` for planning; never direct Meta push

### creative_learning_incomplete

Definition: Creative has not had enough delivery, time, or conversion feedback to classify performance quality.

- Maps to: lifecycle `incubating`, primary action `keep_in_test`
- Allowed contexts: young creative, low impressions, low spend, active test lane, recent launch, Meta delivery still learning or unstable
- Blocked contexts: scale, kill, fatigue, or protected winner claims unless supported by historical identity
- Minimum evidence: below one or more floors: spend < 120, purchases < 2, impressions < 5,000, or creative age <= 10 days
- Required fields: creative age, spend, impressions, purchases, campaign/ad set status, objective/optimization, current delivery status when available
- Confidence requirements: low by design
- Explanation requirements: state the missing learning floor and avoid performance verdict language
- Push eligibility: `board_only`

### spend_waste

Definition: Creative is consuming material budget without profitable or strategically useful signal.

- Maps to: primary action `block_deploy` or `refresh_replace`; lifecycle `blocked`, `validating`, or `fatigued_winner`
- Allowed contexts: spend above floor, zero or poor purchases, CPA above ceiling, ROAS below break-even, weak CTR/CVR, repeated window failure, no useful hook/angle learning
- Blocked contexts: intentionally broad learning budget, upper-funnel objective judged on purchase ROAS alone, tracking gaps, high AOV but low count without profit validation
- Minimum evidence: spend >= max(150, target CPA * 1.5) with no purchase, or spend >= target CPA * 2 with CPA still above ceiling, or ROAS below break-even across primary and recent windows
- Required fields: spend, target/break-even CPA, target/break-even ROAS, purchases, CPA, ROAS, objective, optimization goal, tracking/commercial constraints
- Confidence requirements: medium for review; high requires commercial truth and no objective mismatch
- Explanation requirements: quantify wasted spend against CPA/ROAS floor, include why the spend did not buy useful learning, and separate campaign context from creative weakness
- Push eligibility: `review_queue` for budget hygiene; `blocked` if deployment is unsafe

### no_touch

Definition: Creative should not receive an operator action because it is irrelevant, too thin, inactive, already correctly handled, or outside decision authority.

- Maps to: lifecycle `retired` or trust lane `archive_context`; may also apply to stable `hold_no_touch` items that need no current operator work
- Allowed contexts: inactive/retired creative, immaterial spend, no delivery, selected-range-only artifact, already protected winner, duplicate row, missing essential fields
- Blocked contexts: any material evidence requiring scale, kill, refresh, or test continuation
- Minimum evidence: none required; this is the safe fallback when evidence cannot support action
- Required fields: enough identity to explain why no decision is made; if identity is missing, record missing context
- Confidence requirements: any confidence band; no-touch must become default when confidence is insufficient
- Explanation requirements: explain whether the reason is immateriality, inactive state, missing data, selected-range artifact, or already-protected status
- Push eligibility: `none`

## Cross-Segment Floors

Scale floor:

- spend >= 200
- purchases >= 4
- CPA inside target or break-even ceiling when configured
- ROAS meets target, break-even + buffer, or conservative fallback
- deployment compatibility is not blocked
- commercial truth is not degraded

Kill or waste floor:

- spend >= 150 or material relative to target CPA
- conversion evidence is weak after enough spend
- performance weakness appears in the primary decision window, not only selected range
- campaign objective and optimization do not fully explain the result

Fatigue floor:

- prior winner memory exists
- current decay exists in at least one efficiency metric and one engagement/funnel metric
- frequency, creative age, or family spend concentration supports pressure when available

Learning floor:

- if spend, impressions, age, or purchases are below floor, the segment must stay `creative_learning_incomplete`, `promising_under_sampled`, `false_winner_low_evidence`, `hold_monitor`, or `no_touch`

## Explanation Standard

Every segment/action explanation must include:

- Segment and mapped Decision OS lifecycle/action
- Evidence floors passed or missing
- Primary 30d verdict, recent 7d pressure, and historical memory when available
- Commercial context: CPA, AOV/profit assumptions, target/break-even ROAS, target/break-even CPA, margin or operating mode
- Creative context: age, frequency, hook/CTR/CVR/thumbstop/attention signals when available
- Campaign context: objective, optimization, bid regime, campaign lane, ad set role, GEO/country mix
- Confidence band and why it is capped or elevated
- Push eligibility level and blocker list
- What would change the decision

Explanations must not:

- recommend scale from ROAS alone
- recommend kill from selected-range performance alone
- treat AI commentary as deterministic decision authority
- hide missing data behind confident language
- confuse campaign delivery problems with creative-quality verdicts

## Selected Reporting Range Rule

The selected reporting range is a reporting and analysis overlay. It can answer "what did the operator select to inspect?" It cannot answer "what should we do to the creative?"

Reasons:

- Very short ranges exaggerate variance and conversion lag.
- Long custom ranges can mix old creative states with current delivery states.
- Promo periods, stock events, tracking incidents, and country mix can distort selected-period ROAS.
- Meta insight fields and attribution behavior are platform-dependent, so a selected API range is a reporting slice, not a decision window.
- The local contract already separates `analyticsWindow.role = analysis_only` from `decisionWindows.primary30d.role = decision_authority`.

If selected-range evidence conflicts with decision-window evidence, the analyst must describe the conflict and keep the decision tied to the rolling decision windows.

## Campaign Context Versus Creative Quality

Before assigning scale, kill, fatigue, or waste:

- Check whether objective and optimization match the judged outcome. Do not judge an awareness or traffic lane as a purchase creative failure without qualification.
- Check bid regime. Cost caps, bid caps, or ROAS floors can suppress delivery and make a good creative look weak.
- Check campaign lane. A test lane, validation lane, and scaling lane have different evidence expectations.
- Check audience/GEO and placement mix. A creative may work in one country or placement and fail elsewhere.
- Check operating mode. Recovery and Margin Protect modes cap aggression even when creative metrics look strong.
- Check commercial constraints. Site, checkout, feed, inventory, promo, and merchandising issues can dominate creative outcomes.

The final action must say whether it is a creative-quality verdict, campaign-context verdict, or mixed verdict.

## Segment Precedence

Apply segments in this order:

1. `no_touch` for inactive, immaterial, missing-data, or outside-authority rows
2. `protected_winner` for stable proven winners without active fatigue
3. `fatigued_winner` for prior winners with decay
4. `kill_candidate` or `spend_waste` for material downside evidence
5. `scale_ready` for evidence-complete winners
6. `false_winner_low_evidence` for attractive but under-proven ROAS
7. `promising_under_sampled` for positive leading indicators without proof
8. `creative_learning_incomplete` for insufficient delivery/time
9. `needs_new_variant` as an additive supply-planning tag
10. `hold_monitor` for mixed or unresolved cases

When two segments conflict, choose the safer segment unless evidence and commercial truth are strong enough to justify the more aggressive action.
