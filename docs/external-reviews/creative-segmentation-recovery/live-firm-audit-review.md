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
