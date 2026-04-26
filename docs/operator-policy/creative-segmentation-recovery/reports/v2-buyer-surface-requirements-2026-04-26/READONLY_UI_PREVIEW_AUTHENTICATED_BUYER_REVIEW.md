# Read-Only UI Preview Authenticated Buyer Review (Addendum to PR #80)

Author: Claude Code, acting as independent senior Meta media buyer / operator judge.
Date: 2026-04-26
Reviewing: `wip/creative-v2-readonly-ui-preview-2026-04-26`
PR #81 head reviewed: `8d04d358a4e8f0695468052321e9835b7fc6130e` ("Document v2 preview GitHub hygiene status")
Substantive content commit: `289a9b048c238cdd39f2e11706209a530cdb131a` ("Tighten v2 preview contract validation")
Resolver dependency: PR #78 head `3da2e05cb47f97de89ee42d9af6a64598af8b17a`
Contract dependency: PR #79 v0.1.1 at commit `d0c326d3051510df74a7ef063bbd3e93d127a8f2`
Method: independent buyer audit of the updated PR #79 contract files and PR #81 UI preview branch. No code modified, no resolver logic modified, no gold labels modified, no PR #79 / PR #81 files modified.

---

## Verdict: PASS WITH MONITORING - PROCEED TO LIMITED READ-ONLY OPERATOR PREVIEW

The blocking parity issue ChatGPT flagged in PR #79 v0.1 (forbiddenButtonLanguage missing three terms) is now actually fixed: a fresh `surface-contract-v0.1.1.json` exists with `contractVersion: v0.1.1` and 16 forbidden terms, and the legacy `surface-contract-v0.1.json` content was synchronized to match. The PR #81 UI preview branch references the new v0.1.1 commit explicitly. The forbidden-term scan was strengthened with a parity test that fails if `Auto-*`, `Push live`, `Push to review queue`, `Apply`, `Queue`, `Scale now`, `Cut now`, `Approve`, or `Product-ready` are missing from the runtime regex set. A file-readability test was added that fails if any preview source/test/report file is compressed into suspiciously few lines. An authenticated preview validation was completed against a demo workspace and produced sanitized DOM assertions confirming the surface renders correctly with zero forbidden language, zero internal-artifact terms, and zero DB/Meta writes during detail-click. Ready for limited operator preview behind the off-by-default flag.

---

## 1. Did the authenticated UI preview answer the 5-second buyer questions?

**Yes.** The authenticated DOM assertion in `authenticated-preview-screen-notes.md` confirms:

- `[data-testid="creative-v2-preview-surface"]` count: **1** (the surface rendered)
- Today Priority visible
- Today Priority mentions Scale, Cut, and Refresh
- Diagnose section present and collapsed by default
- Inactive Review section present and collapsed by default
- 0 forbidden language visible
- 0 internal artifact terms visible
- 6 safe read-only action buttons visible
- 0 v2 detail/open interaction app writes

The 5-second tile model (Bleeding spend / Scale-worthy / Fatiguing on budget / Leave alone / Needs diagnosis) is structural in the surface component and was previously verified in my prior buyer review. The authenticated assertion confirms the structure renders end-to-end with v1 still visible.

## 2. Does Today Priority actually surface the right buyer work?

**Yes.** Authenticated assertion explicitly confirms Today Priority mentions Scale, Cut, AND Refresh. Combined with my prior code-level review (priorityScore weights: Scale +70 / Cut+spend +60 / Refresh+active+spend +45 / direct +2 only / inactive -25), the bucket-mapping test, and the sorting test, this is structurally and visually verified.

The library test `routes Scale, high-spend Cut, and active Refresh rows into Today Priority` is preserved and still asserts the correct routing. The fixture has 32 rows in the Today Priority bucket with the company-05 active Cut/Refresh + the textbook Scale + high-risk decision changes correctly placed.

## 3. Are review_only Scale and high-spend Cut surfaced above direct Protect/Test More?

**Yes  -  structurally and tested.** The library test `sorts buyer urgency above confidence-only direct rows` asserts:

```ts
expect(todayPriorityRows[0]?.primaryDecision).not.toBe("Protect");
expect(todayPriorityRows[0]?.primaryDecision).not.toBe("Test More");
```

The priority-score weighting makes this structural: a $10k Scale review_only gets +70, a $58k Cut review_only gets +60, a $786 direct Protect gets +2. The Scale row and high-spend Cut rows always sort above any direct row in Today Priority.

**One observation worth noting honestly:** the authenticated demo workspace's snapshot did not contain a `direct`-actionability row. Codex documented this transparently in the screen notes:

> "The authenticated demo snapshot did not contain a visible Ready for Buyer Confirmation row. Ordering of review-only Scale and high-spend Cut above direct Protect or Test More remains covered by the live-audit fixture bucket-mapping test."

So the visual proof of "review_only above direct" comes from the fixture test, not the live rendering. Acceptable for WIP  -  the underlying logic is asserted, just not visually demonstrated end-to-end on a workspace that happened to have no direct rows. A future authenticated session on a workspace with at least one direct row would close this gap.

## 4. Are Diagnose rows collapsed/cadenced correctly?

**Yes.** Authenticated DOM assertion: `diagnoseDetailsCount: 1, diagnoseOpenCount: 0`  -  the Diagnose section is present in the rendered DOM as a `<details>` element and starts in the closed state. Bucket flag `collapsedByDefault: true` is preserved from PR #79 v0.1.1. Diagnose rows are grouped by blocker/problem class via `diagnoseGroups`. The only buttons on Diagnose rows are "View diagnosis"  -  no Apply / Queue / Push.

## 5. Are inactive rows visually separated correctly?

**Yes.** Authenticated DOM assertion: `inactiveDetailsCount: 1, inactiveOpenCount: 0`  -  Inactive Review section is present and starts collapsed. Combined with the priority-score `-25` inactive penalty and the visual "Inactive" chip on individual cards (verified in my prior code review of `RowCard`), inactive rows are doubly separated from active urgency.

## 6. Are buttons safe?

**Yes.** Authenticated DOM assertion: `safeActionButtonsVisible: 6` and `forbiddenVisible: 0`. The 6 safe buttons match the contract's allowed list (Open detail / View diagnosis / See blocker / Compare evidence / drawer toggles). Independent grep on the surface source returned zero forbidden term hits.

## 7. Is there any Apply / Queue / Push / Auto / Scale now / Cut now / Approve language?

**No.** Verified at three layers:

- **Source layer**: independent grep on `CreativeDecisionOsV2PreviewSurface.tsx` returned 0 hits for all 16 forbidden patterns.
- **Runtime test layer**: `keeps required contract-forbidden terms in the rendered-output scan` test (newly added in commit `289a9b0`) explicitly verifies the forbidden regex set matches every required term: `Auto-*`, `Push live`, `Push to review queue`, `Apply`, `Queue`, `Scale now`, `Cut now`, `Approve`, `Product-ready`. I independently confirmed the test would pass  -  all 9 required terms are matched by the 16 regex patterns. The test fails if any term were ever removed from the regex set.
- **Rendered DOM layer**: authenticated assertion confirms `forbiddenVisible: 0` against the actual rendered page.

This is a stronger guard than what I asked for in PR #80 section 10.

## 8. Do row rationales sound like a media buyer, not an internal system?

**Yes.** Authenticated assertion confirms `internalVisible: 0` (zero internal-artifact terms in the rendered page). Combined with my prior surface-component review:

- Buyer action labels: "Review scale case", "Review cut case", "Plan creative refresh", "Hold steady", "Keep testing", "Investigate blockers"
- Above-the-fold tiles: "Bleeding spend", "Scale-worthy", "Fatiguing on budget", "Leave alone", "Needs diagnosis"
- Section copy: "Buyer urgency is separated from confidence. This panel helps review the highest spend and highest risk decisions without changing platform state."
- Reason tags humanized through `humanizeTag` (e.g. `strong_history_recent_stop` -> "Strong history recent stop")

Buyer-shaped throughout. No raw enum slugs, no contract version numbers, no commit hashes, no internal report references appear in the rendered output.

## 9. Are top 20 highest-spend and top 20 highest-risk rows routed correctly?

**Yes.** PR #81 handoff carries the same top-20 placement table I previously verified buyer-correct. Spot-check confirms the high-impact rows route as expected:

- `company-05/creative-02` ($10,118 active Protect->Scale): Today Priority + Buyer Review (Scale Review Required group)
- `company-05/creative-48` ($57,588 inactive Refresh->Cut): Today Priority + Buyer Review + Inactive Review
- `company-05/creative-03` ($10,022 active Cut->Cut huge_spend_severe_loser): Today Priority + Buyer Review
- `company-08/creative-01` ($8,295 active Cut->Refresh, supervisor rule 7): Today Priority + Buyer Review
- `company-05/creative-46` ($124,047 inactive Refresh->Refresh, no decision change): Buyer Review + Inactive Review (correctly NOT in Today Priority  -  defensible; the row is paused without a decision change)

The top-20 highest-risk decision changes (Refresh->Cut at $58k, Diagnose->Cut at $25k, Protect->Scale at $10k) are correctly in Today Priority. All defensible from a senior buyer perspective.

## 10. Is #81 ready for limited read-only operator preview, or still WIP?

**Ready for limited read-only operator preview behind the off-by-default flag.**

What is now solid:

- **PR #79 v0.1.1 contract parity is genuinely fixed.** New `surface-contract-v0.1.1.json` with 16-term forbiddenButtonLanguage; legacy v0.1 file synchronized to v0.1.1 content; both files independently verified to contain `Auto-*`, `Push live`, `Push to review queue`.
- **PR #81 references the v0.1.1 contract by commit hash** (`d0c326d3...`). No stale dependency.
- **Forbidden-term parity test added** (the test that ChatGPT specifically asked for in Part B section 2). Independent verification confirms the runtime regex set matches every required term.
- **File-readability test added.** All 5 source/test/route files are between 31 and 43 bytes/line, no compressed files.
- **Authenticated preview validation completed** with sanitized DOM assertions. Zero forbidden language rendered, zero internal-artifact terms rendered, zero DB/Meta writes on detail-click.
- **No screenshots committed**  -  Codex chose sanitized DOM assertions instead. This is the correct choice per the privacy constraints; raw browser screenshots of authenticated sessions risk exposing private workspace data.
- **GitHub hidden/bidi warning status documented honestly:** active blob scans found nothing; if conversation-level rendering still warns, it is historical/stale rendering, not a reproducible character in the active branch files.
- **Hygiene clean across all updated files.** I independently confirmed: 0 non-ASCII bytes, 0 control chars, 0 lines >200 chars across all 6 PR #79 + PR #81 updated files.

What I'd flag as honest gaps (not blocking preview rollout):

**10a. The authenticated session's `direct` rail was not visually demonstrated.** The demo workspace snapshot had no direct-actionability rows. The bucket-mapping and sort-order tests cover this code path, but a future authenticated session on a workspace with at least one direct row would close the visual loop. Not blocking  -  the underlying logic is asserted by tests, the structural rendering is verified, and the contract semantics ("direct is confidence, not urgency") are preserved across all layers.

**10b. The screen-notes report describes "A framework development diagnostic request was observed outside the detail-click interval and was not a product/API/DB/Meta write."** Codex was honest about this. It's a Next.js dev-server module-update probe, not a v2 write path. Acceptable; the v2 preview itself captured zero writes.

**10c. The legacy `surface-contract-v0.1.json` and the new `surface-contract-v0.1.1.json` are now byte-identical.** Codex chose to make both the source-of-truth-equivalent rather than mark one as superseded with a `supersededBy` pointer. Operationally fine for now since they agree; future contract updates should pick one canonical path. Not blocking.

After the read-only operator preview rolls out, the natural next gates remain:
- An operator usability session with at least one direct-rail row
- Accuracy validation on a second live cohort
- Supervisor decision on whether `direct` rows ever auto-confirm in a future phase

None of these block flag-gated rollout to a small set of operators.

---

## Verification table

| Area | Result |
|---|---|
| PR #79 v0.1.1 JSON forbiddenButtonLanguage actually contains Auto-* / Push live / Push to review queue | YES (independently verified  -  16 terms, all 3 parity terms present) |
| PR #79 v0.1.1 JSON / Markdown forbidden-list parity | YES |
| PR #79 v0.1 file content synchronized to v0.1.1 | YES (byte-identical to v0.1.1) |
| PR #81 references v0.1.1 contract by commit | YES (`d0c326d3...` cited in handoff) |
| PR #81 forbidden-term parity test added | YES (`keeps required contract-forbidden terms in the rendered-output scan`) |
| PR #81 file-readability test added | YES (`keeps new preview source, test, and report files readable`) |
| Authenticated preview rendered the v2 surface | YES (`previewCount: 1`) |
| v1 still visible in authenticated session | YES (`v1Visible: true`) |
| Today Priority renders with Scale + Cut + Refresh | YES |
| Diagnose collapsed by default | YES (`diagnoseOpenCount: 0`) |
| Inactive Review collapsed by default | YES (`inactiveOpenCount: 0`) |
| Forbidden language visible in rendered DOM | NO (`forbiddenVisible: 0`) |
| Internal artifact terms visible in rendered DOM | NO (`internalVisible: 0`) |
| Detail/open click writes to DB or Meta | NO (`writesDuringDetailClick: 0`) |
| File hygiene (non-ASCII, control chars, long lines) | clean across all 6 updated files |
| Source-file formatting (compressed/single-line) | NO compressed files |
| GitHub hidden/bidi active blob scan | clean per Codex; conversation warning documented as historical/stale |
| Limited read-only operator preview ready | YES, behind off-by-default flag |

## Confirmation

- I did not modify any product code.
- I did not modify any resolver logic.
- I did not modify any gold labels.
- I did not modify any PR #78 / PR #79 / PR #81 files. I only read them and wrote this addendum on the PR #80 branch.
- I did not propose any unsafe queue/apply behavior.
- I did not inspect raw private data. Sanitized aliases only.
- This addendum lives under the PR #80 reviewer directory because PR #80 carries the buyer requirements that PR #81 was reviewed against.
- I am not requesting merge of any PR.
- I am not making a product-ready / accepted / approved claim.
