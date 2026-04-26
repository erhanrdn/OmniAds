# PR #78 Live-Audit Buyer Review (Addendum to PR #77)

Role: CLAUDE_MEDIA_BUYER_JUDGE
Date: 2026-04-26
Reviewing: `wip/creative-decision-os-v2-baseline-first-2026-04-26`
PR #78 head reviewed: `b9b1915c26ef2484a8da0b92aa914e8d966ef792` ("Add v2 live audit evidence")
Source artifacts: `docs/operator-policy/creative-segmentation-recovery/reports/v2-live-audit-2026-04-26/`
Method: independent buyer audit of the sanitized live-audit artifacts only. No raw private data inspected. No code modified. No labels modified.

---

## Verdict: PASS WITH MONITORING - RESOLVER-ONLY WIP

The live audit (303 rows across 8 businesses, 9 accounts) confirms the v2 resolver behaves correctly on production-equivalent data for the headline cases the gold fixture validated. It also surfaces one real boundary defect that the gold fixture did not contain: stable lifetime winners with recent dead-zones (recent_roas = 0, recent_purchases = 0) are being Protected when they should be Refreshed or Diagnosed. Two rows in this cohort exhibit this pattern. Acceptable as the v2 candidate; not yet acceptable for UI / API integration. Queue / apply remain conservative (0 / 0 across all 303 rows).

---

## 1. Are the top 20 highest-spend v2 decisions buyer-correct?

**Yes for 17 of 20. 3 are defensible borderline calls. None are buyer-incorrect.**

I evaluated each of the top-20 rows in `live-safety-summary.json[top20HighestSpendV2Decisions]` against raw spend / ROAS / benchmark / recent / trend metrics from `live-audit-sanitized.json`.

| Spend | row | current | v2 | Buyer judgment |
|---:|---|---|---|---|
| $124k | company-05/creative-46 | Refresh | Refresh (review_only) | inactive historical signal -> review-only Refresh is correct |
| $61k  | company-05/creative-47 | Protect | Refresh | inactive cannot Protect; v2 correct |
| $58k  | company-05/creative-48 | Refresh | **Cut/direct** | inactive at 0.x bench, no recovery -> Cut correct |
| $34k  | company-05/creative-49 | Protect | Refresh | inactive cannot Protect; v2 correct |
| $33k  | company-05/creative-50 | Cut | Diagnose | inactive at $33k, "unclear buyer action" -> defensible borderline |
| $29k  | company-05/creative-51 | Protect | Refresh | inactive; v2 correct |
| $28k  | company-05/creative-52 | Refresh | Diagnose | inactive winner with status question -> v2 conservative, buyer-defensible |
| $26k  | company-05/creative-53 | Refresh | Refresh | match |
| $25.5k| company-05/creative-54 | Diagnose | **Cut/direct** | inactive_confirmed_loser at $25.5k -> Cut correct |
| $23.5k| company-05/creative-55 | Diagnose | Refresh | inactive historical signal; v2 sharper than current |
| $16.3k| company-05/creative-56 | Protect | Refresh | inactive; v2 correct |
| $13.4k| company-05/creative-01 | Protect | Protect | around-benchmark stable; match |
| $12.6k| company-05/creative-57 | Cut | Cut | match (inactive confirmed loser) |
| **$10.1k** | **company-05/creative-02** | Protect | **Scale (review_only)** | ROAS 12.48 (4.47x bench), recent 15.69 (5.62x), 7 recent purchases, spend_v_peer 1.08, trend 1.26 -> textbook scale shape; v2 sharper than current |
| $10.0k| company-05/creative-03 | Cut | Cut | huge_spend_severe_loser at 0.27x bench, 1 recent purchase -> Cut correct |
| $8.8k | company-05/creative-04 | Diagnose | Protect | stable_above_benchmark_winner -> v2 sharper |
| $8.3k | company-08/creative-01 | Cut | Refresh (review_only) | 0.74x bench but 16 recent purchases -> Refresh-before-Cut per supervisor rule 7; v2 less aggressive than current Cut |
| $7.0k | company-05/creative-05 | Diagnose | Test More | weak read with conversion; defensible borderline |
| $6.7k | company-05/creative-06 | Cut | Cut | huge_spend_severe_loser; match |
| $6.3k | company-05/creative-07 | Cut | Cut | match |

The single Scale decision (creative-02) has actionability `review_only`, blocker `scale_requires_operator_review`, queueEligible/applyEligible both false. The shape is unambiguous: 4.47x lifetime, 5.62x recent, growing trend, 7 recent purchases, peer-level spend.

## 2. Are any Cut decisions too aggressive?

**No. v2 cuts less than current.**

- v2 Cut count: 15. Current Cut count: 29. v2 issues 48% fewer Cuts on the live cohort.
- 7 rows are `Cut -> Diagnose` (de-escalation), 6 are `Cut -> Refresh`, 5 are `Cut -> Test More`. v2 routinely chooses softer interventions on cases the current system over-cuts.
- Only 1 active row with recent conversions is currently Cut by v2: `company-05/creative-03` ($10,022 spend, ROAS 0.27x bench, 1 recent purchase, trend 1.13). At $10k spend with 0.27x benchmark and 1 thin recent purchase, this Cut is borderline aggressive but supportable. A senior buyer would accept it.
- v2 reverses one classic over-cut: `company-08/creative-01` (current Cut -> v2 Refresh) at $8,295 spend with 16 recent purchases, ROAS 0.74x bench. With material recent conversion volume, Refresh-before-Cut is the buyer-correct call.

## 3. Are any Scale decisions unsafe?

**No.**

- Single Scale decision in the live cohort (`company-05/creative-02`).
- Actionability: `review_only` (not `direct`).
- queueEligible: false. applyEligible: false.
- BlockerReasons: `scale_requires_operator_review`.
- Shape verified buyer-textbook: 4.47x lifetime ratio, 5.62x recent ratio, 7 recent purchases, peer-level spend, growing trend.
- Active = true. inactiveDirectScaleCount = 0 across all 303 rows.

A buyer cannot accidentally auto-push this Scale move from this resolver alone.

## 4. Are inactive creatives protected from direct Scale?

**Yes. directScaleCount = 0. inactiveDirectScaleCount = 0.**

The resolver's inactive block (lines 195-281 of `lib/creative-decision-os-v2.ts`) correctly routes inactive rows to Refresh/review_only, Diagnose/diagnose, or Cut/direct, never to Scale. Across the 303-row cohort, no inactive row resolves to any Scale primary decision.

## 5. Are Diagnose rows genuinely diagnosis-worthy?

**Mostly yes.** v2 Diagnose count: 194 (vs current Diagnose 211 - slight reduction). Sample inspection of Diagnose rationales shows legitimate use cases:
- Paused historical winners with strong long-90 -> "investigate why was it stopped" (campaign-context Diagnose).
- Thin-data rows with no recent conversion evidence -> data-quality / insufficient-signal Diagnose.
- Mixed-signal rows where lifetime and recent disagree -> diagnose-before-action.
- Degraded-truth rows where the truth-state itself is the blocker.

The Diagnose volume is high in absolute terms (64% of the cohort), but this reflects the cohort itself - many inactive / thin / degraded-truth rows for which "investigate first" is the buyer-correct posture. A live cohort with more healthy active creatives would naturally produce a smaller Diagnose share.

The 22 transitions `Diagnose -> Test More` and 8 transitions `Diagnose -> Refresh / Protect` show v2 also UN-Diagnoses cases the current system over-Diagnoses. The classifier is not lazy.

## 6. Is Test More being used as a lazy holding pen?

**Mostly no, but the volume increase (current 20 -> v2 35) deserves monitoring.**

- v2 Test More cases I sampled: thin-spend rows with positive probe signals; below-benchmark rows with recent conversion rebound; degraded-truth rows below peer-median spend; weak active reads with at least 1 conversion. All defensible buyer rationales.
- Watchlist `testMoreDirectOnDegradedOrDataQualityRisk` flags 27 rows where v2 emits Test More direct under degraded trust. The spot-check on `company-02/creative-05` ($317 spend, ROAS 0, 0 recent purchases, evidence "Degraded-truth loser is still below peer-median spend, so confirm with more delivery before cutting") is buyer-defensible: at $317 with degraded truth, more delivery is reasonable before declaring a Cut.
- One concern: 13 transitions of `Test More -> Diagnose` in the diff show the boundary between "give more delivery" and "investigate before action" is fluid. Buyer-correct most of the time, but a few rows could go either way.

Net: Test More is being used as an active "give it runway" decision, not as a passive holding pen. The volume increase is from rows that current Adsecute over-classifies (currently lots of "Cut" / "Diagnose" instead of buyer-correct "Test More").

## 7. Are Refresh decisions actionable rather than over-triggered?

**Yes.** v2 Refresh count: 42 (vs current 30). The increase is concentrated in two correct patterns:
- `Diagnose -> Refresh` (8) and `Test More -> Refresh` (4): cases where the current system held a row in passive review while v2 says "ok, supply a new variant."
- `Protect -> Refresh` (5): the lifetime-strong-recent-decay pattern that the gold fixture also flagged.

The 3 watchlisted "Refresh despite stable above-benchmark performance" rows are all **inactive (paused)** - the audit's classifier flagged them because lifetime ratio was strong, but the resolver's inactive block correctly maps them to Refresh (review_only) since you cannot Protect a paused creative. **These three are audit false-flags, not v2 defects.**

`company-01/creative-02` (paused, 1.51x bench), `company-01/creative-14` (paused, 1.05x bench, recent 4.73x), `company-04/creative-14` (paused, 1.71x bench): all inactive; v2 Refresh is correct (Protect would be wrong on paused rows).

## 8. Does queue/apply remain conservative?

**Yes - across all 303 rows.**

| Safety check | Live audit count |
|---|---:|
| queueEligible true | 0 |
| applyEligible true | 0 |
| direct Scale | 0 |
| inactive direct Scale | 0 |
| Watch primary | 0 |
| Scale Review primary | 0 |

The single Scale decision (creative-02) is `review_only`. No row in the cohort is queue-eligible or apply-eligible. `Watch` and `Scale Review` are not emitted as primary decisions.

## 9. Are operator-facing rationales clear enough?

**Mostly yes, with one defect class that needs a wording AND policy fix.**

The headline rationales I sampled are buyer-readable:
- "Active creative is far above benchmark with recent and long-window confirmation; Scale requires operator review."
- "Inactive creative spent enough to confirm a below-benchmark loser with no recent recovery."
- "Active underperformer still has conversion volume, so refresh before cutting."
- "Huge-spend severe loser with no recovery should be cut."

**Defect class - "Protect despite recent severe decay" (2 rows):**

The audit's `protectDespiteRecentSevereDecay` watchlist contains two real problem rows where v2 emits Protect with rationale "Above-benchmark active winner should be protected unless scalable evidence is overwhelming" - but the row has stopped converting:

| row | active | spend | ROAS (lifetime) | recent ROAS | recent purchases |
|---|---|---:|---:|---:|---:|
| `company-05/creative-11` | true | $4,388 | 6.84 (2.45x bench) | **0** | **0** |
| `company-07/creative-11` | true | $153 | 7.22 (2.24x bench) | **0** | **0** |

A senior buyer reading "Above-benchmark active winner should be protected" on a row with `recent_roas = 0` and `recent_purchases = 0` would not understand WHY v2 wants to Protect a creative that has stopped delivering. The resolver's `lifetime_strong_recent_decay` rule (lines 473-489 of `lib/creative-decision-os-v2.ts`) does not fire here because of its spend floor (`spend >= max(200, peerMedianSpend * 1.2)` AND `recentPurchases >= 1` OR the spend gate). Both rows fail the floor.

Buyer-correct alternatives:
- `company-05/creative-11`: 0 recent activity at $4.4k spend on a 6.84 lifetime ROAS -> Refresh (test new variant) or Diagnose (why has delivery stopped converting?). Protect is wrong.
- `company-07/creative-11`: low spend ($153) so could legitimately be Test More or Diagnose, but Protect with `recent_roas = 0` is wrong.

This is the single substantive product risk the live audit surfaces. The gold fixture did not contain a row of this exact shape.

## 10. Should #78 proceed to UI/API integration after this audit, or remain resolver-only WIP?

**Remain resolver-only WIP. One narrow recalibration is needed before UI/API integration.**

Reasons to remain WIP:
1. **Real boundary defect (Protect-despite-decay class):** 2 of 303 rows = 0.66% of the cohort exhibit Protect on stopped-converting lifetime winners. Small share, but a buyer reading these rows would lose trust. The resolver's `lifetime_strong_recent_decay` admission is too narrow.
2. **Test More volume increase needs production observation:** 35 v2 Test More vs 20 current is a 75% increase. Most are buyer-defensible, but the boundary calls between Test More / Diagnose / Refresh on degraded-truth rows are fluid. Watching one production cycle would confirm.
3. **The 27 Test More-on-degraded-truth rows are a soft watchlist:** these emit direct action under degraded source trust. None are clearly wrong, but a stricter read might prefer Diagnose. Worth a buyer + supervisor sanity check before promoting to user-facing surface.

Reasons it is closer than before:
- Live audit removes the gold-fixture-overfit concern.
- Top-20 highest-spend decisions are 17/20 perfect, 3/20 defensible, 0/20 incorrect.
- Cut precision is preserved, Scale safety is preserved, queue/apply is conservative across 303 rows.
- The single Scale row in the cohort is textbook-shape and review-gated.

**Recommended next move (Codex):** narrow the resolver's "stable above-benchmark winner" rule (lines 592-622) so Protect does not fire when `recent_roas == 0 AND recent_purchases == 0 AND recent_impressions >= a small threshold`. Reroute that shape to Refresh (review_only) with a `lifetime_strong_recent_dead_zone` reason tag and explicit evidence text. Validate against `company-05/creative-11` and `company-07/creative-11` from this audit. Do not row_id-hardcode; the rule should be a general buyer-shape rule.

After that recalibration ships, this resolver is a candidate for limited UI integration trial (read-only operator surface, no queue/apply changes).

---

## Findings summary

| Check | Status |
|---|---|
| Top-20 highest-spend buyer-correct | 17/20 perfect; 3/20 defensible borderline; 0/20 incorrect |
| Cut decisions too aggressive | NO - v2 cuts 48% less than current; 1 active-with-recent Cut is borderline-supportable |
| Scale decisions unsafe | NO - single Scale row is review_only, queue/apply false, textbook shape |
| Inactive direct Scale | 0 across 303 rows |
| Diagnose genuinely diagnosis-worthy | mostly YES; volume reflects cohort shape |
| Test More used as lazy holding pen | NO; volume increase is buyer-correct routing |
| Refresh actionable | YES; 3 watchlist false-flags are inactive rows |
| Queue/apply conservative | YES - 0/0 across 303 rows |
| Operator rationales clear | mostly YES; 2 Protect-despite-decay rows have misleading evidence |
| Sanitization | clean - no raw IDs, ASCII-only handoff and safety summary, alias-only rowIds |
| Single Cut on active with recent conversions | borderline aggressive, supportable |
| Protect despite recent severe decay | **2 real product-risk rows** - boundary defect |
| Refresh despite stable above-benchmark | 3 audit false-flags (all inactive) - not v2 defects |
| Direct action despite source/campaign blockers | 52 rows; mostly false-flags or defensible Cut/Test More on inactive losers |
| Test More direct on degraded/data-quality risk | 27 rows; defensible but worth supervisor check |

## Recommended monitoring before next pass

- The Protect-despite-decay class (2 rows in live cohort, 0 in gold fixture) is the single substantive defect. Recalibrate the stable-above-benchmark rule to demote Protect when recent windows are dead.
- Re-run live audit after the recalibration; confirm no new boundary defect appears.
- Consider tightening Test More on degraded-truth rows toward Diagnose if the next supervisor pass prefers the more conservative posture.

## Confirmation

- I did not modify any product code.
- I did not modify any gold labels.
- I did not run any new audit; I read Codex's committed sanitized artifacts only.
- I did not inspect raw private data.
- This addendum is the only change I introduced. It lives under the PR #77 reviewer directory because PR #77 is the gold-target reference for this evaluation.
- I am not requesting merge of any PR.
- PR #78 remains Draft and resolver-only WIP.
