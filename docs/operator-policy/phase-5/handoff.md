# Phase 5 Handoff - Cross-Page Operator System Hardening

Date: 2026-04-22
Recommended branch: `feature/adsecute-cross-page-operator-system`

## What Phase 4 Completed

- Deterministic Creative operator policy foundation.
- Creative operator segment taxonomy and shared operator states.
- Creative push-readiness classification using the Phase 3 provenance model.
- Evidence-source safety for live, demo, snapshot, fallback, and unknown Creative evidence.
- Creative row `operatorPolicy` with required evidence, missing evidence, blockers, and explanation.
- Command Center propagation of Creative operator policy.
- Command Center blocking for missing Creative policy and non-queue-eligible Creative opportunity rows.
- Existing Creative Decision Support drawer integration with minimal UI change.
- Creative detail evidence labels for operator segment and push readiness.
- Filter support for operator segment, operator state, and push readiness.

## What Remains

Phase 5 should harden Adsecute as a cross-page operator system rather than adding another isolated decision engine.

Primary gaps:

- Cross-page consistency between Meta and Creative recommendations.
- Operator queue ownership when Meta says the campaign/ad set is constrained but Creative says the asset is strong.
- Durable storage for policy decisions and action outcomes.
- Production monitoring for provenance, evidence source, queue eligibility, and manual execution outcomes.
- Provider-backed creative execution design, if it is ever allowed.
- Performance optimization for multi-window Creative reads.
- Connected-account runtime smoke expansion beyond seeded localhost validation.

## Cross-Page Rules To Preserve

- Selected reporting range remains reporting context only.
- `decisionAsOf` and stable source windows remain action authority.
- Freeform LLM commentary remains support-only and cannot approve final actions.
- Missing data fails closed.
- Demo, snapshot, fallback, and unknown evidence stay contextual.
- Missing provenance blocks queue/apply/push eligibility.
- Provider apply must require a provider-specific execution contract, preflight, audit trail, and rollback proof.

## First Phase 5 Slice

Recommended first slice:

1. Add a cross-page conflict detector.
2. Detect when Creative and Meta policies disagree on the same campaign/ad set/creative family.
3. Surface conflicts as `investigate`, not as automatic action.
4. Add tests for:
   - strong creative inside bid-limited campaign
   - weak creative inside healthy campaign
   - Meta no-touch campaign containing high-ROAS creative
   - Creative refresh recommendation inside campaign budget constraint
   - snapshot Creative evidence plus live Meta action

## Production Rollout Requirements

- Track policy version, evidence source, action fingerprint, queue state, and manual outcome.
- Monitor counts of `blocked_from_push`, `safe_to_queue`, and `operator_review_required`.
- Alert if any demo/snapshot/fallback/unknown Creative row becomes queue eligible.
- Alert if any Creative row becomes provider-apply eligible before a provider execution contract exists.
- Add connected-account smoke that samples sanitized Creative operator policy counts without printing raw IDs.

## Acceptance Criteria For Phase 5

- Cross-page conflict detector is deterministic and test-covered.
- Command Center can explain why cross-page conflicts are held for investigation.
- Meta and Creative policy outputs remain independently stable under reporting-range changes.
- No Creative provider apply is introduced without a separate execution PR.
- Full tests, TypeScript, build, diff-check, and runtime smoke pass.
