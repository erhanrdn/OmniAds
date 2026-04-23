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
