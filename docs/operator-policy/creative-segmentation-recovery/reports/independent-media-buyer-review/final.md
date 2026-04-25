# Independent Media Buyer Review Final

Last updated: 2026-04-25 by Codex

## Executive Verdict

Verdict: **BASELINE-FIRST REBUILD NEEDED**.

This review is diagnosis-only. No product policy, threshold, UI, queue/push/apply, or benchmark-scope code was changed.

A fresh runtime audit was attempted first, but the configured database at `127.0.0.1:15432` refused the connection. The review therefore uses the latest local private live-firm artifact generated at `2026-04-25T01:39:10.910Z`, covering the last 30 completed days ending `2026-04-24`. That artifact was generated from the corrected Creative Decision OS source path; PR #71/#72 were presentation-only, so the underlying segmentation evidence remains usable for this product-truth review.

## Scores

- weighted media-buyer risk score: **83/100**
- equal-segment macro score: **63/100**
- raw row accuracy: **65%**
- businesses reviewed: **8**
- creatives reviewed: **78**
- pdf-company-01 context reviewed
- pdf-company-02 context reviewed

The weighted score is materially better than the equal-segment score because
some severe spend-risk cases are already handled. The equal-segment score is
the stronger product-truth warning: quality is uneven across Scale Review,
Test More, Refresh, Cut, Watch, and Not Enough Data expectations.

## Distribution

| Segment | Adsecute detailed | Blind expected |
| --- | --- | --- |
| Cut | 12 | 14 |
| Not Enough Data | 14 | 23 |
| Not eligible for evaluation | 5 | 0 |
| Protect | 1 | 0 |
| Refresh | 23 | 22 |
| Scale Review | 6 | 5 |
| Test More | 7 | 11 |
| Watch | 10 | 3 |

## Worst 10 Mismatches

| row | business | creative | current | expected | severity | why |
| --- | --- | --- | --- | --- | --- | --- |
| row-014 | live-company-01 | live-company-01-creative-04 | Refresh | Scale Review | critical | relative_winner_not_promoted |
| row-016 | live-company-01 | live-company-01-creative-06 | Refresh | Scale Review | critical | relative_winner_not_promoted |
| row-041 | live-company-04 | live-company-04-creative-03 | Refresh | Cut | high | refresh_softened_cut_candidate |
| row-042 | live-company-04 | live-company-04-creative-04 | Watch | Refresh | high | watch_hiding_refresh_candidate |
| row-043 | live-company-04 | live-company-04-creative-05 | Refresh | Cut | high | refresh_softened_cut_candidate |
| row-044 | live-company-04 | live-company-04-creative-06 | Watch | Refresh | high | watch_hiding_refresh_candidate |
| row-046 | live-company-04 | live-company-04-creative-08 | Refresh | Cut | high | refresh_softened_cut_candidate |
| row-048 | live-company-04 | live-company-04-creative-10 | Watch | Refresh | high | watch_hiding_refresh_candidate |
| row-069 | pdf-company-02 | pdf-company-02-creative-01 | Watch | Refresh | high | watch_hiding_refresh_candidate |
| row-074 | pdf-company-02 | pdf-company-02-creative-06 | Watch | Refresh | high | watch_hiding_refresh_candidate |

## Direct Answers

1. Better than manual table reading: **not reliably**. It helps on some obvious Scale Review/Cut rows, but the mismatch set still contains enough winner/loser misses that a buyer would need to re-read the table manually.
2. Identifies scale candidates: **partially**. It surfaces several review-only winners, but blind agents still flag missed or under-qualified scale-review boundaries.
3. Identifies cut candidates: **partially**. Mature zero-purchase and some below-baseline losers are caught, but the panel still finds Refresh/Watch hiding Cut-shaped waste.
4. Overuses passive states: **yes**. Watch/Test More/Refresh absorb rows that agents would treat as decisive action candidates.
5. Protect hiding winners: **not the dominant current problem**; current misses are more often Watch/Refresh boundary failures.
6. Not Enough Data hiding losers: **still present at low-to-mid spend**, especially when evidence is technically thin but spend/purchase context is enough for a buyer to act.
7. Watch hiding clear action: **yes**. This remains one of the strongest failure patterns.
8. Commercial Truth over-gating relative winners: **partially**. True Scale safety is correct, but the review-only winner story remains too dependent on multiple floors.
9. Campaign/test context: **inconsistent**. Test-like campaigns are present, but active test losers/winners are not always made decisive enough.
10. Taxonomy: the six-primary UI direction helps readability, but it does not fix the underlying winner/loser decision quality.

## Old Challenger

The old challenger is useful as a comparison-only smoke signal, especially
where it independently points at obvious pause/cut or scale-like cases. It is
not reliable enough to become policy authority. In this review it helps flag
rows for attention, but the blind media-buyer expected segment is derived from
raw metrics and baseline context, not from old-rule output.

## Architecture Assessment

The current architecture is salvageable at the safety, provenance, benchmark,
and instruction layers. The weak part is the first-pass creative action
classifier. The review does not support another isolated threshold patch as
the next move, because high and critical mismatches are spread across:

- relative winners softened into Refresh
- Refresh hiding Cut-shaped waste
- Watch hiding Refresh-shaped action
- thin-evidence rows overclassified as Test More / Refresh
- eligibility statuses not translating cleanly into media-buyer decisions

That pattern points to a baseline-first rebuild of the classifier layer, not a
full system rewrite.

## Recommended Next Move

Recommended path: **baseline-first rebuild**.

The next implementation task should not be another one-row threshold patch. Build a parallel baseline-first media-buyer classifier that starts from raw account/campaign peer comparison, then assigns winner / loser / runway / protect / diagnose before lifecycle smoothing. Compare it against the existing Decision OS on this artifact and promote only fixture-backed rules.

Exact first implementation task:

- add a parallel report-only `creative-media-buyer-action-classifier`
- feed it raw metrics, account/campaign baselines, trend, CPA, active/test context, evidence maturity, and Commercial Truth availability
- emit candidate action classes plus reason tags before lifecycle smoothing
- run it against this sanitized artifact and convert only repeated high-confidence misses into fixtures
