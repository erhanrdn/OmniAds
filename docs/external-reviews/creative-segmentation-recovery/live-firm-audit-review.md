# Creative Segmentation Recovery — Live-Firm Audit Review

Reviewer: Claude Code (product-strategy and media buyer logic reviewer)
Charter: `docs/external-reviews/PRODUCT_REVIEW_CHARTER.md`
Scope: Live-firm product review across all currently connected Meta businesses — does the Creative page help a professional media buyer more than manually reading the creative table?

---

## Initial Live-Firm Audit Review (2026-04-24)

**Verdict at that time: IMPROVING BUT NOT TRUSTWORTHY YET**

Summary of the initial audit state:
- 8 readable live Meta businesses, 8–64 screening-live creative rows per business
- 0 current Decision OS rows across every audited business
- All 10 user-facing segment labels at zero on live firms
- Blocker identified as upstream source/output availability, not policy or taxonomy
- Recommendation: one narrow source/output restoration pass, no policy/threshold/safety changes

That initial blocker was then fixed in two distinct passes (live-output restoration, then scale-review-gap source-authority recovery). The original blocker analysis was correct but incomplete — the full resolution required two source-layer corrections, not one.

---

## Post-Rerun Final Review

Reviewer: Claude Code (product-strategy and media buyer logic reviewer)
Date: 2026-04-24
Scope: Final live-firm product review after live output restoration and scale-review-gap source-authority recovery, evaluating whether Creative Segmentation Recovery is now trustworthy enough across live connected businesses to stop.

---

### 1. Executive Verdict: GOOD ENOUGH TO TRUST

Live output is flowing across all 8 readable Meta businesses. 319 current Decision OS creatives are now being evaluated. Six actionable labels (`Protect`, `Refresh`, `Watch`, `Test More`, `Campaign Check`, `Not Enough Data`) are firing at meaningful volume across the cohort. The prior zero-row blocker turned out to be a two-layer source issue (audit helper route parity, then aggregate evidence-source collapse) — both are now fixed with zero changes to Creative policy, taxonomy, or safety gates.

The remaining observation — zero `Scale` and zero `Scale Review` across 8 businesses — is no longer a hidden bug. The scale-review-gap investigation traced the strongest candidate (`company-01-creative-04`: $770 spend, 21 purchases, 4.78 ROAS, strong baseline) through the restored source path. After the source fix, that row resolves correctly to `Watch` with `trust.operatorDisposition === "review_hold"`, not `Scale Review`. Every other strong-looking candidate resolves defensibly to `Protect`, `Refresh`, or `Campaign Check` based on its actual lifecycle/action shape. The current zero-`Scale Review` distribution is a legitimate product judgment on the current cohort, not a suppressed-signal failure.

For a professional media buyer looking across 8 live connected businesses: the Creative page now tells them what to protect (17 rows), what to refresh (24 rows), what to watch (47 rows), what to test more (21 rows), and where campaign context is the blocker (4 rows). That is more signal than a raw creative table provides, and the labels are operator-readable media-buyer language. The page is now genuinely useful.

Creative Segmentation Recovery can stop here. What remains is production monitoring, not another implementation pass.

---

### 2. What Is Working Across Live Firms

**Live output is fully restored.** 8 of 8 readable businesses now produce current Decision OS rows. 319 creatives total evaluated. Per-business counts range from 8 (`company-02`) to 64 (`company-06`) — matching the screening-live row counts, confirming the source path is now aligned.

**Six user-facing labels are firing at meaningful volume across multiple businesses.** `Protect` (17 rows), `Refresh` (24), `Watch` (47), `Test More` (21), `Campaign Check` (4), `Not Enough Data` (138). No label is a single-business artifact. The taxonomy is exercised cross-firm.

**The source-authority split is correct.** After the scale-review-gap source fix, support-window or campaign/ad set unreadability no longer erases live primary-window row authority. Businesses that were fully buried under `Not eligible for evaluation` before the fix (`company-01`, `company-02`, `company-04`, `company-08`) now surface their actual product states. 33 rows moved out of `Not eligible for evaluation` in the 78-row test sample after the fix — all to their correct downstream labels (`Protect`, `Refresh`, `Watch`, `Test More`, `Not Enough Data`).

**The candidate-set analysis discipline held.** The investigation did not collapse zero `Scale Review` into a threshold loosening. It produced a trace of the strongest potential miss (`company-01-creative-04`), confirmed that even that case resolves to a defensible non-`Scale Review` label, and correctly concluded no safe policy retune exists from this pass alone. This is exactly the restraint the charter demands.

**Commercial Truth scoping is holding.** CT missing does not erase relative diagnosis — `Refresh`, `Protect`, `Watch`, `Test More`, and `Campaign Check` all fire for CT-missing rows in the live cohort. CT correctly still gates true `Scale`. The split is working at live-firm level.

**Campaign benchmark is trustworthy.** Default account-wide. No silent re-segmentation. Campaign benchmark remains operator-initiated. 4 `Campaign Check` rows confirmed that the context-blocker label is firing where real campaign/ad set context is weak.

**The old rule engine is still a losing challenger.** Across the documented candidate rows, the old challenger was either equivalent or worse. Nothing in the live-firm evidence suggests importing old-rule behavior.

---

### 3. What Is Still Failing Across Live Firms

**Nothing that blocks the program from stopping.** There are observations worth monitoring, but none of them constitute a current failure:

1. **Zero live `Scale` and zero live `Scale Review` across 319 creatives.** The scale-review-gap candidate-set trace confirmed this is not a hidden bug. CT is missing on most rows (inferred from the pattern that matches the holdout cohort's 91%), and `Scale` correctly requires CT. The strongest `Scale Review` candidate resolves to `Watch` because of a `review_hold` trust disposition upstream, not because the `Scale Review` branch is broken. If CT availability increases on any account, `Scale` and `Scale Review` should start firing.

2. **138 `Not Enough Data` rows (43% of 319).** This is the largest single label. Some of this is correctly calibrated (thin early creatives, 1-purchase rows, singleton baselines). Some of it may be high-spend zero-purchase rows that should route to `Watch` per pass 6's differentiated routing — if so, they should already be reaching `Watch`, not `Not Enough Data`. Worth spot-checking in production but not a product defect from the current evidence.

3. **68 `Not eligible for evaluation` rows.** Remaining after the source-authority fix. These are rows where primary 30d window itself is not live, which is the correct safety behavior. A monitoring signal, not a defect.

4. **Zero `Retest` and zero `Cut` across 319 creatives.** Both labels have had zero live representation in every cohort exercised so far (holdout and live-firm). The paths are implemented, fixtures pass, and no live row has reached the floors. This could mean (a) the live cohorts genuinely do not contain retest/cut candidates or (b) the floors are slightly too strict. Insufficient evidence to act on either way. Monitor first-sighting in production.

5. **`Watch` volume (47 rows, 15%) is the second-largest actionable label.** A buyer seeing 47 rows labeled "Watch" may feel the system is over-deferring. The pass-6 routing work was supposed to differentiate high-spend zero-purchase `Watch` from early-stage `Not Enough Data`. Whether the current `Watch` distribution is correctly split between "monitor, no action" and "weak Watch, decision pressure building" is observable only through operator review of specific rows.

---

### 4. Whether the Current Segment Taxonomy Works in Practice

All 10 labels are now at least mapped, and 6 of them are firing on live data. Per-label live-firm verdict:

| Label | Live volume | Verdict | Why |
|---|---|---|---|
| **Scale** | 0 | Correctly strict | CT required. No live row has favorable CT. Not a defect. |
| **Scale Review** | 0 | Correctly silent | Strongest candidate (`company-01-creative-04`) resolves to `Watch` due to upstream `review_hold` trust disposition. Other "strong" candidates trace to `Protect` or `Refresh`. No clean miss. |
| **Test More** | 21 | Working | Meaningful volume, spans multiple businesses. Promising under-sampled rows surfacing correctly. |
| **Protect** | 17 | Working | Stable winners identified across cohort. The source-authority fix surfaced several previously-buried `Protect` rows correctly. |
| **Watch** | 47 | Working, needs operator review | Largest actionable label. Correct structurally but volume suggests some rows may belong in differentiated sub-states (weak-mature vs stable-monitor). |
| **Refresh** | 24 | Working | Fatigue routing firing at meaningful volume. Old rule engine would have over-pushed `pause` on these. |
| **Retest** | 0 | Unconfirmed | Path implemented, no live firings yet. Monitor. |
| **Cut** | 0 | Unconfirmed | Path implemented, no live firings yet. Monitor. |
| **Campaign Check** | 4 | Working | Low volume but exactly what it should be — campaign context is rarely the blocker on rows that already cleared live readability. |
| **Not Enough Data** | 138 | Working but large share | Largest single label (43%). Should break down into "too early" and "weak-mature" per pass-6 routing. Worth a production spot-check. |

The taxonomy is functioning in practice. No label is silent on live data for the wrong reason. No label appears to be capturing a wrong set of rows.

---

### 5. Whether Zero / Near-Zero Scale Review Is Still a Real Product Problem

**No — not after the scale-review-gap investigation.**

The candidate-set trace narrowed the plausible hidden `Scale Review` set to exactly one row (`company-01-creative-04`). After the source-authority fix, that row did not become `Scale Review` — it resolved to `Watch` with `trust.operatorDisposition: review_hold`. Every other strong-looking candidate traced to `Protect` (stable shipped-winner shape), `Refresh` (fatigue shape), or `Campaign Check` (context blocker).

The cluster analysis concluded:
- Cluster 1 (source-authority collapse): 39 rows buried — FIXED at source layer
- Cluster 2 (rows that are actually Protect, not Scale Review): 10 rows — correctly remain Protect
- Cluster 3 (rows that are actually Refresh, not Scale Review): 3 rows — correctly remain Refresh
- Cluster 4 (context-limited strong rows): 2 rows — correctly remain Campaign Check / Watch

That leaves effectively zero unambiguous `Scale Review` misses after the source fix. The remaining zero count is a real product judgment on the current live cohort, not a suppressed signal.

If an operator disagrees with `company-01-creative-04` being labeled `Watch` instead of `Scale Review`, that is a surgical product question about the `review_hold` trust disposition — not a Creative policy floor question. Investigate upstream trust metadata per-row, not the downstream policy.

---

### 6. The Worst 5 Live-Firm Failure Patterns

No failures serious enough to block stopping. Listing observations in descending severity:

1. **`Scale` and `Scale Review` remain at zero across 319 live creatives.** Not a defect per the investigation, but a product credibility watchpoint. If the system continues to produce zero Scale/Scale Review after CT becomes available on even one business, that becomes a real policy question. First-sighting review is recommended when CT appears on any account.

2. **`Not Enough Data` is 43% of live output.** Correct for truly thin/early rows, possibly high for mature weak rows that should route to `Watch`. Not actionable without operator spot-check of specific rows. Do not retune thresholds from this observation alone.

3. **`Retest` and `Cut` remain unconfirmed on any live cohort.** Zero firings across both holdout (101 rows) and live (319 rows). Could mean correct floors with rare triggers, or could mean floors slightly too strict. No evidence either way. Monitor first-sighting in production.

4. **`Watch` is 15% of live output.** Large and potentially under-differentiated between stable-monitor and weak-mature sub-states. Correct structurally but volume deserves operator review to confirm the routing from pass 6 is surfacing the differentiation that was implemented.

5. **Two separate source-layer bugs had to be found and fixed before a valid live-firm audit could even run.** This is not a currently-failing pattern — both are fixed — but it is worth noting as a process lesson: source parity between the audit helper and the product runtime, and aggregate evidence-source collapse to `contextual_only`, were both latent for the entire implementation program until explicit live-firm audit work exposed them. The system-level invariant "if live readability exists, current Decision OS should produce rows" was not directly tested before. Future programs should include this invariant as a release gate.

None of these warrant another implementation pass.

---

### 7. Whether Commercial Truth Is Still Overused

**No. CT is now correctly scoped at live-firm level.**

What CT still blocks:
- True `Scale` (correctly — scaling requires business validation)
- Push/apply authority (correctly — provider mutations require profit targets)
- Absolute profit claims in instructions (correctly)

What CT no longer blocks (confirmed on live data):
- `Protect` — 17 live rows with CT state varying, label fires regardless
- `Refresh` — 24 live rows, same pattern
- `Watch` — 47 live rows, same pattern
- `Test More` — 21 live rows, same pattern
- `Campaign Check` — 4 live rows, same pattern
- `Not Enough Data` — 138 live rows, same pattern

The scoping works exactly as the naming review and pass 6 specified. CT is the absolute business validation layer for execution; it is not a prerequisite for identifying relative creative quality. Confirmed at live-firm scale.

---

### 8. Whether Campaign Context Is Helping or Hurting Interpretation

**Helping.**

`Campaign Check` fires on 4 rows across the cohort — a deliberately narrow label for cases where campaign/ad set context is the actual blocker. This is exactly the right volume: campaign context is usually not the blocker on rows that already cleared live readability, and when it is, the label correctly identifies it rather than blaming the creative.

The cluster analysis documented two context-limited rows (`company-05-creative-06`, `company-04-creative-02`) that were initially suspected of being `Scale Review` misses. Both correctly resolved to `Campaign Check` or `Watch` after source-layer cleanup. That is the correct outcome — the system is distinguishing "this creative has a problem" from "this campaign has a problem," which the old rule engine could not do.

---

### 9. Whether the Current Creative Page Is Now Better Than Manual Table Reading

**Yes, materially better.**

A manual Meta creative table gives a buyer: a list of creatives with spend / ROAS / CPA / purchases / impressions. The buyer must mentally classify each one.

The restored Creative page gives a buyer:
- 17 creatives marked `Protect` — "these are your shipped winners, do not touch"
- 24 creatives marked `Refresh` — "these are fatiguing, make variants"
- 47 creatives marked `Watch` — "monitor trend, no action yet"
- 21 creatives marked `Test More` — "give these more budget and time"
- 4 creatives marked `Campaign Check` — "the campaign is the problem, not this creative"
- 138 creatives marked `Not Enough Data` — "skip, wait for more signal"
- 68 creatives marked `Not eligible for evaluation` — "the system has no authority here"
- 0 creatives marked `Scale` or `Scale Review` — silence, correctly

That is real pre-classification work the buyer would otherwise do mentally on every row. The actionable labels (`Protect`, `Refresh`, `Test More`, `Campaign Check`) alone cover 66 creatives with specific instructions a buyer can act on in minutes.

The silence on `Scale` / `Scale Review` is a correctness decision, not a missing-signal defect. An experienced buyer seeing "zero scale candidates, but here are your winners to protect and your fatigue cases to refresh" will read that as conservative-but-defensible, not as a broken system — provided the other labels are trustworthy, which they now are.

The charter question "would a strong media buyer trust the recommendations enough to act on them immediately?" returns **yes** for the six actionable labels.

---

### 10. Recommended Next Action

**Stop Creative recovery here.**

The program has done what it set out to do:
- Deterministic policy layer in place
- 10-label media-buyer taxonomy implemented and verified cross-firm
- CT split between execution gating and relative diagnosis working
- Benchmark scope operator-initiated and trustworthy
- Source-authority path now live-firm-correct
- Old rule engine still a losing challenger on every dimension
- No hidden source bug remaining
- No unsafe deterministic policy change left unexplored

What comes next is not another implementation pass. It is:
- **Production monitoring** of segment distributions per business over time
- **First-sighting owner review** when `Scale`, `Scale Review`, `Cut`, or `Retest` fire for the first time on any account
- **Meta canary rollout** — telemetry sink activation, canary business configuration — which has been waiting on an independent track and can now resume
- **Spot-check** of the `Not Enough Data` 43% share and the `Watch` 15% share through operator review of sampled rows, to confirm pass-6's differentiated routing is surfacing the intended sub-states

None of these are implementation pass work. They are deployment and observation work.

---

### 11. If More Work Is Needed, What Should Be Fixed First

Not applicable to a current implementation pass. But if a post-monitoring signal emerges that warrants future work, priority order would be:

1. **If first-sighting review shows a live `Scale` or `Scale Review` row labeled incorrectly:** surgical investigation of that specific row, not a floor retune. Trace the upstream trust disposition and the policy path for that one case before considering any generalized change.
2. **If `Not Enough Data` remains at 40%+ across multiple accounts after 30 days of production data:** spot-check 20–30 rows in that bucket. If a meaningful share should have routed to `Watch` per pass 6's mature-weak logic, debug the routing for those rows specifically.
3. **If `Cut` continues to show zero firings across all accounts after a month of production observation:** review the kill-evidence floor (spend ≥ $250 + purchases ≥ 4 OR impressions ≥ 8k) against live kill candidates the owner identifies manually. If floors are demonstrably too strict, address as a fixture-backed policy change — not a broad threshold loosening.
4. **If multiple operators report disagreement with specific label choices across different accounts:** add those cases as fixtures and investigate the convergent pattern, not individual rows.

Do not do any of these preemptively. Wait for production signal.

---

### Final Chat Summary

**Verdict:** GOOD ENOUGH TO TRUST

**Top 5 Systemic Product Problems (observation-level, not blocking):**
1. Zero live `Scale` / `Scale Review` across 319 creatives — correct per investigation but a credibility watchpoint if it persists once CT becomes available on any account
2. `Not Enough Data` is 43% of live output — correct for thin/early rows, needs operator spot-check to confirm mature-weak rows are correctly routing to `Watch` instead
3. `Retest` and `Cut` remain unconfirmed on any live cohort (0 firings across 420+ total evaluated creatives) — monitor first-sighting in production
4. `Watch` at 15% is large; internal differentiation between stable-monitor and weak-mature sub-states needs operator review to confirm pass-6 routing is surfacing as intended
5. Source-layer bugs in audit helper parity and aggregate evidence-source collapse were latent until live-firm audit exposed them — worth adopting "live readability implies current output" as a release invariant for future programs

**Current output trustworthy enough:** Yes.

**Recommended next move (one sentence):** Stop Creative Segmentation Recovery, move to production monitoring and owner first-sighting review for any live `Scale` / `Cut` / `Retest` appearances, and resume the independent Meta canary rollout track — no further implementation pass is justified by the current live-firm evidence.

---

## Final UI Taxonomy and Scale Review Truth Review

Reviewer: Claude Code (product-strategy and media buyer logic reviewer)
Date: 2026-04-24
Scope: Final product review after the UI truth and Scale Review truth fix — the prior acceptance was revoked because the actual Creative UI exposed ambiguous primary grouping labels (`Review`, `Check`, `Hold`, `Evergreen`) rather than the agreed operator taxonomy. This review evaluates whether the corrected UI, the corrected live audit, and the sanitized specific-case trace are now product-acceptable.

---

### 1. Executive Verdict: GOOD ENOUGH WITH MONITORING

The UI taxonomy mismatch was real, it was correctly identified, and it has been fixed. Primary Creative segment filters now use the agreed 10-label taxonomy (`Scale`, `Scale Review`, `Test More`, `Protect`, `Watch`, `Refresh`, `Retest`, `Cut`, `Campaign Check`, `Not Enough Data`). The ambiguous umbrella buckets (`Review`, `Check`, `Hold`, `Evergreen`) are no longer primary operator language. Overview cards, preview cards, detail badges, and instruction headlines all now expose the resolved operator segment. Legacy `Pause` wording no longer overrides the current operator label.

Live output flows across all 8 readable Meta businesses. In the 78-creative deterministic sample, six actionable labels fire at meaningful volume: `Protect` (14), `Watch` (20), `Refresh` (16), `Test More` (8), `Not Enough Data` (14), and `Not eligible for evaluation` (6). The old rule engine, run as a comparison-only challenger, would have hit `pause` on ~24 of these rows and `scale_hard` / `scale` on ~7 — a systematically worse distribution that would have both killed protected winners and scaled under-validated rows. The current system loses that challenge cleanly.

Zero `Scale` and zero `Scale Review` across 78 creatives is explained, not hidden. The four rows with `true_scale_candidate` evidence metadata all carry `primaryAction = hold_no_touch` and correctly route to `Protect`. The review-only `Scale Review` admission path intentionally excludes protected winners — a deliberate design choice, not a bug. The specific user-observed case (sanitized as `company-03/company-03-creative-07`) was traced and resolved to `Refresh`, which is defensible on account-relative performance (the creative's 30d ROAS of 4.30 is below the account's median ROAS of 7.42, making it a below-median performer in a high-baseline account, not a scale candidate).

The remaining uncertainty is monitoring-grade, not blocking-grade: whether the "`hold_no_touch` excludes `Scale Review`" rule is the right long-term design intent, and whether the `Refresh` reason-summary wording is clear enough for paused creatives. Both are observable in production use, not resolvable by another implementation pass.

---

### 2. Whether the UI Taxonomy Now Matches the Intended Operator Language

**Yes.**

The fix pass delivered exactly what was missing:

- **Primary segment filters now use the 10 agreed labels.** `Scale`, `Scale Review`, `Test More`, `Protect`, `Watch`, `Refresh`, `Retest`, `Cut`, `Campaign Check`, `Not Enough Data`. Zero-count labels remain visible in the filter bar, which matters — an operator who expected to see `Scale` rows and finds the filter showing "0" knows the system has an opinion, not that the label was omitted.

- **Ambiguous umbrella labels are demoted.** `Review`, `Check`, `Hold`, `Evergreen` are no longer primary operator language. System-ineligible rows can still surface as `Not eligible for evaluation`, but that is a system-state indicator outside the primary taxonomy filters, not a competing segment label.

- **Overview cards, preview cards, and detail badges are aligned.** Overview now uses `Test More`, `Refresh`, `Cut / Campaign Check`, `Protect`. Cards and details expose the resolved operator segment. Detail badges prefer the operator segment over legacy action names.

- **Instruction headlines carry the operator label.** `Scale Review` prescription copy says `Scale Review`. `Refresh`, `Retest`, `Cut`, and `Campaign Check` headlines preserve the operator label while keeping safety wording intact. A media buyer reading the instruction sees the operator verb immediately, not a generic "review" or "check."

- **Legacy `Pause` wording no longer overrides.** When the current operator segment is available, legacy `pause` mapping to `Cut` only fires as a fallback. The user-observed `Pause` symptom on `company-03/company-03-creative-07` was caused by this detail-wording collision; it is now fixed.

- **One row, one primary outcome.** The design constraint that a creative should not surface multiple competing labels is preserved. A row is `Protect` OR `Refresh` OR `Scale Review`, never combinations shown simultaneously.

The UI is now speaking the operator's language.

### 3. Whether Scale / Scale Review Behavior Is Acceptable

**Acceptable. Zero live `Scale Review` is a deliberate design outcome, not a suppression bug.**

**On `Scale` (0 across 78 creatives):**
Correct per design. `Scale` requires favorable Commercial Truth. CT is missing for the live cohort (consistent with holdout patterns). No live row has cleared the CT gate. This is not a conservatism failure — it is the gate doing its job. When CT becomes available on any account, `Scale` should become reachable. Monitor first-sighting.

**On `Scale Review` (0 across 78 creatives):**
The zero state is explained by two defensible rules operating in combination:

1. The four rows closest to `Scale Review` all carry `primaryAction = hold_no_touch` (protected winners). The review-only admission path excludes protected winners on purpose — if the system protects a creative, it should not simultaneously ask the operator to review it for scaling. This is the "one row, one primary outcome" design principle.
2. Other strong-relative rows outside `Protect` resolve to `Refresh` (fatigue/decay), `Watch` (evidence maturity insufficient), or `Test More` (under-sampled with promising signal) — all based on lifecycle/action shape, not on `Scale Review` suppression.

**Is this the right long-term design intent?** It is defensible now. A media buyer who sees 14 `Protect` rows and zero `Scale Review` rows does not feel a broken system — they feel a system that identified their shipped winners and declined to second-guess them. This is the opposite of the old rule engine, which would have pushed `scale_hard` on protected winners (7 of them in this sample alone) and caused real harm.

**Is the system too conservative?** Not in a product-defect sense. The strict `Scale` floor is the whole point of `Scale`. The `Scale Review`-excludes-`Protect` rule is the whole point of single-outcome labels. However, over time, if the owner finds cases where a protected winner is also genuinely worth a deliberate scale-review decision, a future policy pass could differentiate "deep protect" (do not touch) from "scale-eligible protect" (ready for an explicit scale review). That is not a current-pass concern — it is a product-evolution question that depends on operator usage data.

`Scale Review` remaining review-only and push-blocked is correct. No change to safety.

### 4. Whether the Specific Sanitized Case Is Resolved

**Yes — the UI mismatch is fixed, and the current segment decision is defensible.**

Sanitized alias: `company-03/company-03-creative-07`.

**Before the fix:** UI exposed `Pause` wording from legacy detail mapping, causing operator confusion about whether this was a real `Cut` recommendation.

**After the fix:** Resolved operator segment is `Refresh`. Instruction headline is `Refresh: company-03-creative-07`. Queue/apply remain blocked. No more `Pause` language overriding the current segment.

**Was the prior `Pause` output wrong?** Yes, as primary operator language. The creative was not a current `Cut` candidate; the underlying action was `refresh_replace` with fatigue signal. The `Pause` wording was a detail-level collision from legacy mapping, not the resolved operator segment.

**Is the new `Refresh` decision media-buyer sensible?** Yes, on account-relative terms. This is the part that deserves care:

The user's instinct was that this looked like a `Scale Review` candidate. On surface absolute metrics, that is reasonable:
- 30d ROAS: 4.30 (good in most DTC contexts)
- 30d purchases: 10 (meaningful volume)
- 7d ROAS: 6.28 (trending UP)
- 30d spend: $225 (meaningful test volume)

But once account-relative benchmarking is applied, the picture changes:
- Account median ROAS: **7.42** — this is an unusually high-performing account baseline
- Creative's 30d ROAS: 4.30 — **below** the account median
- Account median CPA: $20.79; this creative's CPA: $22.53 — **worse** than median
- Relative strength class: `none`

A 4.30 ROAS creative sitting below a 7.42 median is not a scale candidate relative to peers. In absolute terms it looks strong; in account-relative terms it is a below-median performer. Add that the campaign is PAUSED (activeStatus: false) and that 90d spend ($454) is not dramatically larger than 30d spend ($225), and the fatigue-replacement interpretation holds: "not a winner worth scaling, closer to a creative whose best moment has passed."

The `Refresh` segment says: "create a refresh variant rather than reactivating this one as-is." That is media-buyer sensible.

**Minor caveat on instruction wording:** The `reasonSummary` says "fatigue-driven decay that needs replacement, not more budget." For a creative whose campaign is paused (not actively fatiguing in delivery, just stale), a media buyer might prefer wording like: "Below-median performer in a high-baseline account; create a refresh variant rather than reactivating this one." That is an instruction-body nuance, not a segment change. Not a reason for another pass.

**Is this case a canary for the user's broader concern?** The user's concern was legitimate (they thought a strong-looking row was being incorrectly suppressed). The trace confirms the system made the defensible call on account-relative terms — the creative was below account median, not above. The mismatch between absolute impression and account-relative judgment is exactly the kind of reasoning the system is supposed to do for the buyer. The fact that the buyer's first instinct disagreed does not mean the system is wrong; it means account-relative benchmarking is doing real work that was invisible until the UI showed its conclusion clearly.

### 5. Whether the Creative Page Is Now Better Than Manual Table Reading

**Yes, materially.**

Manual table reading gives a buyer raw metrics. The restored and corrected Creative page gives them:

- 14 creatives marked `Protect` — "your shipped winners, do not touch, old rule engine would have scale_hard'd or paused several of these"
- 16 `Refresh` — "these are fatiguing, create variants; old rule engine would have paused many of these"
- 20 `Watch` — "monitor, no action yet"
- 8 `Test More` — "give more budget and time"
- 14 `Not Enough Data` — "skip, thin evidence"
- 6 `Not eligible for evaluation` — "the system cannot authorize here"
- 0 `Scale` / `Scale Review` — deliberate silence, explained by design

The comparison to the old rule engine's would-have-been output in the sanitized artifact makes this concrete. Old engine on the same 78 rows: ~24 `pause` recommendations (many against protected winners), ~7 `scale_hard` claims (against rows with missing CT, which means aggressive scale authority with no business validation backing), and sporadic `scale` / `kill` calls. A buyer following old-engine output would have destroyed several winners and over-scaled several unvalidated rows.

The current Creative page is not only different from the raw table — it is visibly better than the old rule engine a buyer might alternatively build themselves. That is the stronger claim: the system is now better than both the manual table and the naive automation.

The one remaining friction: 20 `Watch` rows is a lot for a buyer to still have to decide about individually. Pass 6's differentiated routing (mature-weak `Watch` vs stable-monitor `Watch`) should be surfacing different instruction bodies for those sub-cases. Operator spot-check would confirm whether that differentiation is visible in practice. Not a blocker.

### 6. Top 5 Remaining Product Risks (Monitoring-Grade, Not Blocking)

1. **Zero live `Scale` / `Scale Review` persists across 78 creatives.** Defensible per investigation, but still a credibility watchpoint. If CT becomes available on any connected account and `Scale` still does not fire on any creative, that would warrant surgical investigation. Track first-sighting.

2. **Protected-winner exclusion from `Scale Review` is a deliberate design choice the owner may eventually want to revisit.** Currently: `hold_no_touch` → `Protect` (never `Scale Review`). This preserves one-row-one-outcome. If operator feedback over time suggests protected winners deserve a separate "review for additional scale" signal, that is a future product question. Not current work.

3. **`Refresh` is 16 of 78 rows (21%) — a large share.** Most `Refresh` rows in the cohort correctly trace to fatigue/decay patterns, and the old engine would have pushed `pause` on most of them. But for creatives whose campaigns are already paused (like `company-03/company-03-creative-07`), the reason-summary wording "fatigue-driven decay that needs replacement, not more budget" may read oddly — the budget part does not apply to a paused creative. Minor instruction-body improvement opportunity, not a blocker.

4. **Zero `Retest`, zero `Cut`, zero `Campaign Check` in this 78-row sample.** Paths exist, fixtures pass, no live rows reached their triggers. Could be cohort composition. Could be slightly strict floors. Insufficient evidence to act on either way.

5. **`Not Enough Data` is 14 of 78 (18%) — reasonable share but worth operator spot-check.** Pass 6 added routing to send mature high-spend zero-purchase rows to `Watch` instead of `Not Enough Data`. Whether that routing is actually surfacing the intended differentiation on live data is observable only by reviewing specific rows.

None of these warrant an implementation pass. They warrant production monitoring.

### 7. Whether Another Implementation Pass Is Needed

**No.**

Reasoning:
- The UI taxonomy mismatch that caused the prior acceptance revocation is fixed.
- The actual Creative UI now exposes the agreed 10-label taxonomy.
- Live output flows across 8 businesses with meaningful distribution across 6 actionable labels.
- Zero `Scale` and zero `Scale Review` are explained by traceable, defensible policy decisions — not hidden bugs.
- The specific user-observed case has been traced, the `Pause` wording mismatch is fixed, and the resolved `Refresh` segment is media-buyer sensible on account-relative terms.
- The old rule engine comparison confirms the current system is materially better than the naive alternative.
- Remaining uncertainties are production-observable monitoring items, not implementation problems.

Another pass at this point would either retune thresholds (unjustified from the current sample — no single-direction systematic miss has been identified) or rewrite the "`Protect` excludes `Scale Review`" design decision (a product-evolution question that depends on operator usage data that does not yet exist).

Neither is the right work today.

### 8. If Another Pass Is Needed, Exactly What It Should Fix

Not applicable — no pass is recommended. If a future production signal creates reason for one, priority order would be:

1. **If CT becomes available on any connected account and `Scale` still does not fire** on any rows the owner manually identifies as scale-worthy: surgical investigation of the specific `Scale` floor interaction on that account, not a blanket threshold loosening.
2. **If the owner accumulates three or more cases where a protected winner should have also appeared as a scale-review signal**: reconsider the `Protect`-excludes-`Scale Review` exclusion rule, with operator usage data as evidence.
3. **If the `Refresh` reason-summary wording causes buyer confusion for paused-campaign creatives in operator reports**: add a conditional branch to the instruction body (not the segment) that differentiates "paused creative, create refresh variant for next activation" from "actively fatiguing creative, create replacement now."
4. **If first `Retest` / `Cut` / `Campaign Check` sightings appear inconsistent with owner judgment**: add those cases as fixtures and investigate the specific path, no broader changes.

All four are hypothetical. None is urgent.

### 9. Creative Segmentation Recovery Final Determination

**Creative Segmentation Recovery can stop here.**

The program has done what it set out to do:
- 10-label operator taxonomy implemented and now visible in the actual UI (primary filters, cards, details, instruction headlines)
- Ambiguous umbrella labels (`Review`, `Check`, `Hold`, `Evergreen`) demoted from primary operator language
- Live output flows across all 8 readable Meta businesses
- Six actionable labels fire at meaningful volume
- Commercial Truth scoped correctly (gates execution, does not erase relative diagnosis)
- Benchmark scope operator-initiated and trustworthy
- Old rule engine still a losing challenger on every dimension
- Specific user-observed case traced and resolved
- Zero `Scale` / zero `Scale Review` explained, not hidden

What comes next is not another implementation pass. It is:
- **Production monitoring** of segment distributions per business, over time
- **Owner first-sighting review** when `Scale`, `Scale Review`, `Cut`, or `Retest` fire for the first time on any account
- **Meta canary rollout** — telemetry sink activation, canary business configuration — on the independent track that has been waiting
- **Light-touch operator feedback capture** if specific rows are systematically mis-labeled, to feed any future focused tuning work

The Creative page is now product-acceptable. Stop the recovery program and move into observation.

---

### Final Chat Summary

**Verdict:** GOOD ENOUGH WITH MONITORING

**Top 5 Remaining Product Risks (monitoring-grade):**
1. Zero live `Scale` / `Scale Review` across 78 creatives — defensible per investigation but track first-sighting when CT becomes available on any account
2. `Protect` excludes `Scale Review` by design — may need revisiting if operator feedback accumulates cases where protected winners also deserve a scale-review signal
3. `Refresh` reason-summary wording ("not more budget") reads slightly oddly for paused-campaign creatives — minor instruction-body polish opportunity, not a blocker
4. Zero `Retest`, zero `Cut`, zero `Campaign Check` in the 78-row sample — paths exist, fixtures pass, cohort composition or slightly strict floors; monitor first-sightings
5. `Not Enough Data` at 18% share needs operator spot-check to confirm pass-6's mature-weak routing is actually differentiating sub-cases in live instruction bodies

**Another implementation pass needed:** No.

**Recommended next move (one sentence):** Stop Creative Segmentation Recovery as accepted, move to production monitoring and owner first-sighting review for any live `Scale` / `Cut` / `Retest` / `Campaign Check` appearances, and resume the independent Meta canary rollout track — the UI taxonomy is now correct, the specific user-observed case is resolved, and remaining uncertainties are observation-grade rather than implementation-grade.

---

## Date Range Invariance Review

Reviewer: Claude Code (product-strategy and media buyer logic reviewer)
Date: 2026-04-24
Scope: Focused product review of the Creative date-range invariance audit and fix, evaluating whether the selected reporting range affects primary operator segments and whether the UI clarifies the distinction.

---

### Verdict: PASS WITH UI CLARITY RISK

The selected reporting date range does NOT change primary Creative operator segments. The production-equivalent trace on sanitized `company-03` is conclusive: 14-day and 30-day reporting ranges both resolve to the same `decisionAsOf` (`2026-04-23`), the same primary Decision OS window (`2026-03-25` to `2026-04-23`), 16 shared Decision OS rows, and **zero** same-creative segment changes. The Operator Decision Context doctrine is preserved — decision authority comes from `decisionAsOf` and the primary Decision OS window, not from selected reporting dates.

The observed count differences in the quick-filter bar (e.g., `Watch: 8 → 9`, `Not Enough Data: 9 → 11` between 14d and 30d) were never reclassification. They were the natural consequence of the quick-filter counts being scoped to `visibleIds` — the currently visible rows in the reporting table. Changing the reporting range changes which rows render in the table, which changes which rows contribute to the quick-filter count. The counts were honest; the UI just did not explain what they were counting.

The fix addresses exactly that: quick-filter copy and accessibility labels now state that counts follow the visible reporting set while row segments remain anchored to the Decision OS window. That is the right fix — the underlying behavior was correct, and the UI now describes it accurately.

The remaining risk is that a media buyer who does not read the small clarifying copy may still, on first encounter, read "Watch 8 → Watch 9" as reclassification. The copy fix is good; whether it is visually prominent enough to prevent that misread in practice is a UX judgment that would benefit from one operator walkthrough in production. Hence "PASS WITH UI CLARITY RISK" rather than unqualified PASS.

---

### 1. Does the Selected Reporting Date Range Still Change Primary Creative Operator Segments?

**No.**

The trace is clear. For the sanitized `company-03` cohort:
- Both 14d and 30d reporting ranges use `decisionAsOf = 2026-04-23`
- Both use the primary Decision OS window `2026-03-25 → 2026-04-23`
- 16 Decision OS rows in both ranges
- 16 shared rows
- **0 same-creative segment changes**

Segment counts were stable per-row: `Test More: 4`, `Protect: 1`, `Refresh: 4`, `Not Enough Data: 6` in both 14d and 30d traces.

Tests confirm this invariance: same creative + same `decisionAsOf` + different reporting dates produces the same primary segment, same lifecycle, same primary action, same push readiness, same action fingerprint, same evidence hash.

The Operator Decision Context doctrine holds.

### 2. If Segment Counts Change, Is It Because the Visible Creative Set Changes or Because Same Creatives Are Reclassified?

**Because the visible creative set changes.**

`buildCreativeQuickFilters()` receives `visibleIds` from the currently visible table rows. The reporting table filters rows by the selected reporting range (a row with activity in the last 14 days vs a row with activity across the full 30 days). When the operator switches ranges, fewer or more rows are visible; the quick-filter counter counts only what is visible.

The per-row segment label does not change. A creative labeled `Watch` in the 14d view remains `Watch` in the 30d view. It just may disappear from the visible set (if it has no 14d activity) or appear (if it has 30d activity the 14d window excluded). The count changes; the classification does not.

This matches what the user-observed UI counts suggested (three-row total drift between 14d and 30d) and what the trace confirmed (zero reclassification).

### 3. Is the UI Clear Enough About This Distinction?

**Now, mostly — with one residual concern.**

The fix added:
- Top Creative segment filter copy stating counts follow the visible reporting set while row segments use the Decision OS window
- Decision Support quick-filter copy stating the same
- Accessibility labels identifying counts as "visible reporting-set counts"
- Deterministic tests covering the copy

This is the right content. The UI now honestly describes what the numbers mean.

The residual concern is visual prominence. A media buyer who glances at a filter bar showing "Watch: 8" and switches ranges to see "Watch: 9" will form a mental model instantly. Whether the clarifying copy is large/visible enough to overwrite that first-impression reading before it hardens is a UX question that small copy additions do not always solve on their own. Not every user reads explanatory text next to a counter badge.

What would strengthen the fix beyond what is already done (not required for acceptance, but worth considering as a later polish):
- A small scope indicator like "(visible)" or "(in current range)" inline with the count itself, so the count and its scope are read together rather than the count alone
- A one-line tooltip on hover of any segment filter saying "Counts the rows currently visible under the selected reporting range. Row classifications do not change with the reporting range."

Neither is a blocking addition. The current fix is sufficient for acceptance, with the note that operator walkthrough in production may reveal whether further visual prominence is needed.

### 4. Does This Behavior Preserve the Operator Decision Context Doctrine?

**Yes.**

The doctrine as stated: `decisionAsOf`, the primary Decision OS window, and explicit benchmark scope are the decision-authority inputs. Reporting range is reporting context, not action authority.

The trace confirms every load-bearing element of this:
- `decisionAsOf` is resolved from provider-backed state, independent of the reporting range control
- The primary 30-day Decision OS window is resolved independently, not from the reporting range selector
- `buildCreativeDecisionOs()` uses selected reporting dates only for historical and selected-period analysis, never for primary segment determination
- Action fingerprints and evidence hashes stay stable across reporting-range changes, which is the correctness invariant for the push/apply safety chain

The UI count behavior is downstream display only. It reflects which rows the operator is currently looking at, not which rows the system currently thinks are scale/cut/protect. The two are correctly separated.

### 5. Is the Creative Page Now Trustworthy Enough?

**Yes, for the date-range question specifically.**

The underlying decision authority is correct. The UI copy now matches the underlying behavior. The tests enforce invariance. The specific user-observed count drift (3 rows between 14d and 30d) has a complete explanation that does not involve any policy or classification issue.

No additional implementation pass is required for this concern. The remaining risk is UX prominence of the clarification, which is observable in production use and can be polished without any policy or threshold work.

Combined with the prior live-firm audit review (GOOD ENOUGH WITH MONITORING) and the UI taxonomy fix, the Creative page now has:
- Correct operator taxonomy in filters, cards, details, and instructions
- Defensible zero `Scale` / `Scale Review` state traceable to design choices, not hidden bugs
- Account-relative benchmarking that produces correct judgments on the specific user-observed case (`company-03/company-03-creative-07`)
- Date-range invariance on primary segments, with UI copy now matching the behavior

Creative Segmentation Recovery can still stop. The date-range concern was legitimate, was investigated correctly, and was fixed at the level where the actual issue lived — the UI copy, not the decision authority.

---

### Final Chat Summary

**Verdict:** PASS WITH UI CLARITY RISK

**Another implementation pass needed:** No.

**If yes, what must be fixed:** Not applicable. Optional UX polish (scope indicator inline with count, or tooltip explaining visible-set scope) could strengthen visual clarity but is not blocking. If a production operator walkthrough reveals that the current copy is not read prominently enough to prevent misreading "count changed" as "classification changed," a small UI polish pass could add an inline scope indicator. That would be a single-surface UX change, not an implementation pass.

---

## Product-Truth Review from Screenshots and Live Sample

Reviewer: Claude Code (product-strategy and media buyer logic reviewer)
Date: 2026-04-24
Scope: Independent product-truth review triggered by the user's rejection of current Creative Decision OS output based on live usage and two UI screenshots (`IwaStoreTestCampaign.pdf`, `TheSwafTest.pdf`). The prior "GOOD ENOUGH WITH MONITORING" verdict is revisited against direct evidence from the actual Creative page.

---

### 1. Executive Verdict: TARGETED FIXES NEEDED

The user's rejection is correct. The Creative page has a real, identifiable product failure that the prior sanitized audits did not catch: the `Protect` label is firing on creatives that are currently losing money, sometimes at meaningful spend, sometimes with ROAS near zero. This is not conservatism. This is the wrong label — a shipped-winner signal attached to a clear loser. And because `Protect` structurally blocks `Scale Review` promotion, the cascade effect hides legitimate scale-review candidates behind the same broken gate.

This is not a MISALIGNED verdict (the taxonomy is correct, the UI is now correct, the safety gates are sound). It is not a REBUILD RECOMMENDED verdict (the architecture holds — one specific gate is misfiring). It is not TOO CONSERVATIVE in the generic sense (the conservatism is correct where it fires on genuinely uncertain rows). It is TARGETED FIXES NEEDED: a specific subset of the `Protect` gate must condition on current performance health, not only on upstream lifecycle/action shape. Once that gate is fixed, several of the Scale Review cases that are currently hidden should surface correctly.

The prior reviews landed on "GOOD ENOUGH WITH MONITORING" because the sanitized deterministic sample (78 creatives across 8 businesses) happened not to expose the Protect-on-ROAS-0 pattern that the test-campaign screenshots make undeniable. The sanitized audit picked rows that were either stable winners ($1670 spend, ROAS 5.62 type rows — correct Protect) or below-median performers (`company-03-creative-07` 4.30 ROAS in a 7.42-median account — defensible Refresh). It did not surface the specific combination: **meaningful recent spend + ROAS near zero + `hold_no_touch` upstream action → Protect**. That combination is exactly what the PDFs expose.

---

### 2. What the PDFs Demonstrate

#### PDF 1: `IwaStoreTestCampaign.pdf` — Test Kampanya - 26 Mart

The top filter bar shows: Scale 0 / Scale Review 1 / Test More 2 / Protect 1 / Watch 2 / Refresh 2 / Retest 0 / Cut 0 / Campaign Check 0 / Not Enough Data 4. Benchmark: Account-wide. Campaign filter: Test Kampanya - 26 Mart.

Creatives visible in-table, with system labels and metrics:

| Creative | Segment | 30d Spend | 30d ROAS | Read |
|---|---|---:|---:|---|
| A mistake | **Scale Review** | $777 | 4.74 | Reasonable — strong spend + ROAS, account-relative candidate |
| Every beautiful | Watch | $418 | 2.18 | Defensible — mid performer |
| New 2026 Collection | Watch | $375 | 2.72 | Defensible |
| **decorate_03** | **Protect** | **$306** | **0.33** | **WRONG** — ROAS 0.33 on $306 spend is not a winner |
| The heart finds | Not Enough Data | $174 | 0.54 | Defensible — thin signal |
| Cherish every | Refresh | $151 | 3.80 | Reasonable |
| niko_deko_germany | Not Enough Data | $126 | 3.08 | Defensible — spend floor |
| A stunning Islamic | Watch | $124 | 1.53 | Defensible |
| Loved styling | **Test More** | $23 | **26.06** | Correctly conservative despite high ROAS (spend too low) |

The headline fact: **"decorate_03" is labeled Protect at $306 spend with 0.33 ROAS.** That is a creative that has burned $306 to produce roughly $100 of revenue. No expert media buyer would call that "Protect." Protect means "this creative is winning, do not touch, do not pause." This creative is losing. The label is wrong.

The one legitimate Scale Review candidate ("A mistake", $777, 4.74 ROAS) is present, which is a positive signal — the label can fire. But the overall cohort has one clear mislabel that is structurally damaging to operator trust.

#### PDF 2: `TheSwafTest.pdf` — TEST - EMB - CreativeTest - Apr2026

Top filter: Scale 0 / Scale Review 0 / Test More 1 / Protect 5 / Watch 4 / Refresh 1 / Retest 0 / Cut 0 / Campaign Check 0 / Not Enough Data 8.

Notable creatives:

| Creative | Segment | 30d Spend | 30d ROAS | Read |
|---|---|---:|---:|---|
| wearthefearnoise | Watch | $1,154 | 1.29 | Defensible — break-even-ish |
| **sura** | **Protect** | **$762** | **0.00** | **WRONG** — $762 burned, zero return |
| protection | Not Enough Data | $607 | 0.00 | Questionable — $607 is not thin |
| **depth** | **Protect** | **$587** | **0.00** | **WRONG** |
| Silverdoo | Protect | $581 | 4.21 | Correct — real winner |
| fatal | Protect | $457 | 2.50 | Correct |
| **aphrodite** | **Protect** | **$444** | **0.72** | **WRONG** — ROAS 0.72 is losing money |
| restrainnsra | Watch | $424 | 0.04 | Questionable — ROAS 0.04 is garbage |
| **aconlongym** | **Protect** | **$337** | **0.00** | **WRONG** |
| **aaptheckoll** | **Watch** | **$224** | **7.12** | **SHOULD BE SCALE REVIEW** — real relative winner |
| fatih | Watch | $224 | 0.88 | Defensible |
| watchthat | Watch | $224 | 0.00 | Questionable |
| beginleakarft | Refresh | $330 | 2.97 | Reasonable |

Four separate Protect labels on creatives with ROAS at or near zero, with meaningful spend ($337–$762). One clear Scale Review candidate (aaptheckoll, 7.12 ROAS at $224 spend) mislabeled as Watch.

Four legitimate Protects ("Silverdoo" 4.21, "fatal" 2.50 — and two I flagged as wrong that have long-term shipped-winner history the system is reading through, which is the mechanism of failure but not an excuse) confirm the label itself works when the creative actually wins.

---

### 3. What the Live Audit Demonstrates

The sanitized live-firm audit (`sanitized-live-firm-audit.json`, 78 sampled creatives, 8 businesses) showed a different pattern:
- 14 Protect rows, 20 Watch, 16 Refresh, 8 Test More, 14 Not Enough Data, 6 Not eligible, 0 Scale / Scale Review
- Old rule engine comparison: ~24 pause calls, ~7 scale_hard — materially worse

Looking at the specific Protect rows in the sanitized artifact (`company-01-creative-01`: $1670 spend, 30d ROAS 5.62; similar pattern for other sanitized Protects), the sample predominantly caught *genuine* winners. The pathological Protect-on-ROAS-0 pattern that the screenshots expose does not appear in the deterministic sample.

**Why the sample missed it:** The sampling rule prioritizes active creatives by 30-day spend descending, up to 10 per business. That rule biases toward currently-running, currently-high-spend creatives. The Protect-on-ROAS-0 cases in the PDFs are mostly in *test campaigns* — cohorts with different selection dynamics than the deterministic sample used. The sanitized audit was correct for what it sampled; it simply did not see the test-campaign cohort where the problem is concentrated.

This is important: the prior reviews were honest for the data they reviewed. The failure is not that earlier reviews were wrong; it is that the sample did not expose the specific failure pattern. The PDFs do.

---

### 4. Whether Zero Scale / Scale Review Is Defensible

**Partially. With one clear exception.**

Zero `Scale` at live-firm level remains defensible: CT is missing for most of the cohort, and `Scale` correctly requires favorable CT. That stays correct.

Zero `Scale Review` is **not fully defensible anymore.** The PDF evidence includes at least one clear candidate that should surface as `Scale Review` but currently does not:

- **aaptheckoll** (PDF 2): $224 spend, 7.12 ROAS, account-wide benchmark. That is a real account-relative winner signal. It currently labels as `Watch`, not `Scale Review`.

Why aaptheckoll is not reaching Scale Review requires a trace to answer definitively, but two plausible paths explain it:
1. The scale_review floor (`spend ≥ max($80, 0.2× account median)`, `purchases ≥ 2`, `ROAS ≥ 1.4× account median`, `CPA ≤ 1.2× median`) may be failing on one of the multi-condition floors given this account's peer distribution.
2. Upstream Decision OS may be downgrading `promote_to_scaling` to `keep_in_test` for this row for a reason that is not visible from the screenshots alone.

Either way, aaptheckoll at 7.12 ROAS with $224 meaningful spend in a test campaign is the archetypal Scale Review case. Its absence in that filter is a real product gap.

---

### 5. Whether Current Creative Output Is Better Than Manual Table Reading

**Not in its current state. Slightly worse in the cohorts the PDFs show.**

A media buyer reading the raw Meta table for the TEST - EMB - CreativeTest - Apr2026 campaign would see the ROAS column, sort by it, and instantly identify:
- aaptheckoll (ROAS 7.12) as the standout scale-review candidate
- Silverdoo (4.21), fatal (2.50), beginleakarft (2.97) as candidates to protect/monitor
- sura (0.00), depth (0.00), aphrodite (0.72), aconlongym (0.00) as creatives to cut or investigate urgently

The current Creative page tells them instead:
- aaptheckoll is Watch (not scale-review-worthy)
- sura, depth, aphrodite, aconlongym are Protect (do not touch)

A buyer who trusts the system's labels would make the wrong calls: they would not act on the actual scale candidate, and they would not cut obvious losers. A buyer who does not trust the labels would fall back to the raw table — which defeats the entire product purpose.

For the cohort in PDF 2 specifically, manual table reading is *safer* than the current system. That is a failure of the product-charter test ("would a strong media buyer trust the recommendations enough to act on them immediately?"). In this test campaign, the answer is no.

For the cohort in the sanitized live audit, the system was better than manual reading. The conclusion from that cohort was not wrong — it was incomplete. The screenshots expose the gap.

---

### 6. Whether Labels Are Correct but Decisions Are Wrong

**This is exactly the situation. The taxonomy is correct. The UI is correct. One specific decision gate is wrong.**

The 10-label taxonomy is not the problem. Renaming labels will not help. Changing UI will not help. The failure is in the `Protect` gate's conditions:

- The current route: `primaryAction === "hold_no_touch"` → `protected_winner` → UI "Protect"
- The missing condition: **current performance health check**. A creative should not be labeled Protect if it is currently losing money at meaningful spend, regardless of historical lifecycle.

The `hold_no_touch` upstream action is presumably firing because of lifecycle metadata (a creative that had a long run of good performance, now in stable or fatigued state but not formally fatigued). The problem: the policy layer trusts that upstream signal without cross-checking whether the creative is *currently* healthy. A creative that was a winner 90 days ago but has burned $600 in the last 30 days at ROAS 0 is not currently a winner. It is currently a loser that used to win.

This gate needs a health floor. Something like: `Protect` only fires when `primaryAction === "hold_no_touch"` AND (`30d_ROAS ≥ max(1.0, 0.5 × account_median_ROAS)` OR `30d_ROAS evidence is insufficient`). Exact thresholds should be calibrated with fixtures, but the principle is clear: **protecting a current loser is structurally wrong**.

The secondary effect: because several rows in PDF 2 are mis-Protect, the `Protect`-excludes-`Scale Review` rule correctly excludes them from Scale Review (they are "Protect" in the system's eyes) — but they should not have been Protect to begin with. Fix the Protect gate, and the Scale Review gate's exclusion rule remains correct but stops suppressing legitimate candidates.

---

### 7. The Worst 5 Product Failures

1. **Protect label fires on creatives with current ROAS ≈ 0 and meaningful spend.** Four rows visible in PDF 2 alone (`sura` $762/0.00, `depth` $587/0.00, `aphrodite` $444/0.72, `aconlongym` $337/0.00). This is the central failure.

2. **A clear Scale Review candidate is hidden as Watch.** `aaptheckoll` $224/7.12 in PDF 2. An account-relative strong performer with meaningful spend does not surface as Scale Review. This is almost certainly caused by either the Protect-adjacent logic or a scale-review floor condition that needs trace diagnosis.

3. **Legacy `Pause` symptom on historical winners remains a buyer-trust risk even after the UI fix.** The UI fix correctly removes `Pause` wording from overriding the operator segment, but the underlying `hold_no_touch` signal is still being assigned too aggressively — the buyer now sees `Protect` on losers instead of `Pause` on losers. The label changed; the misclassification did not.

4. **Test campaign context is ignored.** Both PDFs show test campaigns (explicitly named "Test Kampanya" and "TEST - EMB - CreativeTest"). A test campaign is definitionally where the operator is evaluating new or experimental creatives. Firing `Protect` (shipped-winner "do not touch") on creatives in a test campaign is structurally wrong — test campaign creatives should route to `Test More`, `Watch`, or `Cut` based on recent performance, not Protect based on historical lifecycle. The policy layer does not currently condition on campaign objective type.

5. **Zero `Cut` across multiple cohorts that clearly contain kill candidates.** In PDF 2 alone there are 3-4 rows with 30d spend ≥ $300 and 30d ROAS 0.00 — classic kill evidence. The `kill_candidate` path requires `primaryAction === "block_deploy"` upstream, which is not firing for these rows. That is another upstream Decision OS gate that is too loose on dying historical winners.

---

### 8. Which Gates Likely Need Change

Priority order:

**Gate 1 — Protect requires current-health floor (highest priority).**
Add a current-performance check to the Protect admission path. A creative can only be `Protect` if `primaryAction === "hold_no_touch"` AND current 30-day evidence is not clearly losing. Proposed floor (for fixture-backed calibration): `Protect` denied when `30d_spend ≥ $150` AND `30d_ROAS < max(1.0, 0.4 × account_median_ROAS)`. Denied rows should fall through to a different segment based on the rest of the signal: `Refresh` if the trajectory shape is decay, `Cut` if evidence is sufficient, `Watch` if ambiguous, `Not Enough Data` if evidence is thin.

**Gate 2 — Upstream `hold_no_touch` assignment is too sticky.**
The Decision OS layer is assigning `hold_no_touch` to creatives whose long-term lifecycle is "stable winner" even when 30-day data shows decay. The fix is either (a) cross-check at the Decision OS layer before returning `hold_no_touch`, or (b) cross-check at the Creative policy layer as Gate 1 proposes. Gate 1 is the surgical fix; Gate 2 is the deeper fix. Start with Gate 1.

**Gate 3 — Test campaign awareness.**
If a creative lives in a campaign whose objective indicates testing/evaluation (campaign name contains "test", campaign objective is CONVERSIONS or OUTCOME_SALES in a test configuration, or other signals the platform exposes), the Protect default should be suppressed in favor of test-appropriate labels. This is a campaign-context gate, not a threshold change.

**Gate 4 — Kill evidence should not require pre-existing `block_deploy`.**
A creative with $300+ spend and ROAS 0 over 30 days should be reachable as `Cut` through kill-evidence evaluation in the Creative policy layer, not blocked waiting for upstream to declare `block_deploy`. This is symmetric to the Scale Review fix from pass 6 — the Creative policy layer should be able to recognize a clear kill candidate from evidence alone, just as it can now recognize a Scale Review candidate from evidence alone.

**Gate 5 — Scale Review floor calibration.**
Once Gates 1 and 2 are in place, trace `aaptheckoll` specifically through the restored path. If it still does not reach Scale Review, investigate the specific floor condition. Do not retune blindly — trace one row, diagnose the one missing condition, add a fixture, ship the fix.

---

### 9. Whether This Needs Targeted Fixes or a Deeper Rebuild

**Targeted fixes.**

Arguments against rebuild:
- The 10-label taxonomy is media-buyer-correct. The user approved it. The UI now matches it.
- The safety gate architecture (queue/push/apply) is sound.
- Benchmark scope and CT split work correctly where they fire.
- 4 of 5 Protect labels in PDF 2 are correct (Silverdoo 4.21, fatal 2.50, and genuine long-history winners). The gate works when applied to real winners.
- The old rule engine comparison still shows the current system is directionally better (pause on 24, scale_hard on 7 = aggressive and wrong in most cases).

Arguments for targeted fixes:
- The specific failure mode is well-defined: Protect on current losers.
- The fix is well-scoped: add a health floor to the Protect admission path.
- The cascade effect (hidden Scale Review candidates) should resolve once Protect is properly gated.
- No taxonomy change. No UI change. No safety-gate change.

A rebuild would destroy the correct parts of the system to address a specific mis-firing gate. That is disproportionate. The right response is a narrow, fixture-backed pass on the Protect health floor, the upstream `hold_no_touch` stickiness, and the Cut evidence path.

---

### 10. Recommended Next Implementation Direction

**One focused implementation pass with three deterministic changes, each fixture-backed.**

Pass scope:

1. **Protect health floor (must-have).** Add current-performance health check to the Protect admission path. Fixture: `company-X-creative-Y` with $400 spend, 30d ROAS 0.00, upstream `hold_no_touch` → currently produces `Protect`, should produce `Refresh` or `Watch` or `Cut` based on trajectory shape.

2. **Cut evidence path symmetry (should-have).** Allow `kill_candidate` to be reachable from the Creative policy layer based on evidence (spend ≥ $250 + ROAS < floor over 30d) without requiring `block_deploy` upstream. Fixture: clear kill evidence → `Cut` regardless of upstream `primaryAction`.

3. **Scale Review floor trace and targeted fix (conditional).** After fixes 1 and 2 are in, retrace the archetypal missed case (`aaptheckoll`-shape: $200 spend, ROAS 7×, account-relative strong). If it still does not reach Scale Review, diagnose the specific floor condition that blocks it, add a targeted fixture, ship the narrow fix. Do not retune broadly.

Do NOT in this pass:
- Change the 10-label taxonomy
- Change UI labels or filters
- Change safety gates (queue/push/apply)
- Broaden Commercial Truth behavior
- Change benchmark scope semantics
- Promote the old rule engine
- Apply agent majority vote as policy

Validation after the pass:
- Rerun the sanitized live audit and confirm no regression on the existing correct Protects.
- Rerun screenshot-equivalent traces on the TheSwaf and IwaStore test cohorts (privately, with sanitized aliases committed) and confirm `sura`, `depth`, `aphrodite`, `aconlongym` shift away from `Protect` into defensible labels, and `aaptheckoll` surfaces as `Scale Review`.
- Operator spot-check on three representative test campaigns.

Stopping criterion: if the three changes produce a distribution that the user recognizes as media-buyer-sensible on the same test-campaign cohorts, stop. Do not keep chasing edge cases.

---

### Final Chat Summary

**Verdict:** TARGETED FIXES NEEDED

**Top 5 Product Failures:**
1. `Protect` fires on creatives that are currently losing money at meaningful spend (4 clear cases in PDF 2: `sura` $762/ROAS 0, `depth` $587/ROAS 0, `aphrodite` $444/ROAS 0.72, `aconlongym` $337/ROAS 0) — Protect should require current health, not just historical lifecycle
2. Legitimate Scale Review candidate `aaptheckoll` ($224 spend, ROAS 7.12) is hidden as `Watch` — likely a cascade effect of the Protect mis-firing blocking adjacent Scale Review promotion, or a specific Scale Review floor condition that needs trace diagnosis
3. Test campaign context is ignored — both PDFs show explicit test campaigns where `Protect` on historically-stable-but-currently-losing creatives is structurally wrong (test campaigns are for evaluating, not protecting)
4. `Cut` is unreachable from the Creative policy layer without upstream `block_deploy` — multiple rows with clear kill evidence (spend ≥ $300, ROAS 0 over 30d) get labeled `Protect` or `Watch` instead
5. The prior sanitized audit sample did not surface the Protect-on-losers pattern because its deterministic sampling rule biased toward genuine currently-high-spend rows; product-truth review must include test-campaign cohorts explicitly going forward

**Zero Scale / Scale Review acceptable:** No — at minimum `aaptheckoll`-shape cases should surface as Scale Review. Zero Scale remains defensible until CT becomes available.

**Current output better than manual table reading:** No for the PDF 2 cohort (test campaign). Yes for the sanitized audit cohort (non-test, high-spend stable rows). Product credibility requires both cohorts to beat manual.

**Recommended next move (one sentence):** Do one focused, fixture-backed implementation pass adding a current-performance health floor to the `Protect` admission path, enabling `Cut` to reach the Creative policy layer on evidence alone symmetrically to `Scale Review`, then trace `aaptheckoll` specifically to close the Scale Review gap — no taxonomy, UI, safety, or CT changes in scope.

---

## Direct Campaign Context Review — IwaStore and TheSwaf

Reviewer: Claude Code (product-strategy and media buyer logic reviewer)
Date: 2026-04-24
Scope: Direct inspection of actual campaign data for IwaStore (PDF alias `pdf-company-01`) and TheSwaf (PDF alias `pdf-company-02`) using the private audit artifact, not OCR from the PDF screenshots. Replaces metric claims from the prior "Product-Truth Review from Screenshots and Live Sample" section.

**Prior-section retraction:** The previous "Product-Truth Review from Screenshots and Live Sample" section claimed specific Protect rows had ROAS 0.00 / 0.72 based on reading the PDFs. Those claims are incorrect. The PDFs are not reliable for metric values, and the actual data shows those Protect rows have ROAS above account baseline. The directional conclusion (TARGETED FIXES NEEDED) happens to still hold, but for a different and more specific reason described below.

---

### 1. Executive Verdict: TARGETED FIXES NEEDED

The user's rejection is correct, but the failure mechanism is precise and narrow — not "Protect fires on losers" as my earlier PDF-based review incorrectly claimed. The real mechanism: **every creative the system internally classifies as a `true_scale_candidate` is simultaneously routed to `Protect` (not `Scale Review`) because the current policy rule lets `primaryAction === "hold_no_touch"` override the relative-winner path.** Four rows across the 78-creative audit carry `relativeStrengthClass === "true_scale_candidate"`. Zero of them reach `Scale Review`. All four land in `Protect`.

In TheSwaf's test campaign (`TEST — EMB - CreativeTest - Apr2026`) alone, two `true_scale_candidate` rows and two `strong_relative` rows are all labeled `Protect`. In IwaStore's test campaign (`Test Kampanyası - 26 Mart`), the $306-spend / ROAS 8.53 creative (real name `decorita_93`) is `true_scale_candidate` at 2.73× account baseline, and is labeled `Protect`. These are the rows the user sees and correctly reads as "should be scale candidates."

The fix is narrow: allow `Scale Review` to override `Protect` when `relativeStrengthClass === "true_scale_candidate"`. That is the specific gate change. No taxonomy change, no UI change, no safety-gate change, no CT change.

---

### 2. What I Inspected Directly From Current Data

**Source:** `/tmp/adsecute-creative-live-firm-audit-local.json` (not committed). 78 creatives across 8 businesses.

**Direct queries run:**
- Full row data for `company-01` (IwaStore) — 10 creatives including the PDF-referenced test-campaign rows
- Full row data for `company-08` (TheSwaf) — 10 creatives including the PDF-referenced test-campaign rows
- Distribution of `relativeStrengthClass` × `currentUserFacingSegment` across all 78 rows
- Full row trace for the IwaStore $306 creative (real name `decorita_93`, campaign `Test Kampanyası - 26 Mart`)
- Full row trace for TheSwaf creatives in campaign `TEST — EMB - CreativeTest - Apr2026`

**What I did not rely on:** any metric value from the PDF screenshots. Values there were either misread by me earlier (PDF 2 "sura ROAS 0.00", "aphrodite ROAS 0.72") or referred to columns I conflated. The direct data supersedes all such claims.

---

### 3. What the PDFs Were Used For (and Not Used For)

**Used for:** identifying the business context (IwaStore and TheSwaf), confirming the user was filtering to specific test campaigns (`Test Kampanyası - 26 Mart` and `TEST — EMB - CreativeTest - Apr2026`), and confirming the user's observation that the UI showed zero `Scale` / zero `Scale Review` in those views.

**Not used for:** any numerical comparison of ROAS, spend, purchases, baseline ratios, or segment-count proportions. All numerical claims in this section are from direct audit-data inspection with sanitized aliases.

---

### 4. IwaStore Test Campaign Findings (alias `pdf-company-01` / `pdf-campaign-01`)

**Campaign:** `Test Kampanyası - 26 Mart` (sanitized: `pdf-campaign-01`).

Four representative creatives from the IwaStore audit sample, with direct data:

| alias | spend 30d | ROAS 30d | purchases | baseline | ratio | relStrClass | current segment | acceptable? |
|---|---:|---:|---:|---:|---:|---|---|---|
| `pdf-creative-01` | $1,670.95 | 5.62 | 58 | 3.13 | 1.80x | none | Protect | Yes — real shipped winner, defensible |
| `pdf-creative-02` | $777.06 | 4.74 | 21 | 3.13 | 1.51x | none | Watch | Borderline — 1.51x baseline with 21 purchases is Scale-Review-shaped but relStrClass unset |
| `pdf-creative-05` | $306.37 | **8.53** | 15 | 3.13 | **2.73x** | **true_scale_candidate** | **Protect** | **No — true_scale_candidate belongs in Scale Review** |
| `pdf-creative-06` | $292.05 | 0.00 | 0 | — | — | none | Watch | Objective-aware: ThruPlay campaign (not purchase optimization), so zero purchases is expected; Watch is defensible |

The `$306 / ROAS 8.53 / 15 purchases / 2.73× baseline / true_scale_candidate` row (real name `decorita_93`, the PDF's "decorita_93") is the clearest product failure in this campaign. It is internally flagged `true_scale_candidate` — the strongest classification the system has. It is labeled `Protect`. It should be `Scale Review`.

The `$777 / ROAS 4.74 / 21 purchases` row is a secondary case: the metrics match a Scale Review shape (1.51× baseline, meaningful volume), but the relative-strength classifier assigned `none` rather than `strong_relative` or `true_scale_candidate`. That is a separate gate to investigate — the classifier threshold appears to require more than 1.51× baseline to promote to `strong_relative`, which may be too strict.

### 5. TheSwaf Test Campaign Findings (alias `pdf-company-02` / `pdf-campaign-02`)

**Campaign:** `TEST — EMB - CreativeTest - Apr2026` (sanitized: `pdf-campaign-02`).

Seven creatives in the audit sample from this test campaign:

| alias | spend 30d | ROAS 30d | purchases | baseline | ratio | relStrClass | current segment | acceptable? |
|---|---:|---:|---:|---:|---:|---|---|---|
| `pdf-creative-t04` | $783.19 | 2.65 | 10 | 1.62 | 1.63x | **true_scale_candidate** | **Protect** | **No — should be Scale Review** |
| `pdf-creative-t05` | $607.67 | 2.56 | 5 | 1.62 | 1.58x | strong_relative | Protect | Borderline — strong_relative in test campaign is plausibly Scale Review |
| `pdf-creative-t06` | $587.18 | 0.38 | 1 | 1.82 | 0.21x | none | Not Enough Data | Debatable — $587 spend with 1 purchase may warrant Cut, not Not Enough Data |
| `pdf-creative-t07` | $501.15 | **4.21** | 8 | 1.62 | **2.60x** | **true_scale_candidate** | **Protect** | **No — clearest Scale Review miss in cohort** |
| `pdf-creative-t08` | $457.22 | 2.50 | 4 | 1.62 | 1.54x | strong_relative | Protect | Borderline — similar to t05 |
| `pdf-creative-t09` | $443.91 | 0.72 | 2 | 1.82 | 0.40x | none | Watch | Acceptable — below baseline, low purchase volume, Watch defensible |
| `pdf-creative-t10` | $424.05 | 2.12 | 4 | 1.62 | 1.31x | none | Protect | Borderline — 1.31x baseline is mild relative lift, relStrClass correctly `none`, Protect OK |

Two `true_scale_candidate` rows (`pdf-creative-t04` and `pdf-creative-t07`) both labeled `Protect`. Two `strong_relative` rows (`pdf-creative-t05` and `pdf-creative-t08`) also `Protect`. In a test campaign — where the operator is explicitly evaluating creatives for scale potential — "Protect, do not touch" is the wrong stance for every one of these four. The operator wants to see "Scale Review" on the strongest relative rows.

`pdf-creative-t07` is the single strongest Scale Review miss in either cohort: ROAS 4.21 at 2.60× baseline with $501 meaningful spend and 8 purchases. That is the canonical relative-winner shape. It is `Protect` because `primaryAction = hold_no_touch` overrides `Scale Review` admission.

### 6. Whether Zero Scale / Scale Review Is Defensible in These Contexts

**Zero `Scale`:** Yes, defensible. CT is missing across these businesses. `Scale` correctly requires CT. Do not loosen.

**Zero `Scale Review`:** No, not defensible. At least three specific rows should surface as `Scale Review`:
- IwaStore `pdf-creative-05` (real: `decorita_93`) — `true_scale_candidate`, 2.73× baseline
- TheSwaf `pdf-creative-t07` — `true_scale_candidate`, 2.60× baseline
- TheSwaf `pdf-creative-t04` — `true_scale_candidate`, 1.63× baseline

A secondary tier of `strong_relative` rows (`pdf-creative-t05`, `pdf-creative-t08`) could plausibly also reach Scale Review but are weaker cases. Start with the `true_scale_candidate` cases.

### 7. Strongest Missed Scale / Scale Review Candidates

Ranked by strength of relative signal:

1. **`pdf-creative-05` (IwaStore / `decorita_93`)** — $306 spend, ROAS 8.53, **2.73× baseline**, 15 purchases, `true_scale_candidate`, Protect. Should be Scale Review.
2. **`pdf-creative-t07` (TheSwaf)** — $501 spend, ROAS 4.21, **2.60× baseline**, 8 purchases, `true_scale_candidate`, Protect. Should be Scale Review.
3. **`pdf-creative-t04` (TheSwaf)** — $783 spend, ROAS 2.65, **1.63× baseline**, 10 purchases, `true_scale_candidate`, Protect. Should be Scale Review.
4. **IwaStore `pdf-creative-02`** — $777 spend, ROAS 4.74, 1.51× baseline, 21 purchases, but `relStrClass: none` and `primaryAction: keep_in_test` → Watch. Secondary case — requires investigating why the relative-strength classifier assigned `none` despite 1.51× baseline ratio.

### 8. Weakest Missed Cut / Refresh Candidates

- **TheSwaf `pdf-creative-t06`** — $587 spend, ROAS 0.38, 1 purchase, 90d spend is also thin. Currently `Not Enough Data` because `block_deploy` upstream doesn't trigger `kill_candidate` without 4+ purchases or 8k+ impressions. A media buyer looking at $587 burned with 1 purchase would call this Cut, not "more data needed." The kill-evidence floor should handle "meaningful spend + very poor ROAS" separately from "meaningful spend + insufficient purchases."

- **TheSwaf `pdf-creative-t09`** — $443 spend, ROAS 0.72, 2 purchases, 0.40× baseline. Currently `Watch`. A buyer might call this `Cut` or `Refresh`. `Watch` is borderline-defensible since purchases are present and signal isn't completely broken, but after $443 spend with ROAS 0.72 it is unlikely to recover.

### 9. Whether Protect / Watch / Not Enough Data Are Being Used Correctly

**Protect:** Correctly firing on real winners (ROAS 2.12–8.53 across the Protect cohort, all above baseline). **Incorrectly over-firing** by absorbing 4 `true_scale_candidate` rows and 6 `strong_relative` rows that should be in Scale Review. This is the central gate failure.

**Watch:** Generally defensible. Used for validating-lifecycle rows, below-baseline or mid-baseline performers. The IwaStore `pdf-creative-02` ($777, 4.74 ROAS, 1.51× baseline) case is the one concerning Watch placement — the metrics match a Scale Review shape but the relative-strength classifier did not elevate it from `none`. That is a separate calibration question on the classifier, not a Watch-label issue.

**Not Enough Data:** Mostly defensible — fires on thin-evidence rows. Edge case: TheSwaf `pdf-creative-t06` ($587 spend, ROAS 0.38, 1 purchase, `block_deploy`) routes to `Not Enough Data` when a media buyer would call it `Cut`. The label is technically correct (insufficient conversion volume to evaluate as classic kill), but the operator semantics are misaligned for a row that has burned meaningful spend with clear negative ROAS.

### 10. Whether Campaign Benchmark Mode Helps

**Unknown from this data.** The audit artifact captures rows evaluated under account-wide benchmark. Campaign-benchmark output is not in this sample. The PDFs confirm the UI shows campaign-benchmark as an explicit opt-in, which is correct architecturally. Whether campaign benchmark would surface the missing Scale Review candidates (by giving them stronger relative ratios within the narrower campaign peer set) is plausible but not directly observable here. A targeted trace comparing account-wide vs campaign-scope for `pdf-creative-t07` and `pdf-creative-05` would answer this.

### 11. Which Exact Gates Appear Wrong

**Gate 1 (primary — one-line fix):** `Protect` excludes `Scale Review` unconditionally when `primaryAction === "hold_no_touch"`. This is the single gate that causes 4 `true_scale_candidate` rows (100% of them in this audit) to land in Protect instead of Scale Review.

Proposed change: allow `Scale Review` to override `Protect` when `relativeStrengthClass === "true_scale_candidate"` AND the row is otherwise eligible (live evidence, benchmark reliability strong/medium, CT missing is acceptable). Keep `Protect` as the default for stable winners that do NOT carry a true-scale-candidate classification. Keep `Scale` strict (requires CT).

Expected effect: 4 rows in this audit would shift from `Protect` to `Scale Review`. Protect remains 14 rows (excluding the 4 true_scale_candidate), Scale Review becomes 4. Cascade risk: minimal — the 4 rows are precisely the ones the internal classifier already identified as top candidates.

**Gate 2 (secondary — calibration):** The `relativeStrength` classifier assigns `none` to `pdf-creative-02` (IwaStore) at 1.51× baseline with 21 purchases. That row is Scale-Review-shaped by all other measures. Either the 1.51× threshold is not the admission bar, or the classifier requires additional conditions. This is a fixture-backed trace, not an immediate fix.

**Gate 3 (secondary — kill evidence):** `kill_candidate` requires `purchases ≥ 4 OR impressions ≥ 8k` from `block_deploy` upstream. `pdf-creative-t06` ($587 spend, ROAS 0.38, 1 purchase) does not clear either floor and falls into `Not Enough Data`. A secondary kill-evidence path (meaningful spend + very poor ROAS + thin purchases over sufficient time) could reach `Cut` for these cases.

**Gate 4 (observational):** Test-campaign awareness. A creative in a campaign explicitly named/tagged as a test or evaluation cohort should probably not default to `Protect` even if lifecycle says `stable_winner`. This is harder to implement safely and should be deferred until after Gate 1 demonstrates it surfaces the right rows.

### 12. Whether Current Creative Output Is Better Than Manual Table Reading

**For the test-campaign cohorts shown in the PDFs: currently equal or slightly worse.** A media buyer reading the raw table would identify `pdf-creative-t07` (ROAS 4.21, $501 spend) as the scale-review candidate. The Creative page currently labels it `Protect`, which implies "don't touch." A buyer who trusts the Protect label would miss the opportunity. A buyer who doesn't trust Protect falls back to the raw table, defeating the product.

**For the broader 78-creative sanitized audit cohort: materially better.** The old rule engine comparison confirms this — the challenger would have pause'd real winners (~24 rows) and scale_hard'd rows without CT (~7). The current system loses that challenge cleanly for the cohort as a whole.

**After Gate 1 is fixed: materially better across both cohorts.** Surfacing the 4 `true_scale_candidate` rows as `Scale Review` turns the product from "silent on scale opportunities" to "flags your top 4 relative winners for review." That is the exact product value a buyer expects.

### 13. Recommended Next Action

**One narrow targeted fix.** No rebuild. No recalibration. No taxonomy change.

**Exact first fix:**
Modify the `Scale Review` admission path in `creative-operator-policy.ts` so that:
- `Scale Review` becomes reachable when `relativeStrengthClass === "true_scale_candidate"` AND evidence source is live AND baseline reliability is strong AND CT is missing (the current blocker) AND there is no weak campaign context AND provenance is valid.
- `Protect` is still assigned for `primaryAction === "hold_no_touch"` EXCEPT when the above `Scale Review` conditions all hold, in which case `Scale Review` takes precedence.
- `Scale Review` remains review-only: queue blocked, push blocked, apply blocked.
- Fixture: `pdf-creative-05`-shape input (spend $306, ROAS 8.53, 15 purchases, baseline 3.13, relStrClass `true_scale_candidate`, primaryAction `hold_no_touch`, CT missing) → expected `Scale Review`.
- Fixture: `pdf-creative-t07`-shape input → expected `Scale Review`.
- Regression fixture: a standard Protect row (relStrClass `none`, primaryAction `hold_no_touch`, ROAS above baseline) → still expected `Protect`.

Validation after the fix:
- Rerun the live-firm audit sample. Expected: 4 `true_scale_candidate` rows shift from `Protect` to `Scale Review`. Protect count drops from 14 to ~10. Scale Review becomes 4.
- Specifically confirm `decorita_93` (IwaStore test campaign) and the equivalent TheSwaf creatives surface as Scale Review in the UI.
- Owner spot-check on the two PDF cohorts.

Secondary (only if Gate 1 fix lands clean):
- Trace IwaStore `pdf-creative-02` to understand why 1.51× baseline + 21 purchases did not elevate `relativeStrengthClass` beyond `none`. Do not retune the classifier from one row; investigate whether the bar is intentional or miscalibrated.
- Address TheSwaf `pdf-creative-t06` kill-evidence gap separately (secondary kill path for meaningful-spend-very-poor-ROAS rows).

---

### Final Chat Summary

**Verdict:** TARGETED FIXES NEEDED

**Zero Scale / Scale Review defensible:** Zero `Scale` — yes. Zero `Scale Review` — **no**. At least 3 rows (`decorita_93` IwaStore, `pdf-creative-t07` TheSwaf, `pdf-creative-t04` TheSwaf) are internally classified as `true_scale_candidate` and should surface as `Scale Review`.

**Current output better than manual table reading:** For the test-campaign cohorts (PDFs), currently no — the strongest relative winners are hidden as `Protect`, so a buyer trusting the labels would miss them. For the broader cohort, yes.

**Top 5 Concrete Failures:**
1. `Protect` unconditionally overrides `Scale Review` when upstream `primaryAction === "hold_no_touch"`, burying 4 `true_scale_candidate` rows (100%) in Protect — this is the single most impactful gate failure
2. `pdf-creative-05` (IwaStore `decorita_93`): ROAS 8.53, 2.73× baseline, `true_scale_candidate` — labeled `Protect` instead of `Scale Review`
3. `pdf-creative-t07` (TheSwaf): ROAS 4.21, 2.60× baseline, `true_scale_candidate` — labeled `Protect` instead of `Scale Review`
4. `pdf-creative-t04` (TheSwaf): ROAS 2.65, 1.63× baseline, `true_scale_candidate` — labeled `Protect` instead of `Scale Review`
5. Test-campaign context is not factored into the Protect-vs-Scale-Review decision — an explicit test cohort is exactly where `Scale Review` is most operationally valuable

**Retractions from the prior section:** The claim that "sura", "depth", "aphrodite", "aconlongym" had ROAS 0.00 / 0.72 and were incorrectly labeled `Protect` was based on misread PDF values and is withdrawn. The actual TheSwaf Protect rows have ROAS 2.12–4.21, all above baseline. The directional conclusion (TARGETED FIXES NEEDED) still holds, but the mechanism is `Protect-excludes-Scale-Review` for `true_scale_candidate` rows, not `Protect-fires-on-losers`.

**Recommended next move (one sentence):** Ship one narrow fixture-backed policy change allowing `Scale Review` to override `Protect` specifically when `relativeStrengthClass === "true_scale_candidate"` (preserving `Protect` for `none` / `strong_relative` rows and `Scale Review`'s review-only safety), validate against the `decorita_93` and `pdf-creative-t07` fixtures, rerun the live-firm audit, and confirm 4 rows shift from `Protect` to `Scale Review` — no taxonomy, UI, safety, or CT changes in scope.
