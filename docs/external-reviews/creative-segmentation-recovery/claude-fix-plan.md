# Creative Decision OS — Claude Fix Plan

Author: Claude Code (product-strategy and senior media-buyer reviewer)
Date: 2026-04-25
Scope: Concrete implementation plan to close the remaining gap between current Creative Decision OS quality and the owner's 90+ per-segment acceptance bar. No code. No PR. Planning artifact only.

Data reconciliation note: The equal-segment scoring's "after" replay (Codex-reported, post-PR #61/#63) claims Watch 75, Refresh 84, Cut 92, Protect 83, Test More 83, Scale Review 95, NED 88, macro 87, raw 87%. The live artifact at `/tmp/adsecute-creative-live-firm-audit-local.json` (timestamp 2026-04-24T21:26:56) predates those merges and still shows the pre-fix distribution. This plan assumes the replay scores are correct for main and plans the next step against the **post-PR-#63 baseline of macro 87 / Watch 75 / Refresh 84**, not the pre-fix Round 3 numbers. A fresh live-audit rerun is prerequisite to verify the baseline before starting this plan's work.

---

## 1. Executive Verdict: TARGETED RECALIBRATION NEEDED

Current post-PR-#63 state (per Codex replay): macro 87, 5 of 7 represented segments below 90, 2 at or above. Three characteristics drive the gap:

- **Narrow gate fixes can close the Refresh and NED gaps** (both within 6 points of the 90 bar, with specific known mismatch patterns). These are fixture-backed one-line rule extensions.
- **Protect and Test More require a small classifier recalibration**, not a new gate. Each has 1-2 borderline rows where the classifier's relative-strength threshold is the deciding factor. Adjusting one decision boundary closes both segments.
- **Watch reaching 90 requires floor-policy reconsideration**, not a single fix. Several legitimate-borderline Watch rows sit there by current design — below the $1,000 Cut spend floor, below the validating-Refresh admission path, above the Not-Enough-Data floor. Reaching 90 on Watch means deciding whether those rows should escape to Refresh/Cut at lower spends, which is a product policy question with real over-fire risk.

Verdict: TARGETED RECALIBRATION NEEDED. The path to 90+ per segment is not a rebuild; it is three narrow fixture-backed gates (Refresh, NED, Test More) plus one product-policy decision (Watch spend floors). Scale Review and Cut already meet the bar. Protect is within one decision-boundary call of the bar.

---

## 2. Current Score Diagnosis

**Post-PR-#63 per-segment scores (Codex replay; unverified on fresh live audit):**

| Segment | Score | Target | Gap |
|---|---:|---:|---:|
| Scale Review | 95 | 90 | +5 (PASS) |
| Cut | 92 | 90 | +2 (PASS) |
| Not Enough Data | 88 | 90 | -2 |
| Refresh | 84 | 90 | -6 |
| Protect | 83 | 90 | -7 |
| Test More | 83 | 90 | -7 |
| Watch | 75 | 90 | -15 |
| Retest | 100 (n=1) | — | indeterminate |
| Scale | not represented | — | n/a |
| Campaign Check | not represented | — | n/a |

**Macro (represented non-trivial segments): 87/100**

**Raw overall accuracy: 87%**

**Weakest 3 segments:** Watch (75), Test More (83), Protect (83).
**Strongest 3 segments:** Scale Review (95), Cut (92), Not Enough Data (88).

**Unacceptable error types still at risk (must be zero in acceptance criteria):**
- Severe Cut miss = below-baseline mature loser hiding in Refresh or Watch
- Severe Scale/Scale Review miss = strong-relative above-baseline winner hiding in Protect or Watch
- Protect false positive = Protect on a creative with clear 7d collapse or above-floor CPA blowout
- NED false negative = mature meaningful-spend row with CPA ratio blowout hiding in NED

---

## 3. Prioritized Fix Plan

### Fix #1 — Validating-Lifecycle Trend-Collapse → Refresh Admission (Watch)

**Priority:** P1 — highest leverage.

**Product problem:** Below-baseline validating creatives with collapsed 7-day trends sit in Watch when a media buyer would Refresh. Watch is currently a catch-all for rows that don't meet Cut spend floors and don't admit to Refresh through stable_winner / fatigued_winner paths.

**Affected segment:** Watch (55 → ~68 expected); Refresh (84 → ~87 expected) secondary.

**Representative sanitized examples (from live artifact; same alias map as prior reviews):**
- `pdf-company-08 / creative-10`: $378, ROAS 0.64 (0.35× baseline), 7d ROAS 0, 2 purchases, validating, keep_in_test → Watch. Expected: Refresh.
- `pdf-company-02 / creative-03`: $788, ROAS 2.69 at baseline, 7d ROAS 0, 8 purchases, validating → Watch. Expected: Refresh.
- `pdf-company-06 / creative-02`: $131, ROAS 3.79 (0.62× baseline), trend 0, 6 purchases → Watch. Expected: borderline below current spend floor — fix should leave this one alone.

**Current Adsecute behavior:** Watch default for validating-lifecycle below-baseline rows below the high-spend Cut floor ($5,000) and Cut CPA floor (1.5× median); no validating Refresh admission path exists.

**Expected behavior:** Validating lifecycle rows with collapsed 7-day trend AND meaningful exposure AND at-or-below baseline ROAS should route to Refresh (review-required), not Watch.

**Likely gate/function:** `creative-operator-policy.ts` — add a new admission branch before the Watch fallback in the validating-lifecycle path.

**Deterministic rule candidate:**
```
Admit Refresh when:
  lifecycleState = validating
  primaryAction = keep_in_test
  recent7d.roas / mid30d.roas ≤ 0.25    (or recent7d.roas = 0 with mid30d.roas > 0)
  mid30d.roas < account.medianRoas       (below baseline)
  spend30d ≥ max($300, 2× account.medianSpend)
  purchases30d ≥ 2
  impressions30d ≥ 5000
  creativeAgeDays > 10
  no campaign/ad set context blocker
```

**Fixture tests:**
- `creative-10`-shape (spend $378, ratio 0.35, 7d 0, 2 purch, age > 10) → Refresh.
- `creative-03`-shape (spend $788, at baseline, 7d 0, 8 purch) → Refresh.
- Regression: thin-evidence row ($150 spend, 1 purch) → stays NED or Watch.
- Regression: above-baseline row with 7d dip → stays Test More or Watch (not newly admitted to Refresh).
- Regression: new validating creative age ≤ 10 → no Refresh admission (mature-evidence gate).

**Risk of overfitting:** Low-medium. The age-and-evidence gate mirrors the existing keep_in_test Cut admission from PR #61. The main risk is an over-aggressive 7-day collapse signal on a genuinely thin-volume creative — the age ≥ 10 days and purchases ≥ 2 guard against that.

**Expected score impact:** Watch 75 → ~80 (2-3 rows escape to Refresh/Cut); Refresh 84 → 87 (legitimate admissions); macro 87 → ~89.

---

### Fix #2 — CPA-Ratio Blocker on Fatigued Lifecycle

**Priority:** P1 — severe Cut miss coverage.

**Product problem:** Catastrophic-CPA rows in `fatigued_winner` / `refresh_replace` lifecycle are labeled Refresh. A buyer seeing CPA at 3-13× median would Cut immediately. The CPA rule was extended to `blocked` lifecycle in the critical-media-buyer-fixes pass but not to `fatigued_winner`.

**Affected segment:** Cut (92 → 93); Refresh (84 → 88).

**Representative sanitized examples:**
- `pdf-company-03 / creative-01`: $748, ROAS 0.77 (0.11× baseline), **CPA 12.68× median**, fatigued_winner, refresh_replace → Refresh. Expected: Cut.
- `pdf-company-07 / creative-01`: $2,397, ROAS 2.86 (0.75× baseline), **CPA 2.92× median**, fatigued_winner, refresh_replace → Refresh. Expected: Cut.

**Note:** Codex's per-segment report claims these are ALREADY routed to Cut after PR #61. If the replay is accurate, this fix may already be in main — a fresh live audit is the verification. If the replay claim is correct and the live policy matches, this fix becomes retroactive documentation rather than new work. If the fresh audit still shows these as Refresh, Fix #2 must be implemented.

**Current Adsecute behavior (pre-verification):** Refresh default on `fatigued_winner` + `refresh_replace` regardless of CPA ratio.

**Expected behavior:** Escalate catastrophic-CPA fatigued rows to Cut when CPA ≥ 2.0× median AND ROAS ≤ 0.5× baseline.

**Likely gate/function:** `creative-operator-policy.ts` — in the fatigued-winner routing branch, add a CPA-ratio pre-check before returning Refresh.

**Deterministic rule candidate:**
```
Escalate to Cut when:
  lifecycleState = fatigued_winner
  primaryAction = refresh_replace
  mid30d.cpa ≥ 2.0 × account.medianCpa        (catastrophic CPA)
  mid30d.roas ≤ 0.5 × account.medianRoas      (severely below baseline)
  spend30d ≥ max($500, 1.5× account.medianSpend)
  impressions30d ≥ 5000
  no campaign/ad set context blocker
```

**Fixture tests:**
- `creative-01` (company-03) shape: fatigued, CPA 12× median, ROAS 0.11× → Cut.
- `creative-01` (company-07) shape: fatigued, CPA 2.92× median, ROAS 0.75× → Cut.
- Regression: fatigued with CPA at 1.3× median, ROAS 0.8× → stays Refresh (doesn't over-fire).
- Regression: fatigued with catastrophic ROAS but CPA within 1.5× → stays Refresh (ROAS alone doesn't escalate).
- Regression: blocked lifecycle with CPA blowout → stays Cut via existing blocked-CPA rule (no double admission).

**Risk of overfitting:** Low. The 2.0× CPA and 0.5× ROAS thresholds are intentionally tighter than the keep_in_test and blocked equivalents to prevent over-cutting creatives in natural fatigue decline.

**Expected score impact:** Refresh 84 → 88 (2 severe misses leave); Cut 92 → 93 (precision maintained, recall improves); macro 87 → 89.

---

### Fix #3 — NED-to-Cut Escalation for Mature Meaningful-Spend Zero-Conversion Rows

**Priority:** P2 — closes remaining NED-as-Cut-hiding cases.

**Product problem:** Some mature `blocked` / `validating` rows with 1-purchase catastrophic CPA sit in Not Enough Data when spend is above a meaningful threshold but below current Cut floors. A buyer would Cut; system says "wait for more data" despite $400-$700 already burned.

**Affected segment:** Not Enough Data (88 → 90+); Cut (92 → 93).

**Representative sanitized examples:**
- `pdf-company-01 / creative-08` (historic sample): $174, 1 purchase, CPA 4.5× median, blocked — borderline (below new fix spend floor).
- Any 1-purchase $300-$500 rows with CPA ≥ 3× median and blocked lifecycle.

**Current Adsecute behavior:** Blocked lifecycle rows with 1 purchase fall through to NED when spend is below the $2000 kill-evidence floor.

**Expected behavior:** Admit Cut when NED candidate has meaningful spend + catastrophic CPA + very low ROAS, even at 1 purchase.

**Likely gate/function:** `creative-operator-policy.ts` — extend the existing blocked-CPA Cut admission with a lower spend floor specifically for 1-purchase rows.

**Deterministic rule candidate:**
```
Admit Cut when (extends existing blocked-CPA rule):
  lifecycleState = blocked
  primaryAction = block_deploy OR keep_in_test
  purchases30d ≥ 1 AND purchases30d < 4
  mid30d.cpa ≥ 3.0 × account.medianCpa           (higher CPA threshold for 1-purch cases)
  mid30d.roas ≤ 0.4 × account.medianRoas         (tight ROAS threshold)
  spend30d ≥ max($300, 2× account.medianSpend)   (lower spend floor than existing rule)
  impressions30d ≥ 8000
```

**Fixture tests:**
- $400 spend, 1 purch, CPA 4× median, ROAS 0.25× baseline, blocked → Cut.
- $200 spend, 1 purch, CPA 5× median → stays NED (below spend floor).
- $400 spend, 2 purch, CPA 1.8× median → stays NED (CPA below 3× threshold).

**Risk of overfitting:** Low-medium. Tight thresholds (3× CPA and 0.4× ROAS) mean only catastrophic failures escalate. The 1-purch guard prevents learning-phase rows from being Cut prematurely.

**Expected score impact:** NED 88 → 91 (1-2 cases leave); Cut 92 → 93; macro 89 → 90.

---

### Fix #4 — Protect Borderline Case: Extend Trend-Collapse Floor to 0.50

**Priority:** P3 — closes the one Protect borderline from Round 2/3.

**Product problem:** `company-01/creative-04` at 1.15× baseline with trend 0.45 sits in Protect because the new trend-collapse floor is 0.40. At 0.45, the trend is "mild collapse" but still concerning to a media buyer.

**Affected segment:** Protect (83 → 90+).

**Representative sanitized examples:**
- `pdf-company-01 / creative-04`: $818, ratio 1.15×, trend 0.45, stable_winner → Protect. Expected: Refresh borderline.

**Current Adsecute behavior:** Trend-collapse admits to Refresh only below 0.40 ratio for stable_winner/fatigued_winner lifecycle.

**Expected behavior:** Tighten the admission floor slightly for stable_winner to catch mild-to-moderate trend decline.

**Likely gate/function:** `isStableWinnerTrendCollapseRefreshCandidate` or equivalent — adjust trend threshold.

**Deterministic rule candidate:**
```
Replace trend threshold 0.40 with:
  lifecycleState = stable_winner AND ratio ≥ 1.0 AND ratio < 1.4 → trend ≤ 0.50 admits to Refresh
  lifecycleState = stable_winner AND ratio ≥ 1.4 → trend ≤ 0.40 admits (existing rule)
```

This tiers the collapse sensitivity: mildly-above-baseline stable winners admit at 0.50 trend collapse; strongly-above-baseline (1.4×+) stable winners require the stricter 0.40 floor because they have more buffer.

**Fixture tests:**
- `creative-04` shape (ratio 1.15, trend 0.45, stable_winner) → Refresh.
- Strong winner (ratio 1.8, trend 0.45) → stays Protect (needs 0.40 floor for strong winners).
- Regression: stable winner with trend 0.55 → stays Protect (above new 0.50 floor).

**Risk of overfitting:** Medium. Adjusting a working threshold risks destabilizing previously-correct Protect calls. Tiering by ratio keeps strong winners protected while recovering borderlines.

**Expected score impact:** Protect 83 → 90 (1 row escapes to Refresh); macro 90 → 90.

---

### Fix #5 — Test More Classifier Sensitivity for Thin-Spend Positives

**Priority:** P3 — closes Test More borderline cases.

**Product problem:** 2 thin-spend Test More rows (`company-05/creative-05`, `company-05/creative-06`) at $44-$59 spend with ROAS below account baseline are labeled Test More. A buyer would call these Not Enough Data because sample is too thin to merit "give more budget" guidance.

**Affected segment:** Test More (83 → 90+); NED (88 → ~88).

**Representative sanitized examples:**
- `pdf-company-05 / creative-06`: $44, ROAS 1.62, 2 purch → Test More. Expected: NED or stays Test More if under-sampled-positive classifier is tuned correctly.
- `pdf-company-05 / creative-05`: $59, ROAS 3.97 but 0.45× baseline → Test More.

**Current Adsecute behavior:** Under-sampled-positive classifier admits rows with some recent positive signal to Test More at thin spend.

**Expected behavior:** Require minimum spend threshold for Test More admission, below which rows route to NED.

**Likely gate/function:** under-sampled-positive classifier in `creative-operator-policy.ts`.

**Deterministic rule candidate:**
```
Test More admission additionally requires:
  spend30d ≥ max($60, 0.5 × account.medianSpend)     (lower bound for "meaningful test spend")
  mid30d.roas / account.medianRoas ≥ 0.8              (not materially below baseline)
  OR
  relativeStrengthClass ∈ {strong_relative, review_only_scale_candidate}
```

**Fixture tests:**
- $44 thin spend, ROAS 1.62 (0.18× baseline), 2 purch → NED (below new floor).
- $59 spend, ROAS 3.97 (0.45× baseline) → NED (below ratio floor).
- $92 spend, ROAS 3.08 (3.85× baseline), strong_relative → stays Test More.
- $100 spend, ROAS at baseline, 3 purch → stays Test More.

**Risk of overfitting:** Medium. The current Test More classifier fires correctly on strong relative winners even at thin spend; any stricter gate risks losing those correct admissions. Keeping the relative-strength override preserves them.

**Expected score impact:** Test More 83 → 90 (2 thin rows leave); NED 88 → ~88 (1-2 absorbed, net neutral); macro 90 → 90.

---

### Fix #6 — Potential Scale Review Miss Trace (Investigation Only)

**Priority:** P4 — not a fix, a diagnostic pass.

**Product problem:** `pdf-company-05 / creative-04`: $8,749 spend, 2.83× baseline, 6 purchases, stable_winner, stable trend → Watch. A buyer might elevate this to Scale Review given strong relative performance and meaningful spend.

**Affected segment:** Scale Review (95 — at bar); Watch (could improve slightly).

**Action:** Investigate before fixing. Trace why `relativeStrengthClass` is not promoting to `review_only_scale_candidate` or `strong_relative` despite 2.83× baseline. Two possible reasons:
1. Purchase count (6) is below the scale-review admission floor for this account's peer distribution.
2. Campaign is not explicitly named-as-test, so the active-test-campaign strong_relative elevation rule doesn't apply.

If (1): no fix — scale-review floor is intentionally strict.
If (2): a fix that elevates stable_winner + strong_relative in non-test campaigns is a product policy question with overfiring risk.

**Do not implement this as a code change without completing the trace first.**

---

## 4. Segment-by-Segment Plan

### Scale
- **Current quality:** not represented (no Scale rows in the cohort; correct because CT missing across all businesses).
- **Main confusion:** n/a.
- **Required fix:** none. Wait for CT availability.

### Scale Review
- **Current quality:** 95/100 — strongest segment.
- **Main confusion:** none of significance.
- **Required fix:** none. Preserve current floors.

### Test More
- **Current quality:** 83/100.
- **Main confusion:** thin-spend borderline rows labeled Test More when they should be NED.
- **Required fix:** Fix #5 (spend floor for Test More admission).

### Protect
- **Current quality:** 83/100.
- **Main confusion:** one borderline row at mild-collapse trend 0.45 stays Protect instead of Refresh.
- **Required fix:** Fix #4 (tier the trend-collapse floor by above-baseline ratio).

### Watch
- **Current quality:** 75/100 — weakest segment with meaningful sample size.
- **Main confusion:** below-baseline validating rows with collapsed trends sit in Watch when they should be Refresh or Cut.
- **Required fix:** Fix #1 (validating-lifecycle trend-collapse Refresh admission). Reaching 90+ on Watch may still require a separate floor-policy discussion because many low-spend borderlines sit in Watch by deliberate conservative safety design.

### Refresh
- **Current quality:** 84/100.
- **Main confusion:** catastrophic-CPA fatigued_winner rows stay Refresh when they should escalate to Cut.
- **Required fix:** Fix #2 (CPA blocker on fatigued lifecycle).

### Retest
- **Current quality:** 100/100 (n=1, not significant).
- **Main confusion:** n/a — insufficient sample to assess.
- **Required fix:** none. Continue monitoring first-sighting cases as the segment builds volume.

### Cut
- **Current quality:** 92/100 — passes bar.
- **Main confusion:** none systemic; recall has slight gap to the fatigued-CPA Refresh cases which Fix #2 addresses.
- **Required fix:** none direct. Fix #2 and Fix #3 improve Cut recall indirectly.

### Campaign Check
- **Current quality:** not represented (zero rows in cohort).
- **Main confusion:** n/a.
- **Required fix:** none. Campaign Check fires correctly when campaign context is weak; current sample has no such cases.

### Not Enough Data
- **Current quality:** 88/100.
- **Main confusion:** 1-2 mature meaningful-spend rows with catastrophic CPA stay NED when they should be Cut.
- **Required fix:** Fix #3 (lower spend floor on blocked-CPA Cut admission for 1-purch rows).

---

## 5. What NOT to Change

- **Do not loosen Scale floors.** Scale remains zero because CT is missing; that is correct behavior. When CT becomes available on an account, Scale should start to fire from the existing strict floor.
- **Do not change Scale Review admission for paused or non-test campaigns.** The deliberate gating (test-campaign context + active delivery) exists to prevent Scale Review from firing on historical artifacts. Changing it introduces over-fire risk.
- **Do not change `Protect` exclusion of `Scale Review`** for `hold_no_touch` stable winners in non-test campaigns. The rule works correctly — the remaining Protect issue is trend-collapse sensitivity, not scale promotion.
- **Do not loosen queue/push/apply safety.** All gate changes here must preserve `safe_to_queue` ≤ current set. Scale Review, Cut, Refresh, Retest remain review-only.
- **Do not widen the CPA rule to `stable_winner` with `hold_no_touch`.** Stable winners have a deliberate "don't touch" stance. Catastrophic CPA on a stable winner should first trigger trend-collapse Refresh (Fix #4's domain), not Cut.
- **Do not introduce new user-facing labels.** Taxonomy is closed at 10.
- **Do not change reporting-range authority.** Decision OS window remains authoritative; visible count changes under different reporting ranges are already correctly handled.
- **Do not treat old rule engine as truth.** It was and remains a losing challenger on every documented dimension.
- **Do not rebuild.** The current architecture is sound. All fixes are gate extensions at specific admission points.

---

## 6. Required Fixtures

Consolidated fixture list for the implementation PR(s):

**Fix #1 fixtures (Watch → Refresh):**
- validating + trend 0 + ratio 0.35 + spend $378 + 2 purch + age > 10 → Refresh
- validating + trend 0 + ratio 1.0 + spend $788 + 8 purch → Refresh
- validating + trend 0.25 + ratio 0.8 + spend $150 (below floor) → Watch (regression)
- validating + trend 0.3 + ratio 1.2 + spend $500 (above-baseline) → Test More or Watch (regression — no newly-admitted Refresh on above-baseline)
- validating + new creative age ≤ 10 → no Refresh admission (age gate regression)

**Fix #2 fixtures (fatigued CPA → Cut):**
- fatigued_winner + refresh_replace + CPA 12× median + ROAS 0.11× baseline + spend $748 → Cut
- fatigued_winner + refresh_replace + CPA 2.92× median + ROAS 0.75× baseline + spend $2397 → Cut
- fatigued_winner + refresh_replace + CPA 1.3× median + ROAS 0.6× baseline → stays Refresh (regression)
- fatigued_winner + refresh_replace + CPA 1.8× median + ROAS 0.45× baseline → stays Refresh (CPA below 2× threshold, ROAS just above 0.5× — no over-fire)
- blocked + CPA 3× median → stays Cut via existing blocked-CPA rule (no double admission)

**Fix #3 fixtures (blocked 1-purch → Cut):**
- blocked + 1 purch + CPA 4× median + ROAS 0.25× baseline + spend $400 → Cut
- blocked + 1 purch + CPA 5× median + spend $200 (below floor) → stays NED
- blocked + 2 purch + CPA 1.8× median → stays NED (CPA below threshold)
- blocked + 1 purch + CPA 10× median + ROAS 0.1× baseline + spend $350 → Cut

**Fix #4 fixtures (Protect tiered trend collapse):**
- stable_winner + ratio 1.15 + trend 0.45 → Refresh
- stable_winner + ratio 1.8 + trend 0.45 → stays Protect
- stable_winner + ratio 1.15 + trend 0.55 → stays Protect (above new 0.50 floor)
- fatigued_winner + ratio 1.15 + trend 0.45 → Refresh via existing rule (regression)

**Fix #5 fixtures (Test More spend floor):**
- under-sampled positive + spend $44 + ratio 0.18 + 2 purch → NED
- under-sampled positive + spend $59 + ratio 0.45 → NED
- under-sampled positive + spend $92 + ratio 3.85 + strong_relative → stays Test More (relative-strength override)
- under-sampled positive + spend $150 + ratio 1.0 + 3 purch → stays Test More

---

## 7. Acceptance Criteria

After implementation, a fresh live-firm audit must produce:

**Per-segment (90+ target):**
- Scale Review ≥ 90
- Cut ≥ 90
- Test More ≥ 90
- Protect ≥ 90
- Watch ≥ 85 (relaxed from 90 because reaching 90 on Watch structurally may require floor-policy changes outside this plan's scope)
- Refresh ≥ 90
- Retest: indeterminate while n < 5 (not free credit)
- Not Enough Data ≥ 90
- Scale, Campaign Check: not represented — no free credit

**Systemic (hard requirements, zero-tolerance):**
- No severe Scale or Scale Review miss: no strong-relative above-baseline winner hiding in Protect or Watch at ≥ 2.0× baseline with meaningful spend.
- No severe Cut or Refresh miss: no mature below-baseline loser (spend ≥ $500, ratio ≤ 0.5×) hiding in Watch, Refresh, or NED.
- No Protect hiding scale-worthy creatives: Protect rows must have ratio ≥ 1.3× AND trend > 0.50 OR ratio ≥ 1.6× AND trend > 0.40.
- No NED hiding mature losers: NED rows must have spend < $300 OR purchases ≥ 2 with CPA ≤ 3× median OR thin impressions.
- No Watch hiding clear action cases: Watch rows must have ratio in [0.6×, 1.2×] OR spend < relevant admission floor OR trend ambiguous (0.25 ≤ trend ≤ 0.75).

**Safety (unchanged):**
- Queue/push/apply eligibility: no change. Scale Review, Cut, Refresh, Retest remain review-only.
- Commercial Truth: no loosening. Scale requires CT.
- Benchmark scope: no change. Default account-wide, campaign benchmark operator-initiated.
- Selected reporting range: no authority change.

**Macro:**
- Macro segment score ≥ 89 (up from 87 post-Fix-1+2+3).
- Raw overall accuracy ≥ 90%.
- IwaStore ≥ 88.
- TheSwaf ≥ 88.

---

## 8. Recommended Codex Implementation Order

**Step 0 (prerequisite): Rerun the live-firm audit on current main.** The `/tmp` artifact predates PR #61/#63 and cannot be used to verify the post-fix baseline. A fresh audit is required to confirm the Codex-reported replay scores (Watch 75, Refresh 84, Cut 92, macro 87) match actual live behavior. If the fresh audit shows different numbers, the plan's fix sequencing may need to adjust.

**Step 1 (P1): Fix #2 — CPA blocker on fatigued lifecycle.** Only if fresh audit shows fatigued CPA blowouts still in Refresh. If they're already in Cut (per Codex replay), skip. Fixtures: `company-03/creative-01` and `company-07/creative-01` shapes.

**Step 2 (P1): Fix #1 — Validating trend-collapse Refresh admission.** Closes the largest Watch-to-Refresh gap. Fixtures: `company-08/creative-10` and `company-02/creative-03` shapes.

**Step 3 (P2): Fix #3 — NED-to-Cut escalation for 1-purch blocked rows.** Closes the remaining NED false negatives.

**Step 4 (P3): Fix #4 — Tiered trend-collapse for stable_winner Protect.** Closes the borderline Protect case.

**Step 5 (P3): Fix #5 — Test More spend floor.** Closes the thin-spend Test More misclassifications.

**Step 6 (investigation): Fix #6 trace.** Before any change, investigate why `company-05/creative-04` ($8,749 at 2.83× baseline) is not elevated. Report findings; do not implement without evidence.

**Step 7 (validation): Fresh live-firm audit rerun.** Verify all per-segment targets met. Check for regressions in strong segments (Scale Review must stay ≥ 95; Cut must stay ≥ 90).

**Constraints for every step:**
- Each fix must ship with its fixture set.
- Each fix must pass the full existing regression suite.
- No fix changes queue/push/apply.
- No fix changes taxonomy or UI.
- No fix is bundled with speculative policy changes beyond the named rule.

---

## Final Chat Summary

**Verdict:** TARGETED RECALIBRATION NEEDED

**Top 5 fixes (in recommended order):**
1. **Fix #2** — CPA blocker on `fatigued_winner` / `refresh_replace` lifecycle (catastrophic CPA → Cut). Two severe Refresh-as-Cut-hiding cases: `company-03/creative-01` (CPA 12.68× median), `company-07/creative-01` (CPA 2.92× median). *Only implement if fresh audit confirms these cases are still in Refresh.*
2. **Fix #1** — Validating-lifecycle trend-collapse → Refresh admission. Closes the largest Watch weakness. Cases: `company-08/creative-10` ($378, 0.35× baseline, 7d 0), `company-02/creative-03` ($788 at baseline, 7d 0).
3. **Fix #3** — NED-to-Cut escalation for mature 1-purch blocked-lifecycle rows with CPA ≥ 3× median and spend ≥ $300. Closes remaining NED hiding-mature-losers cases.
4. **Fix #4** — Tier the stable_winner trend-collapse floor: 0.50 for mild above-baseline (1.0–1.4×), 0.40 for strong above-baseline (≥1.4×). Closes `company-01/creative-04` borderline.
5. **Fix #5** — Add spend-floor to Test More admission (spend ≥ $60 AND ratio ≥ 0.8× OR strong_relative override). Closes 2 thin-spend Test More misclassifications.

**Are narrow fixes enough?** Yes, for all segments except Watch. Fixes #1–#5 should bring 6 segments to 90+ (Scale Review, Cut, Refresh, Protect, Test More, NED). Watch should reach ~85 but structural 90+ on Watch requires a separate floor-policy decision (what to do with low-spend below-baseline borderlines that are currently deliberately conservative).

**First Codex implementation target:** Step 0 — rerun the fresh live-firm audit on current main to verify the post-PR-#63 baseline before committing to Fix #1 or Fix #2. If the fresh audit confirms Codex's replay scores (Watch 75, Refresh 84, macro 87) match live behavior, start with Fix #1 (validating trend-collapse → Refresh). If the fresh audit still shows the fatigued CPA cases in Refresh, start with Fix #2 first.
