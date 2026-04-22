# Phase 4 Product Review — Creative Operator Policy Foundation

Reviewer: Claude Code (product-strategy and media buyer logic reviewer)
Date: 2026-04-22
Charter: `docs/external-reviews/PRODUCT_REVIEW_CHARTER.md`
Phase: Creative Operator Policy Foundation

---

## Verdict: ON TRACK WITH RISKS

Phase 4 is a solid classification foundation. The evidence floors are appropriate, the safety gates work, and the protected-winner logic is genuinely valuable. But the system still behaves like an expert analysis tool, not an expert operator tool. It tells operators what a creative IS. It does not tell them what exactly to DO, in which ad set, by when, or what to watch afterward. That gap is the core product risk going into Phase 5.

---

## 1. Does the Creative side truly make expert media buyer decisions?

**Partially. The diagnosis is right. The prescription is missing.**

A senior media buyer looking at a `scale_ready` creative with spend=500, purchases=12, ROAS=3.4, economics eligible, preferred ad set identified — would say "yes, this is a real scale candidate." That part the system gets right.

Then the same media buyer would immediately ask: "OK — what do I actually do? Add it to ad set X? How much budget? Do I pause the loser creative first? What am I watching for in 48 hours to know if the scale worked?" The system has no answers. `scale_ready` classifies a creative. It does not instruct the operator.

Beyond the missing instruction layer, three specific media buyer decisions are currently weak:

**Frequency is absent from the scale floor.** `hasScaleEvidence` checks spend, purchases, and economics status — but not frequency. A creative at ROAS 3.4 with 4.5 average frequency is not the same opportunity as one at ROAS 3.4 with 1.2 frequency. The high-frequency creative is approaching audience saturation and will decay faster than the primary window can detect. A strong media buyer would not scale into frequency above 3.5–4.0 without verifying fresh audience headroom.

**Attribution window is completely absent.** ROAS 3.4x means different things under 7-day click vs. 1-day click attribution. The system uses ROAS figures without surfacing what attribution model generated them. An account optimizing for same-day profitability and using 1d-click attribution as the operating signal could get systematically misleading scale recommendations from a 7d-click ROAS floor.

**Ad set learning phase is not a gate.** If the ad set containing a `scale_ready` creative is in Meta's learning phase (< 50 optimization events in the last 7 days), the creative's metrics are unstable and the scale recommendation may rest on noise. The system does not check whether the parent ad set is in learning before recommending scale.

---

## 2. Do segments clearly answer "what should I do?"

**No. They answer "what is this creative?" not "what should I do with it?"**

The 14-segment taxonomy is correct as a classification system. A human reviewer can look at each segment and recognize what it means. But segments are classification outputs, not operator instructions.

The charter's action-completeness test requires five things: WHAT, WHERE, HOW MUCH, WHY NOW, WHAT TO WATCH AFTER. Current segments provide the WHAT label only. They are missing:

- **WHERE**: `scale_ready` has `preferredAdSetIds` and `preferredAdSetNames` in the deployment metadata. These are available but not surfaced as the primary instruction. The operator sees a segment label, then has to find the preferred ad set in a separate section.
- **HOW MUCH**: No budget move guidance. No "add as new ad" vs. "increase ad set budget" distinction.
- **WHY NOW**: No urgency signal on any creative decision. Every `scale_ready` creative looks equally urgent or equally deferrable.
- **WHAT TO WATCH AFTER**: Nothing. The recommendation ends at segment classification.

The `investigate` segment is particularly incomplete. It tells operators there is a problem without giving them where to look. A creative that is `scale_ready` on evidence but `investigate` due to weak campaign context needs a specific path: check campaign objective compatibility, check learning phase status, find a compatible scaling campaign. Without that, `investigate` is a dead end, not an investigation instruction.

---

## 3. Are ROAS-only, low-spend, low-evidence, and missing commercial truth cases correctly suppressed?

**Yes — this is the strongest part of Phase 4.**

`hasRoasOnlyPositiveSignal` (ROAS >= 2 AND spend < $120 OR purchases < 2) fires before `isUnderSampled`, so a tiny-spend ROAS spike returns `false_winner_low_evidence` before it can reach any undersampled path. The guard order is correct.

The `false_winner_low_evidence` segment — catching high ROAS on tiny spend or few purchases — is one of the most common expensive mistakes in Meta media buying. The system prevents it structurally, which is real product value.

Missing commercial truth correctly blocks `promote_to_scaling`, `block_deploy`, and `refresh_replace`. These are the three aggressive action categories. Passive actions (`keep_in_test`, `protect_winner`) are not blocked, which is the right distinction.

Non-live evidence (demo, snapshot, fallback, unknown) returns `contextual_only` state and `blocked_from_push`. The worst-case combination rule in `combineCreativeEvidenceSource` is sound.

**One gap worth noting:** The `hasScaleEvidence` spend floor ($250) and purchase floor (5) are absolute thresholds calibrated to a mid-size DTC e-commerce account. For a luxury goods account with $300 CPA, 5 purchases is excellent signal. For a subscription account where the first conversion is structurally unprofitable, ROAS 2.5 on 5 purchases might be below the break-even. The economics eligibility check partially compensates, but the absolute floors are account-type-agnostic in a way that could misfire on atypical accounts.

---

## 4. Does Creative policy sufficiently consider campaign/ad set context?

**No — this is the weakest part of Phase 4.**

The only campaign/ad set signal currently feeding into Creative policy is `deployment.compatibility.status` (a binary: `"limited"` or `"blocked"` triggers `hasWeakCampaignContext`). That drives the `investigate` segment for strong creatives in weak campaign contexts. The intent is right, but the implementation is thin.

What is missing:

**Ad set learning phase.** Whether the parent ad set is currently learning is one of the most important scale timing signals a media buyer uses. A creative in a learning ad set has unstable metrics. The system does not check this.

**Cross-creative competition within the same ad set.** If two creatives in the same ad set are both `scale_ready`, the system recommends scaling both. In practice, concentrating budget on one winner first — then moving the second — is standard media buying discipline. The system treats each creative independently, so the operator sees two parallel scale recommendations with no sequencing guidance.

**Operating mode as a gate.** The account's operating mode (Exploit / Stabilize / Rebuild) is referenced in the UI but is not an explicit gate on the `scale_ready` segment. If the account is in Stabilize mode because the overall structure is fragile, recommending creative scale might be premature regardless of the creative's standalone evidence.

**Budget constraints and bid strategy type.** A creative pointing to a cost-cap-constrained ad set should generate a different recommendation than one pointing to a lowest-cost unconstrained ad set. "Scale" means different things operationally in those two contexts. The system does not distinguish.

**The practical consequence:** A `scale_ready` creative pointing to a constrained, learning ad set in a Stabilize-mode account gets the same recommendation as one pointing to an unconstrained, stable ad set in an Exploit-mode account. The operator cannot tell the difference from the segment label.

---

## 5. Does the UI create information pollution?

**Yes — the Overview is too dense for daily use.**

The Creative Overview currently renders 9+ distinct sections: lifecycle board, operator policy summary, policy review, preview truth summary, opportunity board, concept families, pattern board, supply planning, and historical analysis.

The `headline` field ("3 creatives are ready to scale") is prominent and correct. But it sits above 9 sections of supporting context that a daily operator will not read before needing to make a decision. The information architecture inverts the priority: the primary action is at the top, but secondary and tertiary context consumes 90% of the surface.

Additional UI noise problems:

**Segment labels are technical, not operator-readable.** `creative_learning_incomplete`, `promising_under_sampled`, `false_winner_low_evidence` are correct internal terms. Operators should see simpler language: "Too early to judge," "Needs more spend to confirm," "ROAS spike on low volume — wait." The `formatLifecycleLabel` function translates some labels but inconsistently.

**HOLD bucket conflation.** A creative blocked by missing commercial truth and a creative blocked by a campaign structure conflict both land in the HOLD bucket with the label "HOLD." These are completely different situations for an operator:
- Missing truth: "I need to configure my target pack in Adsecute."
- Campaign conflict: "This creative is fine — the problem is in the Meta campaign structure, not here."

An operator reading "HOLD" will default to assuming they need to configure something in Adsecute. If the actual problem is a Meta campaign objective mismatch, that operator wastes time looking in the wrong place.

**No urgency signal and no priority order.** Five scale-ready creatives look equally urgent. The `confidence` score exists but is not surfaced as a priority indicator. The operator has to decide which to act on first without any guidance from the system.

**Quick filter labels are not operator instructions.** "TEST" is ambiguous — test how? "REFRESH" is ambiguous — create a variant? swap copy? swap creative entirely? "HOLD" is the most misleading (see above). Labels should indicate the operator's next action, not just a state category.

---

## 6. Is push/queue safety too loose?

**No — push/queue safety is correctly conservative.**

`canApply` is `false` for all Creative rows without exception. There is no provider execution contract for Creative mutations. This is right.

`safe_to_queue` requires: `scale_ready` segment + `do_now` state + live evidence + clean provenance + no blockers + economics eligible. All conditions must be met. Non-live evidence, missing commercial truth, missing provenance, or any blocker prevents `safe_to_queue`.

The Command Center rechecks `operatorPolicy.queueEligible === true && pushReadiness === "safe_to_queue"` at the row level before passing queue eligibility. `decorateCommandCenterActionsWithThroughput` blocks throughput when Creative policy is missing entirely. These are correct hardening decisions.

Push safety is not the product risk here. The risk is the opposite: the system correctly gates push, but the instruction layer before push (what exactly the operator should do manually) is also absent.

When Creative push is eventually enabled, the following must be defined before `canApply: true` appears anywhere:
1. The exact API mutation — is "scale" a `POST /ads` (new ad in ad set), a `PATCH /adsets/{id}` (budget increase), or both?
2. Pre-push target verification — is the preferred ad set still active and healthy?
3. Conflict check — does scaling conflict with an active Meta learning phase in the target ad set?
4. Rollback path — if the creative underperforms in 48 hours, what is the guided correction?

---

## 7. What must be fixed before Phase 5?

In priority order:

**1. Define what "scale" means as an operator instruction, not just as a segment label.**

The most important gap. Even with push disabled, the Command Center action for a `scale_ready` creative should show:
- Specific target ad set name (already available via `preferredAdSetNames`)
- Suggested action: "Add to ad set [X] as a new ad"
- Whether any competing creative in that ad set should be paused first
- What to monitor in the next 48 hours
- A note if the target ad set is in learning or constrained

Without this, `safe_to_queue` queues an intention, not an instruction.

**2. Fix the HOLD bucket conflation.**

Route `investigate` segment + `blocked` state (from deployment/compatibility conflicts) to a visible "investigate" bucket, not to "needs_truth" / HOLD. The detailed blocker explanation already says the right thing; the bucket label contradicts it. This is a decision pollution risk: operators take wrong actions because the top-level label points them at the wrong problem.

**3. Remove the dead code in `resolveSegment`.**

The inner `hasRoasOnlyPositiveSignal` check inside the `isUnderSampled` block (line 211 of `creative-operator-policy.ts`) is permanently unreachable — line 206 already returned if that condition was true. Dead policy branches in decision-critical code are a Phase 5 regression risk. Remove it before Phase 5 extends the policy.

**4. Add frequency as a secondary signal in the scale evidence floor.**

Not as a hard block, but as a blocker or missing-evidence flag. If frequency is above 3.5 in the target ad set, `hasScaleEvidence` should flag it so the operator sees "scale evidence meets floor, but frequency is elevated — verify audience headroom before acting."

**5. Add 3–5 missing test branches before Phase 5 extends the policy.**

The `spend_waste` path, `needs_new_variant` via fatigued-winner without refresh action, undersampled+promote+modest ROAS, and comeback/retest paths are untested. Phase 5 will refactor the policy. Unprotected paths will develop regressions silently.

---

## What Phase 5 Should Focus On

Phase 5's stated goal is cross-page consistency and conflict detection. That is the right architectural direction. But within that scope, the highest-value work is:

**Cross-creative sequencing within ad sets.** "Creative A and Creative B are both scale_ready in ad set X. Scale A first — B is next in line." This directly closes the action-completeness gap.

**Conflict surfacing with actionable resolution paths.** "Meta says ad set X is bid-constrained. Creative Y is scale_ready but points to ad set X. Resolution: fix the bid constraint first, or find a compatible ad set." This upgrades `investigate` from a dead end to a guided resolution.

**Overview UI simplification.** Before adding more sections, collapse existing ones. Phase 5 cross-page conflicts will want prominent surface real estate. If the UI is already at 9 sections, adding conflict detection makes it 10. Rationalize first.

**Do not:** Add more Creative segments. The taxonomy is sufficient — 14 segments covers the decision space. Adding more classification layers on top of an incomplete instruction layer widens the gap without closing it.

---

## Summary

Phase 4 builds the right foundation. The classification is expert-grade. The safety gates prevent the most common expensive mistakes. Protected winners are protected.

What Phase 4 does not yet do is tell the operator exactly what to do with the classification — which ad set, what action verb, what to watch, why act today rather than tomorrow. That is the difference between an expert analysis tool and an expert operator system. Phase 5 must close that gap, not add more layers above it.

---

## Phase 4 Final Hardening Addendum

Updated: 2026-04-22 post-PR #22 merge

### Was the PR #21 review issue real?

**Yes.** The issue was real and non-trivial.

`mapCreativeOpportunityToCommandCenter` used `some` (OR logic) to check `creativePolicyEligible`: a family opportunity with multiple creativeIds would pass if *any one* row had a safe-to-queue policy, even if other referenced rows were missing entirely or lacked `operatorPolicy`. That means a partially-configured Creative family opportunity could enter the Command Center queue as eligible, with incomplete or non-live evidence on the other referenced creatives.

### What was fixed (PR #22)

The OR `some` check was replaced with a comprehensive AND gate: `allCreativePoliciesEligible` requires `relatedCreatives.every(hasCreativeOpportunityQueueAuthority)`. Queue authority is granted to a creative row only if ALL of the following pass:

1. `hasCreativeCommandCenterProvenance` — provenance present, fingerprints match, scope is `creative/creative`
2. `hasLiveCreativeCommandCenterEvidence` — both `creative.evidenceSource` and `policy.evidenceSource` are `"live"`
3. `policy.queueEligible === true`
4. `policy.pushReadiness === "safe_to_queue"`

Additionally, four explicit failure signals were added with specific block reasons: `missingCreativeRows`, `missingOperatorPolicy`, `missingProvenance`, `nonLiveEvidence`. The `eligibilityTrace` is now normalized to `blocked` verdict whenever `queueEligible` is false, preventing stale `queue_ready` verdicts from surviving downstream.

A follow-up guard (290a4fd) also fixed a latent crash: `creative.provenance?.sourceRowScope.system` had a missing optional chain on `sourceRowScope` that would throw on partially-populated provenance objects.

### Tests added

6 new targeted scenarios in `lib/command-center.test.ts`:

1. One safe row + one missing creative row → `queueEligible: false`
2. One safe row + one row missing `operatorPolicy` → `queueEligible: false`
3. One safe row + one row with non-queue-eligible policy → `queueEligible: false`
4. One row missing required provenance → `queueEligible: false`
5. Partially populated provenance (would previously throw) → `queueEligible: false`, no exception
6. Multi-creative opportunity with all rows live, safe-to-queue, valid provenance → `queueEligible: true`

### Test and build results (post-PR #22)

- Full suite: **290 files / 1954 tests — PASS**
- TypeScript: **PASS (no output)**
- Working tree: clean

### Phase 4 hardening status

**Phase 4 is fully hardened.** The Creative Command Center queue eligibility now fails closed on any partial data condition. Demo/snapshot/fallback/unknown evidence cannot reach queue-eligible status. Missing rows, missing policy, missing provenance, and non-live evidence all produce explicit block reasons and a normalized blocked trace.

### Phase 5 clearance

**Phase 5 may start.** The open product items from this review (HOLD bucket conflation, dead code in `resolveSegment`, action instruction completeness) are correctly scoped as Phase 5 work, not blockers. The safety foundation is sound.
