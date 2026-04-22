# Phase 8 Product Review — Push Readiness Safety Gates

Reviewer: Claude Code (product-strategy and media buyer logic reviewer)
Date: 2026-04-22
Charter: `docs/external-reviews/PRODUCT_REVIEW_CHARTER.md`
Commits reviewed: `cf4965f` (Phase 8), `76eb14c` (PR #29 merge)

---

## Verdict: ON TRACK — 8-Phase Program Complete for Meta Execution Subset

Phase 8 completes the push-readiness layer for the Meta ad set execution subset. The 12-gate apply chain is correct. The provenance validation is deep and specific. The audit trail is properly sanitized. PR flow is restored after three phases of direct-to-main commits.

The 8-phase operator system program is functionally complete for the intended scope: deterministic policy, operator instructions, bounded parameters, telemetry staging, and gated push execution for Meta ad set actions. The system can now, under explicit canary conditions, execute a Meta ad set pause, budget increase, or budget reduction without operator intervention in Meta Ads Manager.

Four items remain that fall outside the 8-phase scope but limit the system's full expert operator claim:

1. **HOLD bucket top-level filter routing** — the longest-running unfixed gap. Per-row labels are correct; the filter bucket still conflates campaign-structure-blocked with truth-blocked.
2. **Telemetry sink not activated** — staged but not wired to production. Production observability is blind until this is wired.
3. **Creative push-to-account** — not in scope for Phase 8. Manual-only. No execution path exists.
4. **Dead code in `resolveSegment`** — present since Phase 4.

---

## 1. Process: PR Flow Restored

Phase 8 was merged through PR #29 (`76eb14c` is a proper merge commit). This restores the branch → PR → CI → merge discipline that Phases 5, 6, and 7 bypassed. The PR flow must continue for all future work that touches policy, instruction, execution, or telemetry behavior.

---

## 2. The 12-Gate Apply Chain

Before a provider mutation fires, `buildCommandCenterExecutionPreflightReport` validates:

1. **Execution feature flag** (`COMMAND_CENTER_EXECUTION_V1`) — preview disabled if off
2. **Apply feature flag** (`META_EXECUTION_APPLY_ENABLED`) — apply disabled by default
3. **Kill switch** (`META_EXECUTION_KILL_SWITCH`) — emergency stop
4. **Canary business allowlist** (`META_EXECUTION_CANARY_BUSINESSES`) — business must be explicitly registered
5. **Operator edit permission** — role check
6. **Valid provenance** (`hasValidCommandCenterExecutionProvenance`) — deep structural check
7. **Live provider scope** — provider-side state is accessible and current
8. **Supported action type** (`META_EXECUTION_SUPPORTED_ACTIONS` allowlist)
9. **Current preview hash** — hash binds to preflight safety state; any gate change stales it
10. **Recorded approval event** — `hasApprovalEvidence` requires `approvedAt` + actor identifier, not just `workflowStatus === "approved"`
11. **Material provider-side delta** — execution is skipped if the provider already reflects the requested state
12. **Rollback plan** — supported actions have provider rollback; manual-only actions have recovery notes

This chain is conservative and correct. Each gate is independently necessary. No single bypass is possible without multiple explicit owner decisions.

### The provenance validation is now deep

`hasValidCommandCenterExecutionProvenance` checks:
- `contractVersion === "operator-decision-provenance.v1"`
- `actionFingerprint` and `evidenceHash` both non-empty
- `sourceDecisionId` matches `action.sourceContext.sourceDecisionId`
- `sourceRowScope.system` matches `action.sourceSystem`
- `sourceRowScope.entityType` is appropriate for the entity type
- `decisionAsOf`, `sourceWindow.key`, `startDate`, `endDate` all present

A copied fingerprint, a mismatched source scope, or a missing evidence hash will all reject. This prevents a class of attacks where a valid fingerprint is copied to an ineligible action.

### Preview hash binds to preflight safety state

The preview hash now includes the current apply boundary state (feature flag, kill switch, canary membership, approval status). If any of these change between preview generation and apply attempt, the hash is stale and apply is rejected. This prevents a race condition where an operator previews under one gate configuration and applies under another.

### Approval requires recorded evidence

`hasApprovalEvidence` checks `approvedAt && (approvedByUserId || approvedByEmail || approvedByName)`. `workflowStatus === "approved"` without a recorded event does not pass. This means the approval gate is verifiable in the audit trail, not merely asserted.

---

## 3. Audit Trail Sanitization

`sanitizeCommandCenterExecutionAuditEntry` strips the following from audit entries returned to the UI/API:
- Actor email, name, and user ID
- Provider payload bodies
- Provider account IDs
- Campaign names and ad set names
- Raw failure messages (replaced with classified reasons)

What remains is execution metadata: fingerprint, operation, status, support mode, preflight readiness, validation result, and a classified blocked reason. This is the right boundary — the audit trail is useful for operational diagnosis without leaking PII or account-identifying data.

---

## 4. Expert Operator Test: Final State After 8 Phases

**Meta ad set budget move (scale_budget, canary-eligible account):**
The complete instruction path is: policy classification → bounded amount guidance → operator instruction with urgency reason → preview with preflight report → 12-gate apply chain → post-apply validation → sanitized audit entry. The operator sees the recommendation, reviews the bounded band, approves, and the mutation executes. This is a complete expert operator flow for this action class.

**Creative scale (scale_ready with preferred ad set):**
The complete instruction path is: policy classification → target context naming the preferred ad set → "Scale X into Y" instruction → queue eligibility → no execution path. The operator reads the complete instruction and must go to Meta Ads Manager to implement it. The decision is made by the system; the execution is still manual.

**Watch, protect, investigate instructions (Meta and Creative):**
Complete and correct. The operator is told clearly what not to do and why. The system enforces the protection structurally through blocked push eligibility, not just through advisory text.

**Verdict:** The product fully satisfies the expert operator test for Meta ad set budget actions under canary conditions. It satisfies the "legible and trustworthy" bar for Creative decisions, with manual execution remaining. It satisfies the "do not touch" bar for protected and watchlist rows structurally, not just textually.

---

## 5. What Remains After the 8-Phase Program

### Not in scope for Phases 1-8, now clearly documented

**Creative push-to-account** requires: complete provider execution identifiers, Creative mutation API contract, preflight Creative state verification, rollback path for ad creation/removal. None of this exists. The `final-product-readiness.md` correctly classifies Creative mutations as manual-only. This is not a gap — it is an explicit boundary.

**Telemetry sink** is staged. `OPERATOR_DECISION_TELEMETRY_SINK` controls activation. Until wired to a metrics or log service, production observability of instruction kinds, blocked reasons, and amount guidance distribution is unavailable. The product is flying blind on its own output. This should be the first activation task before any canary expansion.

### Persisting unfixed gaps

**HOLD bucket top-level routing.** The `investigate` segment + `blocked` state (campaign structure conflict) has routed to the HOLD quick-filter bucket since Phase 4. Per-row labels now correctly say "Investigate" rather than "HOLD" — that disambiguation was done in Phase 7. But the quick-filter bucket still groups these creatives with truth-blocked and preview-blocked rows. An operator filtering to HOLD cannot distinguish "Adsecute configuration missing" from "Meta campaign structure conflict." This has been flagged in every review since Phase 4. It is a one-line routing change in `resolveCreativeAuthorityState`.

**Budget band bid-strategy context.** The 10-20% Meta budget band for `scale_budget`/`reduce_budget` is derived from current daily budget only, with no bid-strategy awareness. A cost-cap ad set where the cost cap is binding will not respond to a budget increase without a corresponding cap adjustment. The amount guidance assumptions list this as a gap but does not surface bid strategy type to the operator. The `bidRegime` field is available in the decision; it is already used for action label selection. Threading it into the amount guidance assumptions is a small addition with meaningful operator value.

**Dead code in `resolveSegment`.** The inner `hasRoasOnlyPositiveSignal` check inside the `isUnderSampled` block in `lib/creative-operator-policy.ts` has been permanently unreachable since Phase 4. It has been flagged in every review. It should be removed.

---

## 6. Test and Build Status

- Full suite: **292 files / 1992 tests — PASS**
- TypeScript: **PASS**
- Working tree: **clean**
- PR flow: **restored** (PR #29, merge commit `76eb14c`)

---

## 7. Summary

Phase 8 completes what the 8-phase program set out to build: a deterministic expert operator system for Meta ad set decisions with gated push-to-account capability. The safety architecture is correct. The gate chain is deep enough that no accidental mutation is possible without multiple explicit owner decisions. The audit trail is sanitized. The provenance validation is specific enough to prevent fingerprint copying.

The system now does what the product charter required for the Meta execution subset:
- Tells operators what to do, why, with bounded guidance
- Tells operators what not to touch and enforces it structurally
- Tells operators what to watch
- Tells operators when evidence is missing
- Executes the action safely under canary conditions with operator approval

What the system does not yet do:
- Execute Creative decisions (manual-only, correctly scoped out)
- Produce production telemetry (staged, not activated)
- Surface HOLD bucket distinctions at the filter level (routing gap, fixable in one line)

The program is complete. The canary rollout checklist in `final-product-readiness.md` is the right next step.
