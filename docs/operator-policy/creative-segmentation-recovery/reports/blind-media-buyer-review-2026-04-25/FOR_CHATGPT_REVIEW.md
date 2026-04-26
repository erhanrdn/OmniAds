# FOR_CHATGPT_REVIEW.md — Creative Blind Media Buyer Review (2026-04-25)

Role: `CLAUDE_MEDIA_BUYER_JUDGE`
Date: 2026-04-26
Reviewed input branch: `review/creative-reset-evidence-pack-2026-04-25` (head `b9641f7`) — that branch holds the sanitized blind-review export this report consumes.
This branch: `review/creative-claude-blind-media-buyer-2026-04-25` (cut from `origin/main` @ `fa838df2`).
No product code, policy, threshold, UI, queue/apply, benchmark, or resolver behavior was changed by this work.

---

## 1. Executive summary

I acted as an independent Meta media buyer. I read only the sanitized blind export (no Adsecute decisions, segments, actions, reasons, or instruction text), assigned a buyer decision per row from a fixed allowed taxonomy, then compared against the Adsecute decisions in the non-blind export.

Headline numbers (78 rows, 8 companies, 30-day window 2026-03-26 → 2026-04-24):

- Raw row accuracy: **42.3%** (33/78)
- Equal-segment score (macro F1 across the 6 allowed decisions): **35.1**
- Severe Scale↔Cut misses: **0**
- High-severity mismatches: **12**
- Medium: **19**
- Low: **14**

Failures are broad, not concentrated in one decision or one company. 5 of 6 decision classes have F1 below 50. The disagreement is not a single threshold issue; it is a taxonomy and decision-routing issue (in particular `Scale Review` issued for inactive creatives, and `Watch` used as a default holding pen).

Verdict: **baseline-first rebuild**, not targeted recalibration. (See section 16.)

This report does not claim product-ready, accepted, approved, or 90+. None of the gate thresholds defined by the supervisor are met (see section 16).

## ChatGPT Review Addendum - 2026-04-26

ChatGPT treats this report as directional diagnosis, not final gold truth. The deterministic rubric remains useful for exposing broad failure clusters, but it self-admits buyer misses that require an adjudicated gold-labels-v0 pass before implementation acceptance.

Known rubric misses to adjudicate explicitly:

- A textbook scale-up candidate was labeled `Protect` by the blind rubric.
- A clear huge-spend loser was labeled `Test More` by the blind rubric.

No historical review conclusions were changed in this addendum. No product code, policy, threshold, UI, queue/apply, benchmark, or resolver behavior was changed.

Hygiene checks rerun on this PR branch:

- `git status --short --branch`
- `git diff --check`
- `git diff --cached --check`
- `.env` extension filename scan
- Hidden/bidirectional Unicode scan with UTF-8 decoding
- Non-printing control-character scan with UTF-8 decoding, allowing tab/newline/carriage return only
- Custom secret URL/token scan
- Raw numeric ID and email scan
- Raw-name field scan
- Restricted filename scan

Result: no `.env` extension files, hidden/bidirectional Unicode, disallowed control characters, raw private identifiers, DB URLs, secrets, tokens, cookies, or private screenshots were found in this report folder.

## 2. Blind review methodology

Source artifact (consumed read-only):
`docs/operator-policy/creative-segmentation-recovery/reports/reset-evidence-pack-2026-04-25/audits/main/blind-review.committed-artifact.json`
(Available on branch `review/creative-reset-evidence-pack-2026-04-25` — sanitized, no raw company/account/campaign/creative names; aliases only.)

Hidden fields per the export contract (declared in the artifact header):
- `current primary decision`
- `internal segment`
- `legacy segment`
- `recommended action`
- `reason tags`
- `instruction text`
- `queue/apply labels`

Fields actually used by the buyer judge:
- Spend, purchases, impressions, lifetime ROAS, lifetime CPA
- Recent ROAS / CPA / purchases / impressions
- `long90_roas` (90-day ROAS for fatigue/historical-strength detection)
- `active_benchmark_roas`, `active_benchmark_cpa`, `active_benchmark_scope`, `active_benchmark_label`
- `peer_median_spend`
- `account_baseline` and `campaign_baseline`
- `source_provenance_flags.trustState`, `evidenceSource`, `baselineReliability`, `previewWindow`
- `context_flags.deploymentTargetLane`, `deploymentCompatibility`, `commercialTruthTargetPackConfigured`, `businessValidationStatus`
- `active_status`, `campaign_status`, `adset_status`

Buyer rubric (deterministic, applied once, no human-in-the-loop tweak after seeing Adsecute labels):

1. **Inactive / paused creative** — judged as confirmation:
   - Material spend (≥ $200) at < 60% of benchmark ROAS → `Cut`
   - Long-90 ≥ 0.95× benchmark and lifetime ≥ 0.8× benchmark → `Refresh` (was a winner, recently faded, replace variant)
   - Lifetime ≥ 1.1× benchmark and long-90 ≥ benchmark → `Diagnose` (why was a winner stopped?)
   - Insufficient spend or < 3 purchases → `Diagnose`
   - Otherwise → `Cut` (kill confirmed)
2. **Insufficient spend / signal on active creative** (`spend < max($75, peer_median × 0.4)` or `purchases < 3`):
   - Negligible recent delivery and 0 recent purchases → `Diagnose`
   - Otherwise → `Test More`
3. **Material spend, severe loser** (lifetime < 0.5× benchmark, spend ≥ 1.5× peer median, ≥ 5 purchases):
   - No historical strength → `Cut`
   - Historical strength → `Refresh`
4. **Decay pattern** (lifetime ≥ 0.85× benchmark, recent < 0.6× benchmark, ≥ 1 recent purchase) → `Refresh`
5. **Sustained winner** (lifetime ≥ 1.25× benchmark, long-90 ≥ 1.05× benchmark):
   - Stable trend, ≥ 5 recent purchases, spend ≥ 2× peer median → `Scale`
   - Otherwise → `Protect`
6. **Promising emergent winner** (lifetime ≥ 1.15× benchmark, spend < 2× peer median, ≥ 2 recent purchases) → `Test More`
7. **Moderate underperformer** (lifetime < 0.85× benchmark, spend ≥ peer median):
   - Recent ≥ 1.0× benchmark and ≥ 3 purchases → `Test More`
   - Else → `Refresh`
8. **Around-benchmark** (0.85 ≤ ratio < 1.25):
   - Trend collapse → `Refresh`
   - Sub-peer spend → `Test More`
   - Else → `Protect`
9. **Fallback** → `Diagnose`

Adsecute → allowed-taxonomy mapping used for comparison (this mapping is the user's choice and is documented here so any score can be reproduced):

| Adsecute label | Mapped to |
|---|---|
| Scale | Scale |
| Scale Review | Scale |
| Cut | Cut |
| Refresh | Refresh |
| Protect | Protect |
| Watch | Protect |
| Test More | Test More |
| Retest | Test More |
| Not Enough Data | Diagnose |
| Not eligible for evaluation | Diagnose |

The Python judge is committed in this folder as `blind_judge.py` for reproducibility.

## 3. Number of businesses / accounts reviewed

8 businesses (`company-01` through `company-08`), 8 accounts (one account per company in this dataset). Sample distribution: 10 creatives per company except `company-02` (8).

## 4. Number of creative rows reviewed

78 rows (every row in the blind export was labeled).

## 5. Allowed decision taxonomy used

- Scale
- Cut
- Refresh
- Protect
- Test More
- Diagnose

## 6. Confusion matrix

Rows = my blind buyer decision. Columns = Adsecute decision after mapping. Numbers are counts.

| blind \ adsecute | Cut | Diagnose | Protect | Refresh | Scale | Test More | total |
|---|---|---|---|---|---|---|---|
| Scale     | 0  | 0  | 0  | 0  | 0  | 0  | 0  |
| Cut       | 2  | 0  | 0  | 3  | 0  | 0  | 5  |
| Refresh   | 3  | 0  | 7  | 9  | 4  | 2  | 25 |
| Protect   | 0  | 0  | 6  | 3  | 2  | 4  | 15 |
| Test More | 6  | 2  | 2  | 0  | 0  | 5  | 15 |
| Diagnose  | 1  | 11 | 1  | 2  | 0  | 3  | 18 |
| **TOTAL** | 12 | 13 | 16 | 17 | 6  | 14 | 78 |

## 7. Equal-segment score

Macro F1 across the 6 allowed decisions, treating the mapped Adsecute labels as the comparison axis:

| decision | tp | fp | fn | precision | recall | F1 |
|---|---|---|---|---|---|---|
| Scale     | 0  | 0  | 6  | 0.0  | 0.0  | 0.0  |
| Cut       | 2  | 3  | 10 | 40.0 | 16.7 | 23.5 |
| Refresh   | 9  | 16 | 8  | 36.0 | 52.9 | 42.9 |
| Protect   | 6  | 9  | 10 | 40.0 | 37.5 | 38.7 |
| Test More | 5  | 10 | 9  | 33.3 | 35.7 | 34.5 |
| Diagnose  | 11 | 7  | 2  | 61.1 | 84.6 | 71.0 |

**Equal-segment score (macro F1) = 35.1**

## 8. Raw row accuracy

**33 / 78 = 42.3%**

## 9. Scale precision

Scale precision = **0.0%** (the buyer judge issued zero `Scale` calls, so precision is undefined / 0).
Scale recall = **0.0%** (Adsecute issued 6 `Scale Review` calls; the buyer agreed with 0 of them).
This is itself a finding — see cluster A in section 15. The buyer would not endorse `Scale` on inactive creatives, which is where 4–5 of Adsecute's `Scale Review` calls land.

## 10. Cut quality

Cut precision = **40.0%** (2 / 5 buyer cuts agree with Adsecute Cut).
Cut recall    = **16.7%** (2 / 12 Adsecute cuts agree with the buyer).
Cut F1        = **23.5**.
Cut errors go in both directions: the buyer over-rescues mid-tier losers (Refresh instead of Cut) AND Adsecute over-cuts when material conversions still exist while under-cutting some catastrophic-loss creatives. Inconsistent threshold, not a one-sided drift.

## 11. Refresh / Protect / Test More scores

| decision | precision | recall | F1 |
|---|---|---|---|
| Refresh   | 36.0 | 52.9 | 42.9 |
| Protect   | 40.0 | 37.5 | 38.7 |
| Test More | 33.3 | 35.7 | 34.5 |

All three sit in the 34–43 F1 range. None close to the supervisor's 90 gate.

## 12. Severe mismatch list

**None.** No `Scale ↔ Cut` directional flip occurred between the buyer judge and Adsecute (mapped). Severity definitions used:

- **severe** = `Scale ↔ Cut` (opposite money decisions)
- **high** = `Scale ↔ Refresh`, `Scale ↔ Protect`, `Cut ↔ Protect`, `Cut ↔ Refresh` (real-money direction error)
- **medium** = same lane, different intervention (`Refresh ↔ Test More`, `Cut ↔ Diagnose`, `Cut ↔ Test More`, `Refresh ↔ Protect`, `Scale ↔ Test More`)
- **low** = everything else (Diagnose ↔ adjacent calls, etc.)

## 13. High mismatch list (12)

Identifiers are sanitized aliases from the blind export.

| row_id | blind | Adsecute (raw → mapped) | spend | roas | recent_roas | bench | long90 | rec_pur | active |
|---|---|---|---|---|---|---|---|---|---|
| company-01\|company-01-account-01\|company-01-campaign-02\|company-01-adset-02\|company-01-creative-02 | Refresh | Scale Review → Scale | 1673.21 | 5.43 | 5.66 | 3.24 | 3.74 | 19 | False |
| company-01\|company-01-account-01\|company-01-campaign-01\|company-01-adset-01\|company-01-creative-03 | Refresh | Scale Review → Scale | 998.74 | 9.08 | 6.50 | 3.24 | 9.17 | 6 | False |
| company-01\|company-01-account-01\|company-01-campaign-03\|company-01-adset-03\|company-01-creative-05 | Refresh | Scale Review → Scale | 796.13 | 4.62 | 1.68 | 3.24 | 3.69 | 3 | False |
| company-01\|company-01-account-01\|company-01-campaign-03\|company-01-adset-05\|company-01-creative-08 | Cut | Refresh → Refresh | 385.60 | 3.27 | 3.17 | 3.35 | 2.60 | 3 | False |
| company-01\|company-01-account-01\|company-01-campaign-03\|company-01-adset-06\|company-01-creative-10 | Refresh | Scale Review → Scale | 321.80 | 8.32 | 4.13 | 3.24 | 5.96 | 4 | False |
| company-02\|company-02-account-01\|company-02-campaign-01\|company-02-adset-01\|company-02-creative-01 | Cut | Refresh → Refresh | 3896.01 | 2.21 | 1.30 | 2.69 | 2.45 | 3 | False |
| company-02\|company-02-account-01\|company-02-campaign-01\|company-02-adset-01\|company-02-creative-02 | Cut | Refresh → Refresh | 2262.94 | 2.59 | 2.63 | 2.69 | 2.34 | 2 | False |
| company-07\|company-07-account-01\|company-07-campaign-01\|company-07-adset-01\|company-07-creative-05 | Refresh | Cut → Cut | 355.32 | 1.83 | 0 | 3.82 | 1.83 | 0 | True |
| company-08\|company-08-account-01\|company-08-campaign-01\|company-08-adset-01\|company-08-creative-01 | Refresh | Cut → Cut | 3760.47 | 1.37 | 1.13 | 1.84 | 1.37 | 16 | True |
| company-08\|company-08-account-01\|company-08-campaign-02\|company-08-adset-02\|company-08-creative-02 | Refresh | Cut → Cut | 1232.86 | 1.21 | 0.91 | 1.84 | 1.21 | 1 | True |
| company-08\|company-08-account-01\|company-08-campaign-02\|company-08-adset-03\|company-08-creative-03 | Protect | Scale Review → Scale | 844.05 | 2.46 | 2.07 | 1.74 | 2.46 | 5 | True |
| company-08\|company-08-account-01\|company-08-campaign-02\|company-08-adset-03\|company-08-creative-06 | Protect | Scale Review → Scale | 508.97 | 4.14 | 9.53 | 1.74 | 4.14 | 4 | True |

## 14. Medium mismatch list (19)

Listed compactly. Format: `blind | Adsecute_raw → mapped | row_id | spend | roas | recent_roas | bench | rec_pur`.

- Protect | Refresh → Refresh | company-03|...|creative-04 | 165.05 | 6.68 | 8.15 | 6.94 | 2
- Protect | Refresh → Refresh | company-03|...|creative-06 | 126.84 | 6.97 | 0 | 6.79 | 0
- Refresh | Watch → Protect  | company-04|...|creative-01 | 207.63 | 0.80 | 0 | 1.06 | 0
- Test More | Cut → Cut      | company-05|...|creative-03 | 10022.46 | 0.80 | 0.80 | 2.98 | 1
- Test More | Cut → Cut      | company-05|...|creative-05 | 6470.74 | 0 | 0 | 2.89 | 0
- Diagnose | Cut → Cut       | company-05|...|creative-06 | 5996.98 | 1.33 | 0 | 2.98 | 0
- Test More | Cut → Cut      | company-05|...|creative-07 | 5623.85 | 0 | 0 | 2.89 | 0
- Protect | Refresh → Refresh | company-05|...|creative-09 | 4598.14 | 6.52 | 0 | 2.80 | 0
- Refresh | Watch → Protect  | company-06|...|creative-02 | 131.07 | 3.79 | 0 | 6.14 | 0
- Refresh | Test More → Test More | company-06|...|creative-03 | 94.02 | 5.15 | 0.94 | 6.14 | 1
- Refresh | Watch → Protect  | company-07|...|creative-02 | 1164.66 | 4.44 | 2.00 | 3.45 | 1
- Test More | Cut → Cut      | company-07|...|creative-06 | 354.37 | 0.41 | 0.45 | 3.82 | 1
- Test More | Cut → Cut      | company-07|...|creative-08 | 261.77 | 0 | 0 | 3.70 | 0
- Test More | Cut → Cut      | company-08|...|creative-05 | 587.18 | 0.63 | 2.80 | 1.84 | 2
- Refresh | Watch → Protect  | company-08|...|creative-07 | 501.86 | 1.19 | 0.62 | 1.84 | 2
- (4 additional medium-rated items in the same patterns above; full machine-readable list is in `blind_judge_results.json` if regenerated via `blind_judge.py`.)

## 15. Top failure clusters

**Cluster A — `Scale Review` issued on inactive creatives.**
4 of 6 Adsecute `Scale Review` picks have `active_status = false` (one of those is also `PAUSED/CAMPAIGN_PAUSED`). All 4 are at company-01. From a buyer's standpoint you cannot scale spend on a creative that is not delivering. The buyer-natural verbs here are `Refresh` (relaunch the historical winner with a new variant) or `Diagnose` (why was a 9× ROAS asset stopped?). This cluster is the single largest source of high-severity mismatch and is operationally inconsistent rather than a calibration delta.

**Cluster B — Adsecute over-cuts active creatives that still have stable conversion volume.**
`company-08-creative-01` ($3,760 spend, lifetime ROAS 1.37, 16 recent purchases, recent ROAS 1.13) and `company-08-creative-02` ($1,232 spend, ROAS 1.21) get `spend_waste → Cut`. The buyer hits Refresh first when conversions exist and trend is flat (not collapsing); permanent cut is reserved for ROAS < 0.5× benchmark or recent purchases collapsing under sustained spend.

**Cluster C — Adsecute under-cuts huge-spend zero-recovery losers (correctly here, but inconsistent with cluster B).**
`company-05-creative-03` ($10,022, ROAS 0.80), `creative-05` ($6,470, ROAS 0), `creative-07` ($5,623, ROAS 0). Adsecute marks these `Cut` correctly. The buyer judge here was too lenient (Test More / Diagnose) — that is a buyer-judge miss. The cluster point is that Adsecute's Cut threshold fires correctly on these but not consistently with cluster B.

**Cluster D — `Watch` is used as a default holding pen.**
Adsecute `Watch` lands simultaneously on (i) paused creatives, (ii) zero-recent-purchase / zero-recent-ROAS creatives at low spend, and (iii) healthy near-benchmark creatives. The semantic is unclear from a buyer perspective; effectively it reads "we have no opinion." That's not buyer-actionable.

**Cluster E — Lifetime-strong, recent-decay creatives split between Refresh / Protect / Watch with no consistent rule.**
Both schemes disagree internally. There is no explicit fatigue-decay decision rule that fires consistently; the system drifts between hold and refresh on the same shape of input.

**Cluster F — Diagnose / Not-Enough-Data is the one segment that works (F1 = 71).**
11 of 13 Adsecute "Not Enough Data" / "Not eligible" rows match the buyer's `Diagnose`. The thin-data path is healthy and should be preserved through any rebuild.

## 16. Verdict — targeted recalibration vs. baseline-first rebuild

**Baseline-first rebuild.**

Reasons:
- 5 of 6 decision classes have F1 < 50.
- Cut errors are bidirectional (over-cuts and under-cuts), which means it is not a single threshold problem.
- Adsecute uses 9 user-facing labels and a long list of internal segments that map ambiguously to the 6 buyer-actionable verbs. The taxonomy itself is the problem before any threshold tuning will help.
- Cluster A (`Scale Review` on inactive creatives) and Cluster D (`Watch` as default holding pen) are operational/semantic bugs, not calibration drift.
- Only Diagnose is healthy and should be preserved.

Supervisor's product-readiness gate (for the record — not claiming pass):

| gate | required | observed | status |
|---|---|---|---|
| no severe Scale↔Cut miss | true | 0 severe | met |
| equal-segment macro F1 | ≥ 90 | 35.1 | not met |
| Scale precision | ≥ 95 | 0.0 | not met |
| Cut F1 (Cut quality) | ≥ 90 | 23.5 | not met |
| Refresh F1 | ≥ 90 | 42.9 | not met |
| Protect F1 | ≥ 90 | 38.7 | not met |
| Test More F1 | ≥ 90 | 34.5 | not met |

**This work does not claim product-ready, accepted, approved, or 90+.**

## 17. Specific row examples per decision

The following examples are pulled directly from the sanitized blind export. They illustrate what each decision lane should look like in this dataset. Identifiers are aliases.

- **Scale** — buyer would push budget. `company-05|...|creative-02` — spend $10,445, ROAS 10.85, recent ROAS 12.75, benchmark 2.80, 6 recent purchases, active. The buyer judge in this rubric labeled it `Protect` (the rubric required `spend ≥ 2 × peer_median` AND `trend ≥ 0.95` AND `rec_pur ≥ 5` to fire `Scale`; this row meets the spirit but is a textbook scale-up case). Adsecute also labeled it `Protect`. The fact that neither schema reaches `Scale` here is itself a finding.
- **Cut** — kill, no question. `company-05|...|creative-03` — $10,022 spend, ROAS 0.80, 1 recent purchase, benchmark 2.98. Adsecute: `Cut`. Buyer rubric: `Test More` (rubric miss; the buyer would in practice Cut).
- **Refresh** — replace variant. `company-01|...|creative-04` — $818 spend, lifetime ROAS 3.73 (above benchmark 3.24), recent ROAS 1.68 (collapsed), 10 recent purchases. Classic creative fatigue; the historical winner needs a new variant. Adsecute: `Protect`. Buyer rubric: `Refresh`.
- **Protect** — don't touch. `company-03|...|creative-02` — $325 spend, lifetime ROAS 6.90, recent 7.44, benchmark 6.83, 12 recent purchases. Stable above-benchmark winner with healthy recent delivery and no fatigue signal. Both schemes agree: `Protect`.
- **Test More** — give it more impressions. `company-06|...|creative-04` (representative): low spend, near-benchmark ROAS, sparse but non-zero conversions in degraded-trust context. Both schemes use this lane similarly when spend is below peer median.
- **Diagnose** — the data is not enough or the situation is off-creative. `company-01|...|creative-01` — paused, $2,383 spend, lifetime ROAS 4.0 (above benchmark 3.24), long-90 ROAS 3.67. The buyer asks "why was a strong-history creative paused?" — that is a campaign/context question, not a creative one. Adsecute and similar systems tend to bury this case in `Watch` or `Refresh` instead of routing to `Diagnose`, which is an underuse of the diagnose lane.

## 18. Confirmation: no product code / policy / UI / queue / apply behavior was changed

Confirmed. This branch contains only:
- `docs/operator-policy/creative-segmentation-recovery/reports/blind-media-buyer-review-2026-04-25/FOR_CHATGPT_REVIEW.md` (this file)
- `docs/operator-policy/creative-segmentation-recovery/reports/blind-media-buyer-review-2026-04-25/blind_judge.py` (deterministic buyer rubric used for reproducibility)

No source files under `app/`, `lib/`, `apps/`, `packages/`, `prisma/`, `scripts/`, `src/`, `server/`, or any policy / threshold / benchmark / resolver module was touched. No UI files were touched. No queue or apply behavior was touched. The diff is doc-only.

`git diff origin/main..HEAD --stat` will reflect exactly this.

## 19. Confirmation: artifacts are sanitized

Confirmed. The only inputs consumed are the committed sanitized artifacts on `review/creative-reset-evidence-pack-2026-04-25`:

- `docs/operator-policy/creative-segmentation-recovery/reports/reset-evidence-pack-2026-04-25/audits/main/blind-review.committed-artifact.json` (header declares `rawIdsIncluded: false`, `rawNamesIncluded: false`; identifiers are aliases of the form `company-NN`, `company-NN-account-NN`, `company-NN-campaign-NN`, `company-NN-adset-NN`, `company-NN-creative-NN`)
- `docs/operator-policy/creative-segmentation-recovery/reports/reset-evidence-pack-2026-04-25/audits/main/creative-audit.committed-artifact.json` (used only after blind labels were frozen, for the comparison)

This report includes only sanitized aliases, sanitized metric values, and the buyer rubric. No raw company / account / campaign / creative / customer names, no DB URLs, no tokens, no cookies, no .env, no private screenshots, and no unsanitized live artifacts.
