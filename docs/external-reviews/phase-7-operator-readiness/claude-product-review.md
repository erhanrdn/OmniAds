# Phase 7 Product Review — Operator Readiness and Telemetry Hardening

Reviewer: Claude Code (product-strategy and media buyer logic reviewer)
Date: 2026-04-22
Charter: `docs/external-reviews/PRODUCT_REVIEW_CHARTER.md`
Commit reviewed: `ba705ea`

---

## Verdict: ON TRACK

Phase 7 closes the last major instruction-text gap and delivers a complete telemetry event structure. The Creative scale instruction now reads "Scale [creative name] into [preferred ad set name]." — a complete, executable action sentence for the first time. The telemetry event is built, normalized, and gated safely. The `hold_monitor` disambiguation reduces per-row label confusion.

The product now passes the expert operator test for the two most common daily actions:

- **Meta ad set budget increase**: direction + bounded band + target ad set name + why + what not to do. Executable.
- **Creative scale**: "Scale [creative name] into [preferred ad set name]" + target context status + urgency reason + invalid actions. Executable pending operator review of the specific ad set state.

Remaining open items are now primarily production infrastructure (telemetry sink, performance), one persistent label routing issue (HOLD bucket), and the long-standing dead code in `resolveSegment`. Phase 8 is correctly scoped as account-push canary preparation, not more instruction work.

There is a continuing process concern: Phase 7, like Phases 5 and 6, was pushed directly to main without a PR merge commit. The Phase 7 report explicitly notes "PR: pending at report creation time." This should be resolved before Phase 8 begins.

---

## 1. The Most Important Improvement: Creative Scale primaryMove Is Now Complete

Before Phase 7, `primaryMove` for a Creative scale instruction said:

> "Scale Travel Hook Winner, but do not invent a budget or bid amount."

After Phase 7, `buildDoNowPrimaryMove` composes:

> "Scale Travel Hook Winner into Prospecting Winners Ad Set."

The logic is correct: `isScaleActionLabel` gates this to scale/promote/increase-budget actions. `sameOperatorTarget` prevents redundancy when the creative name and ad set name are identical. `targetContext.status === "available"` and `targetContext.targetScope === "adset"` are required — if unavailable or review-required, the instruction falls back to "Scale [creative name], but review target placement first; [label]."

This closes the gap that has been flagged in every review since Phase 4. The Creative scale instruction is now a complete sentence: what to do, what to do it to, and where to do it. The operator no longer needs to find the preferred ad set in a separate section.

---

## 2. Telemetry Event Structure

`OperatorDecisionTelemetryEvent` adds a production-ready event wrapper over the instruction's `telemetry` payload:

- `sourceSurface` is **allowlisted** to `meta_decision_os | creative_decision_os | command_center | unknown` — arbitrary surface label strings from callers cannot leak into the telemetry pipeline.
- `evidenceSource` is **normalized** to `live | demo | snapshot | fallback | unknown` — the same conservative vocabulary as the evidence source safety model.
- `emittedAt` is nullable — the event can be built before a timestamp is known and stamped at emission time.
- stdout emission is **gated** behind `OPERATOR_DECISION_TELEMETRY_STDOUT=1` — the helper is disabled by default.

The aggregate helper (`buildOperatorDecisionTelemetryAggregate`) collects counts by sourceSystem, instructionKind, pushReadiness, amountGuidance, targetContext, and blockedReason. It intentionally excludes `actionFingerprint` and `evidenceHash` from the aggregate payload — those stay in per-event records for audit, not in aggregate rollup where they could reconstruct entity identity.

**What is still missing:** no production sink. The event is built and normalized. It cannot be observed in production yet. Phase 8 must wire a metrics or log export path before this telemetry delivers production value.

---

## 3. hold_monitor and investigate Label Disambiguation

`creativeActionLabel` now returns "Hold and watch" for `hold_monitor` and "Investigate" for `investigate` segments. Previously, both used fallback paths that produced generic labels.

This is partial progress on the HOLD bucket conflation problem. The per-row label is now more informative. An operator looking at a `hold_monitor` creative sees "Hold and watch" rather than just "HOLD." An operator looking at an `investigate` creative (blocked by campaign context) sees "Investigate" rather than the same "HOLD" label.

The top-level filter bucket routing is not changed. `resolveCreativeAuthorityState` still sends `investigate` segment + `blocked` state to `needs_truth` / HOLD filter bucket. Both a "Hold: verify" (missing truth) creative and an "Investigate" (campaign structure conflict) creative still land in the same HOLD quick filter. At the filter level, the operator still cannot distinguish them without opening individual cards.

Phase 8 should complete this fix: add a dedicated filter bucket for `investigate`-state creatives, or at minimum reroute `investigate` + `blocked` (from campaign conflict, not truth) to a watch/investigate bucket rather than HOLD.

---

## 4. Performance Fix

Creative quick-filter bucketing changed from O(n × k) — scanning all creatives once per filter key — to O(n + k): one pass over all creatives building a map, then one lookup per filter key. For large Creative Decision OS responses, this eliminates repeated full scans. Small but correct. No product behavior change.

---

## 5. Full Expert Operator Test: Current State

Running the charter test against the current product:

**Meta ad set budget move (scale_budget with daily budget available):**
- WHAT: "Increase budget" ✓
- WHERE: ad set name ✓ (in `targetEntity` and instruction headline)
- HOW MUCH: bounded 10-20% band with current daily budget ✓ (status: bounded_estimate)
- WHY NOW: `urgencyReason` derived from evidence strength and push readiness ✓
- WHAT TO WATCH AFTER: `nextObservation` from `whatWouldChangeThisDecision` ✓
- **Verdict: executable, pending operator verification of pacing and bid tolerance.**

**Creative scale (scale_ready with preferredAdSetNames available):**
- WHAT: "Scale" ✓
- WHERE: "Scale [creative name] into [preferred ad set name]." ✓ (now integrated into primaryMove)
- HOW MUCH: "No safe amount calculated" — amount guidance unavailable ✓ (correct; the budget move is at the ad set level, not the creative level)
- WHY NOW: `urgencyReason` derived (strong evidence + queue-ready → high urgency with reason) ✓
- WHAT TO WATCH AFTER: deployment constraints and compatibility reasons in `nextObservation` ✓
- **Verdict: executable pending operator decision on whether to add the creative as a new ad or remove a competing creative first. Cross-creative sequencing remains absent.**

**Watch/investigate/protect instructions:**
- Fully legible and correctly non-actionable. `primaryMove` is specific. `invalidActions` guards are present. ✓

**Creative scale without preferred ad set (targetContext unavailable):**
- "Scale [creative name], but review target placement first; target ad set unavailable." ✓
- Honest, non-executable, and says why.

---

## 6. What Remains Open

### Gap 1: HOLD bucket top-level routing (per-row labels improved, filter routing unchanged)

The per-row label distinction (Hold and watch vs. Investigate vs. Blocked review) is now correct. The top-level filter bucket still groups them under HOLD. An operator filtering to HOLD sees: truth-missing creatives, preview-degraded creatives, campaign-structure-blocked creatives, and `hold_monitor` creatives in the same bucket.

The fix is one routing change in `resolveCreativeAuthorityState`: when `segment === "investigate"` and the first blocker is a deployment/campaign constraint (not a truth or preview constraint), route to `watch` or a new `investigate` authority state rather than `needs_truth`.

### Gap 2: No production telemetry sink

The telemetry event is built. It is not flowing anywhere in production. `emitOperatorDecisionTelemetryEvent` logs to stdout only when `OPERATOR_DECISION_TELEMETRY_STDOUT=1` is set. Until a metrics or log sink exists, it is impossible to know the production distribution of instructionKind, blocked reasons, targetContextStatus, or amountGuidanceStatus. Phase 8's primary obligation is wiring this.

### Gap 3: Budget band does not account for bid strategy type

The 10-20% Meta budget band for `scale_budget`/`reduce_budget` is computed from current daily budget only. No bid strategy context is used. For a cost-cap ad set, a budget increase without a corresponding check on whether the cost cap is binding may produce no delivery improvement (the cost cap constrains delivery, not the budget). For a lowest-cost ad set, the same increase is likely to produce proportional spend.

The assumptions list correctly notes "No budget utilization or pacing ratio is available." But it does not mention bid strategy type at all. An operator following the band recommendation on a cost-cap account may be confused when delivery does not respond as expected.

This is a data gap (bid strategy type is available in the policy `bidRegime` field — it is already used for action label selection in `metaActionLabel`), not a missing data problem. Phase 8 should either: (a) include bid regime in the amount guidance assumptions text, or (b) produce different band advice for cost-cap vs. lowest-cost.

### Gap 4: Cross-creative sequencing still absent

Two `scale_ready` creatives targeting the same ad set still produce parallel "Scale A into Ad Set X" and "Scale B into Ad Set X" instructions. The operator has to determine which to execute first without system guidance.

### Gap 5: Dead code in `resolveSegment` persists

The inner `hasRoasOnlyPositiveSignal` check inside the `isUnderSampled` block in `lib/creative-operator-policy.ts` has been unreachable since Phase 4 and flagged in every review. It is a cleanup item with no product consequence — until Phase 8 extends the policy and someone misreads the dead branch as intentional.

### Gap 6: PR flow has not been restored

Phase 5 hardening, Phase 6, and Phase 7 were all pushed directly to main. The Phase 7 report explicitly states "PR: pending at report creation time." The commit reached main anyway. Phase 8 involves account-push canary preparation — the highest-stakes code in the product. That phase must not bypass the PR → CI → merge flow.

---

## 7. Test and Build Status

- Full suite: **292 files / 1984 tests — PASS**
- TypeScript: **PASS**
- Working tree: **clean**

---

## 8. Summary

Phase 7 completes the instruction layer. The Creative scale sentence is now fully integrated. The telemetry event is production-normalized. The hold_monitor label is disambiguated.

The product is ready for Phase 8 — but Phase 8 is a different kind of work. Phases 4–7 built the instruction layer. Phase 8 builds the infrastructure to use it safely in production: telemetry sink, preview/apply compact lookup, connected-account monitoring, and the canary rollout plan. The product scope is right. The process discipline must improve before Phase 8 reaches main.
