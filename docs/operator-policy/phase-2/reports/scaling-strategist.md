# Scaling Strategist Policy

## Scope

This report defines how Adsecute Phase 2 should reason about Meta scaling decisions across campaigns, ad sets, and creatives. It is a policy report only. It does not change runtime code, execution support, Creatives code, or provider state.

The policy should generalize from operator examples into expert media-buyer behavior:

- scale only when profitability, conversion depth, variance, and delivery headroom agree
- protect stable winners from unnecessary edits
- distinguish budget-limited, bid-limited, and demand-limited situations before choosing a lever
- use rolling operator decision windows, not the UI-selected reporting range, to decide today's action
- keep aggressive actions out of push flows when commercial truth, source freshness, or sample depth is degraded

## Repo Alignment

Existing Adsecute logic already separates the UI analytics range from operator authority:

- `analyticsWindow`: selected reporting range, role `analysis_only`
- `recent7d`: recent watch window
- `primary30d`: decision authority window
- `baseline90d`: historical memory window
- `decisionAsOf`: provider platform previous date when available

Existing Meta Decision OS action vocabulary includes:

- ad set actions: `pause`, `recover`, `rebuild`, `scale_budget`, `reduce_budget`, `hold`, `duplicate_to_new_geo_cluster`, `merge_into_pooled_geo`, `switch_optimization`, `tighten_bid`, `broaden`, `monitor_only`
- strategy classes: above plus `review_hold`, `review_cost_cap`, `creative_refresh_required`, `stable_no_touch`
- trust lanes: `action_core`, `watchlist`, `archive_context`, `opportunity_board`
- operator dispositions: `standard`, `review_hold`, `review_reduce`, `monitor_low_truth`, `degraded_no_scale`, `profitable_truth_capped`, `protected_watchlist`, `archive_only`

Phase 2 scaling policy should reuse those concepts rather than create a separate execution taxonomy.

## Official Meta Behavior References

Platform behavior that affects this policy:

- Meta Marketing API campaign docs state that a campaign is the highest organizational level and should represent a single objective; campaign objectives validate compatible ad sets. This supports treating campaign scaling as objective and structure aware, not just budget arithmetic. Source: https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group
- Meta Marketing API campaign docs expose CBO-related campaign `bid_strategy` values including uncapped lowest cost, bid cap, cost cap, and minimum ROAS, and note that bid strategy is at campaign level for CBO and at ad set level otherwise. This supports separating budget-limited from bid-limited scaling. Source: https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group
- Meta Advantage+ campaign budget documentation says campaign budget is distributed across ad sets in real time and eligibility requires compatible ad set budget type, bid strategy, and standard delivery. This supports structure and mixed-config checks before campaign-level budget moves. Source: https://www.facebook.com/business/ads/meta-advantage-plus/budget
- Meta ad set structure guidance says combining similar ad sets can reduce audience fragmentation and help delivery learn faster. This supports restructure or consolidation when demand is fragmented, instead of simply raising budgets. Source: https://www.facebook.com/business/ads/ad-set-structure
- Meta delivery status guidance says learning performance is less stable and significant edits can re-enter preparing or learning. This supports recent-change cooldowns and variance-aware holds. Source: https://www.facebook.com/help/messenger-app/650774041651557
- Meta budget guidance says daily budgets can flex during a week and recommends enough budget over at least seven days for learning. This supports minimum-window logic and avoiding same-day overreaction. Source: https://www.facebook.com/business/ads/pricing
- Meta bid strategy guidance says minimum ROAS can reduce or stop delivery if the floor cannot be reached, and bid caps constrain auctions without directly controlling reported CPA. This supports bid/control changes when spend is throttled by guardrails. Source: https://www.facebook.com/business/m/one-sheeters/facebook-bid-strategy-guide
- Meta ad creative guidance emphasizes creative diversification and creative quality as auction inputs. This supports creative scaling as supply and deployment policy, not only ad-level ROAS ranking. Source: https://www.facebook.com/business/ads/ad-creative

## Decision Windows

Today's operator action must come from rolling decision windows:

- Recent window: last 7 complete provider days. Use for trend direction, volatility, fatigue, delivery shocks, and cooldown checks. It can veto scale, but should not alone authorize aggressive scale or stop decisions.
- Mid window: last 30 complete provider days. Use as the primary authority for scale, reduce, stop, duplicate, and restructure decisions.
- Long stable window: last 90 complete provider days. Use for memory, variance baselines, historical winner protection, seasonality, prior creative fatigue, and proof that current results are not a one-week anomaly.

The UI-selected reporting range is analysis context only. It can explain what the operator is looking at, but it must not directly drive today's action. A user-selected 3-day, 14-day, month-to-date, or custom range can create investigation prompts; it cannot become the authority window for push-eligible decisions.

## Core Diagnosis

Classify the situation before choosing an action:

- Budget-limited: delivery is spending available budget, efficiency is stable or improving, conversion depth is adequate, no bid guardrail is throttling, and there is no obvious demand or creative fatigue ceiling. Preferred levers: controlled budget scale, donor-recipient budget shift, or campaign-level budget increase when structure is clean.
- Bid-limited: spend is below available budget or delivery is unstable because cost cap, bid cap, minimum ROAS, or manual bid logic is too tight for the available auction. Preferred levers: bid/control review, cap adjustment, or hold. Do not increase budget until the delivery constraint is understood.
- Demand-limited: spend is available but reach, audience, placement, geo, or creative supply is constrained; frequency, CTR decay, narrow impressions, or fragmented ad sets suggest the system cannot find enough qualified demand. Preferred levers: broaden, duplicate test into a controlled lane, consolidate/merge, creative refresh, or geo validation. Budget scale is blocked until demand expands cleanly.

## Evidence Floors

All action classes must evaluate these floors:

- Source freshness: provider data must be fresh or explicitly labeled partial/stale. Stale data blocks push eligibility.
- Commercial truth: target ROAS, break-even ROAS, target CPA, break-even CPA, operating constraints, promo calendar, country economics where relevant. Missing truth trust-caps scale and hard stop actions.
- Conversion depth: purchases or optimization events must be enough to survive variance. Adsecute's current hard-coded signals use roughly `$250 spend and 8 purchases` as strong ad set signal, `$500 and 12 purchases` as high signal, and `$500 and 18 purchases` as very strong protected-winner signal. Opportunity intake currently uses `$250 spend and 6 purchases` as a board floor.
- Profitability: ROAS and CPA must be compared to configured target and break-even thresholds, not static universal numbers. If target pack is missing, conservative fallback should downgrade aggressive actions.
- Variance: recent 7d must not contradict the 30d action with severe volatility, rapid CPA inflation, tracking gaps, or recent edits.
- Structure cleanliness: mixed budget, bid, optimization, or objective config blocks direct scale and often routes to rebuild/restructure.
- Recent change cooldown: budget or bid changes captured within roughly 3 complete provider days should suppress aggressive action until enough post-change signal accrues.
- Objective fit: sales/catalog objectives can enter lower-funnel scale/stop logic; traffic, awareness, and engagement require different proof and usually route to broaden, hold, or objective upgrade instead of direct spend scale.

## High ROAS That Should Not Scale

High ROAS is not sufficient for scaling when any of these are true:

- spend or purchase count is thin, especially one or two purchases causing inflated ROAS
- recent 7d performance is driven by one outlier day or one large order
- the ad set recently changed budget, bid, optimization, creative, audience, or placement controls
- the winner is retargeting, existing-customer, promo, or clearance traffic that cannot absorb broad prospecting spend
- campaign or ad set has mixed config, mixed bid strategy, or mixed optimization goal
- delivery is bid-limited by cost cap, bid cap, or minimum ROAS and not spending budget
- inventory, margin, geo serviceability, landing page, or manual do-not-scale constraints are active
- creative fatigue is visible: CTR decay, click-to-purchase decay, frequency pressure, or ROAS decay despite still-profitable aggregate ROAS
- the objective is traffic, awareness, or engagement and the reported ROAS is incidental or attribution-thin
- historical 90d memory shows similar spikes failing after budget increases

These cases should route to `hold`, `stable_no_touch`, `review_cost_cap`, `creative_refresh_required`, `duplicate_to_new_geo_cluster`, `broaden`, or `monitor_only`, depending on the bottleneck.

## Low ROAS That Should Not Stop

Low ROAS is not sufficient for a stop when any of these are true:

- conversion volume is too low for a confident loser call
- the ad set is new, learning, or inside recent-change cooldown
- tracking, attribution, pixel, catalog, or value-passing confidence is degraded
- the campaign is upper-funnel, lead, engagement, or traffic and ROAS is not the primary optimization event
- the lane is a deliberate validation, geo expansion, creative test, or prospecting exploration with capped risk
- promo or seasonal context changes expected conversion timing
- spend is low relative to AOV or purchase cycle length
- current CPA is above target but below break-even or near target with improving recent trend
- the ad set feeds a broader structure where stopping it would destabilize an active campaign budget allocation
- creative supply is the likely bottleneck, making refresh/rebuild cleaner than stop

These cases should route to `monitor_only`, `review_hold`, `keep_in_test`, `reduce_budget`, `creative_refresh_required`, `merge_into_pooled_geo`, or `rebuild`, not hard `pause`.

## Lever Selection

Use the smallest lever that matches the diagnosed bottleneck:

- Budget change: only for budget-limited winners or confirmed losers with clean authority. Use controlled move bands and re-check after absorption.
- Bid/control change: when delivery is constrained by cost cap, bid cap, minimum ROAS, bid amount, or optimization goal. Do not stack bid and budget changes in the same recommendation unless one is explicitly secondary and not push-eligible.
- Structure change: when mixed config, audience fragmentation, objective mismatch, geo fragmentation, or learning fragmentation is the primary problem.
- Duplicate test: when signal is promising but not mature enough to touch the incumbent winner, or when a new geo/audience/creative lane needs isolated validation.
- Creative action: when the limiting factor is concept supply, fatigue, deployment compatibility, or creative diversification. Creative scaling should mean promote proven creative into an eligible scaling lane, not edit creative code or mix untested creatives into protected winners.

## Action Classes

### `scale_budget`

Allowed contexts:

- active sales/catalog or proven lower-funnel ad set
- budget-limited, not bid-limited or demand-limited
- clean campaign/ad set config with no recent budget or bid churn
- primary 30d beats configured target ROAS or CPA
- recent 7d does not show sharp efficiency deterioration
- baseline 90d does not show recurring scale failure for this lane

Blocked contexts:

- missing target pack or commercial truth that creates `profitable_truth_capped`
- stock, margin, landing page, serviceability, or manual do-not-scale constraints
- retargeting, promo, clearance, or existing-customer winners unless explicitly allowed as protected maintenance scale
- constrained bid regime without proof of headroom
- creative fatigue or thin creative supply
- mixed config, recent edits, stale data, or learning volatility

Minimum evidence:

- ad set floor: at least strong signal, currently approximated by `$250 spend and 8 purchases`
- push floor: at least opportunity floor, currently `$250 spend and 6 purchases`, plus live-confident trust
- higher confidence for larger move bands: `$500 spend and 12+ purchases`, preferably `$500 and 18+` for protected winner memory

Required fields:

- entity id/name/status, campaign role, objective family, optimization goal
- spend, revenue, ROAS, CPA, purchases, impressions, clicks, CTR
- daily/lifetime budget, bid strategy label, bid value where available
- target ROAS/CPA and break-even ROAS/CPA
- recent change timestamps, mixed config flags, trust lane, source freshness

Confidence requirements:

- board-visible at `>= 0.70`
- push-eligible only at `>= 0.78`
- large move band only at `>= 0.86` with no trust caps

Explanation requirements:

- state why this is budget-limited, not bid-limited or demand-limited
- cite target/break-even comparison and conversion depth
- name the move band and re-check condition
- disclose every guardrail that would stop the next increment

Push eligibility level:

- `action_core / queue_ready` only when all floors are met
- `opportunity_board / board_only` when profitable but capped by variance, bid regime, or missing proof
- `watchlist / blocked` when commercial truth is degraded

### `hold` / `stable_no_touch`

Allowed contexts:

- stable winner where the best operator action is to preserve delivery
- near-target performance with insufficient proof for scale or reduction
- recent change cooldown
- partial source freshness where the surface remains readable but not authoritative
- protected retargeting, promo, or existing-customer winner

Blocked contexts:

- clear active loser with high signal below break-even and no constraints that explain the loss
- serviceability blocked or explicit commercial cut condition
- urgent budget waste where reduction is evidence-backed

Minimum evidence:

- no hard minimum for `monitor_low_truth`
- for `stable_no_touch`, require very strong winner signal, currently approximated by `$500 spend and 18 purchases`, target met, active status, no recent edits, and clean config

Required fields:

- same performance fields as scale
- current constraints, recent changes, no-touch reason, what would change the decision

Confidence requirements:

- `review_hold` can show from `>= 0.56`
- protected no-touch should be `>= 0.80`
- push is generally not applicable because hold/no-touch is a guardrail, not a provider mutation

Explanation requirements:

- explain whether hold is due to protection, thin signal, cooldown, degraded truth, or unresolved variance
- list the exact evidence that would reopen scale, reduce, stop, or restructure

Push eligibility level:

- `watchlist / protected` for no-touch
- `watchlist / board_only` for review hold
- no default provider push

### `monitor_only` / `keep_in_test`

Allowed contexts:

- signal is real enough to watch but too thin for spend, bid, or structure action
- creative, geo, or prospecting validation lane is still inside its planned test budget
- recent data is directionally interesting but not yet confirmed by the primary 30d window
- reporting or commercial truth is degraded and the safest policy is observation

Blocked contexts:

- material active loser with high-confidence waste
- stable winner that should be explicitly protected as `stable_no_touch`
- clear scale candidate with all authority floors met
- unresolved source freshness so severe that even monitoring labels would mislead the operator

Minimum evidence:

- no conversion-depth floor for watch visibility
- at least material spend, impressions, clicks, or configured validation status should exist
- reason for watch/test must be explicit: thin signal, cooldown, variance, validation budget, or missing truth

Required fields:

- entity id/name/status, role or lifecycle state, spend, impressions, clicks, purchases/events where available
- current test budget or validation context where available
- missing fields and uncertainty reason

Confidence requirements:

- can show from `>= 0.50` when clearly labeled as low-authority
- should not be push-eligible

Explanation requirements:

- state why no operator mutation is recommended today
- define the evidence that would graduate to scale, reduce, stop, duplicate, or restructure
- include the next review window

Push eligibility level:

- `watchlist / board_only`
- never default provider push

### `recover`

Allowed contexts:

- muted, paused, or under-delivering lane has prior profitable evidence and a clean recovery hypothesis
- retargeting or existing-customer lane is efficient enough to restart in controlled steps
- recent stop/reduction appears over-conservative after 30d and 90d memory review
- current commercial constraints no longer block delivery

Blocked contexts:

- original stop reason still exists
- no clean historical winner memory
- tracking, product, stock, serviceability, or landing-page constraint remains unresolved
- recovery would reintroduce a mixed-config structure
- recovery competes with a stronger live winner for scarce budget

Minimum evidence:

- prior primary-window or baseline-window profitability above target or safely above break-even
- current constraints cleared and source freshness live-confident
- enough historical conversion depth to explain why recovery is not just nostalgia for a lucky period

Required fields:

- previous status/action reason, current status, historical spend, revenue, ROAS, CPA, purchases
- reason the original blocker cleared
- proposed recovery budget band and re-check threshold

Confidence requirements:

- board-visible at `>= 0.68`
- push-eligible only at `>= 0.82` with live-confident trust and supported execution

Explanation requirements:

- explain why recovery is better than duplicate test or fresh rebuild
- state the cap for the recovery attempt
- state the evidence that would stop recovery again

Push eligibility level:

- `opportunity_board / manual_only` by default
- `action_core / queue_ready` only when executor support and provider diff preview exist

### `reduce_budget`

Allowed contexts:

- active ad set or campaign is below break-even with strong signal
- loss is material but not clean enough for a hard stop
- budget is still being consumed and should be throttled while diagnosis continues
- commercial truth is sufficient to identify break-even or review-reduce posture

Blocked contexts:

- thin signal, recent change cooldown, stale data
- tracking/value-passing uncertainty
- deliberate capped validation lane within accepted test budget
- bid-limited delivery that is underspending, where budget reduction would not address the cause
- low ROAS on upper-funnel or non-sales objective without objective-specific evidence

Minimum evidence:

- at least `$250 spend and 8 purchases` or equivalent optimization-event depth
- for campaign-level reduction, at least one material ad set loser or multiple weaker ad sets creating the campaign loss
- recent 7d must not show clear recovery above break-even

Required fields:

- spend, revenue, ROAS, CPA, purchases, current budget, spend share
- break-even target, recent trend, bid strategy, objective family, status
- donor/recipient context if recommending a budget shift

Confidence requirements:

- board-visible at `>= 0.68`
- push-eligible review reduction at `>= 0.76`
- stronger confidence required if reduction affects CBO campaign budget instead of an ad set budget

Explanation requirements:

- explain why reduce is better than pause
- state the suggested reduction band and review window
- state whether released budget should remain unallocated or move to a named winner

Push eligibility level:

- `action_core / queue_ready` when live-confident and supported by execution capability
- `action_core / manual_only` when campaign-level or CBO context requires human handling
- `watchlist / board_only` when truth is degraded

### `pause` / `stop`

Allowed contexts:

- active lower-funnel ad set with high signal below break-even
- clear loss is not explained by recent edits, tracking gaps, objective mismatch, bid limitation, or temporary promo context
- campaign/ad set has clean config and source freshness
- no stock or landing constraint suggests the ad is being unfairly penalized by external business conditions

Blocked contexts:

- missing commercial truth
- low signal, new learning, or recent config change
- upper-funnel, traffic, awareness, or engagement objective where ROAS is not the primary success metric
- geo validation, creative validation, or capped test lane still inside budgeted learning risk
- bid-limited underspend
- mixed config where `rebuild` is the cleaner action

Minimum evidence:

- high signal, currently approximated by `$500 spend and 12 purchases`
- clear break-even loss, not just below target
- recent 7d and primary 30d both support loser status, or recent 7d confirms worsening against a weak 30d

Required fields:

- same performance fields as reduce
- active status, objective family, optimization goal, recent change timestamps, mixed config flags
- break-even threshold and explanation of why non-performance blockers are ruled out

Confidence requirements:

- board-visible at `>= 0.80`
- push-eligible only at `>= 0.88`
- unavailable when target pack is missing; downgrade to `reduce_budget` or `review_hold`

Explanation requirements:

- explicitly state why low ROAS is reliable enough to stop
- list ruled-out reasons not to stop
- define what evidence would justify recovery or retest later

Push eligibility level:

- `action_core / queue_ready` only for live-confident, supported ad set pause
- `action_core / manual_only` for campaign-level stop or complex structure
- `watchlist / blocked` under degraded truth, thin signal, or recent-change ambiguity

### `review_cost_cap` / `tighten_bid`

Allowed contexts:

- bid, cost cap, bid cap, or minimum ROAS is the primary constraint
- delivery is underspending despite available budget, or efficiency is near target but volume is throttled
- budget increase would not solve the problem until the control is reviewed
- capped strategy is intentionally used and has enough conversion history to evaluate

Blocked contexts:

- uncapped lowest-cost budget-limited winner where budget is the correct lever
- demand-limited creative/audience fatigue
- thin signal where cap changes would chase noise
- same-day or recent cap changes still cooling down

Minimum evidence:

- at least strong signal for performance interpretation
- spend pacing, budget remaining, current bid strategy, bid value, CPA/ROAS relative to cap or floor
- recent trend showing whether the cap is starving or protecting delivery

Required fields:

- bid strategy type/label, bid amount/value, current budget, spend, CPA, ROAS, purchases
- optimization goal, objective family, recent bid change timestamp
- reason the issue is bid-limited rather than budget-limited

Confidence requirements:

- board-visible at `>= 0.66`
- push-eligible only if execution support explicitly exists and confidence `>= 0.82`
- otherwise manual-only review

Explanation requirements:

- name the active bid regime and failure mode
- explain why budget should not be changed first
- state whether the next step is loosen, tighten, remove, or hold the cap

Push eligibility level:

- usually `opportunity_board / manual_only`
- `watchlist / board_only` when evidence is incomplete
- not default queue unless supported by executor and fresh provider diff

### `broaden`

Allowed contexts:

- demand-limited winner with narrow reach, low impression depth, or constrained audience
- traffic/awareness/engagement objective where direct budget scale is not justified but reach expansion is useful
- strong efficiency signal exists but current delivery path is too narrow to absorb budget

Blocked contexts:

- budget-limited lower-funnel winner that can scale budget directly
- bid-limited ad set where auction control is the bottleneck
- poor creative engagement or fatigue
- restricted special ad category or serviceability constraints

Minimum evidence:

- target or near-target efficiency with signs of reach limitation
- recent 7d stability and no recent edit cooldown
- enough clicks/impressions to diagnose narrowness, not only purchases

Required fields:

- impressions, reach if available, clicks, CTR, spend, ROAS/CPA, objective family
- targeting/geo/placement constraints where available
- campaign role and optimization goal

Confidence requirements:

- board-visible at `>= 0.62`
- push generally manual-only unless safe structured expansion is explicitly supported

Explanation requirements:

- explain why the issue is demand-limited
- state what should broaden: audience, placement, geo, or structure
- warn against mixing broadening with budget or bid changes in one move

Push eligibility level:

- `opportunity_board / manual_only`
- `watchlist / board_only` if source lacks targeting detail

### `duplicate_to_new_geo_cluster` / Duplicate Test

Allowed contexts:

- promising but thin geo/audience/creative signal should be isolated without disturbing the incumbent
- high ROAS exists on low spend and needs validation
- a winner should be tested into a new country, audience, bid regime, or structure with capped risk
- the incumbent is no-touch but adjacent expansion is justified

Blocked contexts:

- incumbent winner is already budget-limited and can absorb spend directly
- low ROAS is caused by tracking or commercial-truth gaps
- test would fragment an already learning-limited account
- no clean hypothesis or no capped test budget

Minimum evidence:

- promising signal can be below scale floor, but must have material engagement or early conversion proof
- for geo duplicate, use at least material geo signal or explicit commercial preference
- baseline 90d should not show repeated failure of the same duplicate hypothesis

Required fields:

- source entity, target hypothesis, campaign role, geo/audience/creative context
- spend, ROAS/CPA, purchases/events, confidence, cap budget, success/failure thresholds
- no-touch status of source if applicable

Confidence requirements:

- board-visible at `>= 0.60`
- push-eligible only at `>= 0.80` and only if duplicate execution is supported
- otherwise manual-only

Explanation requirements:

- state why duplication is safer than editing the incumbent
- define the validation budget and stop/graduate criteria
- name the isolation boundary: geo cluster, audience, creative, or bid regime

Push eligibility level:

- `opportunity_board / manual_only` by default
- `action_core / queue_ready` only if future executor explicitly supports duplicate test creation

### `rebuild` / `merge_into_pooled_geo` / Structure Change

Allowed contexts:

- mixed budget, bid, optimization, or objective config makes current performance hard to trust
- similar ad sets are fragmented and starving learning
- geo expansion has thin or scattered signal and should be pooled
- objective is misaligned with the conversion event
- campaign structure conflicts with CBO/Advantage+ budget eligibility or clean delivery

Blocked contexts:

- stable protected winner where disruption is the main risk
- simple budget-limited winner or loser where budget action is cleaner
- recent rebuild still cooling down
- missing enough entity metadata to describe the desired target structure

Minimum evidence:

- structural defect must be observable, not inferred only from ROAS
- at least material spend or repeated learning fragmentation across entities
- for merge/pool, individual signals are thin but collectively meaningful

Required fields:

- mixed config flags, budget level, bid strategy, optimization goal, objective family
- entity group membership, spend/revenue/purchases by member, source freshness
- explanation of current structure problem and target structure

Confidence requirements:

- board-visible at `>= 0.68`
- push generally manual-only
- no automatic push without explicit executor support and provider diff preview

Explanation requirements:

- explain why structure is the bottleneck
- state the target simplified structure and what should remain untouched
- include rollback or monitoring criteria

Push eligibility level:

- `opportunity_board / manual_only`
- `watchlist / board_only` if evidence is incomplete

### `switch_optimization`

Allowed contexts:

- current optimization event is too shallow for the business goal
- add-to-cart, landing-page-view, or click optimization has enough downstream purchase evidence to graduate
- objective upgrade is cleaner than budget scale

Blocked contexts:

- purchase signal is too thin
- current objective is intentionally upper-funnel
- recent objective or optimization change is cooling down
- tracking confidence is degraded

Minimum evidence:

- strong signal on current event and meaningful downstream conversion proof
- primary 30d supports upgrade; recent 7d is not deteriorating

Required fields:

- current objective, optimization goal, downstream purchases, CPA/ROAS, spend, clicks
- tracking confidence and recent optimization-change timestamp

Confidence requirements:

- board-visible at `>= 0.70`
- push only with explicit executor support and confidence `>= 0.84`

Explanation requirements:

- explain why objective upgrade is the next bottleneck
- define expected volatility and cooldown after the switch
- state what would revert or hold the change

Push eligibility level:

- `opportunity_board / manual_only` by default

### `creative_refresh_required`

Allowed contexts:

- winner economics are fading because creative is the bottleneck
- CTR, click-to-purchase, ROAS, or frequency trend suggests fatigue
- creative supply is too thin to support more budget
- high ROAS exists but current concept is over-concentrated or aging

Blocked contexts:

- budget-limited winner with fresh diversified creative and stable trend
- clear media buying constraint unrelated to creative
- Creatives data is unavailable or taxonomy confidence is too low, in which case route to `review_hold`

Minimum evidence:

- material spend and conversion history on the ad set or creative family
- at least one fatigue signal from recent vs mid-window comparison
- deployment compatibility with Meta lane if promoting replacement creative

Required fields:

- creative/family id when available, ad set/campaign target, spend, CTR, click-to-purchase, ROAS, purchases
- lifecycle state, deployment compatibility, creative age/frequency where available
- related Meta lane and constraints

Confidence requirements:

- board-visible at `>= 0.66`
- no provider push by default because this is supply planning and operator review

Explanation requirements:

- explain why budget or bid changes are blocked until creative supply changes
- name the type of creative needed: new hook, angle, format, variant, or replacement
- state whether incumbent winner should remain no-touch

Push eligibility level:

- `watchlist / board_only`
- no default execution push

### Creative `promote_to_scaling`

Allowed contexts:

- creative has passed deterministic economics floors
- target deployment lane is compatible with objective, optimization, bid regime, and campaign role
- promotion does not disturb protected winners or mix testing creative into scaling lanes
- creative family has enough proof beyond a single lucky ad

Blocked contexts:

- missing commercial truth or deployment compatibility
- creative is benchmark-winning but below absolute floors
- target lane is retargeting/promo/protected and cannot absorb prospecting scale
- active fatigue or over-concentration risk

Minimum evidence:

- existing Creative Decision OS floor: `spend >= 200` and `purchases >= 4`
- if target ROAS exists, ROAS must meet target
- if only break-even exists, ROAS must clear break-even with buffer
- fallback: `spend >= 250`, `purchases >= 5`, and `ROAS >= 2.0`
- CPA must stay inside configured target or break-even ceiling when present

Required fields:

- creative id/name/family, lifecycle state, spend, ROAS, CPA, purchases, CTR
- benchmark cohort, deployment compatibility, target campaign/ad set/lane
- commercial-truth coverage and reason if downgraded

Confidence requirements:

- board-visible at `>= 0.70`
- push-eligible only when deployment lane exists, confidence `>= 0.82`, and execution support exists

Explanation requirements:

- explain the creative's economics floor, benchmark context, and deployment lane
- state why promotion is safer than adding it directly to a protected winner
- name the kill, hold, and graduate thresholds for the promoted test

Push eligibility level:

- `opportunity_board / manual_only` by default
- future `action_core / queue_ready` only if supported by a creative-to-Meta deployment executor

## Campaign Scaling Policy

Campaign-level scale is valid only when the campaign is structurally clean enough for budget to flow to the right ad sets. For CBO or Advantage+ budget contexts, campaign scale should require compatible ad set budget types, bid strategies, delivery settings, and at least one live-confident ad set winner. If the campaign contains both winners and losers, prefer a donor-recipient budget shift over a blanket campaign increase.

Campaign scale should be blocked when:

- only one thin ad set is carrying performance
- CBO is masking mixed ad set economics
- high ROAS comes from retargeting, promo, or existing customers
- the campaign objective does not match the intended business action
- ad set-level bid regimes are constraining delivery
- recent campaign budget edits are still cooling down

## Ad Set Scaling Policy

Ad set scale is the cleanest direct scaling lever when the ad set is active, lower-funnel, profitable against configured targets, materially sampled, structurally clean, and not recently edited. Ad set scale should be incremental and re-evaluated after the next complete data window.

Ad set scale should not happen when the diagnosis points to:

- bid-limited: use `review_cost_cap` or `tighten_bid`
- demand-limited: use `broaden`, `duplicate_to_new_geo_cluster`, or creative refresh
- structure-limited: use `rebuild` or merge/pool
- truth-limited: use `review_hold` or `profitable_truth_capped`

## Creative Scaling Policy

Creative scaling is deployment policy, not code policy. Do not touch Creatives code.

Expert behavior:

- promote only creatives that pass absolute economics floors and cohort benchmarks
- keep new creative tests out of protected winner ad sets unless the lane explicitly supports controlled creative rotation
- treat high-performing creative with low spend as a duplicate test candidate, not a direct scale candidate
- treat creative fatigue as a scale blocker even when aggregate ROAS is still high
- require deployment compatibility with campaign role, objective family, optimization goal, bid regime, and geo context

## Push Eligibility Matrix

Push levels:

- `queue_ready`: all evidence floors met, live-confident trust, action in supported execution subset, fresh provider diff required before apply
- `manual_only`: policy supports the action, but structure or provider capability requires human implementation
- `board_only`: visible as operator strategy, not eligible for default queue
- `blocked`: evidence, freshness, truth, or safety guardrail prevents action
- `protected`: visible only as a no-touch guardrail

Default mapping:

- `scale_budget`: `queue_ready` only for live-confident supported ad set/campaign budget changes; otherwise `board_only`
- `reduce_budget`: `queue_ready` only for live-confident supported budget reductions; otherwise `manual_only` or `board_only`
- `pause`: `queue_ready` only for clean active ad set pause with high confidence; otherwise `manual_only` or `blocked`
- `hold`, `stable_no_touch`, `monitor_only`, `keep_in_test`: `protected` or `board_only`
- `recover`: `manual_only` by default; `queue_ready` only with live-confident trust and explicit executor support
- `review_cost_cap`, `tighten_bid`, `broaden`, `duplicate_to_new_geo_cluster`, `rebuild`, `merge_into_pooled_geo`, `switch_optimization`, `creative_refresh_required`, `promote_to_scaling`: `manual_only` or `board_only` unless future executor support explicitly upgrades them

## Explanation Contract

Every action card must answer:

- What is the recommended action?
- Which bottleneck is diagnosed: budget-limited, bid-limited, demand-limited, structure-limited, creative-limited, or truth-limited?
- Which rolling window authorized the action?
- What did recent 7d say?
- What did primary 30d say?
- What did baseline 90d memory say?
- Which evidence floors are met, watch, or blocked?
- Which fields were required and unavailable?
- Why is this action better than scale, hold, reduce, stop, duplicate, or restructure alternatives?
- What would change the decision?
- Is this push-eligible, manual-only, board-only, protected, or blocked?

## Non-Negotiable Guardrails

- Do not let selected UI reporting range directly drive today's action.
- Do not scale from ROAS alone.
- Do not stop from low ROAS alone.
- Do not stack budget, bid, creative, and structure changes into one push-eligible recommendation.
- Do not push aggressive actions when commercial truth is missing.
- Do not disturb protected winners without a stronger separate reason.
- Do not convert creative insight into provider mutation unless deployment compatibility and execution support are explicit.
- Do not expose secrets, tokens, account identifiers beyond normal entity labels already present in product data, or private business configuration details outside the authorized surface.
