# Phase 6 Product Review — Operator Parameters and Observability

Reviewer: Claude Code (product-strategy and media buyer logic reviewer)
Date: 2026-04-22
Charter: `docs/external-reviews/PRODUCT_REVIEW_CHARTER.md`
Commits reviewed: `45d33d2` (Phase 5 push-readiness hardening), `2b49a2d` (Phase 6)

---

## Verdict: ON TRACK

Phase 6 crosses a threshold. For Meta ad set budget actions, the instruction is now genuinely executable: a bounded 10-20% daily budget band appears alongside the action direction, the target ad set name, and explicit assumptions about what the band does not cover. For Creative scale candidates, the preferred ad set name is surfaced in a dedicated target context field. Urgency is now derived from evidence signals for the most important cases, not assigned uniformly by instruction kind.

The product has moved from "operator-legible" to "operator-executable for the majority of routine Meta budget decisions." Creative execution specificity is closer but still not fully executable: the preferred ad set appears in `targetContext` but is not integrated into the `primaryMove` sentence itself.

Two gaps from prior reviews remain open: the HOLD bucket conflation and cross-creative sequencing. Both are well-understood and correctly deferred.

There is a continuing process concern: Phase 5 hardening (`45d33d2`) and Phase 6 (`2b49a2d`) were both pushed directly to main without a PR merge commit. Phase 6's final report references PR #27 but no corresponding merge commit appears in the log. This should be addressed before Phase 7.

---

## 1. What Phase 5 Hardening Fixed (45d33d2)

**Execution allowlist.** `canApply` for Meta actions now requires an explicit allowlist match: `META_EXECUTION_SUPPORTED_ACTIONS = ["pause", "recover", "scale_budget", "reduce_budget"]`, plus `sourceType === "meta_adset_decision"` and `policy.pushReadiness === "eligible_for_push_when_enabled"`. Previously `canApply` was set for any actionable Meta row. The allowlist prevents unintended provider apply on campaign-level, creative, or unsupported action types.

**Policy clamping in the prescription.** `resolvePolicyReadiness` now applies `mostRestrictivePushReadiness(policy.pushReadiness, override)`. A policy `blocked_from_push` cannot be overridden to anything more permissive. Previously, a caller could pass `pushReadinessOverride: "safe_to_queue"` and the instruction would emit that value even if the canonical policy said `blocked_from_push`. This was a real correctness gap and the fix is the right approach.

**Centralized readiness resolution.** The missing-policy case now has a clear path: if `requiresPolicyForQueue` is true and no policy exists, everything fails closed. The logic that was previously scattered across callers is now in one place.

---

## 2. What Phase 6 Added

### A. Bounded Meta budget bands — most important product advance

`metaBudgetAmountGuidance` produces `status: "bounded_estimate"` for `scale_budget`, `recover`, and `reduce_budget` when `dailyBudget` is available on the source row:

- Scale/recover: `+10-20% band` → `$[lower]–$[upper]/day`
- Reduce: `-10-20% band` → `$[lower]–$[upper]/day`

The assumptions are explicit: no pacing data, no utilization ratio, does not override policy gates.

A Meta media buyer reading a `scale_budget` instruction for an ad set with a $500 daily budget now sees: "Review +10-20% budget band: $550–$600/day" alongside "Execution preview or operator review must confirm the final account change." This is a complete enough instruction to evaluate and act on, or to bring to Meta Ads Manager for the actual edit. The gap between "scale this" and "scale this by moving from $500 to $550–$600/day" is meaningfully closed for this action class.

### B. Creative scale target context — addresses the longest-standing product gap

`creativeTargetContext` resolves target context for `scale_ready` creatives:

- `preferredAdSetNames[0]` present → `status: "available"`, label: `"Target ad set: [name] · [campaign]"`
- Only campaign available → `status: "review_required"`, label: `"Campaign context: [campaign]"`
- Nothing available → `status: "unavailable"`, label: `"Target ad set unavailable"`

This directly addresses the gap from Phase 4 onward. The operator no longer needs to navigate to the deployment section to find where a scale_ready creative should go. The preferred ad set is surfaced as a first-class field in the instruction.

The `targetContextStatus` field is also included in telemetry, so production distribution of `available` vs. `review_required` vs. `unavailable` can be monitored.

### C. Evidence-derived urgency

`defaultUrgency` is now evidence-based:
- `do_now` + strong evidence + queue-ready pushReadiness → `"high"` with reason
- `do_now` otherwise → `"medium"` (evidence or missing context keeps it bounded)
- `fatigued_winner` + `frequencyPressure >= 3` → `"high"` with reason "Frequency pressure supports prioritizing a refresh review"
- `promising_under_sampled` → `"watch"` urgency
- `protected_winner` → `"low"` urgency

Every instruction now has an `urgencyReason` explaining the derivation. An operator with two `scale_ready` creatives can now read why one is `high` and the other is `medium`, rather than seeing two identical `"high"` urgency labels.

This is real improvement. It does not yet address cross-creative sequencing (two high-urgency creatives pointing at the same ad set), but it provides the input operators need to make that sequencing decision themselves.

### D. Production-safe telemetry

`OperatorDecisionTelemetry` is attached to every instruction. It includes instructionKind, pushReadiness, queueEligible, canApply, evidenceStrength, urgency, amountGuidanceStatus, targetContextStatus, missing evidence as sanitized tokens, counts, blockedReason, actionFingerprint, and evidenceHash.

The sanitization (`telemetrySafeToken`) strips entity names, raw IDs, and free-form text, normalizing everything to lowercase alphanumeric tokens. This is the right discipline: the telemetry payload is structured for aggregate metrics without leaking account-identifying values.

The telemetry object is attached to the instruction but not yet exported to a metrics sink. Phase 7's task is to wire the export path.

---

## 3. Product Charter Test: Current State

**"If a strong Meta media buyer opened this product today, would they trust the recommendations enough to act on them immediately?"**

**For Meta ad set budget moves: closer to yes.** The instruction now provides direction, a bounded estimate, the target ad set name, why the recommendation was made, and what to verify before executing. A media buyer can evaluate "Increase budget: [ad set name] — Review +10-20% band: $550–$600/day" and decide whether to act. They still need to verify pacing and bid pressure in Meta Ads Manager, but the system has done the classification and bounded the estimate.

**For Creative scale actions: significantly better, not yet complete.** The preferred ad set appears as `targetContext.label: "Target ad set: [name] · [campaign]"`. This is visible and correct. However, `primaryMove` still says "Scale [creative name], but do not invent a budget or bid amount." The action sentence itself does not say "Add [creative name] to [ad set name]." The operator reads the target in a context field and the action in a different field. A fully integrated instruction would merge these: "Add [creative name] to [ad set name] as a new ad." That merge has not happened yet.

**For watch, investigate, and protect instructions: fully legible.** The `primaryMove` sentence, `nextObservation`, and `invalidActions` together give the operator a clear and complete non-action instruction. These are ready.

---

## 4. What Remains Open

### Gap 1: `primaryMove` for Creative scale does not integrate the target ad set

`creativeTargetContext` correctly surfaces the preferred ad set. The `primaryMove` field still says "Scale [creative name], but do not invent a budget or bid amount." The two pieces of information — what to do and where to do it — are in separate fields. The instruction is not yet a single readable sentence.

The fix: when `targetContext.status === "available"` and `targetContext.targetScope === "adset"`, compose `primaryMove` as "Add [creative name] to [targetContext.targetEntity] as a new ad." This is a compositing change in `defaultPrimaryMove`.

### Gap 2: Budget band rationale is implicit

The 10-20% band is a fixed percentage. The instruction correctly states the assumptions (no pacing, no utilization). But it does not explain why 10% is the floor for this specific ad set, or why 20% is the ceiling. For a cost-cap account, a 15% budget increase that breaks the cost cap's delivery tolerance is not safe. For a lowest-cost account with under-pacing, 20% may be conservative.

The band is labeled "review-required" which is the right label. But an expert instruction would say: "This is a conservative reference band based on current daily budget only. Verify against your bid control type and pacing before committing." That context is partially in the assumptions list but is not in the operator-facing label where it would be most useful.

### Gap 3: HOLD bucket conflation persists

The `investigate` segment + `blocked` state (campaign compatibility conflict) still routes to `needs_truth`/HOLD. This has been present since Phase 4 and has survived Phases 5 and 6. The per-creative instruction correctly warns "Do not blame the creative before the limiting campaign or ad set context is reviewed." But the HOLD bucket label still implies an Adsecute configuration gap, not a Meta campaign structure problem.

### Gap 4: Cross-creative sequencing

Two scale_ready creatives targeting the same ad set still produce parallel "Scale: [name]" instructions with no sequencing guidance. Urgency derivation now differentiates between them if their evidenceStrength differs, but if both are high-urgency, the operator still has no system guidance on which to move first.

### Gap 5: Dead code in `resolveSegment`

The inner `hasRoasOnlyPositiveSignal` check inside the `isUnderSampled` block in `lib/creative-operator-policy.ts` is permanently unreachable. This has been flagged in every review from Phase 4 onward.

---

## 5. Process: PR Flow Still Bypassed

Phase 5 hardening (`45d33d2`) and Phase 6 (`2b49a2d`) were committed directly to main. The last PR merge commit is `6dc182f` (PR #22, Phase 4). The Phase 6 final report mentions PR #27 but this PR is not reflected as a merge commit in the git log. Phase 6 was validated (291 files / 1977 tests, TypeScript clean, runtime smoke passed) but without the branch → PR → CI → merge audit trail that Phase 4 used.

Phase 7 should reestablish that pattern. A direct push to main is acceptable for documentation or review files. It is not acceptable for code that changes policy, instruction, or push-eligibility behavior.

---

## 6. Test and Build Status

- Full suite: **291 files / 1977 tests — PASS**
- TypeScript: **PASS**
- Working tree: **clean**

---

## 7. Summary and Phase 7 Priorities

Phase 6 is the most productive phase since Phase 4. The bounded budget bands, Creative target context, and derived urgency reasons together make the product substantially more actionable for the cases operators hit most often.

**Phase 7 priorities, in order:**

1. **Integrate `targetContext.targetEntity` into `primaryMove` for Creative scale.** "Add [creative name] to [ad set name] as a new ad" completes the Creative scale instruction without any new data.

2. **Wire the telemetry export path.** The telemetry is built; it needs a sink. This is the Phase 7 acceptance criterion that gates meaningful production feedback.

3. **Fix HOLD bucket routing.** `investigate` + `blocked` (from campaign structure conflict) should not land in the HOLD bucket. Route it to a visible investigate state.

4. **Reestablish PR flow for code changes.** Documentation commits to main are fine. Policy, instruction, and execution changes belong in a feature branch with CI.

5. **Remove dead code in `resolveSegment`.** It has survived five phases. Every future phase that extends the policy risks treating it as load-bearing.
