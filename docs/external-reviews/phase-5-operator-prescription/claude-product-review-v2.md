# Phase 5 Product Review — Operator Prescription Layer (Post-Hardening)

Reviewer: Claude Code (product-strategy and media buyer logic reviewer)
Date: 2026-04-22
Charter: `docs/external-reviews/PRODUCT_REVIEW_CHARTER.md`
Phase: Phase 5 + Instruction Clarity Hardening (`4063678`)
Prior review: `claude-product-review.md` (written before hardening)

---

## Verdict: ON TRACK WITH RISKS

The hardening commit (`4063678`) closed three of the five gaps flagged in the prior review. The prescription layer is now meaningfully more precise about what it can and cannot do. The product moves one step closer to executable operator instructions, but two critical gaps remain: the instruction still does not name the specific target ad set for Creative scale actions, and the urgency signal is still a fixed default rather than a derived signal.

There is also a process concern: Phase 5 and its hardening were pushed directly to main without a PR. Phase 4 went through PR #20, #21, and #22 with CI gates. Phase 5 bypassed that process. This should be corrected before Phase 6 begins.

---

## What the Hardening Fixed

### Fix 1: Amount warnings now distinguish action types correctly

**Before:** "Do not invent a budget, bid, or spend amount" appeared in `invalidActions` for all `do_now` instructions — including "Pause", "Refresh creative", and "Protect". A media buyer reading "Pause [ad set] — do not invent a budget or bid amount" would be confused by an irrelevant warning.

**After:** `isAmountSensitiveAction` checks `policy.actionClass` first (scale, budget, bid, cost_control, budget_shift) and falls back to action label text matching. Pause, Refresh, Protect, Refresh creative, and similar non-amount instructions now get `amountGuidance.status = "not_applicable"` and label "No amount needed" instead of "No safe amount calculated." The warning only fires where it is relevant.

This is a meaningful UX improvement. The operator reading a Pause instruction no longer sees an amount warning that doesn't apply.

### Fix 2: Command Center queue warnings are now specific

**Before:** Blocked Command Center actions showed a static generic message: "Do not promote this Command Center card into queue work unless policy readiness allows it." This was the same message regardless of whether the block was from missing Creative policy, a policy blocker, contextual-only signal, or final push eligibility.

**After:** `commandCenterInstructionQueueWarnings` generates a specific message from `pushEligibility.blockedReason`, then falls back through a chain of contextual reasons (missing Creative policy → policy blocker text → contextual-only signal → final eligibility blocked). The operator now reads why a card cannot be queued, not just that it cannot.

### Fix 3: Command Center instruction push eligibility now reflects final computed eligibility

**Before:** The instruction in the Command Center action sheet derived `pushReadiness`, `queueEligible`, and `canApply` from the raw policy object. The Command Center's own `buildCommandCenterActionPushEligibility` function applies additional gates (provenance, fingerprint, surface lane, watchlist-only) that could produce a final eligibility that differs from what the policy says. The instruction could show a policy-derived queue state that differed from the actual Command Center gate.

**After:** `pushReadinessOverride`, `queueEligibleOverride`, and `canApplyOverride` are passed from the computed `pushEligibility` into `buildOperatorInstruction`. The instruction's queue fields now match the Command Center's final eligibility decision, not just the raw policy output. This was a real consistency gap and the fix is correct.

### Fix 4: Meta actions no longer require Creative policy warnings

`requiresPolicyForQueue: input.sourceSystem === "creative"` correctly scopes the "Do not queue or push without deterministic operator policy" warning to Creative rows only. Meta rows have a different eligibility path and the generic policy-required warning was misleading for them.

---

## What Still Remains the Gap

### Gap 1: Creative scale instruction does not name the target ad set

This is the highest-priority remaining product gap.

`primaryMove` for a `scale_ready` creative still says: "Scale [creative name], but do not invent a budget or bid amount."

The Creative Decision OS contains `deployment.preferredAdSetNames` and `deployment.preferredAdSetIds`. These are available when `buildCreativeOperatorItem` calls `buildOperatorInstruction`. They are not passed into the instruction.

A media buyer reading "Scale Travel Hook Winner" still has to open the deployment section to find which ad set to act on. The instruction is one field away from being actionable: "Add Travel Hook Winner to [preferred ad set name]" would complete it.

The `targetEntity` field is the creative name. `parentEntity` is the family label. Neither points to the execution target — the ad set. Until that changes, the Creative scale instruction authorizes the action class without specifying the action target.

### Gap 2: Urgency is a fixed default, not a derived signal

`defaultUrgency` assigns:
- `do_now` → `"high"`
- `blocked`, `investigate` → `"medium"`
- `watch` → `"watch"`
- all others → `"low"`

Every `do_now` Creative or Meta action gets `urgency: "high"`. There is no differentiation based on account signals. A Creative that has been scale_ready for 8 days with frequency climbing toward 4.0 and a winner about to fatigue is not distinguished from a Creative that entered scale_ready 12 hours ago at frequency 1.1.

When an operator has 4 high-urgency Creative scale instructions, they have no signal from the system about which to act on first. They must do their own frequency, spend, and timing analysis. This is the precise analysis the system should be replacing.

### Gap 3: HOLD bucket conflation is still present

`investigate` segment + `blocked` state (campaign compatibility conflict) still routes to `needs_truth`/HOLD at the surface level. The per-creative instruction correctly says "Do not blame the creative before the limiting campaign or ad set context is reviewed." But the HOLD bucket label above it implies a configuration problem in Adsecute, not a campaign structure problem in Meta.

This has been present since Phase 4. Neither Phase 5 nor the hardening addressed it. Phase 6 work on cross-page consistency should address this directly.

### Gap 4: Cross-creative sequencing is still absent

Two `scale_ready` creatives pointing to the same ad set both receive `urgency: "high"` and `instructionKind: "do_now"`. There is no "scale A first, B is next in line" logic. The operator must determine the sequencing without guidance.

### Gap 5: Dead code in `resolveSegment` persists

The inner `hasRoasOnlyPositiveSignal` check inside the `isUnderSampled` block in `lib/creative-operator-policy.ts` is permanently unreachable. This has appeared in every review since Phase 4. It is a cleanup item, but every phase that extends the policy makes it more likely this stale branch is misread as load-bearing logic.

---

## Process Concern: Phase 5 Bypassed PR Flow

Phase 4 went through PR #20 (base), PR #21 (initial hardening), and PR #22 (provenance guard) — all with merge commits and CI gates. Phase 5 (`1496c26` and `4063678`) was pushed directly to main without a PR.

The CLAUDE_REVIEW_CHARTER.md states: "Main should contain Phase N only after the branch is merged through a normal PR with passing checks and no unresolved correctness blockers."

Phase 5 was validated (291 files / 1967 tests pass, TypeScript clean, build passes). But the PR process provides an independent audit trail and a point at which the review can surface issues before they reach main. That audit trail is missing for Phase 5.

Phase 6 should reestablish the PR-per-phase pattern.

---

## Decision Quality Assessment: Current State

Running the charter's media buyer checklist against the current product:

**Are recommendations specific enough to act on?**
Partially. Meta actions: yes for direction, no for amount. Creative actions: yes for direction, no for amount or target ad set.

**Is ROAS treated with appropriate skepticism?**
Yes. `false_winner_low_evidence`, evidence floors, and "Do not scale from ROAS alone" in invalidActions are all correct.

**Does the system distinguish creative/delivery/bid/budget problems?**
Better. Meta instructions now include bid-regime-aware action labels (Review cost cap, Review bid cap, Review target ROAS). Creative instructions distinguish scale/test/refresh/protect/hold buckets. Creative invalids note when campaign context is the problem, not the creative.

**Does it respect frequency as a signal?**
No. Frequency is still absent from the scale evidence floor and from urgency derivation.

**Does it protect proven winners?**
Yes. `do_not_touch` → protected_winner path remains sound. Invalid action "Do not kill a protected winner because of short-term volatility" is present.

**Does "scale" come with enough context to know WHERE?**
Still no. Preferred ad set is not in the instruction.

**Does "kill/refresh" come with enough context to know what specifically to do?**
Partially. The action label names the work (Kill review, Refresh). The instruction says what not to do. It does not say what specifically replaces the creative.

---

## What Phase 6 Should Do

**Immediate product priority:** Thread `deployment.preferredAdSetNames[0]` into the Creative scale instruction. Change `primaryMove` to "Add [creative name] to [preferred ad set name]." This is one field change in `buildCreativeOperatorItem` and is the highest-leverage product improvement available with existing data.

**Fix HOLD bucket routing.** Route `investigate` + `blocked` (from compatibility conflict) to a distinct "investigate" bucket at the surface level, not to HOLD.

**Add minimum observability before expanding.** Phase 6 handoff correctly identifies telemetry as the priority: instructionKind distribution, pushReadiness distribution, missingEvidence counts. Do not expand the instruction scope without knowing what the system is actually producing in production.

**Establish PR flow for Phase 6.** Each phase should go through a feature branch and PR before reaching main.

**Do not:** Enable `canApply: true` for any Creative or Meta row. Do not attempt budget/bid amount calculation without a bounded, tested, deterministic source.

---

## Test and Build Status

- Full suite: **291 files / 1967 tests — PASS**
- TypeScript: **PASS**
- Working tree: **clean**

13 new tests added in hardening commit covering: amount-sensitivity detection for bid/cost-control, absence of amount warnings for pause/refresh/protect/watch instructions, absence of false queue warnings for eligible Meta cards, clean safe-to-queue Creative cards.

---

## Summary

The product is advancing in the right direction. The prescription layer exists. The instruction clarity hardening removed false warnings and fixed the Command Center push eligibility consistency gap. The safety foundation from Phase 4 is intact.

The two gaps that remain before an operator can truly act without supplemental analysis: the Creative scale instruction does not name the ad set, and urgency is not derived from account signals. Both are solvable with existing data. Both should be Phase 6 priorities before any new surface expansion.
