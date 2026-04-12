# 1. Executive Summary

- Overall verdict on Meta: the current Meta surface is operationally over-instrumented and under-guiding. It looks like a sophisticated decision system, but it does not convert that sophistication into clear operator action.
- Overall verdict on Creative: the current Creative surface is worse than Meta. It asks the operator to trust a creative decision layer even when preview/media truth is inconsistent or missing.
- Biggest reasons the current surfaces feel broken:
  - primary UI is filled with backend reasoning objects instead of a compressed operator contract
  - top-level space is spent on boards, queues, and diagnostics even when real businesses have nothing queue-ready
  - action language is too generic for bid regime, maturity, and profitability state
  - hierarchy is upside down: the product explains why the system hesitated more clearly than it explains what the buyer should do next
  - recommendation surfaces can be blank at the top while lower-level decision objects still exist
- Whether the current system is operator-usable or not: not operator-usable in its current form. A strong internal user can reverse-engineer intent. A media buyer cannot quickly understand what to do with confidence.
- Whether the problem is mostly UI, mostly backend contract, or both: both. The UI is overloaded, but the deeper problem is that the backend-to-UI contract is exposing internal reasoning structures directly instead of producing an operator-facing action model.

# 2. Review Setup

- Branch / SHA used: `main` / `79ea77643f7dbfbdc5d3c3345b7bbc67a00b53b8`
- Live SHA if verified: verified via `https://adsecute.com/api/build-info` and matched local SHA at `79ea77643f7dbfbdc5d3c3345b7bbc67a00b53b8`
- How local run was performed: local app run with `npm run dev` on `http://127.0.0.1:3000`
- What access method was used:
  - repo inspection of current Meta and Creative components, routes, and response builders
  - local browser observation of the current Meta and Creative surfaces using the seeded smoke operator account
  - direct runtime/API/DB truth for real businesses `Grandmix`, `IwaStore`, and `TheSwaf`
  - live build verification through production build info
  - continuity handoff captured in `docs/operator-rebuild/HANDOFF.md` so future steps can resume cleanly if chat context is lost
- Whether browser evidence was available: yes for the current local surfaces. Direct browser access to `Grandmix`, `IwaStore`, and `TheSwaf` was not available in this pass because the smoke browser account did not have those business memberships.
- Whether real-business evidence was available: yes. Real-business evidence came from current response payloads, current database state, and current runtime outputs for `Grandmix`, `IwaStore`, and `TheSwaf`.
- Any important limitations:
  - real-business UI was not directly observed in browser during this pass
  - where browser visibility was limited, this report relies on current runtime payloads and current repo code rather than historical docs or plans
  - no repo-resident inspection helper was added; only temporary local inspection artifacts were used outside the repo

# 3. Why The Current Meta Surface Fails

- The account-level Meta surface is structurally overloaded before the operator even selects a campaign. In `components/meta/meta-campaign-detail.tsx`, the account overview stacks:
  - Command Center
  - Meta Decision OS overview
  - Operating mode
  - Action Context
  - Performance breakdown
  This is too many top-level concepts before the operator sees a single clear action queue.

- The top-level recommendation surface is structurally wrong. `components/meta/meta-account-recs.tsx` filters recommendations to `!campaignId`, so `Action Context` only shows account-level recommendations. In all three sampled businesses, top account recommendations were zero while campaign and ad set decisions still existed. That means the page can tell the operator nothing at the exact moment the backend actually has campaign-level judgments.

- The Meta Decision OS overview is trying to be an operator surface, a trust dashboard, a debug console, and a planning board at the same time. `components/meta/meta-decision-os.tsx` pushes all of these into one area:
  - today's plan
  - operating mode
  - surface counts
  - readiness
  - decision authority
  - policy review
  - opportunity board
  - budget shift board
  - winner scale candidates
  - top ad set actions
  - GEO OS
  - no-touch list
  This is not a clear operating surface. It is a stitched-together internal system inventory.

- Empty or near-empty boards still consume prime attention. Real-business evidence:
  - `Grandmix`: opportunity board total `0`, queue-ready `0`, winner scale `0`, GEO `0`, protected `0`
  - `IwaStore`: opportunity board total `0`, queue-ready `0`
  - `TheSwaf`: opportunity board total `0`, queue-ready `0`
  Yet the product still presents the opportunity framing as a major surface. That is misleading product theater.

- The browser-observed Meta detail view shows the exact failure mode. On the demo campaign `Backpack Video Ads`, the surface simultaneously presented:
  - `SCALE BUDGET`
  - `REVIEW HOLD`
  - `Unified operator authority`
  - policy chips including `BID COST CAP`
  - `CAMPAIGN POLICY REVIEW`
  - `MISSING EVIDENCE`
  - guardrails
  This looks advanced, but it forces the operator to reconcile contradictory layers manually. The system is saying "scale", "review", and "there is missing evidence" at once.

- Backend reasoning leakage is severe. `components/decision-trust/DecisionAuthorityPanel.tsx` exposes:
  - truth state
  - completeness
  - freshness
  - blocking truth gaps
  - action ceilings
  - explicit thresholds
  - calibration profile counts
  - readiness window
  - suppressed action classes
  - preview coverage
  - source health
  - read reliability
  That is not primary operator copy. It is backend trust instrumentation rendered almost field-for-field.

- The policy review layer is also leaking directly. `components/decision-trust/DecisionPolicyExplanationPanel.tsx` exposes:
  - baseline action
  - candidate action
  - selected action
  - cutover state
  - evidence hits
  - missing evidence
  - blockers
  - degraded reasons
  - action ceiling
  This is useful debug detail. It is not how a media buyer should first encounter a campaign decision.

- Campaign-type logic is present internally but weakly surfaced. The current UI shows bid regime as a chip, not as an action model. The backend knows `cost_cap`, `bid_cap`, `roas_floor`, and `open`, but the operator-facing outcome still collapses into generic labels like `hold`, `review_hold`, or `duplicate_to_new_geo_cluster`.

- Real examples make the mismatch obvious:
  - `Grandmix` `ASC-Niche` is `bid_cap`, spent `$585.16`, drove `20` purchases, and posted `6.45x` ROAS. The surfaced action is still `hold`.
  - `IwaStore` `EmB- USA-Bid Cap` is `bid_cap`, spent `$1,006.86`, drove `34` purchases, and posted `5.94x` ROAS. The surfaced action is still `hold`, with `profitable_truth_capped`.
  - `TheSwaf` `EMB - USA` is `cost_cap`, spent `$2,214.95`, and is surfaced as `hold` with `review_reduce`.
  In all three cases, the system knows enough to classify the regime and the trust state, but not enough to tell the operator a clean regime-specific next move.

- Visually and conceptually, the surface is noisy because too many cards are saying nearly the same thing in different dialects. Command Center, Action Context, Operating Mode, Authority, Policy Review, Opportunity Board, and the campaign headline are all trying to explain the same decision from different system layers.

- The result is predictable: the media buyer does not know whether the right move is to scale budget, change cap, duplicate structure, change creative, or do nothing. The page feels smart but operationally weak.

# 4. Why The Current Creative Surface Fails

- The Creative page has the same contract problem as Meta, plus a media-truth problem. The product asks the operator to believe a creative decision system before it proves that the creative can actually be seen reliably.

- The top of the page is already overloaded:
  - decision signals
  - run signals
  - Creative Decision OS
  - table metrics
  - preview-card warnings
  The operator still has to hunt for the actual "what should I do with which creative" layer.

- The Creative Decision OS drawer is oversized for the actual amount of operator-ready work. `components/creatives/CreativeDecisionOsOverview.tsx` surfaces:
  - total creatives
  - scale-ready / keep testing / fatigued / blocked / comeback counts
  - action-core / watchlist / archive / degraded / truth-capped counts
  - readiness
  - suppressed actions
  - preview coverage
  - authority panel
  - policy review
  - opportunity board
  - lifecycle board
  - operator queues
  - family board
  - pattern board
  - protected winners
  - supply plan
  - historical analysis
  - decision signals
  That is far too much surface area for a product whose real businesses mostly have zero queue-ready promotion work.

- Real-business queue evidence shows that the queue framing is misleading:
  - `Grandmix`: promotion queue `0`
  - `IwaStore`: promotion queue `0`
  - `TheSwaf`: promotion queue `0`
  Yet the drawer is still designed around queue machinery. The system is visually optimized for a workflow that is not actually happening.

- The browser evidence on the current Creative page shows the problem directly:
  - the page states `Preview cards unavailable for this selection`
  - it states `5 selected creatives do not have a usable preview from Meta right now`
  - the detail overlay for `UrbanTrail Explorer Backpack Creative 1` shows `Selected window: missing`, `Live decision window: missing`, `Preview truth missing`, and `No renderable preview sources are available for this creative`
  - despite that, the right rail still proceeds into decision model, commercial context, AI interpretation gating, deployment matrix, benchmark context, fatigue engine, and family provenance
  The system can explain itself more thoroughly than it can show the creative.

- The preview/media contract is actively contradictory. Real-business payloads say preview is ready:
  - `Grandmix`: preview coverage `ready 8`, `missing 0`
  - `IwaStore`: preview coverage `ready 86`, `missing 0`
  - `TheSwaf`: preview coverage `ready 56`, `missing 0`
  Top creative examples across those businesses frequently say `previewLiveDecisionWindow: ready`.
  But browser-observed surface behavior and current raw creative-path logging show missing or unavailable preview states. This is a hard contract failure, not a cosmetic defect.

- The detail experience is overloaded with internal logic. `components/creatives/CreativeDetailExperience.tsx` stacks:
  - deterministic decision
  - command center
  - commercial context
  - AI commentary
  - deployment matrix
  - benchmark evidence
  - fatigue evidence
  - family provenance
  - preview truth
  The operator gets an audit trail before getting a confident view of the actual asset and next move.

- Creative wording repeatedly reads like system self-talk:
  - `Deterministic engine keeps this in test...`
  - `No active scaling lane matched the current family.`
  - `Family provenance high / low`
  - `AI interpretation stays disabled until live preview truth and shared authority are both ready.`
  This is the machine narrating its own internals. It is not operator guidance.

- The commercial context block duplicates meta-explanation instead of helping action. `components/creatives/creative-commercial-context-card.tsx` repeats:
  - `Decisions use live windows. Selected period affects analysis only.`
  - `Decision as of ...`
  - degraded mode labels
  That belongs in secondary detail, not in the main operator column.

- Family and pattern framing are weaker than they look. In `IwaStore` and `TheSwaf`, many sampled families are effectively singletons like `singleton:creative_*`. That means the family board often adds classification overhead without adding real operator leverage.

- The page also has direct interaction friction. During browser inspection, the open Creative Decision OS drawer intercepted clicks until it was closed, which made it harder to move from board-level review into row-level inspection.

- The overall Creative verdict is simple: the surface is creative-rich in instrumentation, not creative-rich in operator confidence.

# 5. Condition → Response Problems

Example 1: `Grandmix` Meta bid-cap efficiency hidden behind generic hold

- Observed condition: ad set `ASC-Niche` in `ASC-Niche-USA-BC` is `bid_cap`, spent `$585.16`, drove `20` purchases, posted `6.45x` ROAS, and had `CPA $29.26`.
- System response: `hold` with `review_hold` policy language and degraded missing-truth reasons.
- Why that response is good / weak / wrong: directionally safe, but structurally weak. The system knows the ad set is efficient and bid-capped, yet it does not translate that into a concrete cap-first action model.
- Whether the UI makes it understandable: no. The operator sees hold copy, policy chips, degraded reasons, and guardrails, but not a crisp answer to "change cap, change budget, or do nothing?"
- What the operator would probably do or fail to do: either leave performance on the table or leave the tool and inspect Meta settings manually.

Example 2: `IwaStore` profitable bid-cap lane still collapses into hold

- Observed condition: `EmB- USA-Bid Cap` is `bid_cap`, spent `$1,006.86`, drove `34` purchases, posted `5.94x` ROAS, and was marked `profitable_truth_capped`.
- System response: `hold`; readiness also suppresses `scale_budget`.
- Why that response is good / weak / wrong: the backend is correctly identifying a truth ceiling, but the surfaced response is weak because it never becomes an operator instruction like "do not release budget until commercial truth is configured; if action is required, review bid cap first."
- Whether the UI makes it understandable: no. The top-level account recommendation area is empty, so the user must drill into lower-level panels and decode trust states.
- What the operator would probably do or fail to do: ignore the product and scale manually, or stop entirely without knowing whether the real blocker is commercial truth, cap level, or maturity.

Example 3: `TheSwaf` cost-cap underperformance is not translated into a usable lever sequence

- Observed condition: `EMB - CC - OtherCountries - JUN17` in `EMB - CC - OtherCountries - Oct5` is `cost_cap`, spent `$2,219.79`, posted `2.26x` ROAS, drove `26` purchases, and showed `CPA $85.38`.
- System response: `hold` with `review_reduce`.
- Why that response is good / weak / wrong: there may be a real case for reduced pressure, so the direction is not obviously wrong. The weakness is that the product never states whether the first lever should be cap reduction, budget reduction, creative replacement, or structural change.
- Whether the UI makes it understandable: no. `cost_cap` appears as a classification chip, not as an action sequence.
- What the operator would probably do or fail to do: apply a blunt reduction or keep holding, without knowing whether the intended model is cap-first or budget-first.

Example 4: Creative preview truth contradicts actual operator-visible preview availability

- Observed condition: real-business creative payloads report preview coverage as ready (`Grandmix 8/8`, `IwaStore 86/86`, `TheSwaf 56/56`), while browser-visible Creative surfaces show missing preview states and explicit preview-unavailable warnings.
- System response: the product still renders a full decision explanation stack and labels many examples as having live decision-window preview ready.
- Why that response is good / weak / wrong: wrong. If the operator cannot actually see the asset reliably, the product cannot claim preview readiness as an operator-ready truth.
- Whether the UI makes it understandable: no. It makes it less understandable by asserting preview confidence while also showing missing preview warnings.
- What the operator would probably do or fail to do: distrust the Creative surface altogether and fall back to native Meta or manual asset lookup.

Example 5: `IwaStore` fatigued winners are directionally correct but badly surfaced

- Observed condition: creatives such as `AyetelKursi`, `Our hearts are`, and `I'm so happy` are fatigued winners with spend and declining efficiency.
- System response: `refresh_replace` and blocked/watch-only treatment.
- Why that response is good / weak / wrong: directionally good. Refreshing fatigued winners is the right family of response. The weakness is presentation: this should be a short plain-English replacement queue, not buried inside lifecycle, family, supply-plan, and queue-taxonomy layers.
- Whether the UI makes it understandable: only partially. A patient operator can infer the intent, but the page does not foreground "replace these now" as the main worklist.
- What the operator would probably do or fail to do: spend too much time reading the surface instead of moving directly into replacement work.

Example 6: `TheSwaf` creative state model collides with itself

- Observed condition: creative `AllRings` is labeled `scale_ready`, spent `$2,288.85`, posted `1.17x` ROAS, and is marked `profitable_truth_capped`.
- System response: `keep_in_test`, target lane `Test`, queue verdict `board_only`.
- Why that response is good / weak / wrong: weak. `scale_ready`, `keep_in_test`, `profitable_truth_capped`, and `board_only` together are too many overlapping states for one creative. That is taxonomy collision, not usable guidance.
- Whether the UI makes it understandable: no. The operator cannot tell whether this is a near-winner, a suppressed winner, or a weak test.
- What the operator would probably do or fail to do: ignore the classification or misread it as a false-positive winner signal.

# 6. Backend-to-UI Contract Problems

- The current contract is too raw. The UI is receiving objects that still look like backend reasoning, then rendering them almost directly.

- What kinds of backend reasoning should not appear directly in the UI:
  - truth state, completeness, freshness, and calibration counts as primary surface content
  - baseline / candidate / selected action comparisons
  - cutover states
  - evidence-hit and missing-evidence inventories
  - source-health and read-reliability diagnostics
  - family provenance confidence and over-grouping risk
  - preview-coverage counters as a primary operator object
  - action ceilings and suppressed action classes as standalone blocks

- What should remain internal:
  - conservative fallback threshold source selection
  - degraded reason lists
  - benchmark sample-size caveats
  - policy ladder branch selection
  - queue-eligibility traces
  - deployment compatibility internals
  - provenance evidence details
  - raw fatigue-decay traces

- What should become compressed operator-facing output:
  - one primary action
  - one reason in operator language
  - one explicit blocker or precondition if the action is capped
  - one expected outcome or risk
  - one optional "show why" path for deeper explanation

- Where current response shapes appear too raw or too verbose:
  - `DecisionAuthorityPanel` mirrors backend trust instrumentation
  - `DecisionPolicyExplanationPanel` mirrors backend compare/cutover logic
  - `CreativeDetailExperience` mirrors backend decision report, timeframe context, deployment object, fatigue object, and provenance object
  - `CreativeDecisionOsOverview` mirrors summary, readiness, authority, opportunity, queue, family, pattern, supply-plan, and policy layers all at once

- The contract is also mixing three audiences into one payload:
  - operator action
  - analyst explanation
  - system debug
  Those must be separated. Right now they are co-located in the primary workflow.

# 7. Information Architecture Recommendations

- What belongs at top level:
  - business and account scope
  - current operating window
  - one concise truth/degraded banner if action ceilings are active
  - one prioritized action queue for the operator's actual next moves
  - a short split between `act now`, `monitor`, and `protected / no action`

- What belongs in secondary view:
  - campaign or creative lists filtered by action state
  - concise action reason
  - key metric context
  - explicit affected lever such as budget, cap, structure, creative refresh, or do not touch
  - compact business context and operating mode if it changes interpretation

- What belongs in detail:
  - policy explanation
  - authority and readiness diagnostics
  - benchmark evidence
  - fatigue traces
  - provenance
  - queue-eligibility logic
  - raw deployment compatibility

- What should be removed / merged / demoted:
  - separate empty opportunity boards
  - large readiness and authority panels as first-order content
  - large queue machinery when queue-ready count is zero
  - singleton family boards
  - repetitive commercial-context and live-window notes
  - duplicate command / trust / policy cards that restate the same decision in different dialects

- What should become the primary action hierarchy:
  - first: what to do now
  - second: why now
  - third: what condition blocks a more aggressive move
  - fourth: what lever this action changes
  - fifth: what to review if the operator wants deeper evidence

- Future structure should be operator-first, not system-first. The product should read like a working desk for a buyer, not like an exposed decision engine.

# 8. Campaign-Type Action Model Problems

- Cost cap logic:
  - current product clearly fails to surface cap-first behavior as operator language
  - `Grandmix` and `TheSwaf` both show cost-cap examples that collapse into generic `hold` or `review_hold`
  - the backend knows the regime, but the operator does not get a clean cost-cap-specific sequence

- Bid cap logic:
  - current product clearly fails to turn efficient bid-cap lanes into explicit cap-adjustment guidance
  - `Grandmix` `ASC-Niche` and `IwaStore` `EmB- USA-Bid Cap` are the clearest examples
  - a buyer needs "adjust bid cap first" or "do not scale budget before cap review," not a generic hold state

- Lowest cost / ASC logic:
  - open and ASC-like lanes are still surfaced with the same generic action vocabulary
  - the product does not clearly distinguish budget-release logic from structure-duplication logic
  - `duplicate_to_new_geo_cluster` appears frequently even on zero-spend or low-signal lanes, which inflates confidence in immature actions

- Scaling vs bid adjustment sequencing:
  - sequencing is hidden inside guardrails and policy summaries, not presented as the main action
  - the operator cannot easily tell whether the first move is budget, bid, structure, or creative
  - this is a core failure because campaign-type logic is only useful if the first lever is explicit

- Profitability-aware action ceilings:
  - the system does have ceilings and suppressed classes
  - `IwaStore` explicitly suppresses `scale_budget`
  - fallback thresholds are being applied from conservative commercial truth defaults
  - but the surfaced action does not clearly tell the operator that the ceiling is the reason the recommendation is being held back

- Signal maturity:
  - zero-spend lanes still receive structured actions like `duplicate_to_new_geo_cluster`
  - low-signal lanes and mature lanes are rendered in very similar UI treatment
  - this makes immature actions look more actionable than they are

- State where the current product clearly fails this:
  - all three sampled businesses show regime-aware backend metadata
  - none of the three produce a consistently regime-specific operator surface
  - the campaign-type intelligence exists in the payload, but the action model the operator sees is too abstract to use

# 9. Top Structural Problems To Fix First

1. Replace the current raw backend-to-UI contract with a compressed operator contract.
2. Stop using empty boards and queue scaffolding as primary surface architecture.
3. Collapse truth/readiness/degraded messaging into one concise operator ceiling banner.
4. Make action language regime-specific: budget move, bid-cap move, cost-cap move, structure move, creative refresh, or protected no-touch.
5. Fix the creative preview/media truth contract before asking operators to trust creative decisions.
6. Demote authority, policy, provenance, benchmark, and fatigue diagnostics into detail-on-demand.
7. Replace the blank account-level recommendation surface with a real top-level action surface that reflects available campaign/ad set decisions.
8. Remove or demote singleton-family and low-value taxonomy panels that create sophistication without helping action.
9. Make maturity explicit so low-signal and zero-spend lanes cannot masquerade as equally actionable recommendations.

# 10. Final Teardown Verdict

- What must be rebuilt:
  - the Meta operator surface
  - the Creative operator surface
  - the adapter layer that translates backend reasoning into operator guidance

- What can be salvaged:
  - much of the underlying decision computation
  - guardrail logic
  - benchmark and fatigue logic
  - commercial-truth detection
  - command-center linkage
  These are salvageable only if they are hidden behind a better operator contract.

- Whether Meta and Creative should be incrementally cleaned up or partially rewritten: partially rewritten. Incremental cleanup will not fix the fact that the current surfaces are shaped around exposed system internals rather than an operator action model.

- Whether the core problem is presentation, decision contract, or both: both, with decision contract slightly deeper than presentation. The UI is noisy because the contract is too raw. Cleaning visual design alone would not fix the operational failure.
