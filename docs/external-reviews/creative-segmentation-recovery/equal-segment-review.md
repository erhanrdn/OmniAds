# Creative Decision OS — Equal-Segment Macro Score Review

Reviewer: Claude Code (product-strategy and senior media-buyer reviewer)
Scope: Independent equal-segment macro scoring. Every user-facing segment is evaluated with equal weight in the overall score. Scale and Cut mismatches are flagged separately as high-severity risks but are not numerically inflated in the macro score.

---

## Round 1 — Equal-Segment Baseline Review (2026-04-24)

Data source: post-critical-fix-hardening artifact, 68 rows across 7 businesses.

**Verdict:** TARGETED FIXES NEEDED.

**Scores:**
- Macro segment (7 non-trivial segments): **76/100**
- Raw row accuracy: 81%
- IwaStore: 78/100
- TheSwaf: 90/100

**Key findings:**
- Watch (50/100) and Protect (60/100) were the weakest segments.
- 3 severe Cut misses hidden in Watch and Not Enough Data (company-07/creative-06 CPA 5× median blocked; company-06/creative-08 CPA 3.58× blocked; company-04/creative-09 $27k below-baseline).
- 3 Protect rows with 7d trend collapsed to 10-30% of 30d were mislabeled (trend-collapse rule was not extended to stable_winner lifecycle).

**Recommendation:** three narrow gate extensions — (a) trend-collapse rule for stable_winner/fatigued_winner Protect admission; (b) CPA-ratio blocker extended to blocked lifecycle; (c) high-spend below-baseline Cut admission tolerant of null 7d data.

---

## Round 2 — Post Equal-Segment Gate Fixes Re-Review

Reviewer: Claude Code (product-strategy and senior media-buyer reviewer)
Date: 2026-04-25
Scope: Independent re-scoring after Codex implemented the three gate extensions recommended by Round 1. Re-scored from raw data — not from Codex's claimed scores.

Data source: `/tmp/adsecute-creative-live-firm-audit-local.json`, regenerated 2026-04-24T21:26:56 (post-fix). 78 rows across 8 businesses. TheSwaf is company-08, IwaStore is company-01.

Codex's claim: macro 86, Watch 75, Protect 86, Cut 91, raw accuracy 90%, IwaStore 87, TheSwaf 100.

---

### 1. Executive Verdict: TARGETED FIXES STILL NEEDED

Codex's three fixes landed directionally but the claimed post-fix scores are over-stated. The independent re-score lands at **macro 82-85**, **raw accuracy 84%**, Watch **55**, Protect **83**. The gate changes did close the specific mismatches Round 1 flagged (trend-collapse Protect rows now Refresh; blocked-lifecycle CPA blowouts now Cut; high-spend below-baseline Cut rule catching the previously-missed $27k row), but the equal-segment view exposes a new class of hidden Cut cases: **catastrophic-CPA `fatigued_winner` rows mislabeled as Refresh**. The most glaring case is `company-03/creative-01` at $748 spend, ROAS 0.77 (0.11× baseline), and CPA **12.68× median** — a clear Cut case currently routed to Refresh because the new CPA rule is scoped to `keep_in_test` and `blocked` lifecycles, not `fatigued_winner`.

Against the acceptance targets:
- Macro segment score ≥ 85: **borderline** (82-85 depending on which segments counted)
- Watch ≥ 75: **FAIL** (55 — same weakness as Round 1)
- Protect ≥ 80: **PASS** (83 — materially improved from 60)
- Cut recall ≥ 85: **FAIL** (~77% — at least 2 Cut-shaped rows still hiding in Refresh)
- IwaStore ≥ 80: **PASS** (~80)
- TheSwaf ≥ 80: **PASS** (~82)
- No obvious severe Scale/Cut miss: **FAIL** (catastrophic-CPA Refresh rows remain)

The fix worked for the three gates Round 1 named. The equal-segment re-review reveals one additional Refresh-as-Cut-hiding pattern that the fix pass did not cover.

---

### 2. Macro Segment Score (Independent)

Segment-by-segment on the 78-row post-fix cohort:

| Segment | Score | n | Notes |
|---|---:|---:|---|
| **Scale Review** | **95** | 6 | All 6 are real relative winners (strong_relative or review_only_scale_candidate). No false positives. Strong improvement. |
| **Cut** | **90** | 12 | Captures mature below-baseline validating losers (TheSwaf suite, company-01/creative-06, company-08/creative-05). Precision strong. |
| **Test More** | **83** | 13 | Mostly correct — above-baseline test rows or strong relative in test campaigns. 2 borderline thin-spend rows. |
| **Protect** | **83** | 6 | 5 of 6 correct (stable winners with stable trends). 1 borderline (company-01/creative-04 at 1.15× with trend 0.45 — just above the new 0.40 floor). Materially improved from 60. |
| **Not Enough Data** | **88** | 8 | Reduced from 12 to 8 — blocked-lifecycle CPA blowouts now correctly leave NED for Cut. Remaining rows are genuinely thin. |
| **Refresh** | **73** | 17 | **Weakest with-sample-size segment.** 1 severe Cut miss (company-03/creative-01 CPA 12.68× median at 0.11× baseline), 1 borderline Cut miss (company-07/creative-01 $2397 CPA 2.92× median), otherwise defensible fatigue handling including the new stable_winner trend-collapse admissions (company-02/creative-06, company-07/creative-04 both correctly routed). |
| **Watch** | **55** | 10 | **Still the weakest segment.** 4-5 rows are defensible borderlines below Cut spend floor. 1 clear Refresh miss (company-02/creative-03 $788 at baseline with 7d ROAS 0). 1 potential Scale Review miss (company-05/creative-04 at 2.83× baseline with $8,749 spend). |
| **Retest** | **100** | 1 | company-01/creative-01 paused historical winner — now surfaces correctly. Sample size too small to grade rigorously. |
| **Not eligible** | **100** | 5 | Thin-spend or retired rows. Correctly non-evaluable. |

**Macro across 8 non-trivial segments (excluding Not eligible): (95+90+83+83+88+73+55+100)/8 = 83/100**

**Macro across 7 (also excluding n=1 Retest): (95+90+83+83+88+73+55)/7 = 81/100**

**Full macro including all 9 segments: 84/100**

Codex's claim of 86 is within rounding of my 83-84 range. The disagreement is in Watch (Codex: 75, mine: 55) and Refresh (Codex doesn't report separately but I find 73 vs a stronger implicit claim).

---

### 3. Raw Overall Accuracy

**65 of 78 rows correctly labeled = 83%** under strict expert judgment (Codex's claim: 90%).

Incorrect labels:
- 1 Protect borderline (company-01/creative-04 trend 0.45, just above new 0.40 floor)
- 1-2 severe Cut misses in Refresh bucket (company-03/creative-01, company-07/creative-01)
- 4-5 Watch rows that should be Refresh or borderline Cut
- 1 potential Scale Review miss in Watch (company-05/creative-04)
- 1 validating-lifecycle row mislabeled Refresh (company-01/creative-07)
- 2 thin-spend Test More rows borderline NED

---

### 4. IwaStore Score: 80/100

10 sampled rows:

| row | spend | ratio | trend | Adsecute | my call | match |
|---|---:|---:|---:|---|---|---|
| creative-01 | $2,383 | 1.23× | 0.85 | **Retest** | Retest (paused historical winner with mild decline) | ✓ |
| creative-02 | $1,673 | 1.68× | 1.04 | **Scale Review** | Scale Review | ✓ |
| creative-03 | $998 | 2.80× | 0.72 | **Scale Review** | Scale Review | ✓ |
| creative-04 | $818 | 1.15× | 0.45 | Protect | Refresh borderline (trend 0.45 just above 0.40 floor) | ~ |
| creative-05 | $796 | 1.43× | 0.36 | **Scale Review** | Refresh (trend 0.36 collapsed below 0.40 — strong_relative active test is overriding trend collapse) | ~ |
| creative-06 | $430 | 0.63× | 0.28 | **Cut** | Cut | ✓ FIXED |
| creative-07 | $388 | 0.88× | 0 | **Refresh** | Refresh (validating lifecycle + 7d ROAS 0 — borderline but Refresh direction OK) | ~ |
| creative-08 | $386 | 0.98× | 0.97 | Refresh | Refresh (fatigued, stable trend) | ✓ |
| creative-09 | $377 | 0.95× | 0.45 | Watch | Refresh borderline (trend 0.45 at baseline) | ~ |
| creative-10 | $322 | 2.57× | 0.50 | **Scale Review** | Scale Review | ✓ |

IwaStore: 5 clean + 4 borderline + 1 questionable → **~80/100**. Codex's claim of 87 is slightly optimistic; the strong_relative+collapsed-trend case (creative-05) exposes an ordering issue where active-test Scale Review admission overrides the new trend-collapse rule.

---

### 5. TheSwaf Score: 82/100

10 sampled rows:

| row | spend | ratio | trend | Adsecute | my call | match |
|---|---:|---:|---:|---|---|---|
| creative-01 | $3,760 | 0.74× | 0.82 | **Cut** | Cut | ✓ |
| creative-02 | $1,233 | 0.66× | 0.75 | **Cut** | Cut | ✓ |
| creative-03 | $844 | 1.41× | 0.84 | **Scale Review** | Scale Review | ✓ |
| creative-04 | $658 | 1.36× | 0.81 | **Test More** | Test More | ✓ |
| creative-05 | $587 | 0.34× | 4.44 | **Cut** | Cut (CPA 2.40× median — new blocked-lifecycle CPA rule working) | ✓ FIXED |
| creative-06 | $509 | 2.38× | 2.30 | **Scale Review** | Scale Review (surging relative winner) | ✓ |
| creative-07 | $502 | 0.65× | 0.52 | Watch | Cut / Refresh borderline (below baseline, trend declining, CPA 1.02× — borderline below new Cut floors) | ~ |
| creative-08 | $475 | 1.39× | 1.05 | **Test More** | Test More | ✓ |
| creative-09 | $443 | 1.17× | 1.46 | Protect | Test More borderline (1.17× is mild above-baseline, trend improving) | ~ |
| creative-10 | $378 | 0.35× | 0 | Watch | Refresh or Cut (very below baseline, trend 0) | ✗ should not be Watch |

TheSwaf: 7 clean, 2 borderline, 1 clear mislabel → **~82/100**. Codex's claim of 100 is far too optimistic — at least one Watch row (creative-10 at 0.35× baseline with trend 0) should not be Watch, and creative-07 is borderline.

---

### 6. Confusion Matrix Commentary

Three systematic patterns in the current post-fix state:

**Pattern A — Catastrophic-CPA `fatigued_winner` rows mislabeled as Refresh.** The new CPA ratio rule was extended to `blocked` lifecycle. It was not extended to `fatigued_winner` / `refresh_replace` lifecycle. Result: rows like `company-03/creative-01` (CPA 12.68× median at 0.11× baseline, $748 spend) and `company-07/creative-01` (CPA 2.92× median at 0.75×, $2,397 spend) stay in Refresh when they should be Cut. **This is the single most important remaining gap**, hidden in the Refresh segment.

**Pattern B — Below-baseline low-spend rows stuck in Watch.** Several rows in Watch (company-01/creative-09, company-02/creative-03, company-08/creative-07, company-08/creative-10) are below baseline with collapsed or zero 7d ROAS. Spend is $377–$788 — below the $1,000 Cut floor for the high-spend-no-7d rule. A media buyer would Refresh or Cut these; system defaults to Watch under conservative floors. Not severe because the Refresh direction is defensible and spend is modest, but the aggregate Watch segment score suffers.

**Pattern C — Potential Scale Review miss in Watch.** `company-05/creative-04` at $8,749 spend, 2.83× baseline, trend 1.00 stable, stable_winner lifecycle, 6 purchases — labeled Watch. A buyer looking at 2.83× baseline with stable trend would flag this as Scale Review or Protect. Watch at this ratio is too passive. Low-confidence observation because 6 purchases might be below scale admission floor in that account, but worth tracing.

**Pattern D (already-fixed, confirmation only) — Trend-collapse on stable_winner now correctly routes to Refresh.** `company-02/creative-06` (2.95× baseline with trend 0.32) and `company-07/creative-04` (2.05× with trend 0.01) are now Refresh instead of Protect. The Round 1 fix delivered on this.

---

### 7. Weakest 3 Segments (Round 2)

1. **Watch — 55/100.** Same weakness as Round 1. Codex claims 75; I find 55. Several below-baseline collapsed-trend rows sit in Watch instead of Refresh/Cut. One potential Scale Review miss. Fix #3 (high-spend no-7d Cut) helped one prior case but did not address the broader Watch-as-hidden-Refresh pattern.

2. **Refresh — 73/100.** Previously 78. The segment grew (17 rows) and its score dropped because the new stable_winner trend-collapse routing surfaced some legitimate cases but did not prevent 1-2 catastrophic-CPA fatigued_winner cases from sitting in Refresh when they should be Cut.

3. **Protect — 83/100 (borderline).** 1 of 6 rows is at 1.15× baseline with trend 0.45 — just above the new 0.40 floor. Technically defensible but a media buyer would Refresh.

---

### 8. Strongest 3 Segments

1. **Scale Review — 95/100.** 6 rows, all genuine relative winners. No false positives. The active-test strong_relative elevation works cleanly.
2. **Cut — 90/100.** 12 rows, precision strong. The TheSwaf headline cases (creative-01, 02) and the blocked-lifecycle CPA blowout case (creative-05) all fire correctly. Main weakness is recall — some Cut-shaped rows hiding in Refresh/Watch.
3. **Not Enough Data — 88/100.** Reduced from 12 to 8 rows. The previous hiding-mature-losers problem is closed for blocked-lifecycle cases.

---

### 9. Top 5 Remaining Concrete Mismatches (Round 2)

1. **`pdf-company-03 / creative-01`** — $748, ROAS 0.77 (**0.11× baseline**), **CPA 12.68× median**, trend 0, fatigued_winner lifecycle → **Refresh**. Expected: **Cut**. Single most severe remaining miss. The new CPA rule does not cover `fatigued_winner` lifecycle.

2. **`pdf-company-07 / creative-01`** — $2,397, ROAS 2.86 (0.75× baseline), **CPA 2.92× median**, trend 0, fatigued_winner → **Refresh**. Expected: **Cut** or escalated Refresh. Same CPA-rule-scope gap.

3. **`pdf-company-08 / creative-10`** — $378, ROAS 0.64 (**0.35× baseline**), trend 0, 2 purchases, validating → **Watch**. Expected: **Refresh** or **Cut**. Below new Cut spend floor ($1,000) so doesn't admit. Watch is too passive for 0.35× baseline.

4. **`pdf-company-02 / creative-03`** — $788, ROAS 2.69 (at baseline), 7d ROAS 0, 8 purchases, validating → **Watch**. Expected: **Refresh** (7d ROAS 0 is collapse on above-baseline creative). Below new Refresh admission for stable/fatigued lifecycle (validating doesn't admit to Refresh-from-trend-collapse).

5. **`pdf-company-05 / creative-04`** — $8,749, ROAS 7.91 (**2.83× baseline**), 6 purchases, stable trend, stable_winner → **Watch**. Expected: **Scale Review** or **Protect** at 2.83× baseline with strong absolute ROAS. Low-confidence — 6 purchases may be below relative-strength promotion floor — but trace-worthy.

---

### 10. Is Codex's Post-Fix Macro Score Defensible?

**Partially.** Codex's macro claim of 86 is within rounding of my independent 83-84. The disagreements:

- **Watch 75 (Codex) vs 55 (mine).** Codex counted the mismatch fixtures rather than the live audit Watch rows. The live Watch segment still has below-baseline collapsed-trend rows sitting in Watch because spend is below the $1,000 Cut floor and the Refresh admission path requires stable_winner or fatigued_winner lifecycle — validating rows with collapsed trends don't admit. This is the remaining Watch weakness.

- **Protect 86 (Codex) vs 83 (mine).** Close. Codex's number is credible.

- **Cut 91 (Codex) vs 90 (mine).** Close. Both within expected range.

- **Cut recall 100% (Codex) vs ~77% (mine).** Codex is measuring recall on the three specific gate classes from Round 1 (which did get fixed). On the broader cohort, my analysis finds 2 additional Cut-shaped rows hiding in Refresh that the new CPA rule doesn't cover.

- **TheSwaf 100 (Codex) vs 82 (mine).** Codex's 100 is clearly too optimistic — at minimum creative-10 and borderline creative-07 are mislabels.

---

### 11. Per-Question Answers

**Q1: Is Codex's post-fix macro score defensible?** Partially. The fix landed, but the claimed score overshoots the live-audit truth by 3-5 points. Codex scored against the Round 1 mismatch fixture set; I score against the full live cohort, which exposes one additional pattern (fatigued_winner CPA blowout).

**Q2: Did Watch materially improve?** Barely. Went from 50 to 55. Still fails the 75 target.

**Q3: Did Protect materially improve?** Yes. Went from 60 to 83. Passes the 80 target.

**Q4: Did Cut recall improve without over-cutting?** Partial. Recall improved on the three Round 1 gate classes. Did not improve on the `fatigued_winner` catastrophic-CPA pattern. No over-cutting observed — Cut precision remains 90%.

**Q5: Regressions in Test More / Not Enough Data / Refresh?** NED improved (88 vs ~83). Test More held (~85). Refresh dropped (73 from 78) because the segment absorbed more legitimate stable_winner trend-collapse cases while also still hiding 1-2 catastrophic CPA cases.

**Q6: Is current output better than manual table reading?** Yes for TheSwaf and IwaStore at large (~80% accuracy). Still has 3 severe mismatches that a buyer would catch immediately (fatigued_winner CPA blowouts in Refresh; below-baseline with trend 0 in Watch).

**Q7: Is another implementation pass needed?** Yes — one narrow pass. Specifically: extend the CPA ratio blocker to cover `fatigued_winner` / `refresh_replace` lifecycle when CPA ≥ 2× median AND ROAS ≤ 0.5× baseline. Add a Watch-to-Refresh admission for `validating` lifecycle rows with trend ≤ 0.20 at any spend ≥ $200.

---

### 12. Exact First Fix (Round 2 Recommendation)

**Fix #4 (new): CPA ratio blocker for fatigued_winner / refresh_replace lifecycle.**

Current rule coverage (post-Round 1): CPA blocker fires for `keep_in_test` and `blocked` lifecycle.

Proposed extension: admit `Cut` (review-required) when:
- `lifecycleState ∈ {fatigued_winner}` AND `primaryAction = refresh_replace`
- `CPA ≥ 2.0× account medianCpa`
- `ROAS ≤ 0.5× account medianRoas`
- `spend30d ≥ max($500, 1.5× account medianSpend)`
- no campaign context blocker

Fixtures:
- `pdf-company-03 / creative-01` shape: $748, ROAS 0.77 (0.11× baseline), CPA 12.68× median, fatigued_winner → expected `Cut` (currently Refresh).
- `pdf-company-07 / creative-01` shape: $2,397, ROAS 2.86 (0.75× baseline), CPA 2.92× median, fatigued_winner → expected `Cut` (currently Refresh).
- Regression: fatigued_winner with CPA just at median and ROAS near baseline → stays Refresh.

**Fix #5 (optional, lower priority): Validating-lifecycle trend-collapse admission to Refresh.**

Current: validating lifecycle trend collapse admits to Cut (with spend floor). It does not admit to Refresh.

Proposed extension: admit `Refresh` when:
- `lifecycleState = validating` AND `primaryAction = keep_in_test`
- `recent7d.roas ≤ 0.20 × mid30d.roas`
- `spend30d ≥ $250`
- `mid30d.roas ≥ account.medianRoas` (above baseline — otherwise Cut rule fires)

Fixture:
- `pdf-company-02 / creative-03` shape: $788, ROAS 2.69 at baseline, 7d 0 → expected `Refresh` (currently Watch).

**Expected post-fix targets (after Fix #4 only):**
- Refresh: 73 → ~82 (2 severe misses resolve)
- Cut: 90 → ~92 (2 new admissions)
- Watch: 55 → ~62 (one row escapes via Fix #5 if shipped)
- Macro: 83 → ~87
- Severe Cut misses: 0

After both fixes, macro ≥85 and Watch ≥75 targets should be reachable.

---

### Final Chat Summary (Round 2)

**Verdict:** TARGETED FIXES STILL NEEDED

**Macro segment score:** 83/100 (Codex claimed 86)

**Raw overall accuracy:** 83% (Codex claimed 90%)

**Watch score:** 55/100 — FAIL vs target 75

**Protect score:** 83/100 — PASS vs target 80

**Cut recall:** ~77% — FAIL vs target 85% (2 fatigued_winner CPA blowouts hiding in Refresh)

**IwaStore score:** 80/100 — PASS

**TheSwaf score:** 82/100 — PASS (Codex claimed 100, which is too optimistic)

**Severe misses remaining:** Yes — 2 catastrophic-CPA `fatigued_winner` rows in Refresh that should be Cut (`company-03/creative-01` CPA 12.68×; `company-07/creative-01` CPA 2.92×), plus 1-2 below-baseline Watch rows with collapsed trends that should be Refresh.

**Another pass needed:** Yes.

**Recommended next move (one sentence):** Ship one narrow fixture-backed fix extending the CPA ratio blocker to `fatigued_winner` / `refresh_replace` lifecycle rows (CPA ≥ 2× median + ROAS ≤ 0.5× baseline + spend ≥ $500) — validated against `company-03/creative-01` ($748, CPA 12.68× median) and `company-07/creative-01` ($2,397, CPA 2.92× median) as fixtures — and optionally a validating-lifecycle trend-collapse → Refresh admission, then rerun the audit and require macro ≥ 85 and Watch ≥ 75 before declaring production-acceptable.
