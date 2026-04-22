# Phase 3 Completion Plan

Role: Phase 3 Planner / Final Reviewer
Repo/app name: Adsecute
Scope: planning only. No app code changes.

## Planning Position

Phase 3.1 PR #16 must close before deterministic Meta policy work starts. The latest review-fix context is commit `55d7961`, but merge safety still depends on final review plus runtime browser smoke or an explicit owner waiver. The known runtime blocker is the missing local Postgres volume at `/Volumes/adsecuteDB`; until that is resolved or waived, PR #16 is not merge-safe under the current gate.

Phase 3 deterministic Meta policy should be a new PR after PR #16 merges or is explicitly accepted with waiver. It should not be added onto PR #16 because PR #16 is the Decision Range Firewall + Provenance Contract. The policy layer changes Command Center readiness, UI authority language, and Meta decision semantics; that needs its own reviewable scope and acceptance criteria.

## Slice Plan

### Slice 0: Close PR #16

Goal: finish the Decision Range Firewall + Provenance Contract before policy work.

Required exit criteria:
- PR #16 review blockers are addressed or explicitly accepted by reviewers.
- Runtime browser smoke passes, or project owner explicitly waives it.
- Automated checks pass: targeted tests, TypeScript, build, `git diff --check`.
- `main` is not pushed directly.

If runtime remains blocked by `/Volumes/adsecuteDB`, the required waiver wording should be explicit: "Owner waives local browser runtime smoke for PR #16 despite missing local Postgres volume; merge may proceed based on automated checks and review."

### Slice 1: Deterministic Meta Policy Contract PR

Branch recommendation after PR #16 merges:

```text
feature/adsecute-meta-operator-policy
```

This PR should implement the minimal deterministic Meta policy foundation only. It must not implement Phase 4 Creative policy and must not redesign the Meta UI.

Acceptance criteria:
- Campaign/ad set action-bearing rows receive deterministic policy verdicts.
- `do_now` is impossible without explicit row trust, provenance, sufficient evidence, and source authority.
- Missing commercial truth, missing provenance, missing row trust, selected-range context, demo/snapshot source, no-touch, and inactive/immaterial rows cannot become push eligible.
- Command Center queue/apply gates require policy approval, not only `action_core + provenance`.
- Selected reporting range changes do not change primary action identity or policy verdict for the same `decisionAsOf` and source state.

## Minimal Policy Contract

Add a pure deterministic Meta policy layer, likely:

- `src/types/meta-operator-policy.ts`
- `lib/meta/operator-policy.ts`
- tests beside the new policy module

Recommended state enum:

```ts
type MetaOperatorState =
  | "do_now"
  | "do_not_touch"
  | "watch"
  | "investigate"
  | "blocked"
  | "contextual_only";
```

Recommended push readiness enum should align with the existing operator decision contract:

```ts
type MetaOperatorPushReadiness =
  | "read_only_insight"
  | "operator_review_required"
  | "safe_to_queue"
  | "eligible_for_push_when_enabled"
  | "blocked_from_push";
```

Minimal verdict shape:

```ts
interface MetaOperatorPolicyVerdict {
  contractVersion: "meta-operator-policy.v1";
  entityType: "campaign" | "adset" | "budget_shift" | "geo" | "placement";
  entityId: string;
  recommendedAction: string;
  operatorState: MetaOperatorState;
  pushReadiness: MetaOperatorPushReadiness;
  policyReasons: string[];
  blockers: string[];
  missingInputs: string[];
  requiredFields: string[];
  confidenceCap: number;
  canEnterCommandCenter: boolean;
  canEnterExecutionPreview: boolean;
}
```

Policy precedence should be conservative:

1. Source/provenance gate.
2. Decision OS authority gate.
3. Row trust gate.
4. Commercial truth gate.
5. Budget ownership gate.
6. Bid/control and delivery constraint gate.
7. Evidence floor gate.
8. Learning/cooldown/no-touch gate.
9. Command Center push-readiness gate.

Missing data must never create permission for aggressive action. It must produce `watch`, `investigate`, `blocked`, or `contextual_only`, depending on the row.

## Files To Change In Policy PR

Expected minimal files:

- `src/types/meta-operator-policy.ts`
- `lib/meta/operator-policy.ts`
- `lib/meta/decision-os.ts`
- `lib/meta/operator-surface.ts`
- `components/meta/meta-decision-os.tsx`
- `components/meta/meta-campaign-detail.tsx`
- `components/meta/meta-campaign-list.tsx` if current styling makes non-command states look primary
- `lib/command-center.ts`
- `lib/command-center-execution-service.ts`
- targeted tests for the above

Files to avoid in this slice:

- Creative Decision OS implementation files, except read-only references in tests if needed.
- Full media-buyer engine rewrites.
- Broad UI layout files unrelated to Meta operator state display.

## Scenario Fixture Subset

Convert a focused subset from the Phase 2 Meta scenario bank. Do not convert all 160 scenarios in this PR.

Required fixtures:

1. Budget not binding:
   Strong ROAS and purchases, but budget utilization does not prove budget constraint. Expected: `watch` or `investigate`, not `do_now`.

2. Bid/control constrained delivery:
   Cost cap, bid cap, or ROAS goal appears restrictive. Expected: `investigate`; no budget-increase primary action.

3. CBO/ad set action invalidity:
   Ad set winner under campaign-owned budget. Expected: no direct ad set budget push; route to campaign-level review or investigate.

4. Low evidence false winner:
   High ROAS with tiny spend/conversion base. Expected: `watch`, not scale.

5. Low evidence poor performer:
   Poor ROAS with insufficient spend/conversions. Expected: `watch` or `investigate`, not pause/kill.

6. Sufficient evidence poor performer:
   Material spend and conversions below commercial target with reliable truth. Expected: `do_now` or `operator_review_required`, depending provider support and risk.

7. Sufficient evidence scale candidate:
   Active ABO, daily budget, budget appears binding, sufficient conversions, commercial truth present, open/non-binding delivery context. Expected: `do_now`; push readiness capped by provider safety gates.

8. Missing commercial truth:
   Strong platform metrics but target pack/margin/constraints missing. Expected: no aggressive action; `watch` or `investigate`; push blocked.

9. No-touch/protected entity:
   Protected stable winner or manual do-not-scale context. Expected: `do_not_touch`, `read_only_insight`, no queue.

10. Selected reporting range firewall:
    Same business + same `decisionAsOf` + same source state + different analytics ranges. Expected: same primary action fingerprints and same policy verdicts.

11. Missing provenance:
    Action row without provenance. Expected: `blocked`, `blocked_from_push`, no Command Center entry.

12. Demo/snapshot/non-live context:
    Demo or snapshot fallback source. Expected: `contextual_only`, `read_only_insight`, no queue/apply.

These fixtures should assert policy decisions directly, not only rendered snapshots.

## Command Center Safety Integration

Command Center must consume the deterministic policy verdict before declaring queue/apply readiness.

Required changes:

- `defaultQueueEligible` must require explicit policy approval, provenance, live/source authority, and supported action capability.
- `action_core + provenance` must no longer be sufficient.
- `degraded_missing_truth`, `inactive_or_immaterial`, no-touch, non-standard disposition, missing row trust, missing commercial truth, demo/snapshot, and selected-range fallback must not become queue/push eligible.
- Execution preview/apply must reject actions when submitted provenance does not match the resolved action provenance.
- Selected reporting dates may remain navigation/reporting context, but must not be action identity.
- Opportunity board queue labels must not be treated as provider push eligibility.

Recommended tests:

- Degraded action core with provenance is not queue eligible.
- Missing policy verdict blocks queue/apply.
- Policy `contextual_only` blocks queue/apply.
- Demo/snapshot source blocks queue/apply.
- Submitted provenance mismatch blocks execution preview.
- Same action with different reporting range still resolves by provenance/action fingerprint when policy allows it.

## Meta UI Integration

This is a small information architecture integration, not a redesign.

Required UI exposure:

- Operator state chip: `do_now`, `do_not_touch`, `watch`, `investigate`, `blocked`, `contextual_only`.
- Push readiness chip: `read_only_insight`, `operator_review_required`, `safe_to_queue`, `eligible_for_push_when_enabled`, `blocked_from_push`.
- One visible reason and first missing-data/blocker reason outside details.
- Detailed evidence remains collapsed.

Copy requirements:

- Do not describe selected reporting range as action authority.
- Prefer "Decision as of ..." for operator anchor when available.
- Keep "Last successful analysis" generic when only part of analysis succeeded.
- Avoid "queue eligible" unless it is clearly review queue or policy-approved queue readiness.

## Runtime And PR Gates

Each Phase 3 policy PR must run:

- Targeted Meta policy tests.
- Existing Meta Decision OS tests.
- Command Center queue/execution tests.
- Existing Phase 3.1 firewall/provenance tests.
- `npx tsc --noEmit`.
- `git diff --check`.
- `npm run build`.
- `npm run lint` only if a lint script exists.

Runtime smoke:

- `/platforms/meta` loads.
- Analysis status renders.
- Decision OS policy outcomes render.
- Reporting range changes do not visibly mutate primary action identity for the same `decisionAsOf`.
- Contextual/fallback rows are not styled as primary commands.
- Command Center does not show blocked/contextual rows as push-ready.

If runtime remains blocked by local infrastructure, document the exact blocker and require owner waiver before merge. Current known blocker: missing local Postgres volume `/Volumes/adsecuteDB`.

## Why Phase 4 Must Wait

Phase 4 is Creative operator policy. It must not start until the Phase 3 Meta policy PR is merged because Creative should inherit the proven operator contract, not copy unfinished Meta semantics.

Blocking reasons:

- The source/provenance firewall must be stable before Creative policy relies on it.
- Command Center queue/apply gates must require policy approval before Creative can define comparable push-readiness behavior.
- Meta policy fixtures will establish the deterministic test pattern that Creative should reuse.
- If Creative starts before Meta policy lands, the repo risks two divergent policy vocabularies and duplicated safety bugs.

Recommended Phase 4 start condition:

- PR #16 merged.
- Meta deterministic policy PR merged.
- Runtime smoke passed or explicitly waived for both PRs.
- Phase 4 handoff updated with lessons from Meta policy fixtures and Command Center integration.

## Final Recommendation

- Phase 3 deterministic Meta policy should be a new PR after PR #16 merges or receives an explicit owner runtime waiver and merges.
- The first policy PR should be narrow: contract, pure policy compiler, Meta row integration, Command Center safety gating, minimal UI chips, and focused scenario fixtures.
- Do not start Phase 4 until the Meta policy PR is merged into `main`, unless the supervisor explicitly authorizes Phase 4 to branch from the unmerged Phase 3 policy branch.
