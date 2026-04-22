# Creative Segmentation Recovery — Naming and Calibration Review

Reviewer: Claude Code (product-strategy and media buyer logic reviewer)
Date: 2026-04-23
Charter: `docs/external-reviews/PRODUCT_REVIEW_CHARTER.md`
Scope: Pre-implementation naming and calibration design review for Creative Segmentation Recovery

---

## Executive Verdict: GOOD DIRECTION WITH NAMING CHANGES

The four-layer separation (Creative Quality / Evidence Confidence / Business Validation / Execution Safety) is architecturally correct and fixes the root cause of the usability failure. The segment names are 70% right. Three need renaming, one needs splitting, and one creates dangerous ambiguity about execution eligibility. The calibration approach described in yesterday's strategy review remains the right method — this review adds naming precision and Commercial Truth correction guidance.

---

## 1. What Is Correct in This Plan

**Four-layer separation is the right model.** The current policy collapses all four layers into a single segment determination. `hasScaleEvidence` requires `economics.status === "eligible"` (Business Validation) inside the same check as spend floor and purchase count (Evidence Confidence). Commercial Truth is absent → `blocked` (Execution Safety) rather than surfacing the Creative Quality signal. Separating the layers structurally is the fix.

**"Scale Review" without Commercial Truth is the central insight.** The current policy at line 218–221 of `creative-operator-policy.ts` hard-returns `"blocked"` when `!commercialTruthConfigured` and `primaryAction === "promote_to_scaling"`. A human media buyer does not look at a creative with 4× account-average ROAS and $300 spend and say "I cannot evaluate this because I have no target ROAS configured." They say "this is relatively strong, I need to review it." The system currently suppresses the signal entirely. The proposed "Scale Review" concept recovers that signal.

**Commercial Truth overuse is correctly identified.** The problem is not just that Commercial Truth gates `scale_ready`. It also gates `kill_candidate`. Line 232 requires `hasKillEvidence(input) && input.commercialTruthConfigured` for the `kill_candidate` label. This means a clearly underperforming creative cannot be clearly labeled as "Cut" if business targets are missing. Both directions — scale and kill — are over-gated.

**Account-relative and campaign-relative baselines are the right empirical grounding.** Absolute floors ($250 spend, 5 purchases for scale; $250 spend, 4 purchases for kill) are blind to account size. They work for a mid-scale account and break for small accounts in both directions.

**Explicit benchmark scope visibility is the right UX principle.** If campaign filter silently changes segment outcomes, operators will distrust the system the moment they notice. The benchmark scope must be visible at all times when it matters.

**9–10 user-facing segments from 14 internal states is the right compression ratio.** Internal segments can carry technical precision. User-facing labels carry operator intent. These are different jobs.

---

## 2. What Is Risky or Wrong

**Risk 1: "Scale" implies push eligibility to an inexperienced operator.** The word "Scale" alone, without qualification, may be read as "the system is ready to scale this." In the final design, "Scale" should only appear when push/apply is eligible (all 12 gates pass). If that never happens without canary configuration, the label "Scale" may never appear in practice — and operators may never see it. Consider whether "Scale" as a label is doing real work if it only appears after all gates pass, or whether "Scale Review" is the more frequently encountered and therefore more important label.

**Risk 2: "Diagnose Context" is not media buyer language.** No experienced media buyer uses the word "diagnose." They say "check the campaign," "look at the ad set," "something is off with the setup." The current internal label `investigate` is more honest than "Diagnose Context." This name must change.

**Risk 3: "Refresh / Variant" combines two different operator actions.** A fatigued winner needs a replacement creative (make something new, inspired by the winner). A retest candidate needs to be retried in a different context or after a break (same creative, different placement or timing). These are different instructions. Showing "Refresh / Variant" conflates the action type and forces the operator to read the instruction body to understand what to do.

**Risk 4: "Not Enough Data" groups legitimately different cases.** `false_winner_low_evidence` (ROAS-only signal with suspicious evidence quality) and `creative_learning_incomplete` (genuinely new creative, no signal yet) feel different to a media buyer. The first is a warning — "this looks good but I don't believe it." The second is neutral — "too early, come back." Grouping them as "Not Enough Data" may cause an operator to wait on a creative that should be watched skeptically rather than patiently.

**Risk 5: Campaign benchmark scope, if it auto-re-segments, will produce trust-breaking jumps.** A creative that shows "Scale Review" in account-wide mode and then drops to "Test More" when the operator filters to its campaign (because the campaign average is higher than the account average) will confuse the operator instantly. The re-segmentation must be explicit, not silent.

**Risk 6: Account-relative baseline requires data not currently in the policy input.** `CreativeOperatorPolicyInput` (lines 65–95 of `creative-operator-policy.ts`) does not include account-median metrics. Adding account-relative floors requires first adding this data to the input model and computing it upstream. The policy change cannot precede the data pipeline change.

---

## 3. Review of Proposed Segment Names

### Scale
**Decision: KEEP — with strict eligibility definition.**
Use "Scale" only when Commercial Truth is confirmed + all evidence floors are met + push eligibility gates pass. This is the rarest label and the only one that may eventually be push-eligible. If the label appears, the operator knows the system has fully validated the action. If the concern is that it implies auto-execution, the instruction text should say "Scale [creative name]. Manual execution required until push canary is active." The label itself is correct.

### Scale Review
**Decision: KEEP.**
This is the most important new label. It surfaces the creative quality signal when Commercial Truth is missing or when execution gates are not passed. A media buyer who sees "Scale Review" understands immediately: "look at this one, it may be worth scaling, I need to evaluate." This is better than "Scale Candidate" because it tells the operator what to do (review for scaling), not just what the system computed. The instruction under this label must include: "Relatively strong performance against account baseline. Business target validation required before acting."

### Test More
**Decision: KEEP.**
"Test More" for a media buyer means "keep spending, give it more time and data." This is correct for `promising_under_sampled`. It does not mean "run a new creative test" — it means "let this test run longer." The instruction should reinforce this: "Give this creative more time and budget. Not enough volume to confirm direction." Do not use "Test More" for `false_winner_low_evidence` — those need a different label (see Not Enough Data below).

### Protect
**Decision: KEEP.**
Excellent. "Protect your winners" is standard media buyer language. Every experienced operator immediately understands this as "do not touch, do not pause, do not reduce budget on this creative." The instruction should say: "This is a protected winner. Do not pause, reduce budget, or modify this creative."

### Watch
**Decision: KEEP.**
Standard language. "I'm watching this one." The instruction should clarify what to watch for: "Monitor performance trend. No action required yet. Check again in [next observation window]."

### Refresh / Variant
**Decision: SPLIT into Refresh and Retest.**
- **Refresh** → maps to `fatigued_winner` and `needs_new_variant` where the creative is declining. Operator action: create a new creative inspired by this one before it drops further. Instruction: "This creative is fatiguing. Create a refresh or variant before performance drops further."
- **Retest** → maps to `retest_comeback` action. Operator action: bring this creative back in a different context or after a break. Instruction: "This creative may have potential in a different context. Consider retesting in a fresh ad set."
These are different actions. A fatigued winner needs replacement now. A retest candidate may be fine — it just needs different placement. Conflating them forces the operator to read the body to understand the action type.
If simplicity requires keeping one label, use **Refresh** and surface the distinction in the instruction text. Do not keep the slash format in the UI.

### Cut / Replace
**Decision: RENAME to "Cut."**
"Cut" alone is direct and clear — media buyers say "cut the creative." The "/ Replace" suffix creates ambiguity: does the system recommend a replacement, is it saying "replace" is the next step, or is it a synonym? The instruction text should carry the replacement guidance if needed: "Cut this creative from active rotation. Replace with a new variant if this concept has shown any positive signal." The label itself should be one word: **Cut**.

### Diagnose Context
**Decision: RENAME to "Campaign Check."**
"Diagnose" is clinical and system-facing. No media buyer says "I need to diagnose this creative." They say "let me check what campaign this is in" or "something is off with the ad set context." "Campaign Check" is clear, direct, and tells the operator where to look. Alternative if the issue is broader than campaigns: "Check Setup." Preferred: **Campaign Check**.

### Not Enough Data
**Decision: KEEP but split usage precisely.**
Use "Not Enough Data" for two distinct cases with different instruction texts:
- `creative_learning_incomplete` (genuinely new, no signal): "This creative needs more time. Come back after it has accumulated enough spend."
- `false_winner_low_evidence` (ROAS-only signal, suspicious evidence): "Early signal looks positive, but volume is too low to trust. Do not scale yet. Monitor until spend and conversion volume increase."
The label is the same. The instruction body makes the distinction. This avoids adding a tenth label for a relatively subtle difference, while still giving the operator the correct interpretation.

---

## 4. Recommended Final User-Facing Segment Taxonomy

Ten segments. Each maps to a clear operator action or stance.

| Label | What It Means to the Operator | Internal Maps To |
|---|---|---|
| **Scale** | Fully validated. All evidence and business targets confirmed. Review for push when eligible. | `scale_ready` |
| **Scale Review** | Relatively strong performance. Business target missing or execution not ready. Evaluate manually. | New segment (currently collapses to `blocked`) |
| **Test More** | Promising but under-sampled. Keep running, gather more data before acting. | `promising_under_sampled` |
| **Protect** | Active winner. Do not touch, pause, or reduce budget. | `protected_winner`, `no_touch` |
| **Watch** | Monitor only. No action yet. Track trend. | `hold_monitor` |
| **Refresh** | Fatiguing. Create a replacement or variant soon. | `fatigued_winner`, `needs_new_variant` |
| **Retest** | Previously promising. Try in a fresh context or after a break. | `needs_new_variant` (retest_comeback action) |
| **Cut** | Underperforming with sufficient evidence. Remove from active rotation. | `kill_candidate`, `spend_waste` |
| **Campaign Check** | Campaign or ad set context issue. Investigate the context before acting on this creative. | `investigate` |
| **Not Enough Data** | Signal is missing, too thin, or suspect. Wait for more before interpreting. | `creative_learning_incomplete`, `false_winner_low_evidence` |

Notes:
- `contextual_only` and `blocked` are not shown to the operator as segment labels. They produce a system-level note: "This row is not currently eligible for evaluation." No label, no instruction, no confusion.
- If Retest is too infrequent to warrant its own label, merge it into Refresh and differentiate in instruction text.

---

## 5. Recommended Internal State Taxonomy

Internal states do not change. They continue to serve policy logic and push readiness.

The only addition needed: a `scale_review` internal segment that maps to the "Scale Review" user-facing label. This is the state for: `primaryAction === "promote_to_scaling"` AND (Commercial Truth missing OR evidence floors not met) AND account-relative performance is strong.

The 15-state internal taxonomy after the addition:

```
scale_ready               → Scale
scale_review              → Scale Review  [NEW]
promising_under_sampled   → Test More
false_winner_low_evidence → Not Enough Data
creative_learning_incomplete → Not Enough Data
protected_winner          → Protect
no_touch                  → Protect
hold_monitor              → Watch
fatigued_winner           → Refresh
needs_new_variant         → Refresh or Retest (based on primaryAction)
kill_candidate            → Cut
spend_waste               → Cut
investigate               → Campaign Check
contextual_only           → [no user label]
blocked                   → [no user label]
```

---

## 6. Commercial Truth Guidance

### What Commercial Truth SHOULD block
- The "Scale" label (fully validated, push-eligible)
- Push/apply eligibility — automated provider mutations always require business target context
- Claiming the creative is "profitable," "above target ROAS," or "meeting CPA goal"
- Any instruction that implies a specific budget amount recommendation

### What Commercial Truth SHOULD NOT block
- Identifying that a creative is relatively strong compared to account or campaign peers
- Surfacing the "Scale Review" label for relatively strong creatives
- Kill/Cut decisions — a clearly underperforming creative should be labeled "Cut" regardless of whether targets are configured. The current gate at line 232 (`hasKillEvidence(input) && input.commercialTruthConfigured` required for `kill_candidate`) is wrong and should be removed.
- "Refresh" and "Retest" decisions — fatigue is observable without targets
- "Not Enough Data" decisions — evidence thinness is observable without targets

### The rule
Commercial Truth is the absolute business validation layer for execution actions. It is not a prerequisite for identifying creative quality or relative performance. A media buyer who has no target ROAS still knows a creative with 4× account-average ROAS is relatively strong. The system should surface that signal with an appropriate caveat, not hide it.

### Implementation note
The current `aggressive` flag at line 312 of `creative-operator-policy.ts` applies to `promote_to_scaling`, `block_deploy`, and `refresh_replace`. The commercial truth blocker fires for all aggressive actions. This must be split: Commercial Truth required for scale push eligibility; NOT required for identifying kill/refresh quality signals.

---

## 7. Account-Relative Baseline Guidance

### What to compute
- `accountMedianCreativeROAS`: median ROAS across all active creatives in the account, 30-day window
- `accountMedianCreativeSpend`: median spend per active creative, same window
- `accountMedianCPA`: median CPA across creatives with ≥ 1 purchase, same window
- `accountCreativeCount`: number of active creatives in the baseline

### How to use it in policy
A creative qualifies for account-relative strong signal if:
- `roas >= 1.4 * accountMedianCreativeROAS` (significantly above median) AND
- `spend >= 0.2 * accountMedianCreativeSpend AND spend >= 80` (meaningful relative spend, not noise) AND
- `purchases >= 2` (at least two real conversion events)

This does not mean the creative is profitable. It means it is relatively stronger than the account's typical creative performance. The "Scale Review" label fires on this logic when the absolute `scale_ready` gates are not met.

### Precedence
If account-relative context is available AND strong: "Scale Review."
If account-relative context is available AND neutral or weak: existing segment logic.
If account-relative context is NOT available (first-run account, no history): fall through to existing logic. Do not invent a baseline.

### Data pipeline prerequisite
`CreativeOperatorPolicyInput` does not currently include account-level baseline fields. Adding account-relative policy logic requires first adding `accountBaseline` to the input type with these computed fields. The policy change cannot ship before the data model change.

---

## 8. Campaign Benchmark Guidance

### The core design rule
Campaign benchmark is an operator-initiated evaluation mode, not an automatic re-segmentation triggered by UI filter state.

### Recommended behavior
- **Default state**: All creatives are evaluated against the account-wide baseline. Segment labels reflect account-relative context.
- **When the operator selects a campaign filter**: The UI shows the filter is active but does NOT automatically re-segment. The operator sees a visible indicator: "Benchmark: Account-wide."
- **Optional operator action**: An explicit control — "Re-evaluate within this campaign" — is available when a campaign is selected. When the operator activates it, segmentation runs again with campaign-wide baseline. The indicator changes to "Benchmark: [Campaign Name]."
- **The switch is always visible**: When campaign benchmark is active, every segment label is marked with the scope indicator. "Scale Review (campaign benchmark)" vs "Scale Review (account-wide)." The operator is never surprised.

### Why not auto-switch
A creative that is "Scale Review" account-wide and "Watch" campaign-wide has not changed. The operator's context has changed. Auto-switching without notice breaks trust. The operator needs to make the choice deliberately.

### When campaign benchmark is most useful
Test campaigns: comparing creatives within a dedicated test campaign where the account-wide baseline would unfairly penalize new concepts. The operator filters to the test campaign, sees that all creatives look weak account-wide, and chooses "Re-evaluate within this campaign" to get a peer comparison.

---

## 9. Old Rule Engine Usage Guidance

The old rule engine is a challenger. The calibration pass must use it as follows:

1. Compute old engine output for all creatives in the sample set.
2. For each disagreement between old engine and new Decision OS, classify:
   - **Old engine right, new wrong**: the old engine called it "scale" and the operator agrees — threshold calibration target.
   - **Old engine wrong, new right**: the old engine called "scale" based on ROAS alone with 1 purchase — the new system correctly avoided this. Mark as fixture confirming new system's conservative call.
   - **Both wrong**: both called it "test" or "watch" and the operator would actually cut it — or both called it good and it was not. Escalate for root cause.
3. Do not build any policy rule whose primary rationale is "the old engine did this." The rationale must be media buyer logic ("a creative with ROAS 2× the account median and spend 3× the account median creative spend is relatively strong regardless of absolute target").
4. After calibration, verify the proposed rules do not converge toward old engine behavior on its known failure cases: high ROAS from a single discount order, ROAS above threshold with 1 purchase, new creative at day 2 with high ROAS driven by a single event.

---

## 10. 10-Agent Calibration Design

The agent structure from yesterday's strategy review is correct. One addition is required before the agents run.

### Required pre-calibration step: remove the dead code
Line 211 of `creative-operator-policy.ts` — the inner `hasRoasOnlyPositiveSignal` inside the `isUnderSampled` block — is permanently unreachable. Line 206 returns before it is reached. Remove this before any agent reads the policy. An agent that spends reasoning cycles on dead code produces lower-quality calibration output.

### Agent mandate additions
Each agent, in addition to the schema from yesterday's review, must record:
- `commercialTruthMissing: boolean` — whether CT was absent for this creative
- `wasBlockedByCT: boolean` — whether the current segment is `blocked` due to Commercial Truth absence specifically
- `accountRelativeStrength: "strong" | "neutral" | "weak" | "unknown"` — agent's qualitative assessment of account-relative performance without CT

This data, aggregated, will answer the question: "How many of our blocked/suppressed creatives are actually relatively strong performers that are being hidden by the CT gate?"

### Account Baseline Agent (mandatory addition)
The original strategy review specified this agent as the highest-priority addition not in the original list. It must run before any creative-level agent. It computes and records the account baseline: median ROAS, median CPA, median spend per creative, distribution quartiles. Every subsequent agent anchors their judgment against this baseline record.

### Agent output schema addition for this review
```typescript
type AgentCreativeJudgment = {
  // [previous fields from strategy review]

  // Commercial Truth gate audit (new)
  commercialTruthMissing: boolean;
  wasBlockedByCT: boolean;  // current segment is blocked specifically due to CT absence
  accountRelativeStrength: "strong" | "neutral" | "weak" | "unknown";

  // Proposed user-facing label (new — distinct from proposed segment)
  proposedUserLabel: string;  // from the 10-label taxonomy above
  proposedInstructionHeadline: string;
};
```

### Critical enforcement rules
1. An agent cannot disagree with the current segment and produce no policy candidate. Opinion without candidate is discarded.
2. `confidence: "low"` judgments are logged but not counted toward threshold calibration.
3. Agent majority vote is not policy. The synthesis step requires a specific function name, parameter, and precondition. "Most agents think the floor is too high" is not a policy candidate.
4. The UX Simplification Agent reviews the proposed user label and instruction headline for every creative where agents disagree — not just the segment change, but whether the new label is clear and actionable.

---

## 11. How to Convert Calibration Findings into Deterministic Policy

This section refines the strategy review guidance with specifics relevant to the naming and CT corrections.

### For Commercial Truth gate corrections
1. Agent finding: "This creative is `blocked` because CT is missing, but account-relative ROAS is 3.2× the median with $240 spend and 6 purchases."
2. Synthesis: "Proposed change — add `scale_review` segment reachable when CT is missing but account-relative strong signal is present. Precondition: `accountBaseline` field must be present in input."
3. Fixture first: input with CT missing, account-relative strong signal present. Expected output: `scale_review`. Run against current policy — it should produce `blocked`. Implement the change. Run again — it should produce `scale_review`. Full suite should pass.

### For kill evidence CT corrections
1. Agent finding: "This creative is labeled `spend_waste` rather than `kill_candidate` because CT is missing, but it has $380 spend, 6 purchases, and ROAS of 0.4 — clearly underperforming."
2. Synthesis: "Remove `input.commercialTruthConfigured` requirement from the `kill_candidate` path at line 232. Kill evidence alone should be sufficient."
3. Fixture: CT missing, kill evidence met. Expected output: `kill_candidate`. Currently produces `spend_waste`. Implement, verify.

### For absolute floor corrections (account-relative)
1. Agent finding: "This creative has $150 spend and 3 purchases — below the $250/5 absolute floors, but this account's median creative spend is $55. At $150, this is at the 97th percentile of spend for this account."
2. Synthesis: "Add account-relative alternative path in `hasScaleEvidence`: if `accountBaseline.medianCreativeSpend` is present and `spend >= max(80, 0.3 * accountBaseline.medianCreativeSpend)` and `purchases >= 2` and `spend >= 0.15 * accountBaseline.totalAccountSpend` then evidence is sufficient for `scale_review`."
3. Note: this is a `scale_review` path, not a `scale_ready` path. The distinction is intentional — account-relative strength without CT is a review signal, not a confirmed action.

### The conversion checklist (per finding)
- [ ] Agent finding has specific creative ID, specific segment disagreement, and specific account context
- [ ] Proposed rule change names the exact function in `creative-operator-policy.ts`
- [ ] Proposed change includes preconditions (what must be true in the input) and known risks (what false positives could result)
- [ ] Fixture written before code is changed
- [ ] Fixture fails under current policy (confirming the gap is real)
- [ ] Policy change implemented
- [ ] Fixture passes under new policy
- [ ] Full suite passes
- [ ] Holdout set (accounts not used in calibration) segment distribution reviewed for unexpected shifts

---

## 12. UI Simplicity Rules

1. **One label per creative.** No combined labels, no "Scale / Test More." One segment, one instruction headline, one action or stance.

2. **No internal segment names in the UI.** `blocked`, `contextual_only`, `false_winner_low_evidence`, `creative_learning_incomplete`, `hold_monitor`, `needs_new_variant`, `spend_waste` — none of these appear to the operator.

3. **`contextual_only` and `blocked` creatives show a minimal system note, not a segment label.** Something like "Not eligible for evaluation in current context." The operator is not confused by a segment label that implies an action when the creative cannot be evaluated.

4. **Commercial Truth absence shows as a caveat, not a segment.** When "Scale Review" fires because CT is missing, the caveat is part of the instruction body: "Business targets not configured. Evaluate against account performance manually before acting." Not a separate label.

5. **Benchmark scope is always visible when campaign benchmark is active.** A small, persistent indicator near the Creative table header: "Benchmark: Account-wide" or "Benchmark: [Campaign Name]." Not in the segment label itself, but visible without scrolling.

6. **Agent calibration results are never surfaced in the production UI.** The calibration lab is a development tool. Zero agent output reaches the operator's screen.

7. **The instruction body does the work, not the label.** "Scale Review" is a one-word decision signal. "This creative is performing at 3.4× account average ROAS with $240 spend and 5 purchases. Review for scaling — no business target is configured. Manually verify profitability before acting." is the instruction. The label and the instruction are separate jobs.

8. **Maximum 10 distinct segment labels in production at any time.** If a new segment is added, an existing one must be deprecated or merged. No segment inflation.

---

## 13. Recommended First Codex Task

**Task: Remove dead code, fix HOLD bucket routing, introduce `scale_review` segment as a named internal state.**

Three changes, in this order:

**Change 1 (2 minutes):** Remove lines 211–214 of `creative-operator-policy.ts` — the unreachable `hasRoasOnlyPositiveSignal` block inside `isUnderSampled`. Update the `CREATIVE_OPERATOR_SEGMENTS` constant to remove anything that was only reachable from this dead path (none — `false_winner_low_evidence` is reachable from line 206). Verify tests pass.

**Change 2 (30 minutes):** Fix the HOLD bucket routing for `investigate` + `blocked` (campaign structure conflict). This is the one-line change in `resolveCreativeAuthorityState` that has been flagged since Phase 4. It is not a calibration task — it is a known bug. Fix it before calibration begins so agents are evaluating correct routing.

**Change 3 (1–2 hours):** Add `scale_review` to `CREATIVE_OPERATOR_SEGMENTS`. Add it to `resolveSegment` as a new path: when `primaryAction === "promote_to_scaling"` AND `!commercialTruthConfigured` AND account-relative strong signal check passes (placeholder function, returns `false` until account baseline is in the input) → return `"scale_review"`. Add `scale_review` to `resolveState` mapping to `"investigate"` (operator review required). Add `scale_review` to `resolvePushReadiness` mapping to `"operator_review_required"`. Write fixtures: CT absent, should produce `scale_review` (will not yet pass until account baseline is wired). Document the placeholder.

This establishes the segment contract before the data pipeline work begins. The segment exists, the fixtures exist, and the account baseline computation becomes the clear prerequisite for the fixtures to pass.

**What Codex should NOT do in the first task:**
- Change any absolute floor values without calibration data
- Attempt to compute account-relative baseline from within the policy function (the data must come in as input, not be computed at policy time)
- Change the `scale_ready` path — that path is correct and should not be touched
- Add any UI changes — naming changes happen after policy changes are stable

---

## 14. Acceptance Criteria for Creative Segmentation Recovery

### Blocking criteria (must all pass before the effort is declared complete)

**Naming:**
- [ ] All 10 user-facing segment labels are present and mapped in the codebase
- [ ] No internal label (`blocked`, `contextual_only`, `false_winner_low_evidence`, etc.) appears in any user-facing string in the UI
- [ ] "Scale" label only appears when all evidence floors + CT + push eligibility conditions are met
- [ ] "Scale Review" label appears for account-relative strong performers when CT is missing
- [ ] "Campaign Check" replaces "Diagnose Context" in all user-facing strings

**Policy:**
- [ ] Dead code at line 211 is removed
- [ ] HOLD bucket routing is fixed — `investigate` + `blocked` (campaign structure) routes separately from `needs_truth`
- [ ] `kill_candidate` is reachable without Commercial Truth configured (CT gate removed from kill path)
- [ ] `scale_review` segment is added and correctly routes CT-absent scale actions away from `blocked`
- [ ] Account-relative baseline computation is present in the input model and used in `scale_review` path

**Evidence and fixtures:**
- [ ] At least 3 new fixtures per modified policy function
- [ ] All fixtures for the known failure cases pass (creatives the owner manually identified as mislabeled)
- [ ] Holdout set validation: segment distribution shift is coherent (no unexpected mass reclassification)
- [ ] Full test suite passes (292+ tests, no regressions)

**UI:**
- [ ] Benchmark scope indicator is always visible when campaign benchmark is active
- [ ] No agent calibration output reaches the production UI
- [ ] Instruction text for each segment label passes the UX Simplification Agent test on at least 5 reviewed accounts

**Operator validation:**
- [ ] Owner manually confirms ≥ 80% recall on their "should be Scale or Scale Review" creative set
- [ ] Owner manually confirms ≥ 90% precision on "Cut" labels (no false kills)
- [ ] Owner states: "I can now understand what the Creative Decision OS is telling me without reading the raw table"

### Non-blocking but flagged if missing
- Telemetry sink activated before production segment distribution is measured
- Old rule engine auditor confirms no regressions on its known-wrong cases
- Retest segment is either distinct or explicitly merged into Refresh with documented rationale

---

## 15. Whether We Should Proceed

**Yes.**

The technical readiness from Phase 8 is correct: the safety gates are sound, the Meta execution subset is canary-ready, the audit trail is clean. Those work streams should continue on their own track.

Creative Segmentation Recovery addresses the product's primary output — the segment label and instruction that the operator reads. The current output is not useful enough for an expert media buyer to rely on. That is the most important problem to fix before any broader rollout. A well-gated system producing poor Creative recommendations is safer but not better.

The sequencing:
1. **Immediately:** Remove dead code, fix HOLD routing, add `scale_review` as internal segment (Codex, hours)
2. **In parallel:** Phase 8 canary configuration (telemetry sink, canary business — Meta-only, independent)
3. **Next:** Build account baseline computation and calibration data export (data pipeline, days)
4. **Then:** Run calibration pass (agents, days)
5. **Then:** Synthesize → fixtures → policy changes → validation (weeks)
6. **Finally:** Deploy updated Creative segment layer with the new user-facing taxonomy

Do not wait for calibration to be complete before starting canary configuration for Meta ad set execution. Do not start Meta canary expansion until Creative segmentation is producing reliable, readable output.

---

## Final Chat Summary

**Verdict:** GOOD DIRECTION WITH NAMING CHANGES

**Recommended segment names (final):**

| Keep | Change to |
|---|---|
| Scale | Scale ✓ |
| Scale Review | Scale Review ✓ |
| Test More | Test More ✓ |
| Protect | Protect ✓ |
| Watch | Watch ✓ |
| Refresh / Variant | → **Refresh** and **Retest** (split) |
| Cut / Replace | → **Cut** (drop the slash) |
| Diagnose Context | → **Campaign Check** |
| Not Enough Data | Not Enough Data ✓ |

**Top 5 Risks:**
1. Commercial Truth gates both scale AND kill signals — both must be corrected, not just scale
2. "Scale Review" requires account-relative baseline data in the input model — the data pipeline change is the prerequisite, not the policy change
3. Campaign benchmark auto-switching silently changes segments — must be operator-initiated with always-visible scope indicator
4. Agent calibration producing majority votes instead of specific threshold candidates — enforce the policy candidate requirement strictly
5. "Scale" label may never appear in practice without canary configuration — if so, "Scale Review" is the label that matters most and must be correct

**First Codex Task:**
Remove dead code (line 211 of `creative-operator-policy.ts`), fix HOLD bucket routing, and add `scale_review` as a named internal segment with placeholder account-relative logic and fixtures. Three changes, in that order. All must ship via PR, not direct-to-main.

**Proceed: Yes.** Creative Segmentation Recovery is the right next milestone. The naming framework is ready to implement. The calibration design is ready to execute. Start with the three Codex tasks above before any calibration work begins.
