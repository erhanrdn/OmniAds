# Creative Segmentation Recovery — Claude Product Review

Reviewer: Claude Code (product-strategy and media buyer logic reviewer)
Date: 2026-04-23
Charter: `docs/operator-policy/creative-segmentation-recovery/STATE.md`
Scope: Foundation Review — whether the Creative Segmentation Recovery foundation moves Adsecute closer to useful Creative segmentation for a professional media buyer.

---

## Foundation Review

**Verdict: READY WITH SMALL FIXES**

The foundation is structurally correct. Naming is preserved, safety gates are sound, and the policy layer is well-organized. Two specific issues must be fixed before the Calibration Lab starts. The Calibration Lab itself should not start until Account Baseline computation is wired.

---

### Review Question 1: Did Codex preserve the intended user-facing segment names?

**YES.**

`creativeOperatorSegmentLabel()` in `creative-operator-surface.ts` correctly maps all 10 internal segments to media-buyer language:

| Internal | User-Facing |
|---|---|
| `scale_ready` | Scale |
| `scale_review` | Scale Review |
| `promising_under_sampled` | Test More |
| `protected_winner` / `no_touch` | Protect |
| `hold_monitor` | Watch |
| `fatigued_winner` | Refresh |
| `needs_new_variant` (retest_comeback) | Retest |
| `needs_new_variant` (other) | Refresh |
| `kill_candidate` / `spend_waste` | Cut |
| `investigate` | Campaign Check |
| `false_winner_low_evidence` / `creative_learning_incomplete` / `blocked` / `contextual_only` | Not Enough Data |

No internal label (`blocked`, `hold_monitor`, `contextual_only`, `false_winner_low_evidence`) appears as a user-facing string. `creativeActionLabel()` mirrors this mapping in the row action label. The naming review recommendations were followed precisely.

---

### Review Question 2: Is the 10-label taxonomy still correct?

**YES.**

Scale / Scale Review / Test More / Protect / Watch / Refresh / Retest / Cut / Campaign Check / Not Enough Data remain the right labels. `CREATIVE_OPERATOR_SEGMENTS` in `creative-operator-policy.ts` contains all 15 internal segments. The mapping from internal to user-facing is complete and correct.

The only taxonomy risk is one that exists by design: `false_winner_low_evidence` and `creative_learning_incomplete` both map to "Not Enough Data" with different instruction implications. The naming-and-calibration-review said to differentiate in instruction body text, not in the label. This is correctly deferred but must be implemented in instruction copy before Calibration Lab evaluation.

---

### Review Question 3: Is scale_review separated correctly from push/apply eligibility?

**YES. This is the most important safety gate and it is correct.**

`resolvePushReadiness()` in `creative-operator-policy.ts` maps `scale_review` explicitly to `"operator_review_required"`. It cannot reach `"safe_to_queue"`. `canApply` is hardcoded to `false` for all creatives. `queueEligible` is only true when `pushReadiness === "safe_to_queue"`, which `scale_review` cannot reach.

The `invalidActions` array in `buildCreativeOperatorItem()` adds "Do not scale until business targets are validated." as a surface constraint specifically for `scale_review`. The safety contract is enforced at policy level, push level, and instruction level. Three separate layers. ✓

---

### Review Question 4: Does Commercial Truth missing still over-suppress useful relative creative signals?

**PARTIAL FIX — CORRECTLY BOUNDED.**

**What changed:** `resolveSegment()` now has an explicit path: when `primaryAction === "promote_to_scaling"` AND Commercial Truth is not configured AND `hasRelativeScaleReviewEvidence()` passes → `scale_review`. Kill evidence no longer requires CT (`hasKillEvidence` path in `block_deploy` branch has no CT gate).

**What remains:** Decision OS (`buildCreativeDecisionOs`) still downgrades `promote_to_scaling` to `keep_in_test` when `degradedMode.active` or economics are not eligible (lines 2058–2097 of `creative-decision-os.ts`). When Creative policy receives `keep_in_test` as the primary action, the `scale_review` branch is unreachable. Live rows where CT is degraded will not show `scale_review` until the upstream gate is addressed.

**Is deferral correct?** Yes. Changing the Decision OS gating without `relativeBaseline` data wired in would produce uncalibrated output. The policy-layer fix establishes the contract. The data pipeline work establishes the precondition. Running the Calibration Lab with synthetic `relativeBaseline` fixtures is possible and correct.

**No regression on kill.** CT no longer blocks `kill_candidate` recognition. A creative with $250+ spend and 4+ purchases (or 8K+ impressions) and `block_deploy` primary action now correctly reaches `kill_candidate` regardless of CT configuration. ✓

---

### Review Question 5: Does the foundation avoid fake account baselines?

**YES.**

`hasRelativeBaselineContext()` enforces all of:
- `relativeBaseline` must be non-null
- `sampleSize >= 3`
- `medianRoas > 0` (real, finite number)
- `medianSpend > 0` (real, finite number)

If `relativeBaseline` is null or absent (which it always will be until baseline computation is wired upstream), the check returns false. `hasRelativeScaleReviewEvidence()` calls `hasRelativeBaselineContext()` as its first guard. No baseline is invented. The policy will not emit `scale_review` from missing or thin context data.

This is the right behavior for the foundation phase. ✓

---

### Review Question 6: Is HOLD bucket ambiguity actually reduced?

**PARTIALLY — ONE REMAINING CONFLATION.**

**Improvement:** `investigate` no longer routes to `needs_truth` (HOLD). `resolveCreativeAuthorityState()` now explicitly routes `segment === "investigate"` to `"blocked"` authority state (REFRESH quick filter). "Campaign Check" rows no longer appear under HOLD. This is a real improvement — HOLD previously mixed "context issue" rows with "truth validation required" rows.

**Remaining conflation:** `blocked` and `contextual_only` segments are labeled "Not Enough Data" at row level (via `creativeOperatorSegmentLabel`) but route to the HOLD (`needs_truth`) coarse bucket via `state === "blocked"` or `state === "contextual_only"` in `resolveCreativeAuthorityState`. An operator sees "Not Enough Data" in the HOLD: VERIFY bucket.

This is semantically wrong. HOLD: VERIFY means "waiting for commercial truth / preview truth validation." "Not Enough Data" means "evidence is thin." These are different operator stances. A creative that is `blocked` because provenance is missing is not the same as one where "there's just not enough data yet." The naming-and-calibration-review explicitly said these cases should show a system note ("Not eligible for evaluation"), not a segment label.

**Fix required:** `blocked` and `contextual_only` should not receive "Not Enough Data" as a row label. They should receive a system-level note: "Not eligible for evaluation in current context." The row label should be absent or replaced with a status indicator, not a creative quality signal.

---

### Review Question 7: Is the UI likely to be clearer or noisier?

**CLEARER AT ROW LEVEL. MIXED AT BUCKET LEVEL.**

Row-level: Significant improvement. Every major segment now maps to a clear media-buyer label. "Campaign Check" replaces the previously meaningless internal routing. `invalidActions` provides specific guardrails per segment (e.g., "Do not scale from ROAS alone" for `false_winner_low_evidence`). The instruction system is connected to the operator policy.

Bucket level: The 5-bucket quick filter system (SCALE / TEST / REFRESH / HOLD: VERIFY / EVERGREEN) does not match the 10-label row taxonomy. Key mismatches:
- "Scale Review" rows appear in the TEST bucket (labeled "Challengers still collecting signal") — technically acceptable, semantically loose.
- "Campaign Check" rows appear in the REFRESH bucket (labeled "Fatigued winners that need a new angle") — semantically incorrect. Campaign Check is a context issue, not a creative fatigue action.
- "Not Enough Data" rows appear in both TEST and HOLD buckets depending on which internal segment they carry.

This is a known and deferred gap. It creates friction if an operator is oriented by quick filter buckets rather than row labels. Before Calibration Lab results are used to tune thresholds, the coarse bucket labels should be clarified to reduce semantic mismatch. This does not require a full UI rewrite — bucket summary text can be updated to be more inclusive.

---

### Review Question 8: Did Codex treat the old rule engine as baseline/challenger rather than truth?

**YES.**

The audit report correctly identifies that `buildHeuristicCreativeDecisions` now delegates to `buildCreativeDecisionOs`, making it a compatibility projection rather than an independent old-rule challenger. Codex did not copy old behavior, did not wire up a fake challenger, and documented the finding accurately.

The policy changes are grounded in media-buyer logic (relative account comparison, evidence sufficiency, label clarity), not in "the old engine did this." `applyDecisionGuardrails` exists but is not called — correctly noted as something that may need recovery from git history before calibration.

The deficit: without a true independent challenger, the Calibration Lab cannot perform the "old engine vs. new Decision OS" comparison described in the naming-and-calibration-review. This must be addressed before Calibration Lab runs.

---

### Review Question 9: Is this ready for the Creative Segmentation Calibration Lab?

**NOT YET. Start with Account Baseline first.**

The Calibration Lab requires three conditions that are not yet met:

1. **`scale_review` must be capable of firing from live Decision OS output.** Currently it cannot, because the upstream Decision OS downgrades `promote_to_scaling` before Creative policy sees it, and `relativeBaseline` is not computed or passed upstream. Calibration agents evaluating real account data will see zero `scale_review` rows, making it impossible to calibrate thresholds.

2. **Account baseline computation must exist.** `relativeBaseline` in `CreativeOperatorPolicyInput` has the right shape, but no upstream code computes or passes it. Until it is wired, the entire `scale_review` path is a dead letter in production.

3. **An independent old-rule challenger must exist.** The calibration design mandates comparing new Decision OS output against old-rule output. Without an honest old-rule challenger, agents cannot classify disagreements as "old right, new wrong" or "old wrong, new right." Calibration without this produces unsupported threshold candidates.

The foundation is ready to receive the next engineering step. The Calibration Lab should start after Account Baseline computation and benchmark scope contract are wired.

---

### Review Question 10: What should Codex do next?

**In strict sequence:**

**Step 1 (prerequisite for everything else):** Build account-level baseline computation. Compute `medianRoas`, `medianCpa`, `medianSpend`, and `sampleSize` across the account's active creatives (30-day window, live evidence source only). Wire this as an explicit `relativeBaseline` field passed into `assessCreativeOperatorPolicy`. Default scope is account-wide. Do not auto-switch on campaign filter — campaign scope must be operator-initiated.

**Step 2 (parallel with Step 1):** Define and expose a visible benchmark scope indicator in the Creative table UI. A small persistent label: "Benchmark: Account-wide" or "Benchmark: [Campaign Name]" near the table header. No operator should ever be surprised about which scope is active.

**Step 3 (after Step 1):** Recover or reconstruct the old simple rule engine as an independent function. Target the 6-label taxonomy (`scale_hard`, `scale`, `watch`, `test_more`, `pause`, `kill`) from `lib/ai/generate-creative-decisions.ts`. It should run in parallel with Decision OS on the calibration fixture set and produce its own segment output without delegating to Decision OS.

**Step 4 (small fix, can ship anytime):** Fix `blocked` and `contextual_only` row labels. Replace "Not Enough Data" with a system note for these cases. They route to HOLD: VERIFY — that bucket should not contain "Not Enough Data" labeled rows. The naming-and-calibration-review called this explicitly.

**Step 5 (after Steps 1–3):** Run the Calibration Lab.

---

### Small Fixes Summary

**Fix 1 (required before Calibration Lab):**
`blocked` and `contextual_only` segments are labeled "Not Enough Data" at row level but appear in the HOLD: VERIFY coarse bucket. Replace the row label for these segments with a system note: "Not eligible for evaluation in current context." Do not use a creative quality label (Scale Review, Not Enough Data, Watch) for execution-safety-blocked rows.

**Fix 2 (monitor during Calibration Lab):**
`hasRoasOnlyPositiveSignal()` fires when `spend < 120` OR `purchases < 2`. A creative with $100 spend, 2 purchases, and 3× account-median ROAS would be classified as `false_winner_low_evidence` before reaching the `scale_review` path. For small accounts where median creative spend is low, this ordering means the relative winner signal is suppressed in exactly the case where it is most valuable. The calibration lab should produce fixtures for this edge case. No code change yet — establish the fixture first, then decide if the threshold ordering needs adjustment.

---

### Top 5 Product Risks

1. **`scale_review` is policy-correct but live-dead.** Until `relativeBaseline` is computed and the upstream Decision OS gate is addressed, no live account will see a single "Scale Review" row. This is the most critical gap between foundation state and useful output.

2. **"Not Enough Data" in HOLD creates operator confusion.** An operator in the HOLD: VERIFY bucket who sees "Not Enough Data" will think "I just need more data," not "this creative lacks execution context." The two stances require different operator actions and cannot share a bucket + label combination without breaking trust.

3. **Coarse quick filter buckets don't match row labels.** Campaign Check under REFRESH, Scale Review under TEST, Not Enough Data under both TEST and HOLD — the bucket labels and row labels tell different stories. An operator who navigates by bucket first will be misled about what they're looking at.

4. **No old-rule challenger = no calibration anchor.** The Calibration Lab design requires a challenger to classify disagreements. Without it, calibration agents produce threshold candidates with no comparison baseline — which risks either over-conservatism (the new system is already fine everywhere) or over-correction (adjusting thresholds without knowing whether the old system was right or wrong).

5. **Small-account `scale_review` suppression edge case.** `hasRoasOnlyPositiveSignal` fires before the `scale_review` branch when spend < 120 regardless of purchase count. For small accounts with median creative spend < $100, this suppresses the relative winner signal for creatives that have genuine purchase evidence. Calibration lab must surface this before thresholds are finalized.

---

### Calibration Lab: Start Now?

**No.**

Start with: Account Baseline computation + benchmark scope contract + old-rule challenger reconstruction.

Then run the Calibration Lab.

The foundation has earned the next engineering step. It has not yet earned calibration.

---

*Reviewed: 2026-04-23. Foundation branch: `feature/adsecute-creative-segmentation-recovery-foundation`.*

---

## Post-Pass-5 Holdout Review

Reviewer: Claude Code (product-strategy and media buyer logic reviewer)
Date: 2026-04-23
Scope: Single phase-level product review after Creative Segmentation Recovery implementation pass 5, evaluating whether the Creative page is now useful to a professional media buyer or whether a focused pass 6 is still warranted.

---

### Executive Verdict: READY WITH A FOCUSED PASS 6

The foundation is sound. The taxonomy is coherent. The holdout validation proved that `Campaign Check`, `Refresh`, `Protect`, and `Test More` all survive live evaluation on a previously-unseen cohort. Commercial Truth is no longer erasing relative diagnosis. The old rule engine stayed comparison-only and lost on every meaningful dimension. The four-layer separation (Creative Quality / Evidence Confidence / Business Validation / Execution Safety) that the strategy review recommended is now materially in place.

But the Creative page is still not yet fully believable to a professional media buyer, for one specific reason: **zero `Scale` and zero `Scale Review` across 293 evaluated creatives in 7 live accounts.** A media buyer who opens the Creative page and sees no creative anywhere in the entire account that merits scaling — not even for review — will conclude the system is broken or mute. That is not a data problem. That is a product credibility problem.

Pass 6 is warranted, and its scope is narrow: surface the relative-winner signal at `Scale Review` when business validation is missing but evidence is genuinely strong relative to account peers, *and* close the two remaining boundary-wording gaps that the holdout agent panel surfaced. No broad rewrite. No push/apply loosening. No agent-majority voting.

---

### 1. What Is Now Genuinely Good

**Taxonomy coherence.** The 10 user-facing labels (Scale / Scale Review / Test More / Protect / Watch / Refresh / Retest / Cut / Campaign Check / Not Enough Data) are present, mapped, and no internal label leaks to the UI. The holdout panel confirmed media buyers across every role read these labels the same way.

**Campaign Check is doing real work.** 3 holdout rows where campaign context was genuinely the blocker correctly surfaced as `Campaign Check`. The old rule engine hid this entirely under generic "watch." This is a concrete improvement that a media buyer will feel: "the system is telling me to look at the campaign, not the creative."

**Refresh for fatigued winners is holding.** 2 holdout rows confirmed. The old challenger reached for `pause` — which would have thrown away a winner. Current policy correctly routes to `Refresh` (create a variant). This is the specific decision a media buyer actually makes, and the system now makes it correctly.

**Protect for stable winners is holding.** 2 holdout rows confirmed. The old challenger would have pushed `scale` on these — which would churn a shipped winner. Current policy correctly protects. This is the do-no-harm behavior every experienced buyer needs the system to respect structurally, not advisorily.

**Commercial Truth is no longer erasing relative diagnosis.** `Refresh`, `Protect`, `Watch`, `Test More`, and `Campaign Check` all survive missing business validation in the holdout cohort. Before this work, CT absence collapsed rows into `blocked` or generic holds. That pattern is gone.

**Old rule engine correctly lost.** Across 8 representative holdout rows, the old challenger did not beat current policy on any important case. It was worse on `Campaign Check`, `Refresh`, `Protect`, and thin-evidence negatives. Treating it as a challenger rather than ground truth was the correct framing.

**Benchmark scope is operator-initiated.** The Creative page defaults to account-wide. Campaign benchmark only activates when the operator explicitly chooses it. Scope is visible. This matches the naming-review recommendation exactly and prevents the trust-killing silent re-segmentation.

**No evidence-thin row leaked into an action-forward label.** Zero leakage across 101 holdout creatives. The foundational failure mode — ROAS-only creatives surfacing as scale candidates — is gone.

### 2. What Is Still Weak

**Zero Scale and zero Scale Review on 293 live creatives is a product credibility gap.** The holdout cohort is dominated by missing business validation (266 of 293 creatives = 91%). Current policy keeps `Scale` unreachable without favorable CT. That is correct. But `Scale Review` is also at zero, including for 4 rows that would otherwise clear true-`Scale` evidence but are capped by missing business validation. That last number is the issue. Relative-winner evidence is present. The label is not firing. A media buyer opening the page sees nothing to review, which reads as "the system has no opinion."

**Watch vs Scale Review boundary is real.** The most important holdout disagreement — `company-01/company-01-creative-03` — split the panel across `Watch`, `Scale Review`, and `Protect`. Strategist, measurement, profitability, and campaign-context lenses read it as a `Scale Review` boundary case. Scaling specialist kept it at `Watch`. Performance and fatigue lenses would even lean `Protect`. A single row splitting three ways across experienced reviewer lenses suggests the current `Scale Review` floor may be one notch too high for holdout-shaped accounts with missing CT.

**Not Enough Data vs Watch wording on high-spend zero-purchase rows.** A creative with $300 spend and zero purchases reads to a media buyer as "weak Watch" (something is wrong, but might still be early-stage noise), not "insufficient evidence." Calling this "Not Enough Data" technically describes the conversion signal but under-describes the spend-level concern. One holdout row (`company-03-creative-02`) is in this category. The agent panel split: commercial-truth and strategist lenses accepted current conservatism; performance, fatigue, and measurement lenses argued this should surface as a weak `Watch`.

**Test More vs Watch wording for fatigue-pressured under-sampled positives.** One holdout row (`company-01-creative-18`) labeled `Test More` drew a mixed read because fatigue-watch pressure is already present. The strategist lens accepts `Test More`. Performance and fatigue lenses think `Watch` may be safer. This is not about which segment — it is about whether the instruction body communicates the fatigue-watch pressure clearly enough for the operator to know the difference.

**Retest has zero holdout representation.** 0 holdout rows labeled `Retest`. This is not a bug; it simply means the `retest_comeback` action path did not fire on any row in this cohort. Cannot confirm the label's live credibility yet, but there is no evidence it is broken either.

**`Cut` has zero holdout representation.** Similarly, 0 `Cut` labels on 101 holdout rows. The policy path is implemented, fixtures exist, but no live row reached the `kill_candidate` or `spend_waste` floor. Either the live cohort genuinely does not contain clearly-kill-evidence creatives, or the kill floors (spend ≥ $250, purchases ≥ 4 OR impressions ≥ 8k) are still too strict when CT is missing. Insufficient data to say which.

### 3. Segment Names/Meanings That Still Feel Wrong

**None of the labels need renaming.** The 10-label taxonomy from the naming review is correct and holding. `Campaign Check`, `Refresh`, `Protect`, `Watch`, `Test More`, `Not Enough Data` are all surviving live operator-sensibility tests across multiple agent lenses.

**What needs refinement is instruction body wording for two specific cases:**

1. **`Not Enough Data` needs differentiated instruction text for two very different underlying states:**
   - Early-stage creative, minimal spend, no purchase signal yet → "Too early. Come back after more spend."
   - High-spend creative, zero purchases → "Meaningful spend but no conversion signal. Treat as a weak Watch: monitor carefully, consider cutting if trend does not change within [X days]."
   The label stays the same. The instruction body must make the operator distinction clear. This is the fix, not a new label.

2. **`Test More` needs a fatigue-watch caveat when the creative is showing early fatigue pressure:**
   - Pure under-sampled positive → "Give this creative more budget and time. Evidence is promising but under-sampled."
   - Under-sampled positive with fatigue-watch signal already present → "Give this creative more budget and time, but fatigue signals are starting to appear. Re-evaluate within [X days]."
   Same label. Sharper instruction body.

**What does not need changing:**
- No label should be merged, split, or renamed based on current holdout evidence.
- `Scale Review` is the right name — do not rename it.
- `Cut` is the right name — do not rename it to "Kill" or add qualifiers.

### 4. Are Scale / Scale Review Now Credible?

**Scale: credible as a label, unproven in live runtime.**
The floor (strong baseline, ≥6 peer creatives, ≥$500 spend basis, ≥8 purchases basis, creative spend ≥ max($300, 1.3× median), purchases ≥6, ROAS ≥1.6× median, CPA ≤ median, favorable CT) is correctly strict. A media buyer seeing a `Scale` label under this floor would trust it. The problem is: with CT missing in 91% of the holdout cohort, the label is currently unreachable. Not wrong — just uncalled. This is acceptable if and only if `Scale Review` is working to surface the relative-winner signal underneath.

**Scale Review: credible as a concept, currently silent.**
Zero `Scale Review` rows across 293 evaluated creatives is the central problem. The `Scale Review` floor (medium+ baseline, ≥3 peer creatives, ≥$150 spend basis, ≥3 purchases basis, creative spend ≥ max($80, 0.2× median), purchases ≥2, ROAS ≥1.4× median, CPA ≤1.2× median) is on paper reasonable. But it is not firing.

The pass-5 current-eval noted: **4 rows clear true-Scale evidence but are capped by missing business validation.** Those 4 rows should be `Scale Review`. They are not. Something in the path from `has*Evidence` → `scale_review` segment is not connecting on live rows. Either the `relativeBaseline` context is not arriving with sufficient reliability, or a pre-`scale_review` gate is intercepting. This is the pass 6 investigation target.

A media buyer cannot trust `Scale Review` as credible until it starts firing on the rows that the internal evidence accounting says should reach it.

### 5. Are the Other Segments Operator-Usable?

**Test More:** Yes, with one caveat. Live-distinguished from `Not Enough Data` for under-sampled positives. The caveat is the instruction wording gap for fatigue-watch pressured positives (noted in Section 3). Operator-usable.

**Not Enough Data:** Yes, but the instruction wording must differentiate between "too early" and "high-spend zero-purchase weak Watch." Label is correct. Instruction body needs the split (also noted in Section 3). Operator-usable with that fix.

**Watch:** Yes. Holdout confirmed, 11 rows, no panel disagreement on its core cases. It is the boundary with `Scale Review` that is open (Section 4), not `Watch` itself.

**Protect:** Yes. 2 holdout rows, broad panel agreement. Label maps clearly to "do not touch." Structural protection is enforced via push readiness. Operator-usable.

**Campaign Check:** Yes. 3 holdout rows, broad panel agreement that campaign context is the real blocker when it fires. Replaces the meaningless old `investigate` routing. Operator-usable.

### 6. Is Commercial Truth Still Over-Gating?

**Mostly balanced. One remaining over-gating point.**

What is balanced:
- `Refresh`, `Protect`, `Watch`, `Test More`, and `Campaign Check` all survive CT missing.
- Kill evidence no longer requires CT to reach `kill_candidate`.
- Relative diagnosis is not being erased by CT absence.

What is still over-gating:
- **`Scale Review` is not firing when CT is missing but relative evidence is genuinely strong.** The 4 rows that clear true-Scale evidence but are capped by missing business validation should reach `Scale Review`. They do not. That is over-gating.
- It is not clear from the holdout reports whether the blocker is (a) the Decision OS upstream downgrading `promote_to_scaling` to `keep_in_test` when CT is absent, (b) the Creative policy `scale_review` path not triggering on the actual relative-evidence shape of these rows, or (c) the `relativeBaseline` context not arriving with sufficient reliability. Pass 6 must diagnose which.

### 7. Is Benchmark Scope Behavior Correct and Trustworthy?

**Yes.** Default account-wide. Campaign benchmark explicit only. Never silently re-segments on campaign filter change. Scope is visible on the page. Pass 3 implemented exactly what the naming review specified. Pass 5 holdout used account-wide scope across 101 rows and confirmed no implicit re-segmentation drift. No change needed.

The one non-blocking note: campaign benchmark has no live holdout representation (0 campaign-scope rows) because no operator-initiated campaign evaluation occurred in this cohort. The feature is implemented and tested; it simply has not been exercised by live usage yet.

### 8. Top 3 Remaining Product Risks

1. **Zero live `Scale Review` output destroys the credibility of the entire Creative page.** A professional media buyer opening the page sees no creative, anywhere, anytime, that the system thinks is worth reviewing for scale. Even if every safety concern is individually correct, the aggregate UI state reads as "the system has no opinion." This is the single highest-leverage gap to close.

2. **`Not Enough Data` is collapsing two operator-distinct states.** A $10-spend-early-stage creative and a $300-spend-zero-purchase creative share the same label. The first calls for patience. The second calls for a weak Watch with decision pressure. Keeping the same label with the same instruction text treats different operator situations identically, which erodes trust in the label's meaning.

3. **The `Watch` ↔ `Scale Review` ↔ `Protect` boundary on strong-relative-low-CT rows is unresolved.** Agent panels split three ways on the single most important holdout disagreement (`company-01/company-01-creative-03`). A boundary that splits that broadly across experienced reviewer lenses is not a single-agent calibration issue — it is a genuine floor question. A media buyer looking at that row today and seeing `Watch` would reasonably disagree with the system.

### 9. Is Pass 6 Needed?

**Yes, and it is small.**

The holdout validation proved the foundation. The taxonomy is right. Safety is correct. What remains is not a rewrite — it is a targeted surface of the `Scale Review` signal on live-shaped rows where evidence is already present, plus two narrow wording fixes. Pass 6 can be completed without changing queue/push/apply, without touching the `Scale` floor, without introducing new segments, and without expanding agent-vote-based tuning.

### 10. What Pass 6 Should Focus On

**Primary target: diagnose and close the `Scale Review` live-firing gap.**
- Take the 4 rows from the pass-5 current-eval that clear true-Scale evidence but are capped by missing business validation.
- Trace, per row, which gate blocks them from reaching `scale_review`: upstream Decision OS downgrade, Creative policy branch ordering, `relativeBaseline` shape/reliability, or peer-depth floor.
- Make the minimum targeted fix to the one gate that is genuinely misfiring. If the gate is policy-correct and the rows simply do not merit `Scale Review`, document that finding and leave policy unchanged.
- Verify with a fixture that the targeted fix does not regress any existing boundary case (especially `Watch` rows that should not become `Scale Review`).

**Secondary target: `Not Enough Data` instruction body split.**
- Keep the label.
- Split the instruction text into two variants: "too early — keep spending" and "meaningful spend, zero conversion signal — treat as weak Watch."
- The internal segment (`creative_learning_incomplete` vs `false_winner_low_evidence` vs high-spend-zero-purchase case) determines which instruction fires. No new internal segment needed.

**Tertiary target: `Test More` instruction body for fatigue-pressured rows.**
- Keep the label.
- Add a conditional instruction extension: when fatigue-watch signal is present alongside the under-sampled-positive signal, the instruction body must say so and recommend a specific re-evaluation window.

**Fourth target (only if Section 8 Risk 3 is actually reproducible on more than one row):** Evaluate whether `Scale Review` floor is one notch too high for holdout-shaped accounts. Do not retune from the single `company-01/company-01-creative-03` disagreement alone. If and only if Pass 6 primary investigation surfaces 3+ independent rows with the same boundary split, consider a narrow floor adjustment with a before/after holdout distribution comparison.

### 11. What Pass 6 Should NOT Do

- **Do not loosen `Scale` floors.** The true-`Scale` gate is correct. It stays strict. Let CT availability grow through upstream product work, not by relaxing the gate.
- **Do not loosen queue/push/apply safety.** The 12-gate apply chain stays intact. `Scale Review` remains review-only.
- **Do not add new labels.** No eleventh segment. No split of `Scale Review` into variants. No split of `Test More`. The 10-label taxonomy is the contract.
- **Do not rename labels.** Every proposed rename risks churning the mental model operators are starting to build. Leave names alone.
- **Do not make agent majority vote into policy.** The holdout panel is diagnosis. Any threshold change must come from a specific fixture with a specific mechanical reason, not from "most agents agreed."
- **Do not import old rule engine behavior into policy.** Old challenger is still worse on every meaningful dimension. Do not copy.
- **Do not add UI surfaces.** No new bucket, no new filter, no new panel. Instruction body text is the only UI surface that may change.
- **Do not retune `Cut` or any kill path from zero-holdout-evidence.** Insufficient data. Defer.
- **Do not expand benchmark scope logic.** Account-wide default + explicit campaign is correct.
- **Do not wait for pass 6 before continuing Meta canary rollout.** Creative Segmentation Recovery and Meta execution canary are independent tracks.

---

### Final Chat Summary

**Verdict:** READY WITH A FOCUSED PASS 6

**Top 3 Product Risks:**
1. Zero live `Scale Review` output on 293 evaluated creatives — the Creative page currently has no scale-worthy creatives anywhere, which reads as "the system has no opinion" to a media buyer
2. `Not Enough Data` collapses "too early" and "high-spend zero-purchase" into one label with one instruction, treating operator-distinct situations identically
3. `Watch` ↔ `Scale Review` ↔ `Protect` boundary on strong-relative-low-CT rows splits experienced agent panels three ways — an unresolved floor question, not a single-agent edge case

**Pass 6 needed:** Yes.

**Pass 6 focus (one sentence):** Diagnose and close the `Scale Review` live-firing gap on the 4 rows that already clear true-Scale evidence but are capped by missing business validation, plus split the `Not Enough Data` instruction body into "too early" vs "weak Watch" variants — no new labels, no floor loosening, no push/apply changes.
