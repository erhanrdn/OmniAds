CHATGPT_REVIEW_READY: YES
ROLE: CLAUDE_MEDIA_BUYER_JUDGE
BRANCH: review/creative-v2-buyer-surface-requirements-2026-04-26
HEAD_COMMIT: see PR body
PRIMARY_REPORT_PATH: docs/operator-policy/creative-segmentation-recovery/reports/v2-buyer-surface-requirements-2026-04-26/
HANDOFF_FILE: docs/operator-policy/creative-segmentation-recovery/reports/v2-buyer-surface-requirements-2026-04-26/FOR_CHATGPT_REVIEW.md
SANITIZED: YES
PRODUCT_CODE_CHANGED: NO
GOLD_LABELS_CHANGED: NO
RESOLVER_LOGIC_CHANGED: NO
MERGE_REQUESTED: NO
MAIN_PUSHED: NO
PRODUCT_READY: NO

# Creative v2 Buyer Surface Requirements

Author: Claude Code, acting as independent Meta media buyer / operator judge.
Date: 2026-04-26
Source data:
- `docs/operator-policy/creative-segmentation-recovery/reports/v2-live-audit-2026-04-26/` (sanitized live-audit artifacts at PR #78 head commit `3da2e05cb47f97de89ee42d9af6a64598af8b17a`).
- `docs/operator-policy/creative-segmentation-recovery/reports/gold-labels-v0-2026-04-26/PR_78_LIVE_AUDIT_RECAL_BUYER_REVIEW.md` (my prior buyer review at PR #77 commit `727b50c`).

This document is buyer/operator judgment only. No product code, no resolver logic, no gold labels were changed. No UI/API/queue/apply behavior is proposed for change. This is a UX requirements document for what the v2 resolver output must look like on the Creative page when it is eventually integrated.

---

## 1. Executive summary

The v2 resolver is correct as a decision engine but conservative by design: only 2 of 303 live rows emit direct actionability (0.66%), 108 are review_only, 193 are diagnose. If those 303 rows land in front of a media buyer as a flat "review queue" with 301 items, the buyer will lose trust within minutes. The Creative page must NOT become a wall of "review" and "diagnose" with no clear workflow.

The requirement is a **buyer-priority surface**: spend-weighted, urgency-bucketed, with the high-impact rows (Cut on $58k, Scale on $10k, Refresh on a $124k inactive winner) visible in the first 5 seconds. The 193 Diagnose rows must collapse into a "Diagnose later" bucket that the buyer can drain on a separate cadence, not interrupt the live decision flow.

A buyer never needs to scroll 303 rows to find the next action. They need to know: "what is on fire today, what is healthy, what is waiting for me to investigate this week."

---

## 2. What the operator must know within 5 seconds of opening Creative

A senior buyer's mental model on opening the page:

1. **Is anything actively bleeding spend?** -> the Cut count and the highest-spend Cut row.
2. **Is there anything I should scale today?** -> the Scale count and the highest-confidence Scale shape.
3. **Is anything fatiguing on real budget?** -> the Refresh-on-active-spend count.
4. **What can I leave alone?** -> the Protect count.
5. **What is waiting for me to investigate?** -> the Diagnose count, with a clear "this week" cadence, not an "every refresh" alarm.

The page must surface those five answers in five tiles or chips at the top, with one-click drilldown into each. No buyer should need to scan a table to count.

---

## 3. Recommended top-level queues / tabs / sections

The current Creative page is a single ranked table. The v2-aware page should show **three layers**, in this order top-to-bottom:

**Layer A - Action ribbon (above the fold):**
A 5-chip strip showing per-bucket counts and the highest-spend exemplar. Buyer hovers/clicks to drill in.

| Chip | Bucket | What it lists |
|---|---|---|
| Act Now | direct + review_only Scale + direct review_only Cut on huge-spend severe-loser shapes | Scale candidate, severe-loser huge-spend Cut review |
| Refresh | review_only Refresh (active rows where creative fatigue or refresh is the buyer action) | Refresh-before-Cut and lifetime-strong-recent-decay rows |
| Protect | direct Protect + review_only Protect | Stable above-benchmark winners; do-not-touch hold |
| Test More | direct Test More + review_only Test More | Promising but under-sampled, recent rebound, around-benchmark thin |
| Diagnose | diagnose actionability | Inactive historical winners, ambiguous source/context, data-quality holds |

**Layer B - The active table (current Creative table, v2-augmented):**
The existing ranked table, now sorted by buyer urgency (see section 16) instead of pure spend. Each row carries the v2 decision badge + actionability badge + reason-tag chips.

**Layer C - Diagnose drawer:**
A collapsed-by-default secondary panel for the 193 Diagnose rows. Buyer opens it on a "Diagnose review" cadence (weekly), not on every page load.

Avoid tabs that hide critical action behind a click. Cut and Scale candidates must always be visible on the default view.

---

## 4. How to display each primary decision

The visual language must let a senior buyer scan ten rows and instantly group them.

| Primary | Color tone | Verb on row | One-line copy template |
|---|---|---|---|
| Scale | green / emerald, single-prominent badge | "Scale" | "Scale candidate. Above benchmark with sustained recent strength. Operator review required." |
| Cut | red / rose, prominent badge | "Cut" | "Cut candidate. Severe loser shape with no recovery. Review before applying." |
| Refresh | amber / orange, medium-prominent badge | "Refresh" | "Refresh candidate. Replace creative variant before harder action." |
| Protect | blue / sky, low-prominent badge | "Protect" | "Stable winner. Do not touch unless trend changes." |
| Test More | sky / indigo, low-prominent badge | "Test More" | "Give more delivery before judging." |
| Diagnose | slate / gray, neutral badge | "Diagnose" | "Investigate context before taking creative action." |

Scale gets the strongest visual emphasis even when count = 1. Diagnose gets the weakest. Cut sits between - prominent because of risk, but never urgent enough to be auto-actionable.

Hard rules:
- Do NOT rename "Scale" to "Scale Review" anywhere on the surface. The taxonomy is six primaries; "review_only" is an actionability axis, not a primary name.
- Do NOT show "Watch" anywhere. Watch is not a v2 primary decision.
- Do NOT show internal names like `lifetime_strong_recent_decay` raw. Reason tags must render as buyer-readable phrases ("recent ROAS collapsed", "above-benchmark stable").

---

## 5. How to display actionability

Actionability is the SAFETY axis. It tells the buyer how much intervention the system thinks is safe right now. It must be visually distinct from the primary decision.

| Actionability | Visual | Operator copy |
|---|---|---|
| direct | small filled chip in same color as primary | "Ready to act" |
| review_only | small outlined chip with a review icon | "Review required" |
| blocked | small chip with lock icon | "Blocked - see why" |
| diagnose | small chip with magnifier icon | "Diagnose first" |

Hard rules:
- The PRIMARY DECISION is always the dominant visual. Actionability is the secondary chip.
- "review_only" must always read as "Review required", never as "Apply" or "Auto-apply".
- "blocked" must always include the blocker reason inline, in plain English (not the raw enum like `cut_requires_buyer_review`).
- "diagnose" must NEVER expose action buttons (no Apply, no Queue, no Push). Only "Investigate" or "Mark reviewed".

---

## 6. How to avoid the page becoming a useless "review everything" panel

The current live audit produces 108 review_only rows. If the page renders 108 "Review required" chips with no internal sort, it's noise.

Three required mechanisms:

**6a. Spend-weighted urgency.** Rows are sorted by `(business_risk * spend)` not by spend alone. A $10k Cut is more urgent than a $124k inactive Refresh. See section 16 for the exact sort.

**6b. Active vs inactive separation.** Inactive rows are visually muted (lower opacity, smaller font weight) AND default-folded. The Creative page in normal use shows ACTIVE rows on top; inactive rows are accessible but not in the buyer's primary scan. Of the 303 live rows, ~190 are inactive - they should not visually compete with the ~113 active rows.

**6c. Diagnose collapsed by default.** Diagnose rows live in the Diagnose drawer (Layer C) and never appear in the active table unless the buyer opens that drawer. Their count is visible in the action ribbon, but the rows themselves are out of sight by default.

If after applying these three the active table still has more than ~20-30 review_only rows, the surface needs a "today" / "this week" / "this month" timeline grouping. A buyer cannot mentally process more than ~25 review-required items per session without losing focus.

---

## 7. Which v2 outputs should be above the fold

In priority order, no exceptions:

1. The action ribbon (5 chips with counts, exemplar row IDs, drill-in CTA).
2. The Scale row (single highest-confidence Scale candidate, full row card with primary, actionability, reason tags, "Why now" copy).
3. The top 3 active Cut rows by spend (Cut on real money is the most urgent buyer signal).
4. The top 3 active Refresh rows by spend.
5. The active Protect row count + the highest-spend Protect (so a buyer sees what is currently shielded from churn).

Below the fold:
- Full active row table.
- Inactive Refresh / Diagnose collapsed sections.
- Test More secondary panel.

Below the fold, but accessible:
- Top 20 highest-risk changes (Main vs v2 diff list).
- Top 20 highest-spend decisions list.
- Diagnose drawer.

---

## 8. Which outputs can be secondary / collapsed

- Inactive rows altogether: collapsed-by-default. Buyer opens "Inactive review" if needed.
- Diagnose rows: collapsed in a separate drawer; show count only on the main page.
- Test More rows where `spend < $200`: collapsed in a "Thin signal" sub-section; show count only.
- Reason tags beyond the first two: collapsed inside an info popover.
- The full evidenceSummary string: visible on hover/click of the row card; not always inline.
- Confidence number: secondary; displayed small on the row, only large in the row detail drawer.
- Source-trust state, baseline reliability: only surface when degraded; otherwise default to clean and quiet.

---

## 9. What a row card / table row must show

Required fields, in display order from left to right (or top to bottom on mobile):

| Field | Source | Display rule |
|---|---|---|
| Creative thumbnail / preview | existing UI | unchanged |
| Creative alias / name (sanitized) | existing UI | unchanged |
| Spend (30d) | input | always visible |
| **Primary decision** | `v2.primaryDecision` | dominant badge, color per section 4 |
| **Actionability** | `v2.actionability` | secondary chip, per section 5 |
| **Buyer action** (single short verb-phrase) | derived from primary + actionability | "Scale - review", "Cut - review", "Refresh", "Protect", "Test more", "Investigate" |
| **Why** (one sentence) | `v2.evidenceSummary` | visible inline (truncate at ~140 chars; expand on click) |
| **Risk tier** | `v2.riskLevel` | small badge: critical (red), high (orange), medium (yellow), low (gray) |
| Top 1-2 reason tags | `v2.reasonTags[0..2]` | rendered as buyer phrases (mapping required) |
| **Blocker reasons** (if non-empty) | `v2.blockerReasons` | warning chip with plain-English message |
| ROAS (lifetime) | input | always visible |
| Recent ROAS / ratio | derived | always visible; highlight when collapsed |
| Source / trust state | input | only show when degraded |

What MUST NOT appear on a row:
- The contract version string.
- The engine version string.
- Confidence as a raw 0-100 (use bands: high / medium / low).
- Any forbidden internal-artifact phrasing.

---

## 10. Allowed and forbidden button language

**Allowed buttons on a row, by actionability:**

| Actionability | Allowed buttons |
|---|---|
| direct | "Apply" (only when the existing safety policy permits applying that decision; for v2 preview = NEVER); otherwise "Mark for review", "Open detail" |
| review_only | "Review", "Open detail", "Mark reviewed", "Push to review queue" |
| blocked | "See blocker", "Open detail", "Mark resolved" |
| diagnose | "Investigate", "Open detail", "Mark investigated" |

**Forbidden button language across all actionabilities:**
- "Auto-apply", "Auto-cut", "Auto-scale", "Auto-refresh".
- "Push live", "Send to ad account", "One-click apply" (until queue/apply is explicitly approved by supervisor for v2 outputs - which is NOT now).
- "Approve" without a follow-up confirmation step.
- "Recommended" alone without the primary decision badge.
- Any button that performs a write to Meta in the v2 preview phase.

For v2 read-only preview, the ONLY safe buttons are: Review, Open detail, Mark reviewed, Mark investigated, See blocker. No write operations on creative state.

---

## 11. Should direct actions be shown as true direct actions, or as "ready for buyer confirmation"?

**As "ready for buyer confirmation" only.** Even though `actionability = direct` exists in v2 output, the Creative page in the v2-preview phase MUST treat direct as "ready for buyer review and one-click confirmation", not as an auto-apply trigger. Concretely:

- A direct Protect row shows "Hold" / "Protect" badge; the only button is "Open detail".
- A direct Test More row shows "Test more" badge; the only button is "Open detail" or "Mark for review".
- The current resolver emits zero direct Cut and zero direct Scale on the live cohort, so this question is moot for those primaries today.
- If the resolver later emits direct Cut: the UI must downgrade it to "Cut - review required" until the supervisor explicitly authorizes direct Cut writes.

Reasoning: the safety contract on the v2 preview phase is that nothing the v2 resolver decides ever writes to Meta without a human in the loop. Showing "Apply" buttons would break that contract at the UI layer even if the queue/apply gate stays at false.

---

## 12. How to handle the 193 Diagnose rows

Three principles:

**12a. Out of the active table by default.** Diagnose rows live in a separate drawer (Layer C). The main Creative table shows active and at-risk rows; Diagnose rows are accessible via a single click, never blocking the buyer's main scan.

**12b. Cadence framing, not noise framing.** The Diagnose drawer is labeled "Investigate this week" or "Investigate as time allows" - not "193 unresolved alerts". A buyer sees Diagnose as a backlog they own at their own cadence, not as a wall of red alerts.

**12c. Group by problem class, not by row.** The drawer groups Diagnose rows by `problemClass`:
- "Paused historical winners" (campaign-context Diagnose)
- "Low evidence" (insufficient-signal Diagnose)
- "Mixed signals" (data-quality Diagnose)
- "Source/trust gaps" (data-quality Diagnose with source flags)

Each group shows the count, the highest-spend exemplar, and a one-line buyer prompt: "Did these 12 paused historical winners stop because of audience exhaustion, policy, or campaign-level issues?"

Hard rule: a Diagnose row never has an "Apply" or "Queue" button. The only verbs are Investigate, Open detail, Mark investigated.

---

## 13. How to handle the 108 review_only rows

These are the buyer's actual day-to-day work. They split naturally into:

| Sub-bucket | Rows in live audit | Buyer cadence |
|---|---:|---|
| review_only Cut on huge-spend severe loser | 4-6 | TODAY - bleeding spend |
| review_only Scale candidate | 1 | TODAY - confirm and authorize budget move |
| review_only Refresh on active above-benchmark with recent decay | 5-10 | THIS WEEK - brief variant |
| review_only Refresh on inactive historical winner | 30-50 | THIS MONTH - relaunch decision |
| review_only Test More on degraded truth | 20-30 | THIS WEEK or NEXT - decide whether to extend runway |
| review_only Protect | ~10 | INFREQUENT - confirm hold |

The page must surface "TODAY" rows above the fold. "THIS WEEK" rows in the active table. "THIS MONTH" rows collapsed into an "Inactive review" section. This three-tier urgency model is non-negotiable - a flat 108-row list does not function for a buyer.

Sort within each sub-bucket: by spend descending (or `business_risk * spend`).

---

## 14. How to handle the 2 direct rows

The two rows currently emitting `direct` actionability are clean above-benchmark cases (`company-02/creative-03` Protect, `company-02/creative-04` Test More). Treatment:

- Render them in their primary's normal section (Protect chip, Test More chip).
- Do NOT highlight them as "auto-applicable" or "auto-act-ready".
- Show the SAME buttons as review_only (Open detail, Mark reviewed).
- The "direct" actionability is a system-confidence signal, not a user-facing instruction. The buyer sees a normal Protect / Test More row.

If the v2 resolver later emits direct Cut or direct Scale (currently 0), the UI must immediately downgrade those to review_only at the surface layer. The supervisor will explicitly authorize a different treatment if needed.

---

## 15. How to prioritize the top 20 highest-spend decisions

Sort by buyer impact, not by spend alone. Proposed priority within "TODAY" surface:

1. Active Scale candidate, by recent ROAS strength desc.
2. Active Cut on `huge_spend_severe_loser` shape, by spend desc.
3. Active Refresh-before-Cut on rows with recent conversions still flowing, by spend desc.
4. Active Refresh on `lifetime_strong_recent_decay`, by spend desc.
5. Active Refresh on `strong_history_recent_stop` (the new buyer-safety rule), by spend desc.
6. Active Protect on stable above-benchmark, by spend desc.
7. Active Test More on degraded truth, by spend desc.

Inactive rows go into the "Inactive review" section and are sorted similarly within that section.

A media buyer scanning the top 20 should see the cluster pattern: most of the top spend in the current cohort is concentrated in `company-05` (paused cluster) - the surface should make that cluster's "Refresh review-only relaunch" decisions easy to triage as a group, not row-by-row.

---

## 16. What would make a media buyer hesitate

These are the failure modes that would lose buyer trust on day one:

- **Too many "Review required" chips with no urgency.** If 108 rows all say "Review required" with no further sort, the buyer perceives system noise.
- **Diagnose rows mixed into the active table.** If the buyer sees `Diagnose / diagnose / Investigate` next to live decisions, the page reads as "the system can't decide". Diagnose must be a separate workflow.
- **Reason tags shown raw.** If a row says `lifetime_strong_recent_decay` without a translation to "lifetime ROAS strong but recent week collapsed", the buyer questions whether the system is built for them.
- **Inconsistency between the badge and the buttons.** If a row badge says "Cut" but the only button is "Investigate", the buyer is confused. Each primary + actionability combination must have a consistent button set.
- **Unsafe-looking direct actions.** If any row offers "Apply" or "Push" without a confirmation step, the buyer will not click and will lose trust.
- **Inactive winners labelled "Refresh" with no campaign-status diagnosis.** Inactive Refresh rows must show "this creative is paused; relaunch decision waits on why it was paused" or similar context.
- **No visible recent-window evidence.** If a Cut row doesn't show recent ROAS / recent purchases, the buyer cannot verify the system's reasoning.
- **Confidence shown as raw integer.** "Confidence 76" reads like dashboard-speak; "high confidence" reads like an operator language.

---

## 17. What would make the panel product-ready

Not a checklist for v2 to pass alone - this is the bar for the page to ship to operators:

1. The 5-chip action ribbon renders with non-zero counts on a live cohort and the buyer can drill into each.
2. The active Creative table sorts by buyer-urgency (per section 15), not by raw spend alone.
3. Reason tags render as buyer-readable phrases (mapping table required).
4. Diagnose rows are out of the active table by default, in a separate cadence drawer.
5. Inactive rows are visually muted and collapsible.
6. No "Apply" / "Push" / "Auto-*" buttons exist in the v2 preview phase.
7. Every direct actionability is rendered as "ready for buyer confirmation" with a confirmation step.
8. queue/apply remain wired to false from the resolver path; the UI cannot bypass that.
9. A read-only feature flag gates the v2 surface; the existing v1 surface remains the default for production users.
10. A buyer can complete a normal review session (5-10 minutes) and feel they made progress on real decisions, not 108 review chips.

If those ten gates are met, the panel is ready for limited rollout to a small set of operators with explicit feedback collection. Even then, claim limited preview, not "product-ready".

---

## 18. Recommendation

**Proceed to read-only UI preview** with the constraints above.

Reasons:
- The v2 resolver is correct and conservative on a real cohort. Reviewer confirmation: PASS WITH MONITORING per the prior PR #78 buyer review.
- More resolver tuning would be premature; the current macro F1 of 97.96 with severe/high mismatches at 0 is well above the ChatGPT-listed acceptance gates, and the live-audit defect (Protect-despite-recent-severe-decay) is fixed.
- The remaining product risk is at the SURFACE, not in the resolver: the buyer experience of 108 review_only rows + 193 diagnose rows is not yet defined. Building the surface contract now is the right next step.
- A redesign of actionability semantics is not needed at this time; the current `direct / review_only / blocked / diagnose` axis is well-mapped to UI patterns.

Explicit next step: ship the operator-surface contract from Codex's parallel PR (read-only preview, no UI/API/queue/apply changes), validate it against this requirements document, then iterate.

Do not claim product-ready. Do not enable queue/apply. Do not auto-write to Meta. Keep v1 as the default for production users until a small operator panel reviews the read-only v2 preview and signs off.

---

## Confirmation

- I did not modify any product code.
- I did not modify any gold labels.
- I did not modify any resolver logic.
- I did not propose any unsafe queue/apply behavior. Every button proposal preserves the v2 preview's no-write contract.
- I did not inspect raw private data. Sanitized aliases only.
- This handoff lives at `docs/operator-policy/creative-segmentation-recovery/reports/v2-buyer-surface-requirements-2026-04-26/FOR_CHATGPT_REVIEW.md`.
- The branch is `review/creative-v2-buyer-surface-requirements-2026-04-26`.
- This PR will be Draft. I am not requesting merge.
- I am not making a product-ready / accepted / approved claim.
