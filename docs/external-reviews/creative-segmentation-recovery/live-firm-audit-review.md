# Creative Segmentation Recovery — Live-Firm Audit Review

Reviewer: Claude Code (product-strategy and media buyer logic reviewer)
Date: 2026-04-24
Charter: `docs/external-reviews/PRODUCT_REVIEW_CHARTER.md`
Scope: Live-firm product review across all currently connected Meta businesses, answering whether the Creative page helps a professional media buyer more than manually reading the creative table.

---

## 1. Executive Verdict: IMPROVING BUT NOT TRUSTWORTHY YET

Every connected, readable live Meta business currently returns zero creatives from the Creative Decision OS output layer. Eight businesses. 8–64 screening-live creative rows per business. Zero Decision OS rows in every single one. Every user-facing segment label — `Scale`, `Scale Review`, `Test More`, `Protect`, `Watch`, `Refresh`, `Retest`, `Cut`, `Campaign Check`, `Not Enough Data` — shows zero live output. A professional media buyer opening the Creative page across these 8 accounts would see nothing anywhere.

This is not a policy conservatism problem. This is not a label boundary problem. This is not a Commercial Truth over-gating problem. The blocker sits upstream of policy — at the moment the current Creative Decision OS builder receives its input row set, it receives nothing (or near-nothing), and its explicit empty-state branch fires across the entire readable cohort. Everything the recovery program built — taxonomy, safety gates, relative-strength surfacing, CT split, benchmark scope — is downstream of this blocker and cannot be evaluated on live firms until the blocker is cleared.

The verdict is not `MISALIGNED` (the architecture is correct). It is not `TOO CONSERVATIVE` (the system has not even reached the point of judging a row). It is `IMPROVING BUT NOT TRUSTWORTHY YET` — the foundational work is intact, but at the moment a live buyer looks at real accounts, the product produces no output at all.

The previous `READY` verdict (Final Recovery Review, 2026-04-23) was based on holdout validation of 293 creatives across 7 companies. That validation was honest for its cohort. But the live-firm audit shows that the pathway from live-readable Meta rows to user-facing output has a current-source/current-output gap that was not exercised by the holdout artifact. The gap is specific and traceable. It is not a reason to redesign anything. It is a reason to do one very narrow source/output restoration pass before declaring the program done.

---

## 2. What Is Working Across Live Firms

**Live Meta connectivity is real.** Runtime token readability is `readable`. The cohort recovery logic works. 8 of 9 candidate businesses pass the live-readability screen. 1 is appropriately skipped (`meta_token_checkpointed`). The infrastructure layer that was the subject of earlier recovery work is holding.

**Screening-level creative presence is real.** Per-business screening-live creative rows range from 8 (`company-02`) to 64 (`company-06`). These are genuinely active creatives in the last 30 completed days on real connected Meta businesses. The data exists upstream.

**The deterministic sampling rule is correctly implemented.** Rank active creatives first, sort by 30-day spend descending, fill up to 10 with non-active creatives if needed. That rule is in place and would have produced a clean sample if the Decision OS layer had returned rows.

**The audit discipline is correct.** Codex did not hand-pick, did not retune thresholds to force output, did not treat the old rule engine as truth, did not attempt majority-vote policy changes. The diagnosis correctly identifies the blocker as a current-source/current-output gap rather than a policy question. This is the right response to an ambiguous audit result.

**Reports are sanitized correctly.** Committed artifacts contain no raw IDs, no real business names, and no customer-identifying values. A stable company-alias scheme is in use. A private local reference file carries real names without being committed.

**The prior taxonomy work is not invalidated.** What the holdout validation established — that `Campaign Check`, `Refresh`, `Protect`, `Test More` survive unseen accounts, that the old challenger loses, that CT no longer erases relative diagnosis — remains true for the data shape that the holdout exercised. The live-firm audit does not refute any of this. It reveals a different problem: even a correct policy layer produces nothing if it receives no input rows.

---

## 3. What Is Failing Across Live Firms

**Zero Decision OS output across 100% of the readable cohort.** Every one of 8 businesses returned 0 current Decision OS creatives despite every business having 8–64 screening-live creative rows. Screening says the data exists. Decision OS says it has nothing to evaluate. The gap is in the input assembly for the current-window Decision OS builder.

**All 10 user-facing segment labels are at zero across live firms.** Not because the system judges creatives conservatively. Because no creative reaches the point of being judged.

**The 10-agent panel cannot run.** Not because the agents are wrong. Because there is no row to diagnose. Every agent role was blocked with the same status: no sampled rows available.

**The old challenger cannot be compared.** Not because the comparison is flawed. Because there are no current rows to compare against.

**Every downstream question is unanswerable in this audit state.** "Is Commercial Truth over-gating?" Cannot tell — no rows reach the CT gate. "Is campaign-context suppression correct?" Cannot tell — no rows reach context evaluation. "Are obviously strong creatives mislabeled?" Cannot tell — no creative is labeled. The entire live-firm product review collapses into a single question: why does current Decision OS see nothing?

**The trust implication for a professional media buyer is severe.** A buyer opening 8 connected live accounts today and seeing no creatives anywhere under any label would conclude one of two things: the system is broken, or it has no opinion about any of the creatives currently running. Either conclusion is catastrophic for product credibility.

---

## 4. Whether the Current Segment Taxonomy Works in Practice

The taxonomy is structurally intact but cannot be validated on live firms in this audit state. The assessment below is what I can say about each label based on prior holdout validation plus the live-firm absence; it is not direct live-firm observation.

| Label | Live-firm verdict | Why |
|---|---|---|
| **Scale** | Unverifiable — live zero | Prior holdout had zero live Scale rows (CT missing in 91% of holdout). Live audit returns zero. Cannot distinguish "correctly strict" from "unreachable due to upstream blocker." |
| **Scale Review** | Unverifiable — live zero | Holdout had 0 Scale Review until pass 6 fixed one real miss. Live audit returns zero. Cannot tell if pass 6's fix is reaching live rows or is never getting a chance to fire. |
| **Test More** | Unverifiable — live zero | Holdout confirmed 8 live rows with panel agreement. Live audit returns zero. No evidence it is failing, but no live evidence it is working either. |
| **Protect** | Unverifiable — live zero | Holdout confirmed 2 rows with panel agreement. Live audit returns zero. Same gap. |
| **Watch** | Unverifiable — live zero | Holdout confirmed 11 rows. Live audit returns zero. Pass 6 added the mature-weak routing, which has not been live-exercised. |
| **Refresh** | Unverifiable — live zero | Holdout confirmed 2 rows. Live audit returns zero. |
| **Retest** | Unverifiable — never live-confirmed | Zero holdout rows. Zero live audit rows. Path implemented, fixtures pass, no live evidence in either cohort. |
| **Cut** | Unverifiable — never live-confirmed | Zero holdout rows. Zero live audit rows. Same as Retest. |
| **Campaign Check** | Unverifiable — live zero | Holdout confirmed 3 rows. Live audit returns zero. Pass 6 did not change this path — the gap is upstream. |
| **Not Enough Data** | Unverifiable — live zero | Holdout confirmed 43 rows (largest segment). Live audit returns zero. If the upstream gap is fixed and rows flow, this label will likely dominate again. |

The taxonomy is not broken — it is simply not reaching users because nothing is reaching the taxonomy. This makes every naming/trust question structurally deferred, not answered.

---

## 5. Whether Zero Scale and Zero Scale Review Is a Real Product Problem

**It is not a policy problem. It is a symptom of the upstream zero-row blocker.**

Before concluding that zero Scale / zero Scale Review at live-firm level is a product-conservatism problem, consider the framing: every other segment label is also at zero. Not because every creative is perfect. Not because every creative is unclassifiable. Because the Creative Decision OS output layer received no rows to classify. Zero Scale here is not the same as zero Scale in a healthy audit where 293 rows ran through the policy and none cleared the floor.

In the prior holdout (pass 5), zero Scale across 293 evaluated creatives was a real product problem — policy had a live opportunity to produce Scale and did not. Pass 6 investigated and partially resolved it (CT was the cap on 1 real row; 3 others were correctly-capped Protect). That framing required the policy to have actually evaluated rows.

In this live-firm audit, zero Scale is not even a policy evaluation outcome. It is a "policy was never asked" outcome. Fixing zero Scale here means restoring the input pipe, not tuning the floor.

**However:** if the upstream blocker is fixed and rows flow again, zero Scale across 8 live businesses would be a real product problem. The current CT-availability ratio across the live cohort is unknown from this audit (screening does not report it). If CT is as scarce on live firms as it was on the holdout cohort (91% missing), then zero Scale will recur and will become a legitimate "no live Scale anywhere" product credibility question. That is worth preparing for, but it is not the question today.

---

## 6. The Worst 5 Live-Firm Failure Patterns

All five trace to the same root cause. Listing them as separate patterns only because they each produce distinct operator impact:

1. **Readable live Meta creative rows do not reach current Decision OS output.** 8 of 8 businesses have 8–64 screening-live rows. 8 of 8 return 0 Decision OS rows. The empty-state branch in `buildCreativeDecisionOs()` is firing on every audited business. Most likely causes per the audit report: `decisionWindows.primary30d` does not resolve to a usable row set, or a persisted zero-row snapshot is being accepted as the primary window input.

2. **The product surface is empty at the exact moment a buyer wants to use it.** A professional media buyer who opens the Creative page on a Wednesday to decide what to do next sees nothing — no scale candidates, no protect rows, no fatigue warnings, no test-more suggestions. The page is effectively worse than a raw Meta table, because Meta at least shows the creatives exist.

3. **Every downstream question is unanswerable.** CT over-gating, campaign-context suppression, Watch/Scale Review boundary, label understandability — none of these can be evaluated at live-firm level because no live-firm row reaches the labels. The live-firm audit becomes diagnostically muted.

4. **Previously validated segment paths (`Refresh`, `Protect`, `Campaign Check`, `Test More`) have no live cohort evidence.** Holdout confirmed them on a sanitized fixture-shaped cohort. Live audit cannot reconfirm them. Any claim that "Refresh works in production" rests on holdout-fixture evidence alone until live rows flow.

5. **The trust-building loop is stalled.** A media buyer who briefly tries the Creative page, sees no output, and closes the tab will not return a second time with a better disposition. Product trust is built through small confirmations ("this label was right for creative X") over many sessions. Zero output prevents the loop from even beginning.

---

## 7. Whether Commercial Truth Is Still Overused

**Not observable in this audit.** No live row reached the CT gate. CT's interaction with relative-strength surfacing cannot be evaluated at live-firm level until the upstream zero-row blocker is fixed.

What is known from prior holdout: CT is correctly scoped after pass 6. It blocks true `Scale`, push/apply authority, and absolute profit claims. It does not block relative diagnosis (`Refresh`, `Protect`, `Watch`, `Test More`, `Campaign Check`, `Scale Review`, `Cut`). That scoping is defensible.

What is not known: the actual CT-missing ratio across live firms. Holdout had 91% CT missing. If live firms have a similar ratio, the post-fix live-firm distribution will likely be dominated by `Scale Review` and `Watch` (CT missing but relative signal present) rather than `Scale`. That would match the product design but would again produce zero `Scale`, which would again raise the credibility question. Worth preparing for, not actionable today.

---

## 8. Whether Campaign Context Is Helping or Hurting

**Not observable in this audit.** No live row reached the campaign-context evaluation. `Campaign Check` has 0 live firings. Holdout confirmed 3 rows with broad panel agreement. Live evidence is pending.

If the upstream blocker is fixed and rows flow, `Campaign Check` is the most likely success-story label to appear first — it fires on weak/missing campaign peer context, which is common across real accounts. If it does not appear in meaningful volume after the fix, that would be a separate investigation. For now, defer.

---

## 9. Whether the Current Creative Page Is Better Than Manual Table Reading

**Currently, worse.** Materially worse.

Manual table reading produces: a list of currently running creatives with spend, ROAS, CPA, and conversion counts, ordered by whatever column the buyer sorts by. The buyer can see every creative, can apply their own mental model, and can act.

Current Creative page on live firms produces: nothing.

A system that produces nothing is strictly worse than a raw data view, because the buyer still has to read the raw table to do their job. The Creative page is not helping; it is a second place the buyer has to ignore.

After the upstream blocker is fixed and rows flow, the comparison will likely shift back to what prior holdout validation suggested: the Creative page will group creatives into media-buyer-sensible segments with instruction bodies, which is a meaningful improvement over raw tables. But that shift cannot be claimed today. The live-firm answer to "is the page better than the raw table" today is No.

---

## 10. Recommended Next Action

**Do one narrow implementation pass.**

Not a policy pass. Not a threshold pass. Not a redesign. A single, targeted source/output restoration pass with a clearly bounded scope. The question is binary: why do screened-live creative rows fail to reach the current Decision OS output layer across 100% of readable businesses?

The recovery program's architecture is correct. The taxonomy is correct. The safety gates are correct. The CT split is correct. The benchmark scope model is correct. Every product-level decision made during passes 1–6 stands. What is missing is the input pipe.

Do NOT:
- retune `Scale` or `Scale Review` floors
- change the taxonomy
- loosen safety gates
- import old rule engine as truth
- apply agent majority vote as policy
- add any UI complexity
- start a broader redesign

---

## 11. Exactly What Should Be Fixed First

### Scope of the narrow pass

One operation: trace why `buildCreativeDecisionOs()` receives zero (or near-zero) input rows for businesses that pass the live-readability screen and have 8–64 screening-live creative rows in the same 30-day window.

### Starting point

Pick one healthy audited business with the clearest signal. `company-06` (64 screening-live rows, 0 Decision OS rows) and `company-04` (50 screening-live rows, 0 Decision OS rows) are the two strongest candidates — large screening volume, clean runtime-readable status. If the blocker reproduces on either, it almost certainly reproduces on all 8.

### Specific trace targets (per the audit's own code-path interpretation)

1. **`decisionWindows.primary30d` resolution.** Does the primary 30-day window used by the Decision OS builder match the window the screening layer used? If the windows drift by even a few hours or use different canonical date boundaries, the builder may see a window that has no rows even when the screen saw rows in a nearby window.

2. **Persisted zero-row snapshot acceptance.** Is the builder reading a persisted snapshot artifact that happens to hold a zero-row state, and is it accepting that snapshot as authoritative for the primary window without refreshing? If so, the fix is to refresh or invalidate zero-row snapshots for the primary window when fresher screening data contradicts them.

3. **Missing `creativeId` on upstream rows (lower probability).** Do upstream creative rows arrive with the expected shape, or do some arrive with null/missing `creativeId` that the builder drops silently? The audit lists this as less likely than the first two, but it is cheap to check.

### Validation after the fix

Rerun the live-firm audit helper in the same mode. Expected outcome:
- Non-zero Decision OS row counts for at least 6 of 8 audited businesses
- Non-zero segment distribution across at least `Watch`, `Not Enough Data`, `Refresh`, and `Test More` (these are the most-expected labels)
- `Campaign Check` appearing when weak campaign context is present
- `Scale` and `Scale Review` remaining low or zero if CT is missing at the holdout-observed ratio (not a defect, just a reflection of CT scarcity)

### Stopping criterion for the fix pass

If the one narrow pass restores non-zero Decision OS rows for the readable cohort AND segment distribution across at least 4 labels is non-trivial, the fix is complete and a fresh live-firm audit rerun can proceed. If the first fix does not resolve both (1) and (2), a second narrow fix may be required — but do not bundle broader policy changes into these fixes. Keep each iteration surgically targeted.

---

## Final Chat Summary

**Verdict:** IMPROVING BUT NOT TRUSTWORTHY YET

**Top 5 Systemic Product Problems:**
1. Zero Creative Decision OS output across 100% of readable live Meta businesses (8/8) — empty state everywhere the buyer would actually look
2. Every segment label (Scale, Scale Review, Test More, Protect, Watch, Refresh, Retest, Cut, Campaign Check, Not Enough Data) is at zero on live firms — not due to conservatism, due to upstream zero-row blocker
3. `decisionWindows.primary30d` is almost certainly mismatching the live screening window, or a persisted zero-row snapshot is being accepted as authoritative — neither is a policy question
4. All prior holdout-validated labels (`Refresh`, `Protect`, `Campaign Check`, `Test More`, `Watch`, `Not Enough Data`) have no live cohort evidence — trust in those labels still rests on sanitized fixture-shaped data
5. The Creative page is currently worse than manual table reading because it produces nothing for a buyer with 8 connected live accounts

**Current output trustworthy enough:** No.

**Recommended next move (one sentence):** Do one narrow source/output restoration pass that traces why screened-live creative rows do not reach the current Decision OS builder for readable businesses, starting with `company-06` or `company-04`, with no policy/taxonomy/threshold changes in scope — then rerun the live-firm audit before declaring Creative Segmentation Recovery done.
