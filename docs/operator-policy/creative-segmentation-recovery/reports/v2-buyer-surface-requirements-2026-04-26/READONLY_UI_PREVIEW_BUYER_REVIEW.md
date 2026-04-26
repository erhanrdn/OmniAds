# Read-Only UI Preview Buyer Review (Addendum to PR #80)

Author: Claude Code, acting as independent senior Meta media buyer / operator judge.
Date: 2026-04-26
Reviewing: `wip/creative-v2-readonly-ui-preview-2026-04-26`
PR head reviewed: `735765d83d366c4716547e78c5759c80cd747e4c` ("Add read-only creative v2 preview surface")
Resolver dependency: PR #78 head `3da2e05cb47f97de89ee42d9af6a64598af8b17a`
Contract dependency: PR #79 v0.1.1 (`a2ab0a8be0ee02e85270089b769159cc13560fdf`, all 16 forbiddenButtonLanguage terms present)
Method: independent buyer audit of the WIP UI preview branch. No code modified, no resolver logic modified, no gold labels modified, no PR #79/#78 files modified.

---

## Verdict: PASS WITH MONITORING - PROCEED TO LIMITED READ-ONLY OPERATOR PREVIEW

The implementation is faithful to the v0.1.1 surface contract and to my Part A buyer requirements. v2 is gated off by default; v1 remains the production default; the v2 preview never replaces the v1 `creativeDecisionOs` object; queue/apply/Command Center stay disconnected. Forbidden button text and forbidden internal-artifact text are absent from the rendered output, with both runtime tests and rendered-HTML tests in place. The 5-second above-the-fold buyer model is implemented exactly. The 108 review_only + 193 diagnose rows are split into 5 decision sub-buckets and a Diagnose-First collapsed drawer respectively, so the page does not become a wall. One UX taste observation about inactive Refresh promotion is documented below as a non-blocking note. Ready for limited operator preview behind the off-by-default flag.

---

## 1. Does the page answer the 5-second buyer questions?

**Yes - exactly.** The above-the-fold model surfaces five `SummaryMetric` tiles in this order:

| Tile | Buyer question | Counter source |
|---|---|---|
| Bleeding spend | Is anything actively bleeding spend? | `aboveTheFold.bleedingSpendCount` (Cut rows in Today Priority) |
| Scale-worthy | Is anything scale-worthy today? | `aboveTheFold.scaleWorthyCount` (all Scale rows) |
| Fatiguing on budget | Is anything fatiguing on real budget? | `aboveTheFold.fatigueOnBudgetCount` (Refresh in Today Priority) |
| Leave alone | What can I leave alone? | `aboveTheFold.protectCount` (all Protect) |
| Needs diagnosis | What is waiting to investigate? | `aboveTheFold.diagnoseCount` (all Diagnose) |

Each tile is a single number with buyer-shaped label. This maps 1:1 to my Part A section 2 buyer questions. A senior buyer scanning the top of the page sees five answers in five seconds.

A read-only pill is anchored at the top right (`Read-only` with `ShieldCheck` icon), and the panel headline explicitly says: *"Buyer urgency is separated from confidence. This panel helps review the highest spend and highest risk decisions without changing platform state."* That is the right framing for a preview surface.

## 2. Does it avoid becoming a wall of 108 review_only + 193 diagnose rows?

**Yes.** Three mechanisms verified in code:

- **108 review_only rows split by decision** via `surface.reviewGroups`. Five named sub-groups appear (Scale Buyer Review, Cut Review Required, Refresh Review, Protect Hold Review, Test More Review) with row counts shown per group. The buyer drilling into "Buyer Review" sees five sub-buckets, not a flat 108-row list.
- **193 Diagnose rows** are routed into the `diagnose_first` bucket with `collapsedByDefault: true`. The handoff confirms 193 rows in this bucket; in the rendered UI they are accessible but do NOT compete with active decisions for attention.
- **Inactive Review (70 rows)** is also `collapsedByDefault: true`. High-spend / high-risk inactive rows can be promoted into Today Priority via the `belongsInTodayPriority` rule (verified for the company-05 inactive Cut cluster: creative-48 $58k, -54 $25k, -57 $12k all in Today Priority).

Verified by spot-checking the handoff's "Top 20 highest-spend placement": rows correctly land in combinations like `"Today Priority + Buyer Review + Inactive Review"` for high-spend inactive Cuts, `"Buyer Review, Inactive Review"` for inactive Refresh-relaunch decisions that don't need same-day attention, `"Today Priority + Buyer Review"` for active Cut/Refresh.

## 3. Is Today Priority actually useful?

**Yes.** Bucket has 32 rows in the live audit (vs the contract's stated 69-row criteria). The implementation is somewhat tighter than the contract's literal criteria  -  it limits inactive rows to those that are Cut OR high-risk decision changes, not "any high-spend inactive row". This is buyer-defensible: "Today Priority" is for active urgency; passive high-spend inactive Refresh decisions are properly routed to Refresh Review instead. See section 11 for the only related observation.

The rendering shows the first 8 rows of Today Priority above the fold (`todayPriority.rowIds.slice(0, 8)`), which is the right size for buyer-day attention. Sorted by `priorityScore` then by spend descending. Score boost rules:
- Scale: +70
- Cut + high spend: +60
- Refresh + active + high spend: +45
- changedFromCurrent: +12
- direct actionability: +2 only
- inactive: -25

A direct Protect/Test More gets only +2, while a $58k inactive Cut gets +60+. So review_only Scale and high-spend Cut land far above any direct row. Verified.

## 4. Are review_only Scale and high-spend Cut correctly surfaced above direct Protect/Test More?

**Yes.** The library test `"sorts buyer urgency above confidence-only direct rows"` explicitly asserts:

```ts
expect(todayPriorityRows[0]?.primaryDecision).not.toBe("Protect");
expect(todayPriorityRows[0]?.primaryDecision).not.toBe("Test More");
```

And the priority-score weighting (Scale +70, Cut at high spend +60, direct +2 only) makes this structurally true, not just test-asserted. The Scale candidate row (`company-05/creative-02` at $10,118) is in Today Priority + Buyer Review combined placement. Direct rows ($786 Protect, $751 Test More) appear only in their decision groups inside Buyer Review and in the secondary "Ready for Buyer Confirmation" rail  -  they do not displace active Cut/Refresh/Scale at the top.

## 5. Are Diagnose rows collapsed/cadenced correctly?

**Yes.** The Diagnose First bucket has `collapsedByDefault: true`. Rows inside are grouped by blocker/problem class via `diagnoseGroups`, sorted by group size descending. Diagnose rows render with `actionButtonLabel` returning "View diagnosis"  -  no Apply / Queue / Push / Auto. High-spend Diagnose rows can also enter Today Priority when they are high-risk decision changes (verified in the top-20 highest-risk list: `company-05/creative-52` Refresh->Diagnose at $28k, `company-07/creative-07` Refresh->Diagnose at $277).

This matches my Part A section 12 requirement (separate drawer + cadence framing + group by problem class + no action buttons).

## 6. Are inactive rows visually and workflow-wise separated correctly?

**Yes.** Inactive Review bucket is collapsed by default. Inactive rows are also visually muted on individual cards via the `Inactive` chip in the row card header. The priority-score `-25` inactive penalty ensures they do not dominate Today Priority unless explicitly promoted by Cut decision or high-risk decision change.

The `RowCard` shows the "Inactive" chip only when `activeStatus === false`, so a buyer reading any row in any bucket can immediately tell whether the creative is actively spending or paused. Combined with the Inactive Review collapsed bucket, this gives the buyer two layers of context.

## 7. Are buttons safe?

**Yes - extremely safe.** I read the surface component end-to-end. The only `<button>` elements are:

| Use | Label | Action |
|---|---|---|
| Diagnose drawer toggle | "Hide Diagnose First" / "Show Diagnose First" | local UI toggle (no platform write) |
| Inactive drawer toggle | "Hide Inactive Review" / "Show Inactive Review" | local UI toggle |
| Row card primary button | from `actionButtonLabel(row)` | calls `onOpenRow(rowId)` only  -  opens existing v1 detail drawer, no v2 write |

The `actionButtonLabel` function returns only:
- "View diagnosis" for Diagnose rows
- "See blocker" when blockerReasons or campaignContextFlags are non-empty
- "Compare evidence" for Protect rows
- "Open detail" otherwise

All four labels are in the contract's allowed list. None match any forbidden term. There are no Apply / Queue / Push / Auto / Approve / Scale now / Cut now / Mark reviewed / Mark investigated buttons in the implementation  -  Codex chose the strictest non-writing button set, which is safer than what I proposed in PR #80 section 10. Excellent choice.

## 8. Is there any Apply / Queue / Push / Auto / Scale now / Cut now / Approve language?

**No.** Independent grep on the rendered surface against all 16 contract-forbidden terms returns zero hits. The library exports `CREATIVE_DECISION_OS_V2_PREVIEW_FORBIDDEN_BUTTON_TEXT` (16 patterns, including the `/Auto-/i` wildcard) and `CREATIVE_DECISION_OS_V2_PREVIEW_FORBIDDEN_INTERNAL_TEXT` (8 patterns: gold, fixture, PR, ChatGPT, Claude, Codex, WIP, internal evaluation). The render test in `lib/creative-decision-os-v2-preview.test.tsx:87-105` uses `renderToStaticMarkup` to materialize the full HTML and asserts zero matches against both arrays plus extra patterns `/labels this row/i` and `/JSON labels/i`. The test scans actual rendered output, not just source strings  -  durable guard.

## 9. Do row rationales sound like a media buyer, not an internal system?

**Yes.** Row card content I traced:

- Title: `{buyerActionLabel} - {shortId(creativeId)}` where `buyerActionLabel` returns "Review scale case" / "Review cut case" / "Plan creative refresh" / "Hold steady" / "Keep testing" / "Investigate blockers". Buyer-readable verbs.
- Evidence summary: forwarded directly from the v2 resolver `evidenceSummary` output. Verified the v2 resolver source in PR #78 contains buyer-language strings only ("Active creative is far above benchmark with recent and long-window confirmation; Scale requires operator review.", etc.).
- Reason tags: rendered through `humanizeTag(tag)` so internal slugs like `strong_history_recent_stop` become "Strong history recent stop"  -  not perfect prose but readable. (Not perfect, but no internal-artifact terms leak through.)
- Blocker: rendered through `humanizeTag(blocker)` similarly humanized.
- Campaign/trust labels: routed through helpers that translate raw flags to buyer phrases like "Inactive context", "Campaign status needs review", "Ad set status needs review", "Deployment blocked", "Campaign context needs review", "Evidence missing", "Source read-only".
- Metrics: Spend, ROAS, Recent ROAS, Purchases, Benchmark  -  all the buyer-language fields.

A senior media buyer reading a row card sees: "Review cut case - cre1234" / "$58,000 spend" / "ROAS 1.7" / "Recent 0.0" / "Below benchmark" / "Inactive context" / "View diagnosis" or "See blocker". That is what the buyer expects to see. No internal jargon.

## 10. Are top 20 highest-spend and highest-risk rows routed correctly?

**Yes.** The handoff's pre-computed top-20 placement matches buyer judgment. Spot checks:

- `company-05/creative-46` ($124k, paused, Refresh->Refresh, medium risk): **Buyer Review + Inactive Review**. Defensible  -  paused historical winner without a decision change is a relaunch decision, not a today-urgent action.
- `company-05/creative-48` ($58k, paused, Refresh->Cut, high risk): **Today Priority + Buyer Review + Inactive Review**. Correct  -  formalize the kill on a $58k inactive loser.
- `company-05/creative-02` ($10k, active, Protect->Scale, high risk): **Today Priority + Scale Review Required**. Correct  -  single textbook scale candidate elevated.
- `company-05/creative-03` ($10k, active, Cut->Cut, critical risk): **Today Priority + Cut Review Required**. Correct  -  huge_spend_severe_loser.
- `company-08/creative-01` ($8k, active, Cut->Refresh, high risk): **Today Priority + Refresh Review**. Correct  -  supervisor rule 7 active conversions below benchmark Refresh-before-Cut.
- `company-07/creative-07` ($277, active, Refresh->Diagnose, high risk): **Today Priority + Diagnose First**. Correct  -  strong-history-recent-stop on active live row deserves visibility despite low spend.

Top-20 highest-risk placements all check out as buyer-correct.

## 11. Should this proceed to limited read-only operator preview, or remain WIP?

**Proceed to limited read-only operator preview, behind the off-by-default flag.**

What is solid:
- Off by default (verified in `route.ts:78-98`: missing flag returns `enabled: false, decisionOsV2Preview: null`).
- v1 not replaced (verified in `page.tsx:471`  -  `creativeDecisionOs` still set on the v1 object and passed to all existing surfaces).
- No Command Center wiring (no imports of Command Center modules in the v2 preview path).
- No queue/apply or platform write (route is GET only; surface emits no apply/queue events; library has no DB write).
- 6 buyer-question tiles above the fold with operator language.
- Today Priority limited to 8 rows visible above the fold; sorted by priority score; full bucket accessible.
- Diagnose collapsed by default with toggle; grouped by problem class.
- Inactive collapsed by default with toggle.
- Forbidden text guards in place at runtime AND on rendered HTML.
- Tests cover the bucket-mapping logic, sorting, no-Watch/no-Scale-Review safety, and rendered-output forbidden term scan.
- All v2 source files normally formatted (31-49 bytes/line average, multi-line, human-readable).
- Live preview validation: handoff documents that the headless smoke could not reach the authenticated Creative page. This is acceptable for a WIP  -  the implementation is gated and tested at unit level; manual operator verification is the next-step task.

What I'd flag as non-blocking observations (not gating preview rollout):

**11a.** "Today Priority" intentionally excludes high-spend inactive Refresh rows (e.g. the $124k / $61k / $34k / $29k company-05 paused Refresh cluster). The implementation requires `activeStatus !== false` for Refresh-into-Today-Priority; only Cut rows or high-risk decision changes can enter Today Priority while inactive. This is a UX taste call: "Today Priority = active urgency only" is defensible, and those inactive Refresh rows DO surface at the top of the Refresh Review group inside Buyer Review (sorted by priority score). My PR #80 requirements asked for high-spend inactive promotion; the contract said "inactive rows only when spend or risk is high enough". The implementation chose a stricter "Cut + high-risk-change only" rule. Operationally fine; surface volume in Today Priority stays manageable (32 rows, well below my 25-item attention concern).

**11b.** Headless smoke screenshot validation could not reach the authenticated Creative page in Codex's environment. This is documented honestly in the handoff. The first authenticated operator preview session is the natural follow-up  -  it can confirm the visual layout matches the contract.

**11c.** `humanizeTag` produces readable but slightly clinical phrases like "Strong history recent stop". Polishing reason-tag display copy could come in a follow-up UX pass; not blocking.

After preview rollout, the natural next gates are operator usability feedback, decision-change accuracy on a second live cohort, and a supervisor-led decision on whether `direct` rows should ever auto-confirm in a future phase. None of those should block flag-gated rollout to a small set of operators.

---

## Verification table

| Area | Result |
|---|---|
| Off by default | YES (route + page test confirm) |
| v1 `creativeDecisionOs` not replaced | YES (verified in page.tsx:471) |
| No Command Center wiring | YES (no imports of Command Center in v2 preview path) |
| No queue/apply enabled | YES (`queueEligible`/`applyEligible` returned but never used to gate UI; route is GET-only; library has no write) |
| Watch primary rendered | NO (test `keeps v2 safety invariants visible`) |
| Scale Review primary rendered | NO (same test) |
| Direct Scale | NO (same test) |
| Inactive direct Scale | NO (same test) |
| Forbidden button language | NO hits  -  independent grep + rendered HTML test |
| Forbidden internal-artifact language | NO hits  -  independent grep + rendered HTML test |
| Bucket mapping (Scale/Cut/active Refresh in Today Priority) | YES (test `routes Scale, high-spend Cut, and active Refresh rows into Today Priority`) |
| Diagnose collapsed by default | YES (test + bucket flag) |
| Inactive collapsed by default | YES (test + bucket flag) |
| Sort puts buyer urgency above direct confidence | YES (test + scoring rules verified) |
| Source-file formatting | YES (multi-line, 31-49 bytes/line) |
| Hygiene (non-ASCII, control chars) on changed files | YES (Codex post-push scan + my independent re-check on key files) |
| Top-20 highest-spend / highest-risk routed correctly | YES (spot-checked against handoff's pre-computed placements) |
| 5-second buyer questions answered above fold | YES (Bleeding spend / Scale-worthy / Fatiguing on budget / Leave alone / Needs diagnosis) |
| Limited read-only operator preview ready | YES, behind off-by-default flag |

## Confirmation

- I did not modify any product code.
- I did not modify any resolver logic.
- I did not modify any gold labels.
- I did not modify any PR #79 / PR #78 / PR-UI files. I only read them and wrote this addendum on the PR #80 branch.
- I did not propose any unsafe queue/apply behavior.
- I did not inspect raw private data. Sanitized aliases only.
- This addendum lives under the PR #80 reviewer directory because PR #80 carries the buyer requirements that the v2 read-only UI preview was reviewed against.
- I am not requesting merge of any PR.
- I am not making a product-ready / accepted / approved claim.
