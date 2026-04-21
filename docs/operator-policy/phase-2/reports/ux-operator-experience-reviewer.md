# UX Operator Experience Reviewer Policy

## Scope

This report defines the Phase 2 UX policy for Adsecute operator surfaces. It is documentation and decision-presentation policy only. It does not implement code, change Creatives code, alter provider state, expose secrets, or authorize write-back actions.

Adsecute is an expert operator system, not a dashboard. The UI must reduce information pollution by showing the operator the smallest truthful next-decision surface first, while keeping diagnostic depth available only when it changes judgment.

Current local UI contracts already provide the required primitives:

- Meta page hierarchy: page status and scope, Meta Decision OS daily operator surface, KPI row, campaign drilldown, collapsed secondary context.
- Creative operator hierarchy: the worklist stays primary; Creative Decision Support opens as a drawer; selected reporting range remains analysis-only.
- Operator surface states: `act_now`, `needs_truth`, `blocked`, `watch`, `no_action`.
- Decision trust fields: truth state, completeness, freshness, read reliability, missing inputs, action ceilings, evidence floors, confidence, blocker, push eligibility.
- Decision windows: selected analytics range is `analysis_only`; operator decisions use canonical recent, primary, and baseline windows.

## First Screen Policy

The user sees decision context before diagnostics.

The first visible operator stack must be:

1. Scope and truth state: selected account, account day/timezone where relevant, selected reporting range label, provider/page readiness, freshness.
2. Operator headline: one sentence that says whether there is decisive work, blocked work, watch work, or no action.
3. Work buckets in priority order: `Do this`, `Do not touch`, `Watch`, `Investigate`.
4. Compact row cards for the highest-priority entities only.
5. KPI context only after the decision headline or beside it when space allows.

The first screen must not start with raw KPI grids, long recommendation paragraphs, broad analytics cards, breakdown grids, or historical charts. Those are context, not the operator's first job.

## Collapsed By Default

Collapsed by default:

- full policy explanation panels
- full evidence-floor lists beyond the top three facts
- breakdown grids by age, placement, country, product, audience, or format
- operating-mode internals and commercial truth section details
- source health internals
- read reliability internals
- historical memory boards
- Creative family, pattern, lifecycle, protected-winner, and supply-planning boards when the main worklist already summarizes the action
- raw recommendation cards that duplicate the operator work buckets
- selected-range exploration charts

Expanded by default only when one of these is true:

- the row is `act_now` or equivalent queue-ready and needs a visible final preflight explanation
- an action is blocked by missing evidence or degraded truth
- the operator explicitly selected the row
- the surface is empty and the collapsed context explains why nothing is actionable

Collapsed panels must summarize what is inside with count and reason, for example: "3 rows blocked by missing target CPA" or "6 thin-signal creatives hidden from headline work."

## Forbidden Copy Patterns

Do not use copy that creates fake certainty, dashboard noise, or executive-summary theater.

Forbidden patterns:

- "AI recommends..."
- "Guaranteed", "will improve", "will increase delivery", "will lower CPA", "will hold ROAS"
- "Top performer" without spend and conversion evidence
- "Scale now" from ROAS alone
- "Kill" from selected-range drop alone
- "Needs attention" without the reason and next threshold
- "Insight" as a generic label for every observation
- "Opportunity" for rows that are blocked, missing truth, or not eligible for push
- "Optimization" when the actual action is wait, investigate, validate, protect, or block
- "Underperforming" when the objective, optimization event, attribution, or evidence floor cannot support that verdict
- "Data unavailable" without saying which input is missing and what is capped
- large paragraphs that restate all metrics already visible in chips

Required replacement language:

- Use "Evidence suggests" for uncertain directional findings.
- Use "Blocked by" for hard missing input or constraint.
- Use "Watch until" for monitoring states.
- Use "Do not touch because" for protected winners and cooldowns.
- Use "Investigate" for incomplete or conflicting evidence.
- Use "Estimate, not guaranteed outcome" for projected impact.

## Action Presentation Model

Adsecute UI must translate engine terms into operator verbs without hiding the underlying policy.

| Operator bucket | Meaning | Allowed visible verb examples | Default tone | Push implication |
| --- | --- | --- | --- | --- |
| `Do this` | Evidence-backed move that can enter operator work if all gates pass. | Increase budget, Reduce budget, Review cost cap, Change structure, Refresh creative, Promote creative, Pause | decisive but bounded | May be `queue_ready`, `manual_handoff`, or apply candidate depending on policy. |
| `Do not touch` | Protect current state because touching it is the risk. | Keep running, Protect, Hold no-touch, Leave budget, Preserve winner | protective | No provider push by default; may be watchlist/protected. |
| `Watch` | Real signal, not enough authority for a move. | Wait, Keep in test, Monitor, Retest later, Review next window | observational | Not push eligible. |
| `Investigate` | Missing, stale, conflicting, or blocked evidence prevents a decision. | Needs truth, Needs preview, Review tracking, Check stock, Check bid control, Verify range | diagnostic | Push blocked or capped to review-only. |

The UI may show the canonical engine action in small secondary text, but the primary label must be the operator verb. Example: "Increase budget" primary, "scale_budget" secondary.

## Evidence Density Policy

Every row must show no more than:

- one primary action label
- one authority label
- one confidence label
- one short reason, maximum two lines
- up to three secondary labels
- up to five metric chips
- one blocker or guardrail line when present

Evidence details beyond this belong in an expandable policy/evidence panel.

Evidence chips must be ordered:

1. commercial threshold fit: target/break-even CPA or ROAS
2. signal depth: spend and purchases/conversions
3. action-specific proof: budget owner, bid control, preview readiness, fatigue, cooldown, deployment compatibility, or source freshness

Do not show raw evidence arrays, repeated metric labels, or multiple summaries that all point to the same reason.

## Non-Expert Orientation

Non-experts should understand what to do without being taught media buying in long prose.

Required orientation rules:

- Use plain operator verbs first, technical terms second.
- Pair every blocked state with the missing input and the consequence.
- Pair every watch state with the trigger that would move it.
- Keep strategy jargon in secondary chips, not row titles.
- Show the active decision window near the surface header.
- Show selected reporting range as exploration context, never as action authority.
- Label unsupported execution paths as manual or review-only instead of hiding them.
- Use stable bucket names across Meta, Creative, and Command Center.

Examples:

- Good: "Watch until 4 purchases or $200 spend."
- Good: "Do not touch: protected winner, no fatigue signal."
- Good: "Investigate: target CPA missing, scale is capped."
- Bad: "Optimization opportunity detected from performance trend."

## Missing Evidence, Confidence, And Push Eligibility

Missing evidence must be visible without implying failure.

Rules:

- Missing evidence appears as a cap, not as a silent null.
- Confidence cannot be high if core evidence is missing.
- Push eligibility must use an explicit label: `none`, `board_only`, `watchlist`, `review_queue`, `queue_ready`, `manual_handoff`, `execution_preview_supported`, `apply_candidate`, or `blocked`.
- If push eligibility is not available, say why in one short blocker line.
- If a field is unknown, label it `unknown` or `unavailable`; do not infer it from adjacent metrics.
- If the system falls back to account-level or heuristic evidence, label the fallback and cap confidence.
- If data is stale, partial, degraded, demo-only, selected-range-only, or metrics-only, cap action presentation to watch or investigate.

The UI must never show a button, queue badge, or action language stronger than the push eligibility label.

## Reporting Range Vs Operator Decision Context

Reporting and exploration range must be visually separate from operator authority.

Selected reporting range:

- Used for charts, historical exploration, exports, visible table filtering, and explaining what the user is inspecting.
- May create an investigation prompt.
- May contradict or support a decision as context.
- Must be labeled `analysis only` when shown near action decisions.

Operator decision context:

- Uses canonical decision windows such as recent 7d, primary 30d, baseline 90d, and decision as-of date.
- Uses current live provider state when an action could affect today's settings.
- Uses commercial truth, source freshness, completeness, read reliability, and policy gates.
- Governs confidence, action class, and push eligibility.

If selected range and decision context differ, the surface must say: "Selected range is for analysis. Today's action uses [decision window] as of [date]."

If the only evidence comes from selected range, push eligibility is `none` or `board_only`, confidence is capped below action threshold, and the row belongs in `Investigate` or `Watch`.

## UI Policy / Action Matrix

Every user-visible policy/action presentation must satisfy this matrix before it can appear as an operator row, card, drawer section, or queue candidate.

| UI policy / action presentation | Allowed contexts | Blocked contexts | Minimum evidence | Required fields | Confidence requirements | Explanation requirements | Push eligibility label |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `Do this: increase budget` | Meta ad set or manual campaign-budget handoff with clean winner evidence; budget-bound diagnosis; fresh authority; commercial truth not blocking. | Selected-range-only winner, CBO direct child mutation, lifetime budget native apply, recent edit cooldown, mixed config, bid-limited or demand-limited diagnosis, missing commercial truth, stale data. | Primary decision window; spend and conversion floor; current budget owner; target/break-even fit; no stronger constraint. | Entity id/name, account, status, budget owner/type, daily/lifetime budget, previous budget age, spend, purchases, CPA, ROAS, target/break-even, bid regime, freshness, trust state. | High for `queue_ready` or apply path; medium max for manual review; low cannot show as `Do this`. | State why budget is binding, move band, commercial fit, cooldown state, rollback/watch metric, and blockers absent. | `review_queue`, `manual_handoff`, `execution_preview_supported`, or `apply_candidate`; otherwise downgrade to `Watch` or `Investigate`. |
| `Do this: reduce budget` | High-signal waste, below break-even, protective load reduction, or safer alternative to pause. | Thin signal, recent edit ambiguity, unknown budget owner, lifetime schedule unknown, selected-range-only loss, learning volatility without high-signal loss. | Material spend; loss evidence against target/break-even; current budget owner; no data-authority blocker. | Same as increase budget plus loss threshold and reason reduction is safer than pause. | Medium minimum for review; high for supported apply path. | Explain waste, why hold/pause is not better, reduction band, and reversal trigger. | `review_queue`, `manual_handoff`, `execution_preview_supported`, or `apply_candidate`. |
| `Do this: pause / stop` | Material loser with enough conversion/spend evidence; objective fit allows stop judgment; no protected winner or learning exception. | Low spend, low conversions, selected-range-only drop, tracking gap, upper-funnel objective judged by purchase ROAS alone, protected winner, recent change cooldown. | Spend floor; conversion/event floor or spend multiple against target CPA; primary window loss; commercial truth. | Entity id/name, status, objective, optimization, spend, CPA/ROAS, conversions, target/break-even, historical memory, tracking state. | High for queue-ready; medium for human review; low becomes `Watch` or `Investigate`. | Show why it is not learning incomplete, what spend was wasted, and what evidence would reverse. | `review_queue` or `blocked` depending on execution support; provider apply only if separately supported. |
| `Do this: review bid/control` | Cost cap, bid cap, target ROAS, or optimization control appears binding or unsafe; current control fields are present. | Missing bid/control fields, selected-range-only trigger, status blocker, budget-bound open bidding, insufficient commercial target, recent edit cooldown. | Current strategy and value; spend-to-budget or underdelivery diagnosis; commercial thresholds; canonical window. | Bid strategy, bid amount or ROAS floor, budget, spend, CPA/ROAS, conversions, optimization goal, previous control age, source freshness. | Medium for review; high for queue-ready recommendation; numeric changes require complete commercial truth. | Explain the control tradeoff, uncertainty, bounded test range if any, and why budget is not the first lever. | `review_queue` or `manual_handoff`; never fake direct apply unless execution contract supports it. |
| `Do this: change structure` | Mixed config, objective mismatch, fragmented ad sets, GEO pooling/isolation, audience or placement constraint, demand-limited diagnosis. | Clean budget-bound winner, missing structural evidence, selected-range-only trend, provider state stale. | Entity structure facts; affected children/counts; performance and configuration conflict; primary decision window. | Campaign/ad set ids, objective, optimization, budget level, bid regime, mixed flags, audience/GEO/placement evidence, confidence, trust state. | Medium for review; high for queue-ready planning; low is investigate. | Name the structural problem, why budget/bid edit is not the lever, and what would validate the rebuild/merge/duplicate. | `review_queue` or `manual_handoff`; not native apply by default. |
| `Do this: refresh creative` | Fatigued winner, concept supply shortage, strong family needing new angle, deployment blocked by creative supply. | No winner memory, low delivery that cannot prove fatigue, campaign-level suppression explains decline, missing creative provenance, selected-range-only decay. | Historical winner memory or family signal; current decay or supply gap; preview not missing for decisive language. | Creative id/name, family id/source, lifecycle, spend, purchases, ROAS/CPA, CTR/CVR/attention where available, age, frequency if available, provenance, preview status. | Medium for planning; high for queue-ready creative work; missing preview or provenance caps confidence. | Distinguish fatigue from campaign suppression; name the component to refresh; state not to redeploy unchanged asset. | `review_queue` for planning; never provider write-back. |
| `Do this: promote creative to scaling` | Creative has scale-ready evidence, compatible Meta lane, fresh commercial truth, ready preview, and deployment compatibility. | ROAS-only winner, low spend/purchases, missing preview, degraded commercial truth, incompatible objective/bid/placement lane, stock/site/checkout blocker. | Spend and purchase floors; CPA/ROAS target fit; preview ready; deployment compatibility; primary 30d authority. | Creative id/name, family, spend, purchases, ROAS, CPA, target/break-even, preview status, deployment target, confidence, blockers. | High for queue-ready; medium max for review; low stays testing. | State evidence floors passed, target lane, what invalidates scale, and why selected range did not decide it. | `review_queue` or `queue_ready`; no direct Meta write in Creative policy. |
| `Do not touch: protected winner` | Stable winner, no fatigue signal, protected lane, active no-touch guardrail, recent-change cooldown, or current setup is the safest state. | Clear high-confidence waste, severe fatigue, tracking unreliability, commercial blocker requiring stop, selected-range-only protection without history. | Historical support or explicit cooldown/protection reason; current commercial fit if winner protection is claimed. | Entity id/name, winner memory, current metrics, fatigue status, last edit/cooldown when relevant, trust disposition, confidence. | Medium minimum; high for protected winner; low must be framed as watch. | Explain why touching it is riskier than waiting and what would reopen action. | `watchlist`, `protected`, or `none`; not provider push. |
| `Do not touch: hold current bid/budget` | Current control is appropriate, recent edits need time, delivery is stable, or any stronger move would stack risk. | Clear action-core winner/loser with no blockers; blocking commercial constraint needing intervention. | Current config, recent-change state, stable decision window, reason no edit is safer. | Entity id/name, budget/bid fields, previous change age, status, metrics, trust state, blocker if any. | Medium for visible hold; high for protected no-touch. | State whether hold is due to protection, cooldown, variance, truth cap, or no clean lever. | `watchlist` or `none`. |
| `Watch: keep in test` | Promising but under-sampled Meta or Creative signal; validation lane; not enough spend, purchases, time, or preview truth for promotion. | Clear action-core scale, clear high-signal stop, critical blocker requiring investigate/block. | Delivery or leading signal; explicit missing floor. | Entity id/name, lane/lifecycle, spend, impressions/clicks, conversions, age, missing floors, next threshold. | Low to medium; cannot be high if evidence floors are missing. | State the promising signal and the exact threshold to graduate. | `board_only` or `watchlist`. |
| `Watch: monitor volatility / cooldown` | Recent budget, bid, creative, audience, or structure edit; volatile recent 7d; attribution or learning delay. | No known recent edit and strong stable authority supports action; severe commercial blocker. | Edit age or volatility evidence; primary window context. | Entity id/name, changed field when known, captured-at timestamp, recent metrics, primary window metrics, next review date/window. | Low to medium. | Explain why waiting is the operator action and when to review again. | `watchlist`; no push. |
| `Watch: evergreen running` | Stable winner should remain live with light monitoring; not a work item unless fatigue appears. | Active fatigue, source unreliability, or commercial constraint. | Winner memory and no current fatigue blocker. | Entity id/name, historical windows, current metrics, fatigue status, family/lane. | Medium to high. | State the trigger that would move it to refresh, reduce, or investigate. | `watchlist` or `none`. |
| `Investigate: needs commercial truth` | Target pack, break-even, CPA/ROAS threshold, margin, AOV, country economics, stock, site, checkout, feed, or manual constraint is missing/stale/blocking. | None when the missing input is action-relevant. | Missing or stale input record; affected action classes. | Missing input name, freshness, blocking flag, action ceiling, affected rows/counts, current confidence cap. | Any confidence; aggressive action must be capped below high. | State what is missing, which action is capped, and what unlocks it. | `blocked`, `board_only`, or `watchlist`; never queue-ready. |
| `Investigate: needs source freshness / read reliability` | Provider data is stale, partial, syncing, failed, repair-required, unstable, or current-day live state is unavailable for a today action. | None when freshness is required for the displayed action. | Source state and affected surface. | Truth state, freshness, completeness, read reliability, source health, selected range, decision as-of. | Confidence capped by authority state; high is forbidden unless independent live-confident authority exists. | Explain whether the row is readable, partial, stale, or not authoritative. | `blocked`, `board_only`, or `watchlist`. |
| `Investigate: needs preview / creative identity` | Creative preview missing/degraded; family provenance low; over-grouping risk high; asset identity uncertain. | Metrics-only reporting where no creative action language appears. | Preview status or provenance evidence. | Creative id/name, preview state, reason, family source, provenance confidence, over-grouping risk, affected action. | Low to medium; high forbidden for decisive creative action. | Explain whether the row is metrics-only, review-only, or blocked from authoritative action. | `blocked` or `board_only`; never direct push. |
| `Investigate: selected-range anomaly` | Selected reporting range shows a spike, drop, outlier, or contradiction not confirmed by canonical windows. | Treating selected range as today's action authority. | Selected range metrics plus canonical-window comparison or absence. | Selected start/end, decision window, affected metric, anomaly description, authority status. | Low to medium; high forbidden unless canonical evidence independently agrees. | Say selected range is analysis-only and name the evidence needed to act. | `board_only` or `none`. |
| `Evidence panel: policy explanation` | Row is selected, action is queue-ready, action is blocked, or operator asks for why. | Always-open long evidence panels; duplicate explanations for every row; AI commentary as authority. | At least one evidence hit, missing evidence item, blocker, or comparison reason. | Summary, baseline action, candidate action, selected action, evidence hits, missing evidence, blockers, degraded reasons, action ceiling. | Mirrors parent row; cannot increase confidence. | Explain the ladder in compact sections; show only evidence that changed the decision. | Same as parent row; panel itself is not push authority. |
| `Authority panel: surface truth` | Page, drawer, Command Center, or report summary where decisions could be interpreted as actions. | Hidden authority state near push-capable UI; mixing provider readiness with page/action authority. | Authority or commercial summary. | Truth state, completeness, freshness, read reliability, missing inputs, action ceilings, source health, readiness window. | Not applicable as an action; governs caps. | Explain which actions are suppressed and why. | Governs child rows; no standalone push. |
| `Opportunity board item` | Board-only or queue candidate with explicit eligibility trace and evidence floors. | Generic "opportunity" without eligibility; blocked rows styled like action-ready rows. | Eligibility verdict; top evidence floors; confidence; blocker/watch reason. | Item id/title, kind, recommended action, confidence, evidence floors, queue verdict, blocked/watch reasons. | Medium for board; high for queue-ready. | Use the verdict label as visible truth: queue-ready, protected, blocked, board-only. | `board_only`, `watchlist`, `queue_ready`, `protected`, or `blocked`. |
| `Projected impact` | Budget, bid, profitability, or planning row with deterministic bounded estimate and required inputs. | AI-invented numbers, missing AOV/margin/target data, selected-range-only impact, point promises. | Baseline metrics; proposed delta range; commercial assumptions; confidence label. | Spend, revenue, purchases, CPA, ROAS, AOV/margin basis, delta range, payback window, assumptions, missing inputs. | High for bounded estimate; medium for directional; low must say not confidently estimable. | Label as estimate, not guaranteed outcome; list assumptions and stop condition. | Same as parent row; no standalone push. |

## Wall-Of-Text Prevention Rules

Each visible card has one job:

- headline card: current operator posture
- row card: one action decision
- evidence panel: why that decision was capped or allowed
- authority panel: whether the surface can be trusted
- exploration panel: what the selected reporting range shows

Do not combine all five jobs in one card.

Maximum visible copy:

- Surface headline: one sentence plus one context line.
- Row reason: 160 characters target, two lines maximum.
- Blocker: one sentence.
- Evidence chip: label plus value only.
- Empty state: one title, one explanation, one next condition.
- Drawer header: summary plus decision-window line.

Longer text belongs behind expand controls, in reports, or in policy documentation, not in default operator flow.

## Empty And Partial State Policy

Empty states must distinguish:

- no rows exist
- rows exist but are immaterial
- rows exist but are muted from headline stack
- data is preparing
- data is partial
- data is stale
- required commercial truth is missing
- selected range has no data but canonical decision context still exists

Never show "No recommendations" when the real state is "actions suppressed by missing evidence." The UI should say what is suppressed and what input would change that.

## Final UX Doctrine

Adsecute should feel like an operator workbench with a strong filter, not a metric archive. The default view answers:

- what should I do
- what should I not touch
- what should I watch
- what must be investigated before acting

Everything else is supporting evidence. Evidence must be available, but not sprayed across the screen. Confidence and push eligibility must be visible, but never stronger than the source truth allows. Selected reporting ranges help operators explore; canonical decision context governs action.
