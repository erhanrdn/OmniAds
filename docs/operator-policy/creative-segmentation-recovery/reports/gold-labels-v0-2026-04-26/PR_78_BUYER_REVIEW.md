# PR #78 Buyer Review (Addendum to PR #77)

Role: CLAUDE_MEDIA_BUYER_JUDGE
Date: 2026-04-26
Reviewing: `wip/creative-decision-os-v2-baseline-first-2026-04-26`
PR #78 head reviewed: `d0550b32902f1cba9036da3176f88f1aebb8f94f` ("Tighten v2 resolver output hygiene")
Gold target: `gold-v0.1` at PR #77 commit `bbb606028136f096f855fea599f6a3648e325078`
Method: independent buyer audit. No code modified. No labels modified. Addendum only.

---

## Verdict: PASS WITH MONITORING  -  RESOLVER-ONLY WIP

The v2 resolver is materially better than current Adsecute on the gold-v0.1 fixture and is operator-safe to read. It is not product-ready: the fresh live audit was blocked by a missing DATABASE_URL, the 78-row gold fixture is the same data the resolver was tuned against, and one remaining medium mismatch is on a row where gold itself is debatable. Acceptable as the next-iteration v2 candidate; not acceptable for UI / API / queue / apply integration.

---

## 1. Are resolver outputs operator-safe?

**Yes.** I independently grepped `lib/creative-decision-os-v2.ts` for every forbidden term ChatGPT named (`gold`, `json`, `fixture`, `PR`, `ChatGPT`, `Claude`, `Codex`, `WIP`, `internal`, `labels this row`). Zero hits in the resolver source. The two strings ChatGPT explicitly flagged in the previous round are gone:

| Old (ChatGPT-flagged) | Current (PR #78 head) |
|---|---|
| "Huge-spend severe loser with no recovery should be cut even when the gold v0 JSON labels this row differently." | "Huge-spend severe loser with no recovery should be cut." |
| "Severe loser shape is present, but degraded truth keeps the v2 WIP in more-test confirmation." | "Severe loser shape is present, but degraded truth requires more-test confirmation." |

Both new strings are clean buyer-readable explanations.

The forbidden-term test at `lib/creative-decision-os-v2.test.ts:187-222` walks every emitted field (string, array of strings) for every row in the 78-row gold artifact against 10 regex patterns. The regex set is correct (`/\bPR\b/` is appropriately case-sensitive on the boundary; the rest are case-insensitive). This test is a durable product-output guard  -  it will fail any future regression that reintroduces internal-artifact language into resolver output.

## 2. Do any emitted evidence summaries sound like internal test artifacts?

**Mostly no.** The 35 distinct `evidenceSummary` strings I traced read as buyer-facing copy:

- "Active creative is far above benchmark with recent and long-window confirmation; Scale requires operator review."
- "Active underperformer still has conversion volume, so refresh before cutting."
- "Around-benchmark creative has recent decay, making Refresh more actionable than passive monitoring."
- "Lifetime or long-window signal remains credible, but recent ROAS decayed below benchmark; refresh before cutting."

These are exactly the kind of one-sentence rationales a senior media buyer would write themselves. No artifact references remain.

**One minor wording risk** (not blocking): the resolver uses "the resolver diagnoses..." in two strings (lines 189 and 290). The word `resolver` is not on ChatGPT's forbidden list, but it's the only place the implementation surface leaks into operator-facing text. A future polish pass could swap it for "this row is held for diagnosis" or "we diagnose the data state before action." This is a polish item, not a hygiene blocker.

## 3. Are the remaining boundary decisions acceptable from a buyer perspective?

**Yes for the headline call. The single remaining medium mismatch is gold-debatable, not a v2 defect.**

The single `severity: medium` mismatch on the gold fixture is `company-07|...|company-07-creative-06`:

| Field | Value |
|---|---|
| spend | $354 |
| roas | 0.41 (vs benchmark 3.82 -> 0.107x) |
| recent_roas | 0.45 (recent ratio ~0.12x) |
| recent_purchases | 1 |
| long90_roas | 0.41 (no historical strength either) |
| spend vs peer | 2.15x peer median |
| gold | Test More (direct, conf 70) |
| v2 | Refresh (review_only) |
| current Adsecute | Cut |

I evaluated this as an independent buyer. Gold's Test More rationale on this row is "Below peer-median spend with sparse purchases - give more delivery before judging." That rationale contradicts the row data  -  spend is **2.15x peer median**, not below. Gold reached Test More via the rubric's lifetime-purchases-less-than-3 gate, not via an explicit buyer override.

A senior buyer reading this row sees: $354 spent, 1 conversion, 0.107x benchmark on both 30-day and 90-day windows. There is no historical strength to "test more" against. The defensible calls are Refresh (try a new variant before harder action) or Cut (clear loss with no recovery). Gold's Test More is the weakest of the three. **v2's Refresh / review_only is the more buyer-aligned call.** Adsecute's Cut is also defensible.

This is a gold-debatable / low buyer risk row. The right move is to leave the disagreement standing and reconsider gold's rationale on this specific row in a future gold v0.2 if it recurs.

The 41 row-level shifts from current Adsecute -> v2 (per `gold-evaluation.json[changedFromCurrent]`) collectively read like a buyer-sensible improvement:

- 6 Protect -> Refresh: trend collapse on near-benchmark rows now generates a refresh action instead of passive hold. Strong improvement.
- 4 Refresh -> Diagnose: paused historical winners now ask "why was it stopped?" before relaunching. Correct.
- 3 Refresh -> Protect: stable winners no longer mistakenly Refresh. Correct.
- 2 Scale -> Refresh: inactive rows can no longer direct-Scale. Correct safety hardening.
- 1 Refresh -> Cut: catastrophic shape now correctly Cut.
- 6 Test More -> various: thin rows now go to Diagnose, Protect, or Refresh based on actual signal shape.

Net: less aggressive direct action, more Diagnose-first / Refresh-first / Protect-first. This trades action throughput for safety, which is the correct posture pre-acceptance.

## 4. Would a media buyer know what to do without hesitation?

**Mostly yes.** The 6 primary decisions (`Scale`, `Cut`, `Refresh`, `Protect`, `Test More`, `Diagnose`) are clean operator verbs. Reason tags are buyer-shaped: `below_benchmark`, `recent_conversion_rebound`, `creative_refresh_candidate`, `huge_spend_severe_loser`, `lifetime_strong_recent_decay`, `inactive_historical_winner`.

The one operational caveat: the resolver returns 22 `Diagnose` rows on the 78-row fixture (28%). These are correctly hand-offs for "investigate before acting"  -  but a Diagnose row only delivers buyer value if the surrounding product workflow has a campaign-context / status / data-quality investigation path. That follow-up workflow is product work, not resolver work, and is explicitly out of scope for this WIP.

The Scale path is correctly disciplined: `actionability: review_only` for all Scale outputs, plus `inactive_creative_cannot_scale` and `scale_requires_operator_review` blockers on the safety gate. A buyer cannot inadvertently auto-push a Scale move from this resolver alone.

## 5. Is this ready for live audit / UI integration, or still resolver-only WIP?

**Resolver-only WIP. Not ready for live audit / UI integration.** Three reasons:

**5a. The fresh live audit did not run.** Codex's handoff documents the exact failure: `Error: DATABASE_URL is not set` from `scripts/creative-live-firm-audit.ts`. ChatGPT's task list explicitly said "Without fresh live audit, PR #78 remains WIP no matter how high fixture score is." That bar is not met.

**5b. The 98.95 macro F1 is on the same 78-row gold fixture the resolver was tuned against.** When a classifier is tuned and evaluated on the same data, generalization to live data is unverified. The Test More / Refresh / Diagnose boundary rules in particular (lines 320-712 of the resolver) contain shape-specific thresholds (e.g. "spend < 100 AND roasRatio >= 0.85", "roasRatio >= 0.95 AND recentRatio < 0.55") that fit the fixture. Live data will have row shapes outside this fixture.

**5c. The single fixture-level mismatch reinforces that gold itself is one-buyer-judgment.** The `company-07-creative-06` case where gold's rationale contradicts gold's own data shows gold v0.1 has at least one rule path that produces inconsistent outputs. This is not a v2 problem  -  but it means the 98.95 score is bounded by gold's own quality, not by ground truth.

The acceptance gate ChatGPT named for next review ("severe 0, high 0, macro F1 >= 90, Scale precision >= 95, Cut F1 >= 90, Watch/Scale Review primary 0, direct Scale 0, queue/apply conservative, no internal artifact text, normally formatted code") is **all met on the gold fixture**. The remaining bar  -  live audit  -  is not met. PR #78 is appropriately WIP.

---

## Findings summary

| Check | Status |
|---|---|
| Resolver output hygiene (forbidden-term scan, independent grep) | PASS  -  zero violations |
| Two ChatGPT-flagged strings removed | PASS  -  confirmed verbatim |
| Forbidden-term test in resolver test suite | PASS  -  durable guard at `lib/creative-decision-os-v2.test.ts:187-222` |
| Code formatting (lines/file ratio normal) | PASS  -  29-33 bytes/line avg, multi-line, human-readable |
| Macro F1 >= 90 on gold v0.1 | PASS  -  98.95 |
| Severe mismatches | PASS  -  0 |
| High mismatches | PASS  -  0 |
| Scale precision >= 95 | PASS  -  100 |
| Cut F1 >= 90 | PASS  -  100 |
| Watch primary count | PASS  -  0 |
| Scale Review primary count | PASS  -  0 |
| Direct Scale count | PASS  -  0 |
| Inactive direct Scale count | PASS  -  0 |
| Queue eligible count | PASS  -  0 |
| Apply eligible count | PASS  -  0 |
| Single remaining medium mismatch (company-07/creative-06) | gold-debatable, low buyer risk; v2 call buyer-defensible |
| Fresh live audit | **BLOCKED  -  DATABASE_URL not set** |
| UI / API / queue / apply integration | not added (correct) |

## Recommended next moves (no code changes from me)

1. **Resolve DATABASE_URL access for the v2 audit runtime.** Without a fresh live audit, the 98.95 fixture score has no production-equivalent confirmation. This is the binding blocker.
2. **Reconsider gold v0.1 rationale on `company-07-creative-06` in a future v0.2 pass.** The "Below peer-median spend" rationale contradicts the row data. Either the gold rule path needs adjustment or this row needs an explicit buyer override.
3. **Optional polish on resolver text:** swap "the resolver diagnoses..." for buyer-first phrasing in the two strings at lines 189 and 290 of `lib/creative-decision-os-v2.ts`. Not blocking.
4. **Do not integrate v2 into UI / API / queue / apply** until 1 lands and live audit produces a clean run.

---

## Confirmation

- I did not modify any product code.
- I did not modify any gold labels.
- I did not run any new resolver evaluation; I read Codex's committed `gold-evaluation.json` and verified counts independently against the gold artifact.
- This addendum is the only change I introduced. It lives under the PR #77 reviewer directory because PR #77 is the gold-target reference for this evaluation.
- I am not requesting merge of any PR.
