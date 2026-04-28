# Creative Decision OS — Independent Media-Buyer Product-Truth Review

Date: 2026-04-25  
Reviewer: Claude Code (independent product-strategy and senior media-buyer reviewer)  
Source artifact: `docs/operator-policy/creative-segmentation-recovery/reports/independent-media-buyer-review/artifacts/sanitized-independent-review.json` (78 rows, 8 businesses, last-30 ending 2026-04-24)  
Cross-referenced with: Round 1–3 equal-segment audits, the previously-merged primary-decision UI swap, and the latest STATE.md.

---

## 1. Executive Verdict

**TARGETED RECALIBRATION NEEDED**

I disagree with Codex's "BASELINE-FIRST REBUILD NEEDED" verdict. The mismatch evidence is real, but it is concentrated in **three gate families** that account for every critical and high-severity mismatch (13 of 13). Codex's own stop criterion in `recommended-rebuild-plan.md` says: *"A targeted patch is enough only if the parallel classifier shows that fewer than three gate families explain nearly all critical/high mismatches."* That criterion is **met**. A baseline-first parallel classifier is overkill for a 3-family recalibration; it preserves the work that's already correct (snapshot pass, six-primary UI swap, queue/push/apply safety, benchmark scope handling) while adding architectural risk.

The weak surface is the **lifecycle/action classifier upstream of the resolver**, not the resolver, the safety gates, the snapshot model, or the UI. Three narrow recalibrations close every critical and high mismatch this artifact contains.

---

## 2. Is Codex's Independent Review Credible?

**The evidence is credible. The "blind multi-agent panel" framing is not.**

Inspection of the artifact JSON reveals that **62 of 78 rows have all 10 agents returning identical expected segments, identical `why` text, identical missing-data lists, and identical boolean flags**. The remaining 16 rows show only 2 distinct opinions across the 10 personas. There is no real diversity of judgment in the panel — it is a single rule-derived synthesis wrapped in 10 agent personas. The "Performance Media Buyer" agent and the "Measurement & Attribution Skeptic" agent do not actually disagree on row-014; they return identical text down to the spend figure quoted.

This dramatically weakens any framing that "10 independent expert media buyers reached this conclusion." It is one analyst's expectation, applied deterministically.

That said, the **underlying mismatch evidence stands** because:
- The same patterns (Watch hides Refresh; Refresh softens Cut; relative-winner not promoted) have surfaced in three independent equal-segment audit rounds (Round 1, 2, 3) prior to this review.
- The raw row metrics are visible in the JSON and can be evaluated directly without trusting the panel's labels.
- I independently re-evaluated 9 of the worst mismatches against raw spend / ROAS / baseline / trend; 7 of the 9 are real Adsecute defects, 1 is borderline (panel may be wrong), 1 has been correctly resolved by Adsecute (row-059 catastrophic CPA → Cut).

**Bottom line:** the mismatch list is a credible product-truth signal even though the multi-agent framing is not.

---

## 3. My Own Score Estimate

**Equal-segment macro: 60–65/100** (Codex: 63). Agree.  
**Raw row accuracy: 65%** (Codex: 65%). Agree.  
**Weighted business-risk score: ~55–60/100** (Codex: 83). Disagree.

Spend distribution by severity tells a clearer business-risk story than Codex's 83/100 implies:

| Severity | Rows | Total spend | Share of spend |
|---|---:|---:|---:|
| match | 46 | $269,987 | 54% |
| **high** | **11** | **$220,238** | **44%** |
| medium | 14 | $6,253 | 1% |
| critical | 2 | $1,099 | <1% |
| low | 5 | $89 | <1% |

The high-severity mismatches concentrate **44% of all reviewed spend**, mostly in the live-company-04 cohort where multiple $20k–$60k creatives are routed Refresh when blind-buyer expectation is Cut, or routed Watch when expectation is Refresh. Even applying generous boundary-discount weighting, a ~55–60 weighted score is closer to truth than 83. Codex's score appears to under-weight spend in the live-company-04 high-severity cluster.

Per-segment estimates (precision + recall blended):

| User-facing segment | n | Estimate | Note |
|---|---:|---:|---|
| Cut | 12 | 80 | Precision strong; recall hurt by 4 fatigued_winner rows hiding in Refresh |
| Refresh | 23 | 65–70 | Absorbs 4 Cut-shaped rows + 3 Test More-shaped rows |
| Watch | 10 | 30 | 7 of 10 should be Refresh; same pattern Round 3 flagged |
| Scale Review | 6 | 70 | 3 should be Test More; 2 of 23 Refresh rows should have promoted to Scale Review |
| Test More | 7 | 75 | 3 should be Not Enough Data; otherwise reasonable |
| Not Enough Data | 14 | 75 | Some genuinely thin; some boundary cases |
| Protect | 1 | n/a | Sample too small |

Macro across 6 with-meaningful-sample segments: ~66.

**Cut precision is the safety-critical headline number.** Of 12 Cut rows, all 12 match expected (~100% precision visible in the comparison file). Cut **recall** is the weak side, not precision. This means the system is not over-cutting; it is under-cutting.

---

## 4. Worst 10 Mismatches (Independent Read)

Re-evaluated against raw metrics; ordered by business risk.

1. **row-041** (live-company-04, $59,729) — ROAS 1.70 (0.57× baseline), CPA $4,266 (1.57× median), 14 purchases, trend 0, fatigued_winner. Adsecute: Refresh. Expected: **Cut**. Confirmed: $59k below-baseline waste should not be Refresh-only. Severity: high.
2. **row-042** (live-company-04, $35,593) — ROAS 2.80 (0.94× baseline), CPA at baseline, 14 purchases, trend 0, validating. Adsecute: Watch. Expected: **Refresh**. Watch is too passive at $35k spend with collapsed 7d. Severity: high.
3. **row-043** (live-company-04, $33,803) — ROAS 1.92 (0.64× baseline), trend 0, fatigued_winner. Adsecute: Refresh. Expected: **Cut**. Confirmed: refresh_softened_cut. Severity: high.
4. **row-044** (live-company-04, $32,253) — ROAS 2.42 (0.81× baseline), trend 0, 15 purchases, validating. Adsecute: Watch. Expected: **Refresh**. Same Watch-hides-Refresh pattern. Severity: high.
5. **row-046** (live-company-04, $29,125) — ROAS 2.03 (0.68× baseline), CPA $4,854 (1.78× median), **only 6 purchases on $29k**, fatigued_winner. Adsecute: Refresh. Expected: **Cut**. Severity: high. Strong Cut case.
6. **row-048** (live-company-04, $24,531) — ROAS 2.64 (0.89× baseline), trend 0, 9 purchases, validating. Adsecute: Watch. Expected: **Refresh**. Severity: high.
7. **row-014** (live-company-01, $785) — ROAS 4.31 (1.67× baseline), CPA $60 (0.61× median), **trend 2.10× UP**, 7d ROAS 9.08, lifecycle=fatigued_winner. Adsecute: Refresh. Expected: **Scale Review**. Severity: critical. **Lifecycle classifier defect**: a creative with 7d ROAS 2× the 30d ROAS cannot reasonably be fatigued_winner.
8. **row-069** (pdf-company-02, $3,873) — ROAS 1.40 (0.80× baseline), 30 purchases, trend 0.85, 7d ROAS 1.19, validating. Adsecute: Watch. Expected: **Refresh**. Severity: high. Below-baseline at $3.8k spend with 30 purchases — Watch is too passive.
9. **row-074** (pdf-company-02, $518) — ROAS 1.15 (0.66× baseline), trend 0.51 sharp down, 7d ROAS 0.59, validating. Adsecute: Watch. Expected: **Refresh**. Severity: high. Below-baseline + trend collapse on a 7-day window.
10. **row-078** (pdf-company-02) — Refresh → Cut, refresh_softened_cut pattern, fatigued_winner with high CPA. Severity: high.

**Two notes on Codex's worst-10 list I disagree with:**

- **row-016** (live-company-01, $314) is listed as critical "relative_winner_not_promoted" (Refresh → Scale Review). My read: 30d ROAS is 7.57 (very strong) but 7d ROAS collapsed to 2.33 — a 70% drop in the most recent week. Adsecute's Refresh is **defensible** here; the panel is over-weighting 30d strength and ignoring trend collapse. Mark this as a panel error, not an Adsecute defect.

- **row-059** (live-company-06, $2,397) is now correctly labeled as **Cut** by Adsecute (per the artifact's `currentAdsecuteDetailedSegment: Cut` and `currentAdsecutePrimaryDecision: Cut`). This is the catastrophic-CPA fatigued_winner row that Round 2/3 audits flagged as a critical Cut miss. **Adsecute has fixed at least one instance of this pattern** since Round 3, even though the policy is not generalized to all `fatigued_winner` rows (rows 041, 043, 046, 078 still leak Cut into Refresh).

---

## 5. Is Current Output Better Than Manual Table Reading?

**Mixed — partially better.**

- **Better than manual reading for:** Scale Review identification (6 rows, all real relative winners; precision strong); Cut precision (12 rows, all match expected — the system is not falsely cutting); the simplified six-primary UI surface that lets a buyer scan in seconds; reason tag chips (`Catastrophic CPA`, `Below baseline waste`, `Trend collapse`, `Comeback candidate`) that surface severity even when the primary label is wrong.

- **Not reliably better for:** Watch and Refresh classification at $20k–$60k spend levels. A buyer scanning the live-company-04 cohort would catch the 6 high-severity mismatches there immediately (Refresh-as-Cut, Watch-as-Refresh). A buyer who trusts the system would miss them.

- **A buyer using Adsecute as a starting point** still has to re-verify Watch and Refresh rows manually before action — which defeats the product goal in the charter ("A strong Meta media buyer should trust the recommendations enough to act on them immediately, without needing to second-guess").

So: clear value on Scale Review and Cut precision; not yet clear value on Watch/Refresh boundaries. Net: useful filter, not yet trustworthy operator.

---

## 6. Is the Current Architecture Salvageable?

**Yes — clearly.**

The current architecture has four distinct layers; only one is broken:

| Layer | Status |
|---|---|
| **Snapshot model + manual run** | sound (PR #66 reviewed PASS WITH SMALL FIXES) |
| **Six-primary resolver + UI swap** | sound (PR #69/#70 reviewed PASS WITH SMALL FIXES) |
| **Queue/push/apply safety + benchmark scope + business validation gates** | sound across all audit rounds |
| **First-pass lifecycle/action classifier** | **broken in three specific places** |

The defects all live in the upstream classifier that produces `lifecycleState` and `primaryAction`. The downstream resolver, the snapshot/manual-CTA model, and the safety gates are correct. Tearing those down to "rebuild baseline-first" would discard 80% of the work that already passes review and replace it with a parallel system that has to re-pass all the safety reviews.

The actual defect surfaces are:

- **Defect A (lifecycle classifier):** A creative with `recent7d.roas / mid30d.roas ≥ 2.0` cannot be `fatigued_winner`. Row-014 violates this (trend ratio 2.10×, lifecycle fatigued_winner). The lifecycle classifier ignores up-trend in determining fatigue.
- **Defect B (Refresh-vs-Cut admission):** `fatigued_winner` rows with high spend + below-baseline ROAS need Cut admission. The CPA-blocker fix to extend to fatigued_winner has been recommended for three rounds and still has not shipped. This was confirmed in this review's row-041, row-043, row-046, row-078.
- **Defect C (Watch-vs-Refresh admission):** `validating` lifecycle rows below baseline with collapsed 7d trend or zero recent week need Refresh admission below current spend floors. Currently these stay in Watch because the Refresh admission requires `stable_winner` or `fatigued_winner` lifecycle. Confirmed in rows 042, 044, 048, 069, 074, 021, 029.

---

## 7. Recommended Next Direction

**Targeted recalibration, three narrow gate adjustments, all fixture-backed against this exact artifact.**

The recalibration order, by business-risk impact:

1. **Defect B first** ($150k+ of high-severity spend impact). Extend the CPA / spend-floor Cut admission to `fatigued_winner` lifecycle so rows like 041, 043, 046, 078 route to Cut. Concrete rule: admit Cut when `lifecycleState ∈ {fatigued_winner, refresh_replace}` AND `roas ≤ 0.80 × baselineRoas` AND `spend30d ≥ max($1500, 3× medianSpend)`. CPA threshold is secondary — high spend below baseline is enough.

2. **Defect C second** ($75k+ of high-severity spend impact). Extend Refresh admission to validating-lifecycle below-baseline rows. Concrete rule: admit Refresh when `lifecycleState = validating` AND `mid30d.roas ≤ 0.85 × baselineRoas` AND (`recent7d.roas ≤ 0.50 × mid30d.roas` OR `recent7d.spend > 0 AND recent7d.purchases = 0`) AND `spend30d ≥ $300`.

3. **Defect A third** (low spend impact but critical severity). Add a guard: a creative cannot be classified `fatigued_winner` if `recent7d.roas / mid30d.roas ≥ 1.5`. The existing fatigue inputs (frequency pressure, ROAS decay) need an up-trend override.

**Codex's parallel report-only classifier** is acceptable as a comparison harness — but only as a diagnostic tool to validate the targeted patches against this fixture and the next live cohort, not as a replacement architecture.

**Stop criterion (mine, not Codex's):** If after the three recalibrations the next live-firm audit shows critical/high mismatches still spread across more than 3 gate families, escalate to a baseline-first parallel classifier as Codex recommends. Until then, do not.

---

## 8. Exact First Implementation Task

**Extend Cut admission to `fatigued_winner` / `refresh_replace` lifecycle (Defect B).**

Files: `lib/creative-operator-policy.ts` (segment routing) and the relevant Cut admission helper.

Concrete change — admit Cut when **all** of:
- `lifecycleState ∈ {fatigued_winner}` AND `primaryAction ∈ {refresh_replace, hold_no_touch}`
- `mid30d.roas ≤ 0.80 × baselineMedianRoas`
- `spend30d ≥ max($1,500, 3 × baselineMedianSpend)`
- no campaign context blocker
- no preview-missing block

Fixtures (all from this review's artifact):
- row-041 shape: $59,729, ROAS 1.70 (0.57× baseline), fatigued_winner → expected `Cut` (currently Refresh).
- row-043 shape: $33,803, ROAS 1.92 (0.64× baseline), fatigued_winner → expected `Cut`.
- row-046 shape: $29,125, ROAS 2.03 (0.68× baseline), 6 purchases on $29k, fatigued_winner → expected `Cut`.
- row-078 shape: pdf-company-02 high-spend below-baseline fatigued_winner → expected `Cut`.

Regression fixtures (must remain Refresh, not Cut):
- fatigued_winner with ROAS at or above baseline and trend collapsed → stays `Refresh`.
- fatigued_winner with ROAS slightly below baseline (0.85×–0.95×) at low spend → stays `Refresh`.
- fatigued_winner with `recent7d.roas / mid30d.roas ≥ 1.5` (recovery) → stays `Refresh` and lifecycle re-evaluated.

Acceptance:
- All four target rows route to Cut.
- All regression fixtures stay Refresh.
- Cut precision on the 78-row artifact stays ≥ 90%.
- Cut recall on the same artifact rises from ~75% to ≥ 90%.
- No queue/push/apply gate is loosened; Cut admission goes through `manual_review` sub-tone like all current Cut rows.

This single change closes **4 of 11 high-severity mismatches** and lifts the equal-segment Refresh score from ~67 to ~80 and Cut recall from ~75% to ~90%.

After this fix lands, run the next live-firm audit and reassess whether Defect C is still present at the same intensity before shipping the second recalibration.

---

## 9. What Should NOT Be Done

- **Do not rebuild the architecture baseline-first.** Three of four layers are sound. Replacing them with a parallel system trades known correctness for unknown risk and ignores Codex's own stop criterion (≤3 gate families explain critical/high mismatches).
- **Do not promote the old rule challenger to authority.** Multiple rounds confirm it is useful as smoke-signal only, not as policy truth.
- **Do not interpret the "10-agent blind panel" as 10 independent reviewers.** The artifact shows 62 of 78 rows have unanimous identical agent text. Treat the panel output as one analyst's expectation, useful as a benchmark but not as consensus.
- **Do not loosen queue/push/apply gates** to accommodate the Watch-as-Refresh fix. The Refresh admission expansion should remain `manual_review` sub-tone.
- **Do not add a 7th primary segment.** The six-primary UI is correct; the defect is upstream.
- **Do not couple the Defect B fix with Defect C in a single PR.** Ship them sequentially so each can be measured against the same fixture.
- **Do not let the next pass repackage these recalibrations as a fix-all "lifecycle classifier rewrite."** The lifecycle classifier needs **one** guard (Defect A), not a rewrite.

---

## Final Chat Summary

- **Verdict:** TARGETED RECALIBRATION NEEDED
- **Current output better than manual table reading:** partially. Yes for Scale Review and Cut precision. No for Watch and Refresh boundary calls at $20k+ spend. Net: useful starting point, not yet trustworthy operator.
- **Weighted score estimate:** ~55–60/100 (spend-weighted, factoring 44% of spend on high-severity mismatches). Codex's 83 looks high; their weighting under-counts the live-company-04 cluster.
- **Equal-segment score estimate:** ~63–66/100 (matches Codex's 63 within rounding). Watch is the weakest segment at ~30; Cut precision is the strongest at ~95.
- **Recommended next move (one sentence):** Ship one targeted recalibration that extends Cut admission to `fatigued_winner` lifecycle (rule: `lifecycleState=fatigued_winner` AND `roas ≤ 0.80× baseline` AND `spend ≥ max($1,500, 3× medianSpend)` → Cut at `manual_review` sub-tone), validate on the four live-company-04 high-spend fixtures from this artifact (rows 041, 043, 046, 078), then rerun the live-firm audit before deciding whether the Watch-hides-Refresh recalibration (Defect C) and the lifecycle up-trend guard (Defect A) need to ship as separate passes or as one combined pass.
