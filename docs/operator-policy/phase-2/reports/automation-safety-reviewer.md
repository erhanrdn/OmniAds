# Automation Safety Reviewer Policy

Scope: Adsecute Phase 2 future push-to-account safety. This is a policy review only. It does not implement code, change Creatives, expose secrets, or authorize new provider writes.

Reviewed local surfaces:

- `lib/command-center.ts`
- `lib/command-center-execution.ts`
- `lib/command-center-execution-capabilities.ts`
- `lib/command-center-execution-service.ts`
- `lib/command-center-execution-config.ts`
- `lib/meta/decision-os.ts`
- `lib/meta/execution.ts`
- `lib/creative-decision-os.ts`
- `lib/decision-trust/*`
- `docs/phase-05-action-queue-contract.md`
- `docs/phase-06-safe-execution-layer.md`
- `docs/phase-06-executor-contract.md`

## Safety Levels

These are the only automation safety levels for this review:

- `read_only_insight`: may explain evidence, classify risk, or appear in reports. It cannot enter the default action queue and cannot imply provider write readiness.
- `operator_review_required`: may enter operator workflow or manual handoff when deterministic evidence is sufficient, but a human must inspect and decide. No provider apply is available.
- `safe_to_queue`: deterministic action may enter Command Center as queue work when authority, freshness, evidence floors, confidence, and explanation gates pass. Queue approval is not apply permission.
- `eligible_for_push_when_enabled`: the action can become provider-push eligible only after workflow approval, exact live preview, current preview hash, all preflight checks, canary gate, inactive kill switch, rollback artifact, and post-apply validation.
- `blocked_from_push`: must never run as provider-backed push in the current and future safety model unless a new explicit execution contract is written, tested, reviewed, and canary-proven.

The levels are ordered by execution risk, not by business value. A valuable recommendation can still be `blocked_from_push`.

## Non-Negotiable Automation Rules

- Final write decisions must be deterministic. A freeform LLM, AI Commentary, generated summary, or natural-language rationale may explain a decision, but must never be the final decision-maker for queue inclusion, apply, rollback, or push eligibility.
- Queue and execution authority can only come from typed deterministic surfaces: Meta Decision OS, Creative Decision OS for planning only, Command Center workflow state, execution capability registry, live provider state, and stored audit artifacts.
- No action can skip `operator_review_required` on the way to provider write. Human approval is a necessary but not sufficient condition.
- `eligible_for_push_when_enabled` is currently limited to the existing supported Meta ad set subset: `pause`, `recover`, `scale_budget`, and `reduce_budget`.
- Creative actions, GEO actions, placement actions, no-touch items, campaign-level budget shifts, structure changes, bid/control changes, duplicate tests, objective switches, broadening, rebuilds, and merge/pool actions must not auto-push.
- Missing, stale, partial, contradictory, demo, inaccessible, selected-range-only, or non-live evidence must degrade, never promote.
- Push must be exact-target only. No bulk, inferred, freeform, multi-entity, account-wide, campaign-family, natural-language, or best-effort mutation is allowed.
- Apply must be kill-switch-aware and pause-aware. When `META_EXECUTION_KILL_SWITCH` is active, apply is blocked even if every other check passes.
- Rollback must be available before push, except for actions explicitly classified as `blocked_from_push`. A note-only rollback is not enough for push eligibility.

## Required Confirmation And Evidence

All queued or push-considered actions require:

- Deterministic source: `sourceSystem`, `sourceType`, `sourceDecisionId`, `recommendedAction`, stable `actionFingerprint`.
- Trust state: `surfaceLane`, `truthState`, `operatorDisposition`, trust reasons, evidence envelope completeness, freshness, and suppression state.
- Entity identity: business id, provider account id when applicable, provider entity id, campaign/ad set/geo/creative identity, and source deep link.
- Decision window proof: selected reporting range is analysis context only; action authority must come from deterministic operator windows and `decisionAsOf`.
- Minimum evidence floors: spend, purchases/events, revenue/CPA/ROAS, impressions/clicks, target or break-even thresholds, and commercial truth where relevant.
- Required fields for the action class listed in the matrix below.
- Explanation: why this action, why not a safer action, what evidence would change the decision, which blockers were checked, and why push level is capped or allowed.
- Confidence: numeric confidence must meet the class floor. Missing required data caps confidence below queue or push thresholds.

Push-considered Meta ad set actions additionally require:

- Existing Command Center workflow status is `approved`.
- Execution capability registry returns `supportMode=supported`.
- Live Meta ad set read resolves immediately before apply.
- Live state is provider accessible and not demo.
- Source decision still matches the live Command Center action and entity id.
- Preview hash is current.
- Preflight passes every required check.
- Apply gate is enabled, canary allowlist includes the business, and kill switch is inactive.
- Post-apply live provider read matches requested state before marking success.
- Immutable execution audit stores preflight, provider response, validation report, provider diff evidence, and rollback metadata.

## Rollback, Cooldown, Kill, And Pause Safety

- Any push-eligible action must capture pre-apply status and daily budget when applicable.
- Rollback must restore captured pre-apply state and be post-validated against live provider state.
- Duplicate apply or rollback retries must be idempotent by `clientMutationId`; unsafe replay must block rather than retry automatically.
- If live state already matches the requested target, do not dispatch a provider mutation.
- If provider state cannot be read before apply or after apply, mark the action failed or manual-only. Do not infer success from API response text alone.
- After any provider apply or rollback, impose a minimum 3 complete provider-day cooldown before another budget, bid, objective, targeting, structure, pause, or recovery push on the same entity or tightly coupled parent/child entity.
- During cooldown, actions may be `read_only_insight` or `operator_review_required`; they cannot be `eligible_for_push_when_enabled`.
- A global kill switch blocks all provider apply. A business/account pause flag, sync incident, stale source health, provider auth issue, assignment mismatch, or live read failure also blocks push.
- Manual pauses or user-side provider changes discovered during live preflight must invalidate the preview and return to operator review.

## Budget And Bid Change Safety

- Budget push eligibility is limited to live Meta ad set daily-budget mutations in the supported subset.
- `scale_budget` and `reduce_budget` may only be push considered when `budgetLevel=adset`, `dailyBudget` is finite and positive, `lifetimeBudget=null`, no mixed budget/config state exists, and provider scope is accessible.
- Campaign-owned budgets, CBO/Advantage+ campaign budgets, lifetime budgets, mixed budget/config structures, missing budget owner, and donor/recipient budget transfers are manual-only or blocked from push.
- Current safe budget target bands remain bounded: `scale_budget medium=+15%`, `scale_budget large=+25%`, `reduce_budget medium=-15%`.
- Budget increases must prove the entity is budget-limited, not bid-limited or demand-limited.
- Budget reductions must prove material loss or load-shedding need and must explain why hold or pause is not safer.
- Bid strategy changes, cost cap changes, bid cap changes, ROAS-floor changes, objective switches, broadening, duplicate tests, and structure changes have no current provider-validated push path and are `blocked_from_push`.
- Never stack budget, bid, objective, targeting, and structure changes into one push.

## Missing Data Behavior

Default behavior is conservative:

- Missing entity id, provider account, live state, budget owner, status, freshness, confidence, target/break-even threshold, or rollback artifact blocks push.
- Missing commercial truth blocks scale, promotion, budget increase, bid loosening, target relaxation, and hard stop. It may still allow manual review for protective reductions if loss evidence is material.
- Missing freshness or source health caps at `operator_review_required`; stale or timeout source health usually caps at `read_only_insight`.
- Missing confidence caps at `read_only_insight`.
- Missing explanation caps at `operator_review_required`; missing explanation blocks `safe_to_queue`.
- Selected reporting range without deterministic operator-window proof caps at `read_only_insight`.
- Any unsupported or unmapped action class defaults to `blocked_from_push`.

## Push-Eligible Action Classes

Only these action classes can ever become `eligible_for_push_when_enabled` under the current safety model:

- `meta_adset_decision.pause`
- `meta_adset_decision.recover`
- `meta_adset_decision.scale_budget`
- `meta_adset_decision.reduce_budget`

Even these are not automatically pushable. They must pass the action-specific requirements and every execution preflight, apply gate, canary, kill-switch, approval, and rollback condition.

## Never Auto-Push Classes

These action families must never auto-push without a new explicit execution contract:

- All Creative Decision OS actions: `promote_to_scaling`, `keep_in_test`, `hold_no_touch`, `refresh_replace`, `block_deploy`, `retest_comeback`.
- All GEO actions: `scale`, `validate`, `pool`, `isolate`, `cut`, `monitor`.
- Placement actions: `keep_advantage_plus`, `exception_review`.
- No-touch items: `hold_no_touch`.
- Campaign budget shifts: `budget_shift`.
- Meta ad set structure, bid, objective, and audience actions: `rebuild`, `duplicate_to_new_geo_cluster`, `merge_into_pooled_geo`, `switch_optimization`, `tighten_bid`, `broaden`, `hold`, `monitor_only`.

## Action Class Safety Matrix

| Action class | Allowed contexts | Blocked contexts | Minimum evidence | Required fields | Confidence requirements | Explanation requirements | Push eligibility level |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `meta_adset_decision.pause` | Active lower-funnel ad set with live-confident, action-core deterministic loser decision; high-signal break-even loss; no recent edit, tracking, objective, bid, stock, landing, or commercial-truth ambiguity; provider-accessible live ad set. | Missing commercial truth, thin signal, recent edit cooldown, learning volatility, upper-funnel objective judged only on ROAS, bid-limited underspend, mixed config, campaign/lifetime budget ambiguity, demo or inaccessible account, stale source, kill switch active. | High signal, generally spend >= 500 and purchases >= 12 or equivalent; 30d and recent evidence support loss; live provider state resolved; rollback state captured. | `businessId`, provider account id, `campaignId`, `adSetId`, status, effective status, objective family, optimization goal, spend, revenue, ROAS, CPA, purchases, daily/lifetime budget, budget level, bid strategy, mixed flags, trust metadata, approval, preview hash, rollback snapshot. | `>=0.88` for push consideration; `>=0.80` for queue review; lower confidence downgrades to review or insight. | State why pause is safer than reduce or hold, which non-performance blockers were ruled out, break-even proof, cooldown state, rollback plan, and what would justify recovery. | `eligible_for_push_when_enabled` only after all execution gates; otherwise `safe_to_queue` or `operator_review_required`. |
| `meta_adset_decision.recover` | Paused or muted ad set has prior profitable memory, original blocker cleared, clean live state, bounded restart hypothesis, and no stronger current winner would be disrupted. | Original stop reason persists, no historical winner proof, unresolved stock/site/tracking/landing issue, mixed config, scarce budget conflict, stale source, inaccessible provider, no rollback state. | Prior primary/baseline profitability above target or break-even, enough historical conversion depth, current blocker clearance, live provider read. | Previous status/action reason, current status, historical spend/revenue/ROAS/CPA/purchases, blocker-clear evidence, recovery cap, live budget/status, provider ids, trust metadata, approval, preview hash, rollback snapshot. | `>=0.82` for push consideration; `>=0.68` for manual review. | Explain why recovery is better than duplicate test or rebuild, recovery cap, review window, stop-again threshold, and rollback. | `eligible_for_push_when_enabled` only after all execution gates; otherwise `operator_review_required`. |
| `meta_adset_decision.scale_budget` | Active ad set-owned daily-budget winner; budget-limited, not bid-limited or demand-limited; lower-funnel compatible objective; target/break-even met; recent 7d does not contradict; no recent change; clean live state. | Campaign/CBO budget, lifetime budget, mixed config, missing budget owner, missing commercial truth, constrained bid regime without headroom, fatigue, stock/site/feed/landing/do-not-scale blocker, selected-range-only evidence, cooldown, stale data, kill switch active. | Strong signal, generally spend >= 250 and purchases >= 8; opportunity floor plus live-confident trust; live daily budget finite; provider accessible; requested target bounded to +15% or +25%. | `actionSize`, current `dailyBudget`, requested daily budget, `budgetLevel=adset`, `lifetimeBudget=null`, spend, revenue, ROAS, CPA, purchases, target/break-even thresholds, bid strategy, optimization goal, previous budget capture, mixed flags, trust, approval, preview hash, rollback snapshot. | `>=0.88` for push consideration; `>=0.80` for queue/manual; larger move bands require stronger proof. | Explain why budget is binding, why bid/demand/creative constraints are not primary, move band, commercial fit, cooldown, rollback and re-check threshold. | `eligible_for_push_when_enabled` only after all execution gates; otherwise `safe_to_queue`, `operator_review_required`, or `read_only_insight`. |
| `meta_adset_decision.reduce_budget` | Active ad set-owned daily-budget entity with material loss or load reduction need where pause is too aggressive; clean live state; break-even miss or high-confidence review-reduce posture. | Thin signal, cooldown, tracking/value uncertainty, validation lane still inside accepted test budget, bid-limited underspend, campaign/CBO or lifetime budget, mixed config, missing live state. | Generally spend >= 250 and purchases >= 8 or equivalent material loss; recent trend does not show recovery; live daily budget finite; requested target bounded to -15%. | Current/requested daily budget, budget level, lifetime budget, status, spend, revenue, ROAS, CPA, purchases, break-even/target, bid strategy, objective, recent changes, trust, approval, preview hash, rollback snapshot. | `>=0.86` for push consideration; `>=0.76` for queue/manual. | Explain why reduce is safer than hold or pause, loss materiality, reduction band, review window, and what would reverse. | `eligible_for_push_when_enabled` only after all execution gates; otherwise `safe_to_queue` or `operator_review_required`. |
| `meta_adset_decision.rebuild` | Observable structural defect such as mixed config, objective mismatch, fragmented learning, repeated failed structure, or creative/landing bottleneck. | Stable protected winner, simple budget-limited winner/loser, recent rebuild cooldown, insufficient metadata to define target structure. | Structural defect proof plus material spend or repeated fragmentation; deterministic source freshness. | Mixed flags, budget level, bid strategy, optimization goal, objective family, entity membership, spend/revenue/purchases, source freshness, target structure description. | `>=0.68` for queue/manual; below stays insight. | Explain structure bottleneck, target rebuild shape, untouched entities, monitoring and rollback criteria. | `blocked_from_push`; max `operator_review_required` or `safe_to_queue` for manual work. |
| `meta_adset_decision.duplicate_to_new_geo_cluster` | Promising but immature geo/audience/creative signal should be isolated with capped risk; incumbent should not be edited. | Incumbent can directly absorb budget, repeated failed duplicate hypothesis, no capped test budget, learning fragmentation risk, missing commercial/geo truth. | Material early signal or commercial preference; source entity proof; validation budget and success/failure thresholds. | Source entity, target geo/audience/creative hypothesis, spend, ROAS/CPA, purchases/events, confidence, cap budget, geo economics, no-touch status if applicable. | `>=0.80` would be required for any future executor; current queue/manual can start at `>=0.60`. | Explain why duplication is safer than editing incumbent, isolation boundary, cap, stop/graduate criteria. | `blocked_from_push`; max `operator_review_required`. |
| `meta_adset_decision.merge_into_pooled_geo` | Thin scattered geo signals collectively meaningful; pooling reduces fragmentation and learning starvation. | Stable protected geo/ad set, simple budget action is cleaner, missing group membership, current structure already clean. | Geo group signal, material pooled spend, fragmentation evidence. | Geo group keys, member labels, spend/revenue/purchases by member, campaign/ad set ids, mixed flags, source freshness. | `>=0.68` for manual review. | Explain pooling rationale, target pool, entities not to touch, monitoring criteria. | `blocked_from_push`; max `operator_review_required`. |
| `meta_adset_decision.switch_optimization` | Current optimization event is too shallow and downstream proof supports graduation to better objective/event. | Purchase/downstream signal too thin, intentional upper-funnel objective, tracking degraded, recent objective change cooldown. | Strong current-event and downstream proof in primary window; recent trend not deteriorating. | Current/proposed optimization goal, objective, downstream purchases, CPA/ROAS, spend, clicks, tracking confidence, recent optimization-change timestamp. | `>=0.84` would be required for any future executor; current review starts at `>=0.70`. | Explain bottleneck, expected volatility, cooldown, revert/hold criteria. | `blocked_from_push`; max `operator_review_required`. |
| `meta_adset_decision.tighten_bid` | Bid/cost cap/bid cap/min-ROAS is the diagnosed lever; budget increase is wrong fix; enough control history exists. | Open bidding budget-limited winner, demand-limited fatigue/audience issue, thin signal, same-day or recent cap changes. | Current bid regime, bid value/floor, spend pacing, budget remaining, CPA/ROAS relative to target, recent trend. | Bid strategy type/label, bid amount/value, ROAS floor if present, budget, spend, CPA, ROAS, purchases, optimization goal, recent bid timestamp. | `>=0.82` would be required for future executor; current review at `>=0.66`. | Name bid regime, failure mode, why budget should not change first, loosen/tighten/remove/hold recommendation. | `blocked_from_push`; max `operator_review_required`. |
| `meta_adset_decision.broaden` | Demand-limited winner with narrow reach, constrained audience, or lower-funnel efficiency that cannot absorb budget directly. | Budget-limited winner, bid-limited entity, poor creative engagement, restricted serviceability/special category, missing targeting detail. | Efficiency near/above target plus reach/audience limitation evidence. | Impressions, reach if available, clicks, CTR, spend, ROAS/CPA, objective family, targeting/geo/placement constraints, campaign role. | `>=0.62` for review; future executor would require `>=0.82` and exact provider diff. | Explain demand limitation, what broadens, and why not to combine with budget/bid change. | `blocked_from_push`; max `operator_review_required`. |
| `meta_adset_decision.hold` | Stable or uncertain case where safest action is preserve current delivery; cooldown, partial source, protected lane, or near-target evidence. | Clear high-signal loser needing reduce/pause, urgent commercial blocker, explicit do-not-run state. | Enough evidence to justify no mutation or explicit uncertainty reason. | Current metrics, status, trust, recent changes, no-touch reason, what would change decision. | `>=0.56` for review hold; `>=0.80` for protected no-touch. | Explain hold reason: protection, thin signal, cooldown, degraded truth, variance, or unresolved blocker. | `blocked_from_push`; max `read_only_insight` or `operator_review_required`. |
| `meta_adset_decision.monitor_only` | Signal is too thin or uncertain for mutation; validation lane still learning; degraded truth makes observation safest. | Material active loser, stable protected winner needing no-touch, clear scale candidate with all floors. | Material spend/impressions/clicks or validation status plus explicit watch reason. | Entity identity, spend, impressions, clicks, events, validation context, missing fields. | Can show from `>=0.50` if labeled low authority. | State why no mutation is recommended, graduation threshold, and next review window. | `blocked_from_push`; max `read_only_insight`. |
| `meta_budget_shift.budget_shift` | Donor and recipient are both deterministic, live-confident, and operator should inspect a zero-sum transfer; useful for campaign/CBO budget planning. | Missing donor or recipient proof, same-campaign ambiguity, selected-range-only evidence, degraded commercial truth, CBO direct child mutation, missing budget owner. | Donor pause/reduce evidence plus recipient winner-scale evidence; suggested move band and guardrails. | `fromCampaignId`, `toCampaignId`, donor/recipient confidence, roles, spend, ROAS/CPA, budget fields, trust, guardrails, suggested move band. | `>=0.82` average confidence for manual queue. | Explain donor loss, recipient headroom, move band, why manual-only, and what would block transfer. | `blocked_from_push`; max `operator_review_required` or `safe_to_queue` for manual handoff. |
| `meta_geo_decision.scale` | GEO has material profitable signal, serviceability and country economics allow scale, and surface is live-confident. | Missing country economics, serviceability block, thin signal, stale geo source, campaign structure ambiguity, target not exact provider entity. | Material geo spend/revenue/purchases, ROAS/CPA against target, fresh geo source, commercial context. | `geoKey`, country code, label, spend, revenue, ROAS, purchases, serviceability, economics multiplier, freshness, trust. | `>=0.75` for manual queue. | Explain geo economics, signal depth, target lane, and why no provider push exists. | `blocked_from_push`; max `operator_review_required`. |
| `meta_geo_decision.validate` | GEO signal is promising but under-sampled and should remain in validation with capped risk. | Critical commercial/serviceability block, no material signal, stale source. | Early geo signal or explicit commercial preference. | Geo identity, spend, clicks/impressions, purchases if any, economics, validation threshold, freshness. | `>=0.60` for review. | State validation budget/window and graduation or cut criteria. | `blocked_from_push`; max `operator_review_required`. |
| `meta_geo_decision.pool` | Multiple thin geos should be pooled because collective signal is meaningful and fragmentation is the bottleneck. | Stable isolated winner, serviceability conflicts, missing group membership, stale geo source. | Group member metrics and pooled rationale. | Cluster key/label, member countries, spend/revenue/purchases, group count, economics, freshness. | `>=0.68` for review. | Explain pool membership, why pooling helps, and monitoring criteria. | `blocked_from_push`; max `operator_review_required`. |
| `meta_geo_decision.isolate` | GEO is materially different enough to deserve separate handling or risk containment. | Thin or stale evidence, country economics missing, no exact isolation hypothesis, protected pooled structure. | Material geo performance divergence or commercial constraint proof. | Geo identity, cluster context, spend/revenue/ROAS/CPA/purchases, economics, serviceability, freshness. | `>=0.72` for review. | Explain why isolation is safer than pool/monitor and what would reverse. | `blocked_from_push`; max `operator_review_required`. |
| `meta_geo_decision.cut` | GEO has high-confidence commercial or performance reason to stop/reduce exposure manually. | Missing commercial truth, tracking uncertainty, low signal, promo/seasonality ambiguity, stale geo source. | Material loss below break-even or serviceability block; fresh source. | Geo identity, spend, revenue, ROAS/CPA, purchases, serviceability, priority, freshness, trust, guardrails. | `>=0.80` for manual queue. | Explain cut proof, ruled-out temporary causes, and re-entry criteria. | `blocked_from_push`; max `operator_review_required`. |
| `meta_geo_decision.monitor` | GEO is meaningful but not actionable; evidence is thin, stable, or inconclusive. | Clear cut/scale/isolate/pool evidence. | Any material geo delivery or explicit uncertainty reason. | Geo identity, current metrics, freshness, missing inputs, next review threshold. | Can show from `>=0.50` if labeled. | Explain why monitoring is safest and what evidence changes status. | `blocked_from_push`; max `read_only_insight`. |
| `meta_placement_anomaly.keep_advantage_plus` | Placement anomaly review concludes current automated placement should stay unchanged. | Missing placement data, severe delivery anomaly requiring manual exception review, stale source. | Placement spend/share/performance and account average comparison. | Placement key/label, action, confidence, evidence, note, what would change decision. | `>=0.65` for review. | Explain why preserving Advantage+ placement is safer than exception. | `blocked_from_push`; max `read_only_insight` or `operator_review_required`. |
| `meta_placement_anomaly.exception_review` | Placement shows material anomaly that needs human inspection in Ads Manager. | Thin placement spend, stale source, no placement-level evidence. | Material negative or concentrated placement signal versus account/campaign baseline. | Placement key/label, spend or share evidence, performance delta, note, confidence. | `>=0.70` for manual queue. | Explain anomaly, likely risk, and exact manual review ask. | `blocked_from_push`; max `operator_review_required`. |
| `meta_no_touch_item.hold_no_touch` | Stable protected winner or protective context should stay untouched. | Active blocker requiring separate approved workflow; outdated protection evidence. | Protection reason and guardrails. | Entity type/id/label, confidence, reason, guardrails. | `>=0.70` for watchlist; high confidence preferred for protected status. | Explain why no-touch protects value and what would reopen action. | `blocked_from_push`; max `read_only_insight`. |
| `creative_primary_decision.promote_to_scaling` | Creative has deterministic scale-ready evidence, fresh commercial truth, compatible deployment lane, and human deployment planning is needed. | Degraded commercial truth, incompatible objective/bid/campaign lane, fatigue, low evidence, missing preview/deployment context. | Creative scale floors: spend >= 200, purchases >= 4, impressions >= 5,000, target or break-even fit, compatible deployment. | Creative id/name/format, family, spend, purchases, ROAS, CPA, impressions/clicks, benchmark, fatigue, economics, deployment compatibility, trust. | High creative confidence `>=0.76` for queue-ready planning; medium for review. | Explain evidence floors, benchmark cohort, commercial fit, deployment lane, and what invalidates promotion. | `blocked_from_push`; max `safe_to_queue` for human planning, never provider apply. |
| `creative_primary_decision.keep_in_test` | Creative is incubating/validating, promising under-sampled, or learning incomplete. | Clear fatigue, clear block, clear protected winner, or clear scale-ready evidence. | Impressions >= 1,000 or spend >= 40 plus leading signal, or explicit learning-incomplete reason. | Creative identity, age, spend, impressions, clicks, CTR/attention/funnel signals, benchmark status, missing floors. | Low to medium; cannot be high until floors met. | State missing floor, positive signal, next test threshold, and why not scale/kill. | `blocked_from_push`; max `operator_review_required` for test backlog. |
| `creative_primary_decision.hold_no_touch` | Stable creative winner or no-touch item should remain undisturbed. | Severe fatigue, critical commercial blocker, tracking unreliability, selected-range-only winner. | Protected winner floor: spend >= 250, purchases >= 5, supportive history, no material fatigue. | Creative id/family, historical windows, spend, purchases, ROAS/CPA, target/break-even, fatigue, campaign lane, trust. | Medium-high; high requires stable history and fresh truth. | Explain protection reason, fatigue trigger, and why it stays out of promotion work. | `blocked_from_push`; max `read_only_insight` or watchlist. |
| `creative_primary_decision.refresh_replace` | Fatigued winner or useful concept family needs replacement/variant planning. | No winner memory, no decay evidence, campaign issue better explains decline, low delivery cannot prove fatigue. | Historical winner memory plus current decay in efficiency and engagement/funnel metric; frequency/age/concentration strengthens proof. | Historical windows, current ROAS/CPA/CTR/CVR, frequency if available, creative age, family spend concentration, campaign status. | Medium for review; high requires fatigue support and memory. | Distinguish fatigue from campaign suppression, list decay metrics, name family to refresh, and avoid redeploying same asset unchanged. | `blocked_from_push`; max `safe_to_queue` for refresh planning, never provider apply. |
| `creative_primary_decision.block_deploy` | Creative has material downside or unsafe deployment context and should be blocked from further manual deployment. | Low-spend learning, selected-range-only drop, tracking issue, objective mismatch, protected winner. | Spend >= 150 with weak purchases/ROAS/CPA, or spend >= 2x target CPA with zero purchases, or commercial/tracking/stock blocker. | Creative id, spend, purchases, ROAS, CPA, benchmark, objective/optimization, commercial blockers, historical memory, age. | Medium for review; high requires repeated failure and no alternative campaign explanation. | Show wasted spend, benchmark underperformance, why not learning incomplete, and reversal evidence. | `blocked_from_push`; max `operator_review_required`. |
| `creative_primary_decision.retest_comeback` | Prior winner or useful family has comeback hypothesis with bounded manual test. | No historical memory, blocker persists, insufficient test hypothesis, scarce budget conflict. | Prior supportive window plus cleared blocker or new context. | Creative/family id, historical proof, current blocker clearance, test budget/window, success/failure threshold. | `>=0.70` for manual review; high requires strong memory and fresh truth. | Explain why retest is better than new concept or no-touch, cap, measurement window, and stop criteria. | `blocked_from_push`; max `operator_review_required`. |

## Conservative Final Position

The current Adsecute execution architecture is correctly narrow: it supports preview-first, human-approved, canary-gated Meta ad set apply for only four exact-target action classes. Future push-to-account safety should preserve that narrowness.

The safe automation boundary is:

- deterministic engine decides whether an action can be reported, reviewed, queued, or push-considered
- human approval decides whether an eligible action may proceed to apply preflight
- live provider state and capability registry decide whether apply can dispatch
- post-apply validation decides whether execution succeeded
- rollback audit decides whether recovery can be offered

No freeform model output should ever replace those gates.
