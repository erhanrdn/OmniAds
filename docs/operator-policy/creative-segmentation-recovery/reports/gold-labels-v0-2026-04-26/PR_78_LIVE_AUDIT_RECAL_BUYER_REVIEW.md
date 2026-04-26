# PR #78 Live-Audit Recalibration Buyer Review (Addendum to PR #77)

Role: CLAUDE_MEDIA_BUYER_JUDGE
Date: 2026-04-26
Reviewing: `wip/creative-decision-os-v2-baseline-first-2026-04-26`
PR #78 head reviewed: `3da2e05cb47f97de89ee42d9af6a64598af8b17a`
Substantive change commit: `10f5a94fa66f0501150376010d3ab4d0c7c16e3a` ("Fix v2 live audit safety semantics")
Doc-only follow-up: `3da2e05` ("Document PR78 hidden Unicode inspection")
Method: independent buyer audit of the updated sanitized live-audit artifacts and resolver source. No raw private data inspected. No code modified. No labels modified.

---

## Verdict: PASS WITH MONITORING - RESOLVER-ONLY WIP

The Protect-despite-recent-severe-decay defect is fixed. Actionability semantics are now buyer-safe across all 303 live rows. Queue/apply remain 0/0. Gold F1 dropped slightly (98.95 -> 97.96) because the new buyer-safety rule introduces one expected gold-fixture trade-off mismatch - this is the right priority and matches ChatGPT's guidance. One narrow consideration remains before UI integration: the resolver is now extremely conservative (only 2 of 303 rows emit direct actionability), which is correct for a WIP but warrants a deliberate "operator surface volume" decision before promotion.

---

## 1. Is Protect despite recent severe decay fixed?

**Yes.** Both previously-defective rows now emit non-Protect outputs with buyer-readable evidence:

| Row | active | spend | ROAS lifetime | recent ROAS | recent purchases | Old v2 | New v2 | New evidence |
|---|---|---:|---:|---:|---:|---|---|---|
| `company-05/creative-11` | true | $4,388 | 6.84 (2.45x bench) | 0 | 0 | Protect / direct | **Refresh / review_only** | "Strong historical signal stopped converting in the recent window, so refresh before protecting." |
| `company-07/creative-11` | true | $153 | 7.22 (2.24x bench) | 0 | 0 | Protect / direct | **Diagnose / diagnose** | "Strong historical signal stopped converting recently, but source or context risk makes the buyer action ambiguous." |

The differentiated routing is exactly the supervisor-asked behavior:
- $4,388 spend + clean source = Refresh (creative fatigue is the most likely cause).
- $153 spend + thin signal + ambiguity = Diagnose (insufficient evidence for a confident Refresh call).

The new reason tags are general buyer shapes (`strong_history_recent_stop`, `refresh_candidate`, `diagnose_before_refresh`), not row-id hardcoded. I checked the resolver source at `/tmp/v2-resolver2.ts:427,439`  -  the rule is parameterized on `roasRatio`, `recentRatio`, `recentPurchases`, `spend`, and trust state. No row identifiers in code.

`live-safety-summary.json[protectDespiteRecentSevereDecay]` is **0**.

## 2. Did Codex over-trigger Refresh or Diagnose?

**No.** Counter-intuitively, **Refresh DECREASED** after the fix:
- Refresh: 42 -> 37 (-5)
- Protect: 16 -> 17 (+1)
- Test More: 35 -> 40 (+5)
- Diagnose: 194 -> 193 (-1)
- Scale, Cut: unchanged

The 5-row drop in Refresh comes from rows that were previously Refresh-direct moving to Refresh-review_only OR being correctly re-routed to Test More / Diagnose under the tightened actionability rules. Diagnose DROPPED by 1 (not increased), so the fix did not cause cautious over-Diagnosing.

The transition table shows the routing logic stayed disciplined: only 7 rows moved Refresh -> Test More (correctly under-confident) and only 4 rows moved Test More -> Refresh (correctly upgrading to refresh action). No mass exodus to Diagnose.

## 3. Are direct actionability semantics now buyer-safe?

**Yes - extremely so.** Across all 303 live rows:

| Actionability | Count |
|---|---:|
| diagnose | 193 |
| review_only | 108 |
| **direct** | **2** |

Only **2 direct actions across 303 rows** (0.66%). Both are clean unambiguous active above-benchmark cases:

| Row | spend | ROAS | recent ROAS | recent purch | v2 primary | rationale |
|---|---:|---:|---:|---:|---|---|
| `company-02/creative-03` | $786 | 4.18 (1.49x bench) | 8.71 (3.11x bench, growing) | 3 | Protect / direct | clean above-benchmark stable winner, no blockers |
| `company-02/creative-04` | $751 | 2.91 (1.04x bench) | 1.89 (0.68x recent) | 1 | Test More / direct | around-benchmark, thin recent, defensible runway call |

Zero direct Cut, zero direct Scale, zero direct Refresh, zero direct Diagnose. The single Scale decision in the cohort (creative-02 at $10k) is `review_only` with `scale_requires_operator_review` blocker. Inactive losers that were previously direct Cut are now review_only Cut.

`directActionDespiteSourceOrCampaignBlockers`: **0** (was 52).
`testMoreDirectOnDegradedOrDataQualityRisk`: **0** (was 27).

Buyer-safe. Operator cannot accidentally apply a hard action.

## 4. Are any Cut decisions too aggressive after the change?

**No.** v2 Cut count: 15 (unchanged). All Cut decisions are now `review_only` (zero direct Cut). The single previously-flagged "Cut on active creative with recent conversions" row (`company-05/creative-03` at $10,022 / 0.27x bench / 1 recent purchase / huge_spend_severe_loser) is now `review_only` with `cut_requires_buyer_review` blocker. That's exactly the supervisor's rule 6 conservative posture: severe loser shape is preserved as Cut, but actionability is downgraded for buyer review.

## 5. Are any Scale decisions unsafe?

**No.** Single Scale decision (`company-05/creative-02` at $10k spend, 4.47x lifetime, 5.62x recent, 7 recent purchases, growing trend). Actionability `review_only`. Blockers `scale_requires_operator_review`. Active. The shape remains textbook. Queue/apply both false. inactiveDirectScaleCount = 0.

## 6. Are Test More rows genuinely "test more," or being used as a lazy holding pen?

**Genuinely test more, but the volume increased to 40 rows.** The Test More count moved from 35 -> 40 mostly via:
- 27 rows that were "Test More direct on degraded/data-quality risk" became Test More review_only (correct downgrade, not a category change).
- 5 rows moved from Refresh -> Test More via the new tightened rules where degraded truth or thin recent signal made a confident Refresh call inappropriate.

I sampled the new Test More rows. They retained meaningful tags: `weak_read_with_conversion / test_more_before_cut`, `degraded_truth / sparse_purchases / confirm_before_refresh`, `around_benchmark / needs_more_delivery`. None look like passive holds  -  each has a specific signal-shape rationale.

Volume note: 40/303 = 13% of the cohort is Test More. That's high but reflects the cohort's degraded-truth and below-peer-spend characteristics. Not a holding-pen abuse.

## 7. Are top 20 highest-spend decisions still buyer-correct?

**Yes.** Top-20 row IDs and primary decisions are essentially unchanged from the previous round (which I confirmed buyer-correct at 17/20 perfect, 3/20 defensible borderline, 0/20 incorrect). The only change is actionability  -  most are now `review_only` instead of `direct`. That's appropriately conservative for inactive context and degraded-truth context.

Notable preservations:
- The textbook Scale row (creative-02 at $10k, 4.47x lifetime, 5.62x recent) remains Scale / review_only.
- The two huge-spend severe-loser rows (creative-03 and creative-06 at $10k and $6.7k) remain Cut (now review_only).
- The Refresh-before-Cut on `company-08/creative-01` ($8.3k with 16 recent purchases) preserved.

## 8. Are top 20 highest-risk changes still buyer-correct?

**Yes.** I checked the new `top20HighestRiskDecisionChanges` list. The high-risk transitions all read as buyer-correct:
- 5 inactive_confirmed_loser Cuts on $25k-$58k spend with no recovery (correct).
- 1 Refresh-before-Cut on $8.3k active with 16 recent purchases (correct, supervisor rule 7).
- 1 Refresh-before-Cut on $4.4k active with 3 recent purchases (correct).
- 1 textbook Scale candidate at $10k (correct).
- Multiple Refresh -> Diagnose moves on inactive historical winners (correct, "investigate before relaunch").
- One new entry: `company-07/creative-07` ($277, Refresh -> Diagnose, `strong_history_recent_stop, diagnose_before_refresh`). This is the new recent-stop rule firing on a thin-spend ambiguous row. Buyer-correct: at $277 with stopped-converting historical signal, Diagnose hold is right.

No high-risk change in the top-20 looks aggressive or unsafe.

## 9. Are resolver outputs operator-safe and free of internal artifact wording?

**Yes.** I independently grepped `lib/creative-decision-os-v2.ts` for every forbidden term ChatGPT named (`gold v0`, `v2 WIP`, `labels this row`, `gold-v0`, `ChatGPT`, `Claude`, `Codex`, `WIP`, `internal`, `json`, `fixture`). Zero hits in the resolver source. The new evidence strings introduced by this commit:

- "Strong historical signal stopped converting in the recent window, so refresh before protecting."
- "Strong historical signal stopped converting recently, but source or context risk makes the buyer action ambiguous."

Both read as clean buyer rationale. The existing forbidden-term test in `lib/creative-decision-os-v2.test.ts` walks every output field for every gold row  -  durable guard.

## 10. Is #78 ready for UI/API integration, or still resolver-only WIP?

**Still resolver-only WIP. One narrow consideration before UI integration.**

What is now solid:
- Live boundary defect closed.
- Actionability is conservative (only 2 of 303 rows emit direct).
- Queue/apply 0/0 across the live cohort.
- Gold-v0.1 macro F1 still 97.96 with severe/high mismatches at 0.
- Operator-facing rationales are buyer-readable.
- Source files are normally formatted (30-34 bytes/line average across resolver, test, and script).
- Forbidden-term test passes.

What still warrants one supervisor decision before UI rollout:
- **Direct-action volume is intentionally tiny (2/303 = 0.66%).** This is correct for a WIP behind no UI. For UI rollout, the operator surface needs an explicit story for "98% of rows need operator review"  -  either through a clear review-queue model in the UI, or by relaxing actionability slightly on a small set of clear-evidence cases (e.g. clean above-benchmark Protect with 3+ recent purchases as direct, clean huge_spend_severe_loser with no blockers as direct review_only is OK). This is a UI/UX product decision, not a v2 resolver fix.
- **The recent-stop rule is freshly added.** A second live audit on a different time window or cohort would confirm it doesn't over-trigger or miss edge cases.
- **Gold mismatch on `company-05/creative-09`** (now Refresh instead of Protect per the new recent-stop rule). This trade is consistent with ChatGPT's guidance ("no more gold-fixture tuning unless live-audit defect coverage requires it"). The rule fix is buyer-safer; the gold rubric on this row may itself need re-adjudication in a future v0.2.

Recommendation: hold #78 as resolver-only WIP. Open a separate supervisor discussion thread on the operator-surface UX model (review-queue volume) before integrating v2 into the UI. The resolver itself is ready for that next decision.

---

## Verification of supervisor-listed acceptance items

| Acceptance target | Live audit result |
|---|---|
| `protectDespiteRecentSevereDecay` = 0 | **0** PASS |
| `directActionDespiteSourceOrCampaignBlockers` = 0 (or justified) | **0** PASS |
| `testMoreDirectOnDegradedOrDataQualityRisk` = 0 (or justified) | **0** PASS |
| `directScale` = 0 | **0** PASS |
| `inactiveDirectScale` = 0 | **0** PASS |
| `queueEligible` true count = 0 | **0** PASS |
| `applyEligible` true count = 0 | **0** PASS |
| `Watch` primary count = 0 | **0** PASS |
| `Scale Review` primary count = 0 | **0** PASS |
| Scale precision (gold v0.1) preserved | **100** PASS |
| Cut F1 (gold v0.1) preserved | **100** PASS |
| Source files normally formatted | **30-34 bytes/line; multi-line** PASS |
| GitHub hidden/bidi warning gone | trusted per Codex local scan + PR HTML inspection (not independently re-verified) |
| No product-ready / accepted / approved claim | confirmed; handoff says "Draft and resolver-only WIP" PASS |
| No UI/API/queue/apply integration | confirmed; resolver is pure PASS |

## Confirmation

- I did not modify any product code.
- I did not modify any gold labels.
- I did not run any new audit; I read Codex's committed sanitized artifacts only.
- I did not inspect raw private data.
- This addendum is the only change I introduced. It lives under the PR #77 reviewer directory because PR #77 is the gold-target reference for this evaluation.
- I am not requesting merge of any PR.
- PR #78 remains Draft and resolver-only WIP.
- I am not making a product-ready / accepted / approved claim.
