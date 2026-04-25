# Creative Decision OS — Taxonomy Simplification Review

Date: 2026-04-25  
Reviewer: Claude Code (product-strategy and senior media-buyer reviewer)  
Scope: Should Creative Decision OS reduce its 10 primary segments to a smaller set of operator decisions, with secondary reason tags carrying the nuance?

---

## 1. Executive Verdict

**SIMPLIFY PRIMARY DECISIONS**

The current 10-label taxonomy mixes three different things — operator actions, evidence states, and context blockers — into one row of primary segments. The independent equal-segment audits (Round 1–3) show this most clearly in **Watch (55/100)** and **Refresh (73/100)**: both segments hide rows that a senior media buyer would route to a different action immediately. Watch is functionally a "we couldn't decide" bucket dressed as a primary segment. Reducing the primary surface to **6 operator decisions** with **secondary reason tags** would directly address the owner's distrust without loosening any safety gate. The deterministic policy underneath does not need to change — only the label resolution and the UI surface.

This is **simplification of the user-facing surface**, not a rebuild. The internal `operatorPolicy.segment` enum (scale_ready, scale_review, promising_under_sampled, fatigued_winner, etc.) stays. The mapping from those internal segments to user-facing labels collapses, and a parallel reason-tag layer is added.

---

## 2. Is the Current Taxonomy Too Complex?

**Yes — but not because of the count alone. Because of the category mixing.**

Looking at [lib/creative-operator-surface.ts:20-31](lib/creative-operator-surface.ts#L20-L31), the 10 primary labels are:

| Label | What it really is |
|---|---|
| Scale | Action verb (act now) |
| Scale Review | Action verb + confidence sub-state |
| Test More | Action verb (give runway) |
| Protect | Action verb (don't touch) |
| Watch | Hedging state ("we can't decide cleanly") |
| Refresh | Action verb (replace creative) |
| Retest | Action verb (revive comeback) |
| Cut | Action verb (stop spend) |
| Campaign Check | Context blocker (creative read is corrupted by campaign issues) |
| Not Enough Data | Evidence state (sample too thin) |

Of these, only **5 are pure operator actions**: Scale, Test More, Protect, Refresh, Cut. The other 5 are evidence states, confidence sub-states, context blockers, or hedging buckets.

The charter is explicit: *"Are watch/investigate/blocked states meaningful and actionable, not just labels?"* The Round 3 audit answered this for Watch: **no**. The Watch segment scored 55/100 because it absorbed below-baseline collapsed-trend rows, potential Scale Review misses, and 0.35× baseline waste — a real media buyer would route those to Refresh, Cut, or Scale Review immediately.

Three concrete failures of the current taxonomy from the recent audits:

1. **Watch is a catch-all.** Round 3 found 4 Refresh-shaped rows, 1 Scale Review-shaped row, and 1 Cut-shaped row sitting in Watch because admission rules to those segments had spend or lifecycle floors that the row didn't clear.
2. **Refresh hides Cut.** Two `fatigued_winner` rows with CPA 12.68× median and 2.92× median sit in Refresh because the CPA blocker was scoped to `keep_in_test` / `blocked` lifecycles. The label collapses the difference between "creative is fatigued" and "creative is hemorrhaging money."
3. **Scale Review is a Scale modifier, not a separate decision.** Operators read both segments and merge them mentally. Splitting them costs cognitive load without changing the operator action.

The owner's complaint that the page does not clearly answer *"what should I scale / cut / keep testing / protect / investigate?"* is supported by the data. The page **does** compute the answer — the surface taxonomy is the bottleneck.

---

## 3. Current Label-by-Label Review

### Scale → KEEP AS PRIMARY

The clearest, highest-value verb. Often empty (zero Scale in Round 3 is acceptable per owner's statement that without commercial truth, Scale stays empty). Should remain top-level. Add a sub-tone "queue ready" vs nothing if commercial truth is configured.

### Scale Review → MERGE INTO SCALE

**Rationale:** Scale Review is "Scale candidate held for business validation or commercial truth." It is a Scale row with a missing-evidence flag. Operators do not perform a different action — they perform the same review with a softer push.

**Recommendation:** Make this a sub-tone of Scale: `Scale (review only — business validation missing)`. This preserves the safety gate (no auto-push without business validation) while collapsing two segments operators currently scan separately.

### Test More → KEEP AS PRIMARY (light rename optional)

The "give runway" decision is a real, distinct operator action. The current label is acceptable. A buyer who sees "Test More: 13" knows exactly what to do — protect those rows from premature judgment.

### Protect → KEEP AS PRIMARY

The "don't touch" instruction is one of the most valuable in media buying. Operators churn winners constantly, and the system telling them to leave it alone is high-trust value. Round 3 noted Protect at 83/100 — the issue there is policy-level (one row at trend 0.45 just above the 0.40 floor) and a separate fix.

### Watch → REMOVE AS PRIMARY (this is the biggest change)

**Rationale:** Watch absorbs everything that doesn't fit cleanly into Scale, Test More, Protect, Refresh, or Cut admission rules. It scores 55/100 in three consecutive audits. From the charter:

> "Watch/investigate/blocked states must be meaningful and actionable, not just labels."

Watch is none of those.

Rows currently in Watch should resolve to:
- **Test More** if above baseline with thin evidence
- **Refresh** if below baseline with collapsed trend (requires the validating-lifecycle Refresh admission Fix #5 from Round 2)
- **Cut** if catastrophic ratio with adequate spend
- **Diagnose** if a campaign context blocker or low evidence is the real reason

### Refresh → KEEP AS PRIMARY (consider rename to "Replace")

**Rationale:** "Refresh" is correct for fatigued winners. The action verb is sound. **Retest** belongs inside this same bucket because the operator action is the same: supply a new creative — either a fresh variant (Refresh) or revive a paused historical winner (Retest). The differentiation belongs in a reason tag.

Combined: **Refresh / Replace** as one primary action, with reason tags `fatigued_winner`, `below_baseline_waste`, `trend_collapse`, `comeback_candidate`.

### Retest → MERGE INTO REFRESH

**Rationale:** Round 3 had n=1 Retest. Operationally identical to Refresh (supply a creative). The "this is a paused historical winner worth bringing back" nuance becomes a reason tag.

### Cut → KEEP AS PRIMARY

The cleanest verb. Highest precision in the audits (90/100). Operators trust Cut when it appears. Should remain top-level. The Round 3 recall gap (~77%) is a policy fix — extend CPA blocker to `fatigued_winner` lifecycle — not a taxonomy fix.

### Campaign Check → DEMOTE TO REASON UNDER DIAGNOSE

**Rationale:** Campaign Check means "we cannot read this creative cleanly because the campaign or ad set context is blocking us." That is **not an action on the creative**. It is a flag that the operator should look at the campaign first. Operationally, the operator's next move is the same as for any context-blocked row: investigate before deciding. This belongs as a reason tag under a single Diagnose primary.

### Not Enough Data → DEMOTE TO REASON UNDER DIAGNOSE OR NOT READY

**Rationale:** "Not Enough Data" is an evidence state, not an operator decision. The operator's actual action is "wait" or "give it more runway" — which overlaps Test More if the row is above baseline, or "investigate the test setup" if it is suspiciously thin. Round 3 had this at 88/100 — it isn't broken, but it's not load-bearing as a primary segment.

Two options:
- **Option A:** Fold into Diagnose with reason `low_evidence`.
- **Option B:** Keep as a separate primary "Not Ready" if the owner wants a hard "do not act" bucket distinct from "investigate the campaign." This is a taste call; both work.

---

## 4. Recommended Primary Decision Taxonomy

**6 primary operator decisions:**

1. **Scale** — increase budget on a strong relative winner. Sub-tone: `queue_ready` or `review_only`.
2. **Test More** — keep running, do not judge yet. Above-baseline thin evidence, active test campaigns, or promising under-sampled.
3. **Protect** — stable winner, do not touch. Includes paused historical winners that should not be reactivated yet.
4. **Refresh** — supply a new variant or revive a paused historical winner. Subsumes today's Refresh + Retest.
5. **Cut** — stop spend now. Catastrophic CPA, mature below-baseline waste, retired/blocked rows.
6. **Diagnose** — cannot decide on the creative alone; campaign context, missing evidence, or preview problems block a clean read. Subsumes today's Campaign Check + Not Enough Data + the worst of Watch.

**What goes away:** Watch, Scale Review (becomes a sub-tone of Scale), Retest (becomes a reason tag in Refresh), Campaign Check (becomes a reason tag in Diagnose), Not Enough Data (becomes a reason tag in Diagnose).

This drops the operator's first-scan from 10 labels to 6 verbs.

---

## 5. Recommended Secondary Reason Tags

Reason tags are pinned to each row inside its primary segment. They explain **why** the row landed in that segment without forcing the operator to read all rows in all segments.

**Action / strength reasons:**
- `strong_relative_winner` — primary segment Scale or Test More
- `business_validation_missing` — primary segment Scale (forces `review_only` sub-tone)
- `commercial_truth_missing` — primary segment Scale or Diagnose
- `weak_benchmark` — primary segment Test More or Diagnose

**Fatigue / failure reasons:**
- `fatigue_pressure` — primary segment Refresh
- `trend_collapse` — primary segment Refresh or Cut
- `catastrophic_cpa` — primary segment Cut (top severity tone)
- `below_baseline_waste` — primary segment Cut or Refresh
- `mature_zero_purchase` — primary segment Cut
- `comeback_candidate` — primary segment Refresh
- `paused_winner` — primary segment Protect

**Context / evidence reasons:**
- `campaign_context_blocker` — primary segment Diagnose
- `low_evidence` — primary segment Diagnose or Test More
- `preview_missing` — primary segment Diagnose (decision authority capped)
- `creative_learning_incomplete` — primary segment Diagnose or Test More

Each row should carry **at most 2 reason tags**, ranked by severity.

---

## 6. How This Improves Media Buyer Usability

**Cognitive load drops.** The first scan becomes "how many Cut, how many Refresh, how many Scale, how many Diagnose, how many Test More, how many Protect." Six numbers, six decisions. Today the operator must mentally merge Scale + Scale Review, then mentally split Watch into "is this really watch or is something hidden?", then check Campaign Check separately, then read Not Enough Data to see if anything escaped from there. Six scans collapse to one.

**Trust improves on the weakest segments.** Watch was 55/100 — and it was 55 because the segment was definitionally vague. Removing it forces the rows into segments where the audit can actually grade the decision. The operator stops being asked to interpret a label that means "we couldn't decide."

**Action completeness improves.** The charter requires every action to tell the operator WHAT, WHERE, HOW MUCH, WHY NOW, and WHAT TO WATCH AFTER. Reason tags make the WHY explicit on the same line as the action, instead of forcing the operator to drill in. A buyer sees `Cut · catastrophic_cpa · below_baseline_waste` and knows immediately: this is a clear stop-spend with two independent severe signals.

**A less-experienced operator can act.** Today, "Watch" or "Not Enough Data" in front of a junior buyer reads as "the system is uncertain — I'd better not touch it." That's the wrong instinct: many of those rows are clear Refresh or Cut. A 6-verb taxonomy with reason tags removes the ambiguity.

**A senior operator trusts the smaller set.** Senior buyers do not think in 10 segments. They think in 4–6 actions. Showing them 10 segments signals dashboard thinking; showing them 6 signals operator thinking.

---

## 7. Risks This Creates

### R1 — Diagnose becomes the new Watch

If Diagnose is allowed to absorb anything ambiguous, it will become the new catch-all and reproduce the Watch problem at the same bucket size. **Mitigation:** every Diagnose row must carry exactly one of `campaign_context_blocker`, `low_evidence`, `preview_missing`, or `creative_learning_incomplete`. If no reason tag fits, the row belongs in Test More or Refresh. Enforce this with a deterministic test in `creative-operator-surface.ts`.

### R2 — Severity collapses inside Refresh

A `Refresh · fatigue_pressure` and a `Refresh · catastrophic_cpa` are operationally different. The severe row is a Cut in disguise; the mild row is a normal supply task. **Mitigation:** if the row carries `catastrophic_cpa` or `mature_zero_purchase`, route to Cut, not Refresh. This requires the Round 2 fix #4 (CPA blocker on `fatigued_winner` lifecycle) to ship first. The taxonomy change cannot fix the CPA recall gap; the policy change must.

### R3 — Scale Review collapse hides the review-only safety distinction

Today, Scale Review is a visual signal that the row is review-only. Folding into Scale must preserve this. **Mitigation:** the Scale segment must always render the `review_only` sub-tone visibly when business validation is missing, and the queue/push gate must continue to block on `business_validation_missing`. Do not let the rename loosen the safety gate.

### R4 — Information loss on Retest specifically

Retest = paused historical winner worth reviving. This is a meaningfully different supply task from "brief a new variant of the same family." **Mitigation:** the `comeback_candidate` reason tag must drive a distinct sub-tone in the Refresh row (e.g., a `Revive` chip on the row) so a buyer scanning Refresh knows the action is "unpause + watch" not "brief new creative."

### R5 — Implementation cost / regression risk

A taxonomy rename touches `creative-operator-surface.ts`, `creative-operator-policy.ts`, the table column header label, the quick filter chips, the operator console, the AI tag filter dropdown, the snapshot summaryCounts shape, the test fixtures, and many tests. **Mitigation:** ship in two passes. Pass 1: add the new label resolver + reason tags as additive types and helpers, with a feature flag. Pass 2: flip the UI and remove the old labels. Do not couple the rename with any policy change in the same PR.

### R6 — Existing snapshot summaries become stale-labelled

`creative_decision_os_snapshots.summary_counts` includes user-facing segments by old label. Old snapshots will display old labels in the UI's last-analyzed metadata. **Mitigation:** migrate existing snapshots' `summary_counts.userFacingSegments` keys at read time using a deterministic legacy-to-new mapping (no DB rewrite), or accept that pre-rename snapshots show old labels until the next manual run.

---

## 8. What Should NOT Change

- **`operatorPolicy.segment` internal enum** ([creative-operator-policy.ts:20-32](lib/creative-operator-policy.ts#L20-L32)) — this is the deterministic decision surface used by the policy explanations, telemetry, and the existing test fixtures. It stays. Only the label resolver in `creative-operator-surface.ts` changes.
- **Scale / Scale Review evidence floors** — the gates that decide `scale_ready` vs `scale_review` are correct (the Round 3 audit confirmed Scale Review precision at 95/100). Only the user-facing label collapses.
- **Cut precision rules** — at 90/100 they are working. Rename only.
- **Protect floors and trend-collapse Refresh admission** — the Round 1 fix is correct; do not loosen.
- **Push/apply safety contract** — `business_validation_missing` keeps blocking direct push. Sub-tone changes do not change the gate.
- **Snapshot identity contract** — `business_id`, `analysis_scope`, `analysis_scope_id`, `benchmark_scope`, `benchmark_scope_id` stay as identity fields. The taxonomy change does not affect snapshot identity.
- **The pending Round 2/3 CPA fix** — extending the CPA blocker to `fatigued_winner` lifecycle must ship **before or in parallel with** the taxonomy change. Otherwise, the Refresh-as-Cut hiding pattern survives the rename.
- **No new agent-vote, old-rule, or majority-policy authority** — the deterministic policy is the truth.

---

## 9. Recommended First Codex Implementation Task

**Task: introduce the new label resolver + reason tags as a parallel layer, behind no flag (additive only).**

Concretely:

1. Add a new exported type in `lib/creative-operator-surface.ts`:
   ```ts
   export type CreativeOperatorPrimaryDecision =
     | "scale" | "test_more" | "protect" | "refresh" | "cut" | "diagnose";

   export type CreativeOperatorReasonTag =
     | "strong_relative_winner"
     | "business_validation_missing"
     | "commercial_truth_missing"
     | "weak_benchmark"
     | "fatigue_pressure"
     | "trend_collapse"
     | "catastrophic_cpa"
     | "below_baseline_waste"
     | "mature_zero_purchase"
     | "comeback_candidate"
     | "paused_winner"
     | "campaign_context_blocker"
     | "low_evidence"
     | "preview_missing"
     | "creative_learning_incomplete";
   ```

2. Add a deterministic mapper:
   ```ts
   resolveCreativeOperatorDecision(creative): {
     primary: CreativeOperatorPrimaryDecision;
     subTone: "queue_ready" | "review_only" | "default";
     reasons: CreativeOperatorReasonTag[];
   }
   ```
   This reads from `operatorPolicy.segment`, `lifecycleState`, `primaryAction`, `trust.surfaceLane`, `previewStatus`, `fatigue.status`, `relativeBaseline`, and the existing helpers (`isPausedHistoricalRetest`, `creativeNeedsBusinessValidation`).

3. Add a unit test that runs the mapper over the existing live audit fixture and asserts:
   - Every existing creative resolves to exactly one of 6 primary decisions.
   - No row resolves to a primary that contradicts its current operator action class (Scale vs Cut, Protect vs Refresh).
   - Watch dissolves: every previously-Watch row maps to Test More, Refresh, Cut, or Diagnose with at least one reason tag.
   - Diagnose rows always carry one of the 4 context/evidence reason tags.

4. **Do not change UI yet.** The Creative page continues to use `creativeOperatorSegmentLabel`. The new resolver is parallel, exercised only by tests.

This pass produces no operator-visible change, contains all the policy logic, and lets the next pass be a pure UI swap. The owner can review the new resolver against fixtures before any user sees the new labels.

**Pass 2 (after acceptance of pass 1):** swap the Creative page status card, table column, quick filters, and the drawer to use the new primary decisions and reason tag chips. Gate this behind a single config flag for one release, then remove the flag.

**What to skip in pass 1:** do not touch `operatorPolicy.segment`, do not change any test fixtures, do not change the snapshot schema, do not change push/apply gates.

---

## 10. Acceptance Criteria for the Taxonomy Change

The taxonomy change is acceptable when **all of the following** hold:

1. **Six primary segments only.** No primary segment is allowed to be "Watch" or any catch-all label.
2. **Every row resolves to exactly one primary.** A deterministic test enforces this on the live audit fixture (78 rows).
3. **Every Diagnose row has a non-empty reason tag set.** Reason tag must be one of `campaign_context_blocker`, `low_evidence`, `preview_missing`, `creative_learning_incomplete`.
4. **No regression on Scale Review safety.** Scale rows where `business_validation_missing` reason is present must continue to be queue-blocked. A test exercises this.
5. **No regression on Cut precision or Refresh recall.** Re-running the Round 3 audit against the new resolver must produce: Cut precision ≥ 90, Refresh recall ≥ 90 *after the parallel CPA fix ships*. If only the rename ships, recall must not get worse.
6. **Catastrophic-CPA fatigued_winner cases route to Cut, not Refresh.** This requires the policy fix; the taxonomy change must not be allowed to mask the recall gap.
7. **Watch segment does not exist in the UI.** Removed from the quick filter chip row, the operator console aggregates, the AI filter dropdown, and the snapshot summary.
8. **Comeback candidates display a `Revive` sub-tone chip in Refresh.** A buyer scanning Refresh can tell at a glance whether the row needs a new brief or an unpause.
9. **The 6-verb scan is testable.** A new equal-segment audit should grade each of Scale, Test More, Protect, Refresh, Cut, Diagnose individually. Target: every represented segment ≥ 85, with the goal of 90+.
10. **Last-analyzed snapshots survive the rename.** Existing snapshots in `creative_decision_os_snapshots` continue to render valid (legacy-to-new mapping at read time, or a one-shot `summary_counts` migration).

---

## Final Chat Summary

- **Verdict:** SIMPLIFY PRIMARY DECISIONS
- **Recommended primary labels:** Scale, Test More, Protect, Refresh, Cut, Diagnose (6 total)
- **Labels to demote into reasons:** Scale Review (→ `review_only` sub-tone of Scale), Watch (split into Test More / Refresh / Cut / Diagnose by reason), Retest (→ `comeback_candidate` reason in Refresh), Campaign Check (→ `campaign_context_blocker` reason in Diagnose), Not Enough Data (→ `low_evidence` reason in Diagnose)
- **Biggest risk:** Diagnose becomes the new Watch — must enforce a non-empty reason tag rule deterministically
- **First Codex task:** add `resolveCreativeOperatorDecision()` mapper + reason tags as a parallel additive layer in `lib/creative-operator-surface.ts` with a unit test against the live audit fixture; do not change UI in this pass; do not couple with any policy change; the pending CPA-blocker fix on `fatigued_winner` lifecycle must ship before or alongside the rename so Refresh-as-Cut hiding does not survive the relabel
