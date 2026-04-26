# PR #79 v0.1 Surface Contract Buyer Review (Addendum to PR #80)

Author: Claude Code, acting as independent Meta media buyer / operator judge.
Date: 2026-04-26
Reviewing: `review/creative-v2-operator-surface-contract-2026-04-26`
PR #79 head reviewed: `61f8ba3eaef13edfd2498d361a45f43299479ec0` ("Record Creative v2 contract warning status")
Substantive content commit: `100c16ff12d72a743f8d81b9bbaf4ea15d225e48` ("Reflow Creative v2 surface contract")
Contract version: `surface-contract-v0.1.json`
Method: independent buyer audit of the revised contract files only. No code modified, no resolver logic modified, no gold labels modified, no PR #79 files modified.

---

## Verdict: PASS WITH ONE SMALL FIX BEFORE READ-ONLY UI PREVIEW

The v0.1 contract correctly separates buyer urgency from actionability, prevents the 108 review_only + 193 diagnose rows from becoming a flat wall, places review_only Scale and high-spend Cut above direct Protect/Test More in the Today Priority sort, collapses Diagnose by default with high-spend exceptions promoted, handles inactive rows with the same exception pattern, and pins the safety invariants (queue/apply disabled, no Command Center, no v1 replacement). One real consistency gap remains: the machine-readable `forbiddenButtonLanguage` array in `surface-contract-v0.1.json` does not include three terms that the markdown forbidden list correctly names. Fix this before any UI implementation begins. Otherwise the contract is ready for read-only UI preview implementation.

---

## 1. Did PR #79 v0.1 correctly separate buyer urgency from actionability?

**Yes.** The contract states explicitly: *"Direct is actionability confidence, not buyer urgency."* (`surface-contract-v0.1.json:coreCorrection.summary`). Three independent axes are present:

| Axis | Purpose | Buckets |
|---|---|---|
| Urgency | What buyer should see first | Today Priority, Inactive Review, secondary direct-confidence rail |
| Actionability | What system is safe to do | ready_for_buyer_confirmation, buyer_review, diagnose_first, blocked |
| Decision | Recommended buyer direction | scale_review_required, cut_review_required, refresh_review, protect_hold_review, test_more_review, diagnose_first |

The v0 -> v0.1 correction is recorded in the handoff at section "v0.1 Correction: Direct Is Not Urgency" with the exact reasoning: the two `direct` rows in the live audit are one Protect and one Test More, neither of which is more urgent than the review-only Scale candidate or the critical Cut rows. The correction is buyer-correct.

## 2. Does the contract prevent the 108 review_only + 193 diagnose rows from becoming a useless wall?

**Yes.** Three mechanisms work together:

- **108 review_only rows are split internally by decision:** Scale Review Required (1), Cut Review Required (15), Refresh Review (37), Protect Hold Review (16), Test More Review (39). A buyer drilling into "Buyer Review" sees five sub-buckets, not one flat list.
- **193 Diagnose rows are collapsed by default and grouped by blocker / problem class.** High-spend or high-risk Diagnose rows can be promoted into Today Priority, but the detail route remains Diagnose First. The Diagnose surface is a cadence backlog, not an alert wall.
- **Inactive Review (70 rows) is collapsed by default with high-spend / high-risk exceptions promoted.** This is exactly the right pattern for the company-05 paused cluster: those inactive rows with $124k / $61k / $58k spend are promoted to Today Priority but visually labeled as inactive context.

The handoff section "How v0.1 Prevents A Review Wall" articulates the same logic in prose. It matches my Part A requirements (PR #80 sections 6, 12, 13) faithfully.

## 3. Is the Today Priority / Buyer Command Strip model buyer-correct?

**Yes, with one volume note.** The criteria match my Part A requirements:

- All Scale rows including review-only Scale.
- High-spend Cut, including review-only Cut.
- Active Refresh / fatigue / recent collapse / below-benchmark conversion rows.
- Highest-risk current -> v2 decision changes.
- High-spend / high-risk inactive exceptions.

Live-audit count under this rule: **69 rows**. That is a reasonable buyer-day workload (vs the alternative of 303 raw rows or 110 review+direct rows).

Volume note (not a defect, just a UX implementation detail): 69 is at the upper edge of what a senior buyer can scan in one session. The `defaultAboveTheFoldModel` correctly puts the Today Priority count + top rows first, but the implementation will need to paginate or show a clear "top N visible / see all 69" pattern. This is a UI concern, not a contract concern.

## 4. Are review_only Scale and high-spend Cut correctly allowed to appear above direct Protect/Test More?

**Yes.** The `sortingRules.todayPriority` array specifies the order:

```
1. Scale rows
2. critical/high Cut rows by spend
3. high-spend active Refresh/fatigue rows
4. highest-risk current -> v2 changes
5. active recent-collapse rows
6. high-spend/high-risk inactive exceptions
7. direct-confidence Protect/Test More rows  <- last
```

Direct-confidence rows are explicitly placed at position 7, last in the list. This is the correct buyer model: a $58k Refresh-to-Cut decision is more urgent than a $786 stable Protect that happens to be `direct`.

The verification table in `top20HighestSpendPlacement` confirms this works in practice. The single Scale row (`company-05/creative-02` at $10,118) lands in "Today Priority + Scale Review Required". Critical Cut rows ($25k-$58k) land in "Today Priority + Cut Review Required". Direct rows are not in the top-20 highest-spend list (they are the $786 Protect and $751 Test More  -  way below the top 20 by spend).

## 5. Are Diagnose rows handled correctly as collapsed/cadence workflow?

**Yes.** The `urgencyBuckets[diagnose_first]` and `actionabilityBuckets[diagnose_first]` both specify:

- collapsed by default
- grouped by blocker / problem class
- high-spend / high-risk Diagnose rows promoted to Today Priority but their detail route remains Diagnose First
- no action buttons

This matches my Part A requirement (PR #80 section 12: "Cadence framing, not noise framing. Group by problem class. Diagnose row never has 'Apply' or 'Queue' button.").

The top-20 highest-risk list correctly shows that Diagnose rows can appear in Today Priority when they are high-spend ($28k, $61k from the company-05 paused cluster)  -  which is the right inactive-promotion behavior.

## 6. Are inactive rows handled correctly?

**Yes.** The `inactive_review` urgency bucket (70 rows) is collapsed by default. The `top20HighestSpendPlacement` shows that high-spend inactive rows get the combined placement label like `"Today Priority + Inactive Review + Refresh Review"`  -  meaning the row appears in the Today Priority surface but visually retains the Inactive Review context. That is the right buyer pattern for the company-05 paused cluster (large historical winners that were paused; buyer needs to see them at the top with paused context, not buried in a hidden inactive drawer).

The handoff section "Inactive Review" makes this explicit: the row must clearly explain whether the buyer problem is creative refresh, campaign/status diagnosis, confirmed loser review, or hold.

## 7. Is button language safe?

**Mostly yes, with one machine-readability gap.** The handoff markdown forbidden list correctly includes 16 terms:

```
Apply, Apply now, Auto apply, Auto-*, Queue, Queue now, Push live,
Push to review queue, Scale now, Cut now, Launch, Budget increase,
Approve, Accepted, Direct scale, Product-ready
```

The handoff also addresses ChatGPT's specific "Push to review queue" ruling in prose (handoff lines 468-471): *"'Push to review queue' should be avoided in the read-only preview phase unless a later implementation proves it is purely local, non-writing, and explicitly safe."*

**However, the machine-readable `surface-contract-v0.1.json[forbiddenButtonLanguage]` array is missing three of those terms:**

| Term | In markdown forbidden list | In JSON forbiddenButtonLanguage |
|---|---|---|
| Apply | yes | yes |
| Apply now | yes | yes |
| Auto apply | yes | yes |
| **Auto-*** | **yes** | **NO** |
| Queue | yes | yes |
| Queue now | yes | yes |
| **Push live** | **yes** | **NO** |
| **Push to review queue** | **yes** | **NO** |
| Scale now | yes | yes |
| Cut now | yes | yes |
| Launch | yes | yes |
| Budget increase | yes | yes |
| Approve | yes | yes |
| Accepted | yes | yes |
| Direct scale | yes | yes |
| Product-ready | yes | yes |

A future UI implementation that programmatically lints button strings against the JSON contract would NOT block "Push to review queue", "Push live", or "Auto-prefix" buttons because those terms are absent from the machine-readable list. This is the only real defect I find in v0.1.

## 8. Should "Push to review queue" be removed/avoided in the read-only preview phase?

**Yes.** ChatGPT's ruling is explicit and the markdown handoff carries it correctly. The fix needed is to add `"Push to review queue"`, `"Push live"`, and `"Auto-*"` to the JSON `forbiddenButtonLanguage` array so the contract is machine-enforceable. ChatGPT-listed allowed terms (Review, Open detail, Mark reviewed, Investigate, Mark investigated, See blocker) are all in the markdown allowed list and acceptable.

## 9. Is the contract ready for read-only UI preview implementation?

**Almost. One small fix first.**

What is in good shape:
- contractVersion field, sourceResolverPr provenance, sanitization booleans, behaviorChanged/uiIntegrated/apiIntegrated/queueApplyIntegrated all set to false.
- Three-axis bucket model is complete and internally consistent.
- Field-mapping contract covers all 10 v2 output fields with placement + behavior.
- Sorting rules are explicit per bucket.
- Filter rules cover the 13 important axes.
- Safety invariants are pinned (queue/apply disabled, no Command Center, no v1 replacement).
- Top-20 highest-spend and top-20 highest-risk placements are pre-computed and defensible against the live audit.
- File hygiene is clean: 0 non-ASCII bytes, 0 control chars, 0 lines over 160 chars across both files.
- JSON parses cleanly with `python3 -c "json.load(...)"`. 25 top-level keys, well-organized.
- Markdown is human-readable with normal line breaks and proper headings.

What needs the small fix before UI implementation:
- Add `"Auto-*"`, `"Push live"`, `"Push to review queue"` to `surface-contract-v0.1.json[forbiddenButtonLanguage]` to match the markdown forbidden list and ChatGPT's ruling.

After that single addition, the contract is ready for the read-only UI preview implementation phase under the explicit constraints already pinned in the contract: queue/apply disabled, no Command Center, no v1 replacement, no UI/API integration of the resolver into existing flows.

## 10. Any remaining buyer hesitation?

Three minor items, none blocking:

**10a. JSON <-> markdown forbidden-list parity (the actionable item).** As above, three terms missing from the JSON. This is a 30-second fix.

**10b. Today Priority count of 69 rows is at the upper edge.** A buyer's working memory holds about 20 prioritized items. The contract correctly puts them in priority order, but the UI implementation must paginate or show a "top 20 / see all 69" pattern, otherwise even Today Priority becomes scrollable noise. This is a UI implementation concern, not a contract gap.

**10c. The treatment of `direct` Protect / Test More in Today Priority.** The contract sorts them last (position 7) inside Today Priority. They could also be entirely OUTSIDE Today Priority and only in the "Ready for Buyer Confirmation" rail. Both are defensible. The current treatment is fine; just noting it as a UI taste call worth a one-line confirmation in the implementation pass.

## GitHub hidden / bidi warning status

I cannot independently re-fetch the GitHub PR HTML in this environment, but Codex's local + post-push verification reads cleanly:

- Active files in this branch are pure ASCII (independently confirmed: `high-bytes=0, ctrl=0, lines>160-chars=0` for both `FOR_CHATGPT_REVIEW.md` and `surface-contract-v0.1.json`).
- Codex documented in the handoff that the active GitHub raw blobs were re-inspected after push and showed no non-ASCII matches and no long lines.
- The handoff explicitly notes: if the PR conversation still shows a hidden/bidi warning, this is historical/stale rendering, not a reproducible character in the active branch files.

Acceptable. The active surface is clean. The historical conversation rendering is GitHub's UI, not a contract defect.

---

## Summary table

| Question | Answer |
|---|---|
| 1. Urgency separated from actionability? | YES |
| 2. Prevents flat review wall (108 + 193 rows)? | YES |
| 3. Today Priority model buyer-correct? | YES (volume of 69 needs UI pagination  -  implementation concern, not contract) |
| 4. review_only Scale / high-spend Cut above direct Protect/Test More? | YES  -  explicit in `sortingRules.todayPriority` |
| 5. Diagnose rows collapsed/cadence workflow? | YES |
| 6. Inactive rows handled correctly? | YES  -  high-spend exceptions promoted with inactive context preserved |
| 7. Button language safe? | MOSTLY  -  JSON forbidden list missing 3 terms |
| 8. Push to review queue removed/avoided? | In markdown YES; needs to be added to JSON forbidden list |
| 9. Ready for read-only UI preview implementation? | After the JSON forbidden-list fix, YES |
| 10. Remaining buyer hesitation? | One small fix + two non-blocking UI implementation notes |

## Recommended single fix before UI implementation begins

Codex should update `surface-contract-v0.1.json[forbiddenButtonLanguage]` to include the three missing terms, in this order to match the markdown source list:

```
"Auto-*",
"Push live",
"Push to review queue"
```

The JSON should then be validated to parse, and the contract version can stay at `v0.1` since this is a parity fix on an already-stated rule, or bump to `v0.1.1` if Codex prefers explicit minor versioning. Either is acceptable from a buyer perspective.

After that fix, no further contract work is required before the read-only UI preview implementation phase.

## Confirmation

- I did not modify any product code.
- I did not modify any resolver logic.
- I did not modify any gold labels.
- I did not modify any PR #79 files. I only read them and wrote this addendum on the PR #80 buyer-requirements branch.
- I did not propose any unsafe queue/apply behavior. The single recommended fix tightens, not loosens, the forbidden-button list.
- I did not inspect raw private data. Sanitized aliases only.
- This addendum lives under the PR #80 reviewer directory (`v2-buyer-surface-requirements-2026-04-26/`) since PR #80 carries my buyer requirements that the v0.1 contract was reviewed against.
- I am not requesting merge of any PR.
- I am not making a product-ready / accepted / approved claim.
