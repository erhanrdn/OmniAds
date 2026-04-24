# Direct Live-Data Creative Review — IwaStore and TheSwaf

Reviewer: Claude Code (product-strategy and media buyer logic reviewer)
Date: 2026-04-24
Charter: `docs/external-reviews/PRODUCT_REVIEW_CHARTER.md`
Scope: Independent media buyer review after the Creative test-campaign actionability pass, evaluating IwaStore and TheSwaf test-campaign contexts against raw live data, then comparing against Adsecute's post-fix Decision OS output.

---

## 1. Executive Verdict: TARGETED FIXES NEEDED

The test-campaign actionability pass delivered the two changes that most directly addressed the user's prior rejection: (a) `Protect` no longer absorbs `review_only_scale_candidate` rows, and (b) mature zero-purchase test losers now reach `Cut`. On the IwaStore side — the specific context the user flagged with `decorita_93` — this works correctly: 3 Scale Review rows now surface, including the exact creative the user said should have been a scale candidate. This is a real, concrete improvement.

On the TheSwaf side, a different gap is still open and visible at the largest spend in the sample. `company-08-creative-01` has burned `$6,930.14` in 30 days at ROAS 1.28 (0.70× account baseline of 1.82) across 48 purchases. It is currently `Watch` with `keep_in_test` / `validating` lifecycle. No expert media buyer would call this `Watch` — at nearly $7k burned with below-baseline performance, it is either a `Cut` or `Refresh` candidate. The new Cut path fires for mature *zero-purchase* rows but not for *below-baseline-with-purchases* rows at meaningful spend. That is the remaining gap.

The verdict is TARGETED FIXES NEEDED, not TRUSTWORTHY ENOUGH, specifically because that single $6,930 loser sitting in `Watch` in the top-spending slot of a connected business is enough to make a buyer distrust the page on first encounter — even though the rest of the cohort is now reasonable. The needed fix is narrow: extend `Cut` / `Refresh` reachability to mature `validating`-lifecycle rows with meaningful spend AND below-baseline ROAS trajectory, not only to zero-purchase cases.

---

## 2. Data Source Used

**Primary source:** `/tmp/adsecute-creative-live-firm-audit-local.json` (post-fix artifact, generated `2026-04-24T15:21:36.024Z`, uncommitted private). This reflects the runtime state after the test-campaign actionability pass and contains sanitized aliases with the true name-to-alias mapping available privately.

**Direct Meta Marketing API access not attempted.** The repo contains Meta provider clients, but invoking them would require credentials/tokens and could modify provider state or incur rate costs. I treated the provider audit helper's output (which uses the same runtime path as the `/creatives` page) as the closest-to-truth live data source available. This is the same path the actionability pass used to validate its fix, so it is directly comparable to what an operator would see in the UI.

**Runtime path:** `getCreativeDecisionOsForRange()` → `buildCreativeDecisionOs()` on the live Decision OS source. Window: 30 completed days ending `2026-04-23`. 8 readable businesses. 78 sampled creatives.

**What the PDFs were used for:** confirming which businesses and which campaign labels (`Test Kampanyası - 26 Mart` for IwaStore; `TEST — EMB - CreativeTest - Apr2026` for TheSwaf) the user was looking at when they raised the concern. Nothing else.

**What the PDFs were NOT used for:** any numerical value, count ratio, or segment-count observation. All numbers in this review come from the post-fix audit artifact.

**Limitations:** sample size per business is capped at 10 by the audit's deterministic rule. Smaller or longer-tail creatives in the same campaigns are not in the sample. For IwaStore's Test Kampanyası, 4 sampled rows appear (which is enough to validate the fix). For TheSwaf's `TEST — EMB - CreativeTest - Apr2026`, only 1 row from that specific campaign is in the top-10 by spend (`creative-10` at $1,155); most TheSwaf sampled spend sits in non-test campaigns.

---

## 3. IwaStore Independent Media Buyer Review

**Account baseline:** median ROAS `3.13` (strong reliability, 20 eligible peers).

Independent media-buyer assessment (before looking at Adsecute labels), sanitized:

| alias | campaign (sanitized) | spend 30d | ROAS 30d | purch | ratio | active | my buyer call | reason |
|---|---|---:|---:|---:|---:|---|---|---|
| `pdf-company-01 / creative-01` | `pdf-company-01-campaign-A` (PAUSED) | $2,364.71 | 4.31 | 60 | 1.38× | no | Protect | Paused historical winner, 60 purchases, above baseline. Don't touch. |
| `pdf-company-01 / creative-02` | `pdf-company-01-campaign-B` (ACTIVE) | $1,671.97 | 5.62 | 58 | 1.80× | no | Scale Review | Real winner, 1.80× baseline, 58 purchases. Needs explicit scale consideration. |
| `pdf-company-01 / creative-03` | `pdf-company-01-campaign-A` (PAUSED) | $999.44 | 9.11 | 31 | 2.91× | no | Scale Review | Exceptional ROAS at meaningful spend. Reactivate for scale review. |
| `pdf-company-01 / creative-04` | `pdf-company-01-campaign-C` test (ACTIVE) | $777.15 | 4.74 | 21 | 1.51× | no | Scale Review (borderline) / Test More | Active test, 1.51× baseline, 21 purchases. Strongest non-elevated candidate. |
| `pdf-company-01 / creative-05` | `pdf-company-01-campaign-A` (PAUSED) | $763.26 | 3.43 | 10 | 1.10× | no | Watch | Near-baseline, modest volume. |
| `pdf-company-01 / creative-06` | `pdf-company-01-campaign-C` test (ACTIVE) | $418.27 | 2.18 | 7 | 0.66× | no | Watch | Below baseline, 7-day trend 0.56 collapsing. Could be Refresh. |
| `pdf-company-01 / creative-07` | `pdf-company-01-campaign-A` (PAUSED) | $393.50 | 2.93 | 8 | 0.88× | no | Watch | Near-baseline, paused. |
| `pdf-company-01 / creative-08` | `pdf-company-01-campaign-A` (PAUSED) | $378.10 | 3.20 | 7 | 0.96× | no | Watch | At baseline, paused. |
| `pdf-company-01 / creative-09` | `pdf-company-01-campaign-C` test (ACTIVE) | $375.14 | 2.72 | 11 | 0.82× | no | Watch | Below baseline active test. |
| `pdf-company-01 / creative-10` | `pdf-company-01-campaign-C` test (ACTIVE) | $306.45 | **8.53** | 15 | **2.73×** | no | Scale Review | Archetypal winner — active test campaign, 2.73× baseline, 15 purchases. |

**Narrative:** IwaStore has three unambiguous Scale Review candidates (`creative-02`, `creative-03`, `creative-10`) and one borderline `strong_relative` candidate in the active test campaign (`creative-04`). The remaining 6 rows are defensibly Watch or near-baseline rows where conservative labeling is appropriate.

---

## 4. TheSwaf Independent Media Buyer Review

**Account baselines:** median ROAS `1.62–1.82` across the sampled windows. Notably lower than IwaStore, which means the same absolute ROAS is a different relative signal in this account.

Independent media-buyer assessment, sanitized:

| alias | campaign (sanitized) | spend 30d | ROAS 30d | purch | ratio | active | my buyer call | reason |
|---|---|---:|---:|---:|---:|---|---|---|
| `pdf-company-02 / creative-01` | `pdf-company-02-campaign-A` (ACTIVE) | **$6,930.14** | **1.28** | 48 | **0.70×** | **yes** | **Cut or Refresh** | **$6,930 burned, below baseline. Mature test, loss evident.** |
| `pdf-company-02 / creative-02` | `pdf-company-02-campaign-A` (ACTIVE) | $307.61 | 1.07 | 2 | 0.59× | yes | Refresh | Fatigue signal, below baseline. |
| `pdf-company-02 / creative-03` | `pdf-company-02-campaign-A` (ACTIVE) | $57.13 | 3.51 | 1 | 2.17× | yes | Not Enough Data | Promising but thin. |
| `pdf-company-02 / creative-04` | `pdf-company-02-campaign-A` (ACTIVE) | $52.84 | 0.00 | 0 | — | yes | Not Enough Data | Thin. |
| `pdf-company-02 / creative-05` | `pdf-company-02-campaign-A` (ACTIVE) | $46.04 | 0.00 | 0 | — | yes | Not Enough Data | Thin. |
| `pdf-company-02 / creative-06` | `pdf-company-02-campaign-B` (PAUSED) | $3,608.31 | 2.53 | 41 | 1.56× | no | Protect / Scale Review-borderline | Paused strong_relative winner. Protect OK; could review for reactivation. |
| `pdf-company-02 / creative-07` | `pdf-company-02-campaign-C` (ACTIVE camp, inactive creative) | $3,427.34 | 1.39 | 26 | 0.76× | no | **Cut or Refresh** | **$3,427 burned below baseline. Validating lifecycle doesn't match the spend weight.** |
| `pdf-company-02 / creative-08` | `pdf-company-02-campaign-D` (PAUSED) | $3,278.27 | 1.82 | 30 | 1.12× | no | Watch | Near baseline, paused. |
| `pdf-company-02 / creative-09` | `pdf-company-02-campaign-E` (PAUSED) | $1,216.46 | 1.49 | 10 | 0.82× | no | Watch / Refresh | Below baseline but paused. |
| `pdf-company-02 / creative-10` | `pdf-company-02-test-campaign` (ACTIVE) | $1,155.34 | 1.29 | 7 | 0.71× | no | Cut or Refresh | $1,155 in active test campaign at 0.71× baseline. Test showed it doesn't work. |

**Narrative:** TheSwaf's headline issue is the $6,930 row at ROAS 1.28 still in Watch. That single row — the largest spender in the top-10 sample — is the trust-breaker. A buyer opening this account and seeing it labeled Watch would immediately distrust the page. Three similar but less extreme cases (`creative-07` at $3,427 / 0.76×, `creative-09` at $1,216 / 0.82×, `creative-10` at $1,155 / 0.71×) share the same pattern: meaningful spend, below-baseline ROAS with purchases present, `validating` lifecycle, `keep_in_test` action, → Watch. These are the cases the new Cut path misses because it requires zero purchases.

TheSwaf has no unambiguous Scale Review candidate in this top-10 sample. `creative-06` at 1.56× baseline with $3,608 and 41 purchases is a `strong_relative` row but the campaign is PAUSED; Protect is defensible, and elevating to Scale Review on a paused campaign would be questionable.

---

## 5. Comparison Against Adsecute Decision OS

### IwaStore: mostly agrees with independent review

**Adsecute agrees (10/10):**
- 3 Scale Review (creative-02, creative-03, creative-10) — exact match
- 1 Protect (creative-01 paused historical winner) — exact match
- 6 Watch — all defensible

**Adsecute too conservative (0 clear cases, 1 borderline):**
- `creative-04` ($777, 4.74 ROAS, 1.51× baseline, `strong_relative`, ACTIVE test campaign) labeled Watch. An expert buyer could reasonably call this Scale Review or Test More. Adsecute kept it at Watch because `strong_relative` alone doesn't elevate to Scale Review (only `review_only_scale_candidate` does). This is a borderline judgment call, not a clear miss.

**Adsecute wrong (0 cases).**

**Adsecute defensible (the rest).**

**IwaStore verdict:** Adsecute's post-fix labels are media-buyer-sensible. The user's `decorita_93` concern is correctly addressed. One borderline case (creative-04) could go either way.

### TheSwaf: partial agreement, with a clear mislabel at the largest spender

**Adsecute agrees (5/10):**
- Refresh (creative-02) ✓
- Not Enough Data (creative-03, creative-04, creative-05) ✓
- Protect (creative-06 paused strong_relative winner) ✓

**Adsecute too conservative / wrong (4 cases):**
- **`creative-01`: $6,930 spend, ROAS 1.28, 0.70× baseline, ACTIVE. Labeled Watch. Should be Cut or Refresh.** The most important mislabel in the entire post-fix cohort.
- `creative-07`: $3,427 spend, 0.76× baseline, campaign ACTIVE but creative inactive. Labeled Watch. Should be Cut or Refresh.
- `creative-09`: $1,216 spend, 0.82× baseline, PAUSED. Labeled Watch. Borderline — could be Watch (paused) or Refresh.
- `creative-10`: $1,155 spend, 0.71× baseline, ACTIVE test campaign. Labeled Watch. Should be Cut (test concluded negatively).

**Adsecute defensible (1 case):**
- `creative-08`: $3,278 at 1.12× baseline, PAUSED. Watch is OK.

**TheSwaf verdict:** Adsecute fails specifically on mature `validating`-lifecycle rows with meaningful spend AND below-baseline ROAS. The Cut path now catches zero-purchase test losers but misses these "below-baseline with purchases" losers. This is the remaining gap.

---

## 6. Scale / Scale Review Assessment

**Is zero `Scale` defensible?** Yes. CT is missing across these businesses. `Scale` correctly requires CT. Do not loosen.

**Is zero `Scale Review` defensible in TheSwaf?** Yes, conditionally.
- `creative-06` (strong_relative, 1.56× baseline) is PAUSED. Protect is defensible.
- No other TheSwaf row in the top-10 sample meets the `review_only_scale_candidate` floor.
- The `TEST — EMB - CreativeTest - Apr2026` campaign has only one row in the top-10 sample (`creative-10`, which is a below-baseline loser, not a scale candidate).
- If there are Scale Review candidates in that test campaign not captured by the top-10 spend sample, they are not visible here. The sample does not contradict Adsecute's zero count for this specific campaign.

**Is zero `Scale Review` defensible in IwaStore?** No — it is no longer zero. 3 Scale Reviews surface correctly post-fix, including `decorita_93`.

**Which creatives should be Scale Review if any?**
- IwaStore: creative-02, creative-03, creative-10 (Adsecute agrees). Optional fourth: creative-04 (borderline).
- TheSwaf: none in the current top-10 sample.

---

## 7. Cut / Refresh / Retest Assessment

**Which creatives should be cut, refreshed, or retested?**

Cut candidates not being caught by Adsecute:
- **TheSwaf `creative-01`**: $6,930 spend, ROAS 1.28, 0.70× baseline. Mature test lifecycle, meaningful spend, below-baseline. → **Cut or Refresh.**
- **TheSwaf `creative-07`**: $3,427 spend, 0.76× baseline, inactive creative in active campaign. → **Cut or Refresh.**
- **TheSwaf `creative-10`**: $1,155 spend, 0.71× baseline in active test campaign. → **Cut** (the test concluded).

Refresh candidates (Adsecute gets these right):
- IwaStore `creative-06` (roas-7d collapsing from 2.18 to 0.56) could be Refresh-vs-Watch borderline. Adsecute has it Watch. Defensible.

**Is Adsecute missing loser detection?** Partially yes. The `Cut` path now catches *zero-purchase* mature rows (5 rows across the cohort — this was the fix). It still misses *below-baseline-with-purchases* mature rows at meaningful spend (at least 3 TheSwaf rows, most notably creative-01 at $6,930).

---

## 8. Protect Assessment

**Which Protect rows are truly Protect?**
- IwaStore `creative-01`: $2,364 paused historical winner with 60 purchases. ✓
- TheSwaf `creative-06`: $3,608 paused strong_relative with 41 purchases. ✓

**Which Protect rows hide scale-review candidates?**
- None in the post-fix cohort. The fix correctly moved `review_only_scale_candidate` rows out of Protect. This was the exact pre-fix failure, now closed.

**Protect verdict:** Protect is now correctly scoped — only 9 rows across the 78-sample (down from 14 pre-fix), all of which are either paused historical winners or `strong_relative` winners that are legitimately not at the scale-review floor.

---

## 9. Test More / Not Enough Data Assessment

**Are they distinct enough in actual campaign use?**

Yes, based on the post-fix sample:
- `Test More` (8 rows) fires on positive under-sampled signal with relative-strength cues.
- `Not Enough Data` (15 rows) fires on genuinely thin rows (low spend, low purchases, low impressions).

One questionable case from my independent review:
- TheSwaf `creative-06` (waitthat): $224 spend, ROAS 0, labeled Not Enough Data. Actually wait — this alias is in the pre-fix data I reviewed earlier, not the post-fix data I'm looking at now. The post-fix TheSwaf sample shifted. Ignoring this specific alias.

For the post-fix sample: distinction is clean enough.

---

## 10. Campaign Benchmark Assessment

**Does within-campaign comparison improve judgment?** Not exercised in this audit — benchmark scope was `account` for all rows. Campaign-scope would likely help for the TheSwaf test campaign specifically (narrower peer cohort = stronger relative signal for borderline winners), but the current sample does not have within-campaign benchmark rows to validate this.

**Is account-wide comparison misleading in test-campaign context?** Not in the IwaStore case — `decorita_93` at 2.73× account baseline is strong under any benchmark scope, and the fix surfaces it correctly. In TheSwaf, the account baseline (1.62–1.82) is already low, so account-wide ratios are generous enough to catch relative winners; the issue is not baseline calibration but kill-evidence gaps.

---

## 11. Worst Concrete Product Failures (top 5)

Ranked by media-buyer trust impact:

1. **TheSwaf `pdf-company-02 / creative-01`**: $6,930.14 spend, ROAS 1.28, 0.70× baseline, 48 purchases, ACTIVE, `keep_in_test` / `validating`. Labeled Watch. **This is the single highest-spend row in the entire post-fix cohort and it is a clear Cut/Refresh miss.** A buyer sees the top spender labeled Watch despite $7k burned below baseline, and loses trust immediately.

2. **TheSwaf `pdf-company-02 / creative-07`**: $3,427 spend, ROAS 1.39, 0.76× baseline, 26 purchases. Labeled Watch. Same mature-test-with-purchases loss pattern.

3. **TheSwaf `pdf-company-02 / creative-10`**: $1,155 spend, ROAS 1.29, 0.71× baseline, ACTIVE test campaign, 7 purchases. Labeled Watch. In an active test campaign with $1,155 spent at 0.71× baseline, the buyer's call is Cut — the test has answered itself.

4. **IwaStore `pdf-company-01 / creative-04`** (borderline, not a clear failure): $777 spend, ROAS 4.74, 1.51× baseline, 21 purchases, `strong_relative`, ACTIVE test campaign. Labeled Watch. In a test campaign context, a buyer could reasonably expect Scale Review or Test More on a 1.51× baseline with 21 purchases. Current Watch is defensible but conservative. Secondary priority vs the TheSwaf kill-evidence gaps.

5. **Below-baseline mature-test gap is systemic, not single-row:** 4 of 10 TheSwaf sampled rows show the same pattern (meaningful spend + below-baseline ROAS + purchases > 0 + `validating` lifecycle → Watch). This is not a per-row bug; it is a gate gap. The post-fix Cut path handles zero-purchase maturity but does not handle below-baseline-with-purchases maturity.

---

## 12. Recommended Next Action: **One Narrow Targeted Fix**

The test-campaign actionability pass delivered the correct central fix. Scale Review now surfaces. The Cut path fires for mature zero-purchase losers. What remains is one additional narrow extension of the Cut/Refresh admission path to handle the below-baseline-with-purchases loser pattern.

Do NOT:
- Retune Scale Review floors (working correctly post-fix)
- Retune Protect admission (working correctly post-fix)
- Change taxonomy, UI, or safety gates
- Loosen Commercial Truth behavior
- Promote the old rule engine

Do:
- One deterministic extension to the Cut/Refresh admission path for the "mature loser with purchases" shape.

---

## 13. Exact First Fix

**Target gate:** the Cut admission path in `creative-operator-policy.ts`.

**Current behavior (post-actionability-pass):** Cut fires when `primaryAction === "block_deploy"` upstream OR when `keep_in_test` lifecycle has zero purchases at meaningful exposure.

**Missing behavior:** `keep_in_test` / `validating` lifecycle with meaningful spend AND below-baseline ROAS AND non-zero but below-floor purchases should reach Cut (operator-review) or Refresh, not perpetual Watch.

**Proposed deterministic addition:**
- Admit `Cut` (review-required) when all of:
  - `lifecycleState ∈ {validating, fatigued_winner}`
  - `primaryAction ∈ {keep_in_test, refresh_replace}` (not already scale-classified)
  - `spend30d ≥ max($1000, 3× account.medianSpend)` — meaningful test weight
  - `roas30 ≤ 0.80 × account.medianRoas` — clearly below baseline
  - `purchases30 ≥ 1` (but below true kill-evidence floor) OR `impressions30 ≥ 50k` — mature exposure
  - Queue/apply remains blocked (review-only Cut signal)

- Alternatively route to `Refresh` instead of `Cut` if fatigue-trajectory signals are present (7d < 30d ROAS).

**Fixtures:**
- `pdf-company-02 / creative-01`-shape input: spend $6,930, ROAS 1.28, 0.70× baseline, 48 purchases, validating, keep_in_test → expected `Cut` (review-required).
- `pdf-company-02 / creative-10`-shape input: spend $1,155, ROAS 1.29, 0.71× baseline, 7 purchases, active test → expected `Cut`.
- Regression fixture: IwaStore `creative-10` (ROAS 8.53, stable_winner) → still `Scale Review`. IwaStore `creative-04` (1.51× baseline, `strong_relative`) → still `Watch` (not triggered by Cut path).
- Regression fixture: healthy validating row above baseline → still `Watch` or `Test More`.

**Validation after the fix:**
- Rerun the live-firm audit sample.
- Expected: 3–4 TheSwaf rows shift from Watch to Cut or Refresh.
- Expected: Protect, Scale Review, and Test More unchanged (regression guard).
- Specifically confirm `pdf-company-02 / creative-01` ($6,930 spend) surfaces as Cut or Refresh, not Watch.

**Secondary (only if first fix lands clean):**
- Evaluate whether IwaStore `creative-04` (strong_relative, ACTIVE test campaign, 1.51× baseline, 21 purchases) should elevate to Scale Review through a test-campaign-context adjustment. Do not bundle with the primary Cut-path fix.

---

## 14. Should Codex Implement Another Pass?

**Yes, one narrow pass.** Scope: the below-baseline-with-purchases Cut/Refresh admission extension described in Section 13. Single gate, fixture-backed, no taxonomy / UI / safety / CT changes. Expected impact: 3–4 TheSwaf Watch rows shift to Cut or Refresh (including the headline $6,930 case), IwaStore distribution unchanged.

Do not bundle the IwaStore `creative-04` Scale Review borderline question into the same pass. That is a secondary calibration call that should be addressed (if at all) only after the Cut gap is closed and its real-world effect observed.

---

## Final Chat Summary

**Verdict:** TARGETED FIXES NEEDED

**Direct live data used:** Yes, via the post-fix audit artifact generated through the same runtime path as the `/creatives` page. Direct Meta Marketing API not invoked (would require live credentials and risks modifying provider state).

**Zero Scale / Scale Review defensible:** Zero `Scale` — yes. Zero `Scale Review` in TheSwaf top-10 sample — yes (no clear candidate in the sampled rows). Zero `Scale Review` in IwaStore — no longer zero (3 Scale Review rows now surface correctly, including `decorita_93`).

**Current output better than manual table reading:** For IwaStore — yes. For TheSwaf — not yet, because the $6,930 loser in Watch destroys the comparison in the single slot that matters most.

**Top 5 Concrete Failures:**
1. TheSwaf `creative-01`: $6,930 spend, ROAS 1.28, 0.70× baseline, 48 purchases, ACTIVE — labeled Watch, should be Cut or Refresh (headline failure)
2. TheSwaf `creative-07`: $3,427 spend, 0.76× baseline, 26 purchases — same pattern, Watch instead of Cut/Refresh
3. TheSwaf `creative-10`: $1,155 spend in active test campaign, 0.71× baseline, 7 purchases — labeled Watch, test has concluded negatively
4. Systemic gap: Cut path catches mature zero-purchase losers but not below-baseline-with-purchases losers — affects 3–4 rows in TheSwaf
5. IwaStore `creative-04` borderline: $777, 1.51× baseline, `strong_relative`, ACTIVE test campaign — labeled Watch, could be Scale Review/Test More (secondary)

**Recommended next move (one sentence):** Ship one narrow fixture-backed extension to the Cut/Refresh admission path that catches mature `validating` / `fatigued_winner` lifecycle rows with meaningful spend AND below-baseline ROAS AND non-zero purchases below the kill-evidence floor, validated against `pdf-company-02 / creative-01` ($6,930 / ROAS 1.28) as the canonical fixture — no other taxonomy, UI, safety, or CT changes in scope.
