# Phase 5 Product Review — Operator Prescription Layer

Reviewer: Claude Code (product-strategy and media buyer logic reviewer)
Date: 2026-04-22
Charter: `docs/external-reviews/PRODUCT_REVIEW_CHARTER.md`
Phase: Operator Prescription Layer

---

## Verdict: ON TRACK WITH RISKS

Phase 5 closes the most visible product gap from Phase 4: the system now speaks in operator sentences, not just classification labels. The prescription layer is architecturally correct and the "do not invent a budget or bid amount" constraint is exactly the right discipline for this stage.

The remaining gap is precisely defined. The system can now tell an operator WHAT class of action to take and WHAT NOT to do. It still cannot tell them HOW MUCH or WHERE SPECIFICALLY. Those two missing answers are the difference between "I understand the recommendation" and "I can act on it right now."

---

## 1. What Phase 5 Actually Advances

**From label to sentence.** The most important change. Before Phase 5, a `scale_ready` creative produced: segment=`scale_ready`, state=`do_now`, pushReadiness=`safe_to_queue`. After Phase 5 it produces: `headline: "Scale: Travel Hook Winner"`, `primaryMove: "Scale Travel Hook Winner, but do not invent a budget or bid amount."`, `reasonSummary`, `nextObservation`, `invalidActions`.

This is a real improvement. A media buyer opening the product now reads a sentence that tells them what the system intends, rather than having to decode a segment label into a verb.

**The "do not invent" constraint is the right call.** `amountGuidance.status = "unavailable"` for all scale/budget actions, with the explicit label "No safe amount calculated" and reason "The deterministic policy authorizes the class of work, but this layer does not calculate a safe budget or bid amount." This is correct product discipline: the system is honest about where its authority ends rather than guessing. The invalid actions list reinforces this: "Do not invent a budget, bid, or spend amount."

**Invalid actions are a meaningful new operator guardrail.** The Creative prescription now includes:
- "Do not blame the creative before the limiting campaign or ad set context is reviewed." (when campaign context is limited)
- "Do not scale from ROAS alone." (for `false_winner_low_evidence`)
- "Do not kill a protected winner because of short-term volatility."

These are real media buyer guardrails expressed as explicit constraints, not implicit consequences of classification.

**`nextObservation` pulls real context.** For Creative rows this includes deployment constraints, compatibility reasons, fatigue missing context, and benchmark missing context. For Meta rows it includes `whatWouldChangeThisDecision`, guardrails, and missing creative asks. The operator now sees "what to watch after" grounded in actual decision signals, not generic text.

**Command Center now leads with the instruction.** The action sheet header shows `operatorInstruction.headline` and the primary content shows `operatorInstruction.primaryMove`. The "why now" and "how much" cards are visible before the operator reaches the technical evidence detail. Information hierarchy has improved.

---

## 2. What Phase 5 Does Not Close

### Gap 1: Amount guidance is honest but still empty

`amountGuidance.status = "unavailable"` for every scale, budget, and bid action. The system correctly refuses to invent a number. But for a media buyer making a scale decision, "no safe amount" means the instruction is still not executable without their own analysis.

A media buyer reading "Scale Travel Hook Winner, but do not invent a budget or bid amount" still has to determine: how much budget to move, whether to move it to the preferred ad set or a new one, and whether to adjust the ad set budget or add the creative as a new ad. The prescription narrows the decision class but does not resolve the decision.

This is the single biggest remaining gap between the current system and an expert operator system. Phase 6 must include at least a bounded estimate range for budget moves — even a conservative floor/ceiling derived from the ad set's current daily budget — to move past this.

### Gap 2: Target specificity stops at the creative name

`targetEntity` in the Creative prescription is the creative name. `primaryMove` says "Scale [creative name]" — not "Add [creative name] to [preferred ad set name] as a new ad."

The preferred ad set data exists in the Creative Decision OS (`preferredAdSetNames`, `preferredAdSetIds`). It is not threaded into the prescription's `targetEntity` or `primaryMove`. The operator still has to find the preferred ad set in the deployment metadata section, which is below the prescription card in the UI.

The fix is straightforward: if `preferredAdSetNames[0]` is available, `primaryMove` should say "Add [creative name] to [ad set name], but do not invent a budget amount." That one change makes the scale instruction executable instead of partial.

### Gap 3: Cross-creative sequencing is still absent

If two creatives are both `act_now` pointing to the same ad set, both receive `headline: "Scale: [name]"` with `urgency: "high"`. The operator sees two parallel scale instructions with no sequencing guidance.

Standard media buying discipline: concentrate budget on one winner in a given ad set before introducing a second. The system produces two actionable instructions where a real media buyer would produce one instruction and one "next in line" note.

### Gap 4: Urgency is defaulted from instruction kind, not derived from signals

`defaultUrgency` assigns `"high"` to all `do_now` instructions, `"medium"` to `blocked` and `investigate`, `"watch"` to `watch`, and `"low"` to everything else. This is a uniform assignment from the instruction class, not a genuine urgency signal.

A `do_now` creative that has been scale_ready for 7 days with frequency climbing toward 4.0 is more urgent than a `do_now` creative that entered scale_ready 6 hours ago at frequency 1.2. Both get `urgency: "high"`. The system cannot yet tell the operator which of two `high`-urgency items to act on first.

### Gap 5: HOLD bucket conflation is still present

The `investigate` segment + `blocked` state (from campaign compatibility conflict) still routes to `needs_truth`/HOLD at the surface level. A creative that is strong on its own evidence but limited by its campaign context lands in the HOLD bucket with "Creatives held back by truth, preview, deployment, or stop-level constraints." The operator reads "HOLD" and checks their Adsecute configuration rather than their Meta campaign structure.

Phase 5 added a specific `invalidAction`: "Do not blame the creative before the limiting campaign or ad set context is reviewed." That is the right message. But it appears inside the instruction card while the bucket label above still says "HOLD." The top-level routing contradicts the per-creative instruction.

---

## 3. Meta Side Assessment

The Meta prescription adapter is stronger than the Creative one in one important way: `nextObservation` is populated from `whatWouldChangeThisDecision` and guardrails, which are account-derived signals. The operator reading a Meta instruction sees what would move the decision, not just that the decision was made.

The `instructionPolicyForMetaAuthority` function synthesizes a modified policy object when the authority state overrides the row-level policy state (e.g., a `watch` authority state converts the policy's `state` to `"watch"` even if the canonical policy says something different). This is necessary for the prescription to be consistent with the displayed authority state, but it creates a layer of policy interpretation that is not tested directly. If `authorityState` and `policy.state` diverge in unexpected ways, the instruction could produce a misleading primary move.

The Meta surface action labels have good specificity: "Increase budget," "Reduce budget," "Review cost cap," "Review bid cap," "Pause," "Refresh creative." These are operator verbs, not system labels. This is better than the generic phase equivalents.

---

## 4. Prescription Safety Assessment

**Does the prescription layer weaken any existing safety gates?** No.

`buildOperatorInstruction` is an adapter over existing policy outputs. It reads `policy.queueEligible`, `policy.pushReadiness`, `policy.canApply`, and propagates them into the instruction contract without modifying them. `canApply: false` remains hardcoded for Creative rows via the underlying policy. Non-live evidence still routes to `contextual_only` instruction kind. `blocked_from_push` policy readiness produces `blocked_from_push` in the instruction.

The Command Center recomputes the instruction during `decorateCommandCenterActionsWithThroughput` rather than using the pre-built surface instruction. This means the instruction in the action sheet is always fresh against the current policy, which prevents stale instructions from persisting when policy state changes.

**One watch item:** The Command Center instruction recomputation uses `action.recommendedAction.replaceAll("_", " ")` as the `actionLabel`. This produces labels like "promote to scaling" or "keep in test" rather than the cleaner surface-level labels like "Scale" or "Collect signal" that the creative surface adapter produces. The instruction text seen in the Command Center action sheet uses a different, less polished action label than the one the operator saw on the Creative overview. This is not a safety issue but it is a consistency gap.

---

## 5. Does Phase 5 Pass the Expert Operator Test?

The charter test: "If a strong Meta media buyer opened this product today, would they trust the recommendations enough to act on them immediately, without needing to second-guess the system or do their own analysis first?"

**Closer. Not yet.**

For a **Meta ad set action** (non-budget): a media buyer reading "Pause: [ad set name] — Signal is still too thin for a headline move, so the right call is to wait" with "Do not convert this watch read into a scale, kill, budget, or bid command yet" can understand the intent and decide whether to act. If they agree with the evidence read, the instruction is actionable. The gap is that the system still cannot tell them the exact lever to pull (which bid control to adjust, what value to set).

For a **Creative scale action**: a media buyer reading "Scale: Travel Hook Winner — but do not invent a budget or bid amount" knows the class of action but cannot act without knowing which ad set to add it to and at what spend level. The instruction is necessary but not sufficient.

For a **watch or investigate instruction**: materially improved. "Keep watching [name]; wait for [specific next observation] before scaling" is a real instruction. The operator knows to leave it alone and what to check before reconsidering.

The product has moved from "expert analysis tool" to "expert analysis tool with operator-facing sentences." The next phase needs to move it to "expert operator tool" by completing the instruction with execution specifics.

---

## 6. What Must Change Before Phase 6

**Priority 1: Add preferred ad set name to Creative scale prescriptions.**

When `creative.deployment.preferredAdSetNames` and `preferredAdSetIds` are available, surface them in the instruction's `targetEntity` and `primaryMove`. Change "Scale [creative name]" to "Add [creative name] to [preferred ad set name]." This is the single highest-leverage product change available with existing data.

**Priority 2: Fix the HOLD bucket routing for campaign structure conflicts.**

The `investigate` segment + `blocked` state (from deployment compatibility conflict) should route to a distinct bucket, not to `needs_truth`/HOLD. The per-creative instruction already says the right thing. The top-level bucket routing contradicts it.

**Priority 3: Remove dead code in `resolveSegment`.**

The inner `hasRoasOnlyPositiveSignal` check inside the `isUnderSampled` block is permanently unreachable. It has now survived two phase reviews. Phase 6 will extend the policy. Remove it before it causes confusion in that work.

**Priority 4: Align Command Center instruction action labels with surface action labels.**

Command Center uses `recommendedAction.replaceAll("_", " ")` producing "promote to scaling." Creative surface uses "Scale." These should be the same.

---

## 7. What Phase 6 Should Focus On

**A. Bounded budget guidance for Meta scale actions.**

Even a conservative estimate — "ad set current daily budget is $X; a 20–30% increase is within typical scale range" — moves `amountGuidance.status` from `"unavailable"` to `"bounded_estimate"`. This is the only remaining gap that prevents a Meta instruction from being immediately executable.

**B. Observability first, expanded instructions second.**

The Phase 6 handoff correctly identifies telemetry as the Phase 6 priority. Before widening the instruction scope (more Creative details, more Meta edge cases), the system needs to know what prescription states it is actually producing in production: command-ready count, blocked count, contextual-only count, missing evidence distribution. Without this, Phase 7 product decisions will be made blind.

**C. Feature flag fallback before expanding Creative instruction scope.**

Phase 6 should implement the feature flag that can hide prescription sections without disabling deterministic policy before the Creative instruction surface is expanded further. If a prescription is producing poor output for a class of account, the current architecture has no rollback path short of a code deploy.

**Do not:** Enable `canApply: true` for any Creative row. The Phase 6 handoff correctly states the preconditions for this. None of them are met yet.

---

## Summary

Phase 5 is the right phase. It moved the product from classification output to operator language. The prescription contract is well-designed, the safety gates are preserved, and the "do not invent" discipline is exactly right.

The product can now tell a media buyer: WHAT class of action to take, WHY, WHAT NOT TO DO, and WHAT TO WATCH. It still cannot reliably tell them WHERE SPECIFICALLY or HOW MUCH. Closing those two gaps — preferred ad set in Creative scale instructions, and bounded budget guidance for Meta scale actions — would move the product from "operator-legible" to "operator-executable" for the majority of daily decisions.

Phase 6 may start. The safety foundation is sound. The instruction layer exists. The gaps are well-defined.
