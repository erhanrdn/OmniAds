# Meta Policy Architecture and Data Contract Audit

Role: Meta Policy Architect + Data Contract Auditor
Repo/app name: Adsecute
Scope: Phase 3 Meta operator foundation only. No app code was changed.

## Executive Summary

Phase 2 doctrine is clear: Adsecute is an expert operator system, not a KPI dashboard. Final action authority must be deterministic, testable, evidence-based, and conservative when inputs are missing. Selected reporting dates are analysis overlays; they cannot authorize today's Meta action. Evidence: `docs/operator-policy/phase-2/reports/final-policy-report.md:7-20`, `docs/operator-policy/phase-2/reports/final-policy-report.md:32-44`.

Phase 3.1 has already introduced much of the infrastructure needed for this: `decisionAsOf`, stable windows, analytics/reporting separation, provenance, evidence hashes, action fingerprints, and push eligibility types. Evidence: `src/types/operator-decision.ts:10-23`, `src/types/operator-decision.ts:69-93`, `lib/operator-decision-provenance.ts:46-103`, `lib/operator-decision-metadata.ts:83-119`.

The missing Phase 3 slice is a minimal deterministic Meta policy layer that sits between raw `MetaDecisionOs` action candidates and UI/Command Center exposure. It should not be a new LLM engine. It should classify campaign/ad set actions into operator states and push readiness using explicit evidence gates. The current Meta Decision OS already has useful trust lanes, commercial truth caps, provenance, and some media-buyer guardrails, but it still lacks a canonical Phase 3 operator policy verdict and has gaps around budget binding, CBO/ABO invalidity, learning/delivery diagnostics, and live/demo/snapshot push source posture.

## Existing Foundation

### Doctrine and scenario sources

- Selected reporting range is `analysis_only`; authority comes from `decisionAsOf`, `primary30d`, supporting windows, and live provider state. Evidence: `docs/operator-policy/phase-2/reports/scenario-bank.md:1-5`, `docs/operator-policy/phase-2/reports/final-policy-report.md:34-42`.
- Phase 2 explicitly requires commercial truth, measurement truth, delivery state, source freshness, evidence floors, and push gates to outrank raw ROAS. Evidence: `docs/operator-policy/phase-2/reports/final-policy-report.md:13-18`.
- Scenario bank has Meta cases that should become Phase 3 fixtures: ABO scale candidate, CBO child invalidity, lifetime budget pacing, thin high-ROAS spike, cost-cap/bid-cap constraints, missing truth, no-touch, tracking degradation, learning, selected-range anomaly, and inactive archive. Evidence: `docs/operator-policy/phase-2/reports/scenario-bank.md:11-60`.
- Phase 2.1 accepted Phase 2 with conditions and required fixture conversion, provenance, selected-range firewall tests, and legacy fallback demotion. Evidence: `docs/operator-policy/phase-2.1/final.md:6-19`, `docs/operator-policy/phase-2.1/final.md:51-64`.

### Current code foundation

- Shared windows encode `analyticsWindow.role = "analysis_only"` and decision windows `recent7d`, `primary30d`, `baseline90d` with roles `recent_watch`, `decision_authority`, and `historical_memory`. Evidence: `src/types/operator-decision.ts:1-23`.
- `getMetaOperatorDecisionMetadata` defaults omitted `decisionAsOf` to provider previous date, not selected analytics end date. Evidence: `lib/operator-decision-metadata.ts:101-119`.
- Meta source fetches primary decision campaigns, breakdowns, country breakdowns, and ad sets from `decisionWindows.primary30d`, not from selected reporting dates. Evidence: `lib/meta/operator-decision-source.ts:28-68`.
- Meta Decision OS response includes `analyticsWindow`, `decisionWindows`, `decisionAsOf`, `campaigns`, `adSets`, `budgetShifts`, `geoDecisions`, `placementAnomalies`, `noTouchList`, `opportunityBoard`, commercial truth coverage, and authority. Evidence: `lib/meta/decision-os.ts:468-489`.
- Action-bearing campaign/ad set/budget/GEO/placement rows now carry provenance, evidence hash, and action fingerprint. Evidence: `lib/meta/decision-os.ts:220-239`, `lib/meta/decision-os.ts:247-281`, `lib/meta/decision-os.ts:285-300`, `lib/meta/decision-os.ts:303-327`, `lib/meta/decision-os.ts:329-340`.
- Trust metadata already has `action_core`, `watchlist`, `archive_context`, `opportunity_board`, truth states, operator dispositions, and aggressive action blocking. Evidence: `src/types/decision-trust.ts:1-30`, `src/types/decision-trust.ts:117-143`, `lib/decision-trust/compiler.ts:35-74`.
- Command Center blocks default queue eligibility when provenance is missing. Evidence: `lib/operator-decision-provenance.ts:105-139`, `lib/command-center.ts:1033-1044`, `lib/command-center.ts:1828-1857`.

## Minimal Phase 3 Meta Policy Contract

Add a small pure policy contract. Suggested location: `src/types/meta-operator-policy.ts` or `src/types/operator-decision.ts` if the team wants one shared policy namespace.

### Operator states

Use exactly these Phase 3 states:

| State | Meaning | Eligible examples | Hard blockers |
| --- | --- | --- | --- |
| `do_now` | Deterministic action is safe to present as today's operator work. | Live-confident ad set `scale_budget`, `reduce_budget`, `pause`, `recover`, or manual review action with all required floors met. | Missing provenance, missing commercial truth for aggressive actions, non-live/demo/snapshot source, selected-range-only evidence, no-touch, inactive/immaterial, missing row trust. |
| `do_not_touch` | The correct operator move is restraint. | Stable winner, protected retargeting/existing customer lane, manual do-not-scale, no-touch path. | Do not queue as a provider action. |
| `watch` | Evidence is meaningful but not command-ready. | Thin winner, near target, cooldown, learning, degraded but not blocked, profitable truth-capped row. | Cannot be primary command language. |
| `investigate` | The next step is diagnosis, not budget/status mutation. | Cost cap likely binding, CBO child budget ambiguity, tracking issue, learning limited, delivery blocked, lifetime budget pacing. | Cannot become push eligible. |
| `blocked` | Action class is explicitly blocked by policy, source, or missing data. | Missing provenance, stale source, missing budget owner, selected-range-only fallback, demo/snapshot source, no live target. | Cannot enter queue/apply/push. |
| `contextual_only` | Useful context that is not operator authority. | Snapshot fallback recommendation, demo recommendation, legacy selected-range insight, opportunity-board/no-touch context. | No Command Center default queue; no execution. |

### Push readiness

Use existing `OperatorDecisionPushEligibility.level` values and make the policy layer set or derive them explicitly. Evidence for existing enum: `src/types/operator-decision.ts:82-93`.

| Push readiness | Phase 3 meaning |
| --- | --- |
| `read_only_insight` | Visible context only. Use for `contextual_only`, demo, snapshot fallback, selected-range fallback, and most opportunity-board context. |
| `operator_review_required` | Deterministic verdict is useful, but action is manual-only, high-risk, unsupported by provider write, or lacks live preflight. |
| `safe_to_queue` | Deterministic, live-confident, provenance-backed, policy-approved work can enter Command Center default queue, but provider push is not enabled. |
| `eligible_for_push_when_enabled` | Reserved for exact supported live Meta targets after preview, permission, rollback, and provider capability gates. Phase 3 should normally not emit this until execution gates are complete. |
| `blocked_from_push` | Missing provenance, missing row trust, missing source authority, selected-range-only fallback, demo/snapshot/non-live evidence, no-touch, inactive/immaterial, or policy block. |

### Minimal verdict shape

```ts
type MetaOperatorState =
  | "do_now"
  | "do_not_touch"
  | "watch"
  | "investigate"
  | "blocked"
  | "contextual_only";

interface MetaOperatorPolicyVerdict {
  contractVersion: "meta-operator-policy.v1";
  entityType: "campaign" | "adset" | "geo" | "placement" | "budget_shift";
  entityId: string;
  recommendedAction: string;
  operatorState: MetaOperatorState;
  pushReadiness: "read_only_insight" | "operator_review_required" | "safe_to_queue" | "eligible_for_push_when_enabled" | "blocked_from_push";
  policyReasons: string[];
  blockers: string[];
  missingInputs: string[];
  evidenceFloors: Array<{
    key: string;
    status: "met" | "watch" | "blocked";
    current: string;
    required: string;
    reason: string | null;
  }>;
  requiredFields: string[];
  confidenceCap: number;
  canEnterCommandCenter: boolean;
  canEnterExecutionPreview: boolean;
}
```

This verdict should be pure and deterministic. It should be attached to Meta campaign/ad set rows first, then used by UI and Command Center. It should not replace provenance or trust metadata; it should compile them into operator states and push readiness.

## Policy Precedence

Run gates in this order. First hard blocker wins; otherwise the most conservative state wins.

1. Source and identity gate: missing provenance, missing action fingerprint, demo/snapshot/non-live selected-range source, stale mismatched context -> `blocked` or `contextual_only`.
2. Surface authority gate: missing authority, non-fresh authority, non-stable reliability, `degraded_missing_truth`, inactive/immaterial, suppressed action class -> no `do_now`.
3. Row trust gate: missing row trust, non-`action_core`, non-`live_confident`, non-`standard`, aggressiveActionBlocked, suppressed, no-touch -> no `do_now`.
4. Commercial truth gate: missing target pack, break-even, operating constraints, or stale commercial truth -> block/downgrade aggressive actions; protective reductions may remain `operator_review_required` only with material loss.
5. Budget ownership gate: campaign-owned budget, unknown owner, lifetime budget, mixed budget/config -> no direct ad set budget action.
6. Constraint diagnosis gate: bid/control constrained, delivery blocked, learning/cooldown, tracking/site/stock issue -> `investigate` or `watch`.
7. Evidence floor gate: spend, purchases, signal depth, objective fit, status, cooldown, and source freshness floors.
8. Action support gate: unsupported action class -> `operator_review_required` or `read_only_insight`, not push.
9. Queue posture gate: only provenance-backed, live-confident, policy-approved rows can become `safe_to_queue`.

## Current Input Audit

| Input | Status | Evidence | Current risk / Phase 3 behavior |
| --- | --- | --- | --- |
| `decisionAsOf`, source windows, analytics/reporting split | Available | `lib/operator-decision-metadata.ts:41-67`, `lib/operator-decision-metadata.ts:83-119`, `lib/meta/operator-decision-source.ts:32-55` | Use as mandatory authority context. Selected `startDate/endDate` may remain reporting context only. |
| Campaign/ad set spend, revenue, ROAS, CPA, CTR, impressions, clicks, purchases | Available | `app/api/meta/campaigns/route.ts:14-29`, `lib/api/meta.ts:83-93`, `lib/api/meta.ts:239-268` | Good for floors, but ROAS alone must not authorize scale/pause. |
| Bid strategy/control | Available but normalized by heuristic | Source fields exist on campaign/ad set rows: `app/api/meta/campaigns/route.ts:80-89`, `lib/api/meta.ts:249-257`. Current classifier string-matches into `open`, `cost_cap`, `bid_cap`, `roas_floor`, `unknown`: `lib/meta/decision-os.ts:659-686`. | Treat as available for investigation labels. Numeric bid/control writes require extension: exact bid/cost/ROAS control value, age, prior value, target fit, and delivery/budget diagnosis. |
| Campaign/ad set budget owner and budget type | Available but underused | `budgetLevel`, `dailyBudget`, `lifetimeBudget`, mixed flags exist: `app/api/meta/campaigns/route.ts:13`, `app/api/meta/campaigns/route.ts:90-99`, `lib/api/meta.ts:245-265`. | Phase 3 must block ad set budget actions when `budgetLevel !== "adset"`, unknown, lifetime budget, or mixed budget. Current `scaleCandidate` does not check budget owner/utilization directly: `lib/meta/decision-os.ts:1813-1822`. |
| Spend vs budget utilization | Derived, currently insufficient for binding diagnosis | Spend and budgets are present in supporting metrics: `lib/meta/decision-os.ts:2312-2325`. | Primary scale must require a budget-binding diagnosis. Current code can classify `scale_budget` from target fit/signal without proving budget is binding: `lib/meta/decision-os.ts:1804-1823`, `lib/meta/decision-os.ts:1914-1922`. Add derived `budgetUtilization30d` as watch evidence only unless live/current pacing exists. |
| CBO / Advantage Campaign Budget implications | Available partially | `budgetLevel` can distinguish campaign vs ad set ownership. Mixed flags exist: `app/api/meta/campaigns/route.ts:95-99`, `lib/api/meta.ts:258-265`. | Direct ad set budget changes under campaign-owned budget must become `investigate` or `operator_review_required`, never `safe_to_queue`. Need explicit tests for scenario M02. |
| Delivery constraint vs budget constraint | Missing / requires extension | Phase 2 audit flags missing delivery-state/learning diagnostics and current-day pacing source: `docs/operator-policy/phase-2/reports/code-data-contract-auditor.md:123-125`. | Do not infer budget binding from high ROAS. Missing delivery diagnostics downgrade scale to `watch` or `investigate` unless other policy explicitly allows review-only action. |
| Learning phase / learning limited | Missing / requires extension | Current row types expose status and config but no learning status: `lib/api/meta.ts:239-268`; Phase 2 audit marks learning/delivery feed missing: `docs/operator-policy/phase-2/reports/code-data-contract-auditor.md:123-124`. | Missing learning state should block push and cap aggressive actions to `operator_review_required` at most. Recent budget/bid timestamps can support cooldown watch: `lib/meta/decision-os.ts:1743-1745`. |
| Commercial truth target pack | Available but may be missing/stale | Target pack fields: `src/types/business-commercial.ts:122-134`; coverage/action ceilings: `src/types/business-commercial.ts:243-252`; missing target pack produces `review_hold`: `lib/business-commercial.ts:638-657`. | Missing target pack blocks scale, recovery spend increases, pause certainty, and bid relaxation. Current Decision OS already downgrades aggressive actions when missing: `lib/meta/decision-os.ts:2027-2068`. |
| Country economics / GEO commercial truth | Available for GEO, not campaign/ad set budget binding | Country economics fields: `src/types/business-commercial.ts:136-147`; missing country economics produces `monitor_low_truth`: `lib/business-commercial.ts:660-679`; GEO action uses serviceability/scale override: `lib/meta/decision-os.ts:1319-1370`. | Required for GEO scale/isolate/cut. For campaign/ad set scale, country economics can only be supporting context unless entity-country mapping exists. |
| Operating constraints | Available but coarse/account-level | Constraint fields include site, checkout, tracking, feed, stock, landing, merchandising, manual do-not-scale: `src/types/business-commercial.ts:163-175`; missing constraints ceiling is `degraded_no_scale`: `lib/business-commercial.ts:704-723`. | Good hard blocker for broad scale, but entity/product scope is limited. Missing or stale constraints should block aggressive push. |
| Calibration profiles | Available but not currently policy-enforcing | Calibration profile fields include channel, objective, bid regime, archetype, confidence cap, action ceiling: `src/types/business-commercial.ts:185-200`; missing profiles create `review_hold` ceiling: `lib/business-commercial.ts:726-738`. | Phase 3 should read confidence cap/action ceiling but not require profile for all read-only verdicts. Missing calibration blocks push and caps confidence. |
| Evidence floors | Derived, hard-coded | Current hard-coded ad set floors: `$250/8`, `$500/12`, `$500/18`: `lib/meta/decision-os.ts:1739-1742`; opportunity-board floors use `$250 / 6 purchases`: `lib/meta/decision-os.ts:2915-2924`. | Keep in Phase 3 fixtures, but make floors explicit in policy verdict. Do not hide hard-coded defaults; label them `default_policy_floor`. |
| Sample size / conversion volume | Available | Spend and purchases are row fields; current code uses floors above. | Low evidence must be `watch`, never `do_now`, even if ROAS is high. Scenario M07 covers this: `docs/operator-policy/phase-2/reports/scenario-bank.md:17`. |
| No-touch/protected entities | Derived; manual entity-level constraints missing | No-touch type exists: `lib/meta/decision-os.ts:342-349`; stable winners derive no-touch list: `lib/meta/decision-os.ts:3186-3228`; operating constraints have only coarse manual do-not-scale: `src/types/business-commercial.ts:171`. | Good for protected winners. Missing explicit entity-scoped no-touch rules means policy should allow `do_not_touch` only when derived trust/no-touch exists or broad manual constraint is present; no-touch rows should remain non-push. |
| Provenance/action fingerprint | Available for main action rows, missing on `MetaNoTouchItem` | Main rows carry provenance: `lib/meta/decision-os.ts:220-239`, `lib/meta/decision-os.ts:247-281`, `lib/meta/decision-os.ts:285-300`, `lib/meta/decision-os.ts:303-340`. `MetaNoTouchItem` has no provenance fields: `lib/meta/decision-os.ts:342-349`; Command Center attempts optional no-touch provenance and falls back to synthetic fingerprint: `lib/command-center.ts:1565-1578`, `lib/command-center.ts:1686-1708`. | Missing no-touch provenance is acceptable for read-only context, but it must block queue/push. If no-touch becomes action-bearing, add provenance first. |
| Recommendation source: Decision OS / snapshot fallback / demo | Available | `analysisSource.system` enum: `lib/meta/recommendations.ts:104-113`; route emits `demo`: `app/api/meta/recommendations/route.ts:91-119`, `decision_os`: `app/api/meta/recommendations/route.ts:162-175`, `snapshot_fallback`: `app/api/meta/recommendations/route.ts:269-305`. | `decision_os` recommendations can be context if full surface is missing; `snapshot_fallback` and `demo` must be `contextual_only/read_only_insight`. Add `authority = non_authoritative_selected_range_context` if not already present in response. |
| Live vs demo/snapshot/non-live source | Requires extension at policy boundary | Demo/snapshot are visible in recommendations source, but provenance itself does not encode live/demo/snapshot source class. | Add source posture to policy input or verdict. Demo/snapshot/non-live must be `blocked_from_push` even if metrics are strong. |

## Current Risk Areas To Patch In Phase 3

1. `scale_budget` can be selected without budget-binding proof. Current `scaleCandidate` uses active status, target fit, evidence volume, clean config, objective family, role, and bid regime, but not budget owner or spend-to-budget utilization. Evidence: `lib/meta/decision-os.ts:1804-1823`.
2. Campaign fallback can still choose `scale_budget` from aggregate campaign ROAS when no ad set decision exists. Evidence: `lib/meta/decision-os.ts:2371-2374`. Phase 3 should downgrade this path to `watch` or `investigate` unless child evidence and budget owner are explicit.
3. Cost-cap/bid-cap diagnosis is partial. Current bid regime classifier exists and `bidRegimePressure` routes to `review_cost_cap`, but true underdelivery/binding proof is not present. Evidence: `lib/meta/decision-os.ts:659-686`, `lib/meta/decision-os.ts:1835-1842`, `lib/meta/decision-os.ts:1979-1986`.
4. Learning/delivery/account issue data is missing. Phase 2 audit explicitly calls this out. Evidence: `docs/operator-policy/phase-2/reports/code-data-contract-auditor.md:123-125`.
5. Snapshot fallback recommendations remain selected-range heuristic output. They are labeled by source, but the policy layer should explicitly force `contextual_only/read_only_insight`. Evidence: `app/api/meta/recommendations/route.ts:181-260`, `app/api/meta/recommendations/route.ts:269-305`.
6. Existing operator surface uses older states `act_now`, `needs_truth`, `blocked`, `watch`, `no_action`. Evidence: `lib/operator-surface.ts:1-9`, `lib/meta/operator-surface.ts:67-85`. Phase 3 can either add a mapping layer or replace Meta-only labels with requested states. Do not expose both vocabularies in the UI.

## Minimal Code Touch Points

Do not rewrite the Decision OS. Add a deterministic policy compiler and integrate it into existing surfaces.

1. Add `src/types/meta-operator-policy.ts` or extend a shared type file:
   - `MetaOperatorState`
   - `MetaOperatorPushReadiness`
   - `MetaOperatorPolicyVerdict`
   - evidence floor keys and missing input keys

2. Add `lib/meta/operator-policy.ts` as a pure deterministic compiler:
   - input: row decision, authority, source posture, budget ownership, commercial truth coverage, provenance
   - output: `MetaOperatorPolicyVerdict`
   - no network, no LLM, no date range fetching

3. Integrate inside `lib/meta/decision-os.ts`:
   - attach `operatorPolicy` to `MetaCampaignDecision` and `MetaAdSetDecision`
   - compile after trust/provenance is known
   - keep existing `primaryAction`/`actionType` for backward compatibility

4. Update `lib/meta/operator-surface.ts`:
   - map `operatorPolicy.operatorState` to user-facing buckets
   - avoid older `act_now/needs_truth/no_action` vocabulary leaking into Meta if new states are present

5. Update `components/meta/meta-decision-os.tsx` only enough to display:
   - state label
   - primary reason
   - blocked/missing input summary
   - push readiness
   - detailed evidence in existing collapsed panels
   Existing command readiness checks are conservative and should remain. Evidence: `components/meta/meta-decision-os.tsx:555-583`, `components/meta/meta-decision-os.tsx:909-927`.

6. Update `lib/command-center.ts`:
   - use `operatorPolicy.pushReadiness` to decide default queue eligibility
   - keep provenance requirement from `buildOperatorDecisionPushEligibility`
   - force `contextual_only`, `do_not_touch`, demo, snapshot, and missing-provenance actions out of queue

7. Update `app/api/meta/recommendations/route.ts` and `lib/meta/recommendations.ts` only if needed:
   - ensure snapshot/demo responses have explicit non-authoritative source posture
   - never give snapshot fallback a queue/action authority field

## Phase 3 Fixture Coverage

Convert a focused subset of Phase 2 Meta scenarios into deterministic fixtures. Do not convert all 160 yet.

Required fixtures:

1. Budget not binding:
   - Strong ROAS + strong purchases, but spend does not approach budget or budget ownership is unknown.
   - Expected: `watch` or `investigate`, not `do_now`.

2. Bid/control constrained delivery:
   - Cost cap/bid cap/ROAS floor + low delivery + strong efficiency.
   - Expected: `investigate`, push `operator_review_required` or `blocked_from_push`; no budget increase.
   - Scenario source: M15/M17/M18 at `docs/operator-policy/phase-2/reports/scenario-bank.md:25-28`.

3. CBO/ad set action invalidity:
   - Child ad set winner under `budgetLevel="campaign"`.
   - Expected: campaign budget review/manual context; no ad set budget push.
   - Scenario source: M02 at `docs/operator-policy/phase-2/reports/scenario-bank.md:12`.

4. Low evidence false winner:
   - High ROAS but below spend/purchase floors.
   - Expected: `watch`, not `do_now`.
   - Scenario source: M07 at `docs/operator-policy/phase-2/reports/scenario-bank.md:17`.

5. Low evidence poor performer:
   - Poor ROAS but below spend/purchase loss floors.
   - Expected: `watch` or `investigate`, no pause/reduce.

6. Sufficient evidence poor performer:
   - Material spend and purchases below break-even, with commercial truth and no tracking/learning blocker.
   - Expected: `do_now` or `operator_review_required` depending push support; no selected-range dependency.
   - Scenario source: M04/M05 at `docs/operator-policy/phase-2/reports/scenario-bank.md:14-15`.

7. Sufficient evidence scale candidate:
   - Active ABO, daily budget, near budget utilization, open bidding or non-binding controls, target met, clean config, complete truth.
   - Expected: `do_now`, at most `safe_to_queue` unless provider push gates exist.
   - Scenario source: M01/M16 at `docs/operator-policy/phase-2/reports/scenario-bank.md:11`, `docs/operator-policy/phase-2/reports/scenario-bank.md:26`.

8. Missing commercial truth blocks aggressive action:
   - Strong metrics but missing target pack/country/constraints.
   - Expected: `watch` or `investigate`, push blocked.
   - Existing test already covers downgrade: `lib/meta/decision-os.test.ts:233-260`; add policy verdict assertions.

9. No-touch/protected entity:
   - Retargeting/protected stable winner or manual do-not-scale.
   - Expected: `do_not_touch`, `read_only_insight`, no default queue.
   - Existing no-touch derivation: `lib/meta/decision-os.ts:2118-2134`, `lib/meta/decision-os.ts:3186-3228`.

10. Selected reporting range firewall:
    - Same business + same `decisionAsOf` + same primary rows + different analytics windows.
    - Expected: same primary actions, same policy verdicts, same action fingerprints.
    - Existing Phase 3.1 tests already cover provenance/action stability; add policy verdict equality.

11. Missing provenance blocks queue/push:
    - Remove provenance from action row.
    - Expected: `blocked`, `blocked_from_push`, `canEnterCommandCenter=false`.
    - Existing queue block evidence: `lib/operator-decision-provenance.ts:112-119`.

12. Demo/snapshot/non-live context:
    - `analysisSource.system = "demo"` or `"snapshot_fallback"`.
    - Expected: `contextual_only`, `read_only_insight`, no queue/apply.
    - Source labels: `lib/meta/recommendations.ts:104-113`, `app/api/meta/recommendations/route.ts:91-119`, `app/api/meta/recommendations/route.ts:299-303`.

## Acceptance Criteria For The Policy Layer

Phase 3 Meta policy foundation is acceptable when:

- Each campaign/ad set action-bearing row has a deterministic `operatorPolicy` verdict.
- `do_now` is impossible without live-confident authority, row trust, complete required evidence, and provenance.
- Missing commercial truth downgrades or blocks aggressive actions.
- Missing budget owner, CBO child ownership, lifetime budget, mixed budget/config, or missing budget utilization prevents direct ad set budget action.
- Bid/cost/ROAS controls route to `investigate` unless budget-binding proof exists.
- Learning/delivery gaps block push and cap action to review/watch.
- Snapshot/demo/fallback recommendations are always `contextual_only/read_only_insight`.
- Command Center default queue eligibility is governed by provenance plus policy verdict, not just `surfaceLane`.
- Fixtures prove the core media-buyer guardrails and selected-range firewall.

## Recommended Next Step

Implement `lib/meta/operator-policy.ts` and tests first, without changing UI layout. Then attach verdicts to Meta campaign/ad set decisions and let the existing Meta overview/Command Center surfaces consume those verdicts. This keeps Phase 3 scoped to deterministic Meta operator foundation and avoids slipping into the Phase 4 Creative policy engine.
