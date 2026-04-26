# FOR_CHATGPT_REVIEW.md - Creative Decision OS Adjudicated Gold Labels v0

Role: CLAUDE_MEDIA_BUYER_JUDGE
Date: 2026-04-26
Branch: review/creative-decision-os-gold-labels-v0-2026-04-26 (cut from origin/main @ fa838df2)
Inputs:
- review/creative-reset-evidence-pack-2026-04-25 (PR #75) - sanitized 78-row evidence artifact
- review/creative-claude-blind-media-buyer-2026-04-25 (PR #76) - blind buyer review

This is gold v0. It is NOT product-ready, NOT accepted, NOT approved, NOT 90+. It is the adjudicated buyer label set against which v2 candidates should be measured. ChatGPT remains decision owner.

No product code, policy, threshold, UI, queue, apply, benchmark, or resolver behavior was changed by this work. Diff = 3 docs-only files.

All artifacts are sanitized: the only inputs consumed are the committed sanitized artifacts on PR #75 (`rawIdsIncluded: false`, `rawNamesIncluded: false`; identifiers are aliases like `company-NN`). All output identifiers are the same aliases. JSON output is written with `ensure_ascii=True`. Markdown and Python files are pure ASCII.

---

## 1. Final gold distribution by decision

| decision   | count |
|------------|-------|
| Scale      | 1     |
| Cut        | 4     |
| Refresh    | 21    |
| Protect    | 14    |
| Test More  | 16    |
| Diagnose   | 22    |
| **total**  | 78    |

For comparison, current Adsecute (mapped to the 6-decision allowed taxonomy):

| decision   | count |
|------------|-------|
| Scale      | 6     |
| Cut        | 12    |
| Refresh    | 17    |
| Protect    | 16    |
| Test More  | 14    |
| Diagnose   | 13    |

Adsecute -> allowed-taxonomy mapping used: `Scale Review -> Scale`, `Watch -> Protect`, `Retest -> Test More`, `Not Enough Data` / `Not eligible for evaluation` -> `Diagnose`. Identity for the rest. (Note: `Watch` and `Scale Review` themselves are not allowed as primary v2 decisions per supervisor; the mapping is only used for scoring the current system against gold.)

## 2. Current Adsecute vs gold confusion matrix

Rows = gold v0 adjudicated decision. Columns = current Adsecute decision after mapping. Counts.

| gold \ adsecute | Scale | Cut | Refresh | Protect | Test More | Diagnose | total |
|---|---|---|---|---|---|---|---|
| Scale     | 0 | 0  | 0 | 1 | 0 | 0  | 1  |
| Cut       | 0 | 3  | 1 | 0 | 0 | 0  | 4  |
| Refresh   | 2 | 2  | 9 | 6 | 2 | 0  | 21 |
| Protect   | 1 | 0  | 3 | 6 | 4 | 0  | 14 |
| Test More | 1 | 6  | 0 | 2 | 5 | 2  | 16 |
| Diagnose  | 2 | 1  | 4 | 1 | 3 | 11 | 22 |
| **total** | 6 | 12 | 17| 16| 14| 13 | 78 |

Per-decision precision / recall / F1 (current Adsecute scored against gold v0):

| decision   | tp | fp | fn | precision | recall | F1   |
|------------|----|----|----|-----------|--------|------|
| Scale      | 0  | 6  | 1  | 0.0       | 0.0    | 0.0  |
| Cut        | 3  | 9  | 1  | 25.0      | 75.0   | 37.5 |
| Refresh    | 9  | 8  | 12 | 52.9      | 42.9   | 47.4 |
| Protect    | 6  | 10 | 8  | 37.5      | 42.9   | 40.0 |
| Test More  | 5  | 9  | 11 | 35.7      | 31.2   | 33.3 |
| Diagnose   | 11 | 2  | 11 | 84.6      | 50.0   | 62.9 |

Macro F1 (current Adsecute vs gold v0): 36.84

## 3. Severity counts vs current Adsecute

Severity definitions:
- severe: Scale <-> Cut directional flip
- high:   Scale <-> Refresh, Scale <-> Protect, Cut <-> Protect, Cut <-> Refresh
- medium: same lane / different intervention (Refresh <-> Test More, Cut <-> Diagnose, Cut <-> Test More, Refresh <-> Protect, Scale <-> Test More)
- low:    everything else

| severity | count |
|----------|-------|
| severe   | 0     |
| high     | 7     |
| medium   | 19    |
| low      | 18    |

### Severe mismatch list

None. (Gold v0 has 0 Scale<->Cut directional flips against current Adsecute.)

### High mismatch list (7 rows)

| row_id | gold | adsecute | spend | roas | recent_roas | bench | long90 | rec_pur | active |
|---|---|---|---|---|---|---|---|---|---|
| company-01\|...\|company-01-creative-02 | Refresh | Scale Review | 1673 | 5.43 | 5.66 | 3.24 | 3.74 | 19 | False |
| company-01\|...\|company-01-creative-05 | Refresh | Scale Review | 796  | 4.62 | 1.68 | 3.24 | 3.69 | 3  | False |
| company-03\|...\|company-03-creative-01 | Cut     | Refresh      | 749  | 0.77 | 0.00 | 6.94 | 1.55 | 0  | True  |
| company-05\|...\|company-05-creative-02 | Scale   | Protect      | 10446| 10.85| 12.75| 2.80 | 8.72 | 6  | True  |
| company-08\|...\|company-08-creative-01 | Refresh | Cut          | 3760 | 1.37 | 1.13 | 1.84 | 1.37 | 16 | True  |
| company-08\|...\|company-08-creative-02 | Refresh | Cut          | 1233 | 1.21 | 0.91 | 1.84 | 1.21 | 1  | True  |
| company-08\|...\|company-08-creative-03 | Protect | Scale Review | 844  | 2.46 | 2.07 | 1.74 | 2.46 | 5  | True  |

### Medium mismatch list

19 rows. The full list with per-row detail is in `gold-labels-v0.json` under `rows[*]` where `severity_vs_adsecute == "medium"`. Top patterns:

- gold Test More vs Adsecute Cut on huge-spend losers (company-05 cluster - 4 rows where gold also confirms severe loss but routes through Test More because of borderline thresholds; see also section 4 cluster B).
- gold Refresh vs Adsecute Watch / Test More on lifetime-strong recent-decay rows.
- gold Diagnose vs Adsecute Refresh / Test More on inactive historical-winner rows where the buyer asks "why was it stopped" first.

### Low mismatch list

18 rows. Mostly Diagnose <-> adjacent (Refresh / Watch / Test More) and Refresh <-> Protect on near-benchmark rows. Operationally interchangeable.

## 4. Top failure clusters in current Adsecute (per gold v0)

**Cluster A - Scale Review on inactive creatives.**
Adsecute issues `Scale Review` for 4 inactive creatives at company-01 (creative-02, creative-03, creative-05, creative-10). Operationally invalid: a paused asset cannot be scaled. Gold v0 routes these to `Refresh` (relaunch with new variant) when the long-90 strength supports it, or to `Diagnose` (`campaign-context` problem class) when long-90 is materially above benchmark and the buyer needs to know WHY the asset was stopped.

**Cluster B - Cut threshold inconsistency on active creatives with material conversion volume.**
Adsecute Cut fires on `company-08-creative-01` ($3,760 spend, 16 recent purchases, ROAS 0.74x bench) and `company-08-creative-02` ($1,233 spend, 1 recent purchase, ROAS 0.66x bench). Gold v0 applies supervisor rule 7 - active creatives with material recent conversions below benchmark should generally Refresh before Cut unless loss is severe and sustained. Gold = Refresh. Note: the same Adsecute Cut threshold also misses the huge-spend company-05 losers in cluster C - showing the Cut rule is not consistently calibrated.

**Cluster C - Adsecute under-cuts huge-spend zero-recovery losers (correctly here, but the gold rubric was too lenient).**
`company-05-creative-03` ($10,022 spend, ROAS 0.80, 1 recent purchase), `creative-05` ($6,470, ROAS 0), `creative-07` ($5,623, ROAS 0). Adsecute marks these `Cut` correctly. Gold also routes to `Cut` via the new "huge-spend severe loser" branch - this cluster is now fixed in the rubric, and the v0 rubric's prior `Test More` miss has been adjudicated to `Cut`.

**Cluster D - Watch as default holding pen.**
Adsecute `Watch` lands across paused creatives, zero-recent / zero-ROAS active creatives, and healthy near-benchmark creatives. Gold v0 routes Watch-shaped rows to `Refresh`, `Test More`, `Diagnose`, or `Protect` per the actual signal shape. `Watch` is not a primary decision in gold v0 (per supervisor rule).

**Cluster E - Lifetime-strong / recent-decay rows.**
Active creatives with lifetime ROAS >= benchmark but recent ROAS at <0.55x of benchmark with conversions still flowing. Gold v0 introduces an explicit Refresh rule for this pattern. Adsecute splits these between `Watch`, `Protect`, and `Refresh` inconsistently.

**Cluster F - Paused-creative routing.**
Gold v0 separates paused creatives into four explicit outcomes: severe-loss Cut (direct), historical-big-winner Diagnose (`campaign-context`), recent-or-long-90-strong Refresh (`review_only`), and thin-data Diagnose. The current Adsecute system routes most paused creatives through `Refresh` / `Watch` without the campaign-context split.

## 5. Explicit acceptance that this is gold v0, not product-ready

This file and the accompanying `gold-labels-v0.json` are gold v0. They are the buyer-adjudicated labels that v2 implementation candidates should be scored against. They are not, and do not claim to be:

- product-ready
- accepted by ChatGPT
- approved by the supervisor
- a 90+ system

Limitations of gold v0:
- It is one buyer judge (Claude Code) doing adjudication, not a multi-buyer panel.
- Some borderline rows (Refresh vs Cut on company-08-creative-02 with thin recent volume; Protect vs Test More vs Scale on emergent winners) reflect a single buyer judgment call. ChatGPT may overrule any specific row.
- The adjudication is limited to the supervisor-allowed 6-decision taxonomy and the 4-value actionability axis. Any domain-specific override (e.g., known stock-out, seasonal launch, brand campaign) cannot be reflected from the sanitized data alone.
- 6 rows are explicitly flagged as needing human / business context (see section 6).
- Macro F1 of current Adsecute vs gold = 36.84. This is the *current system's* score against gold, not the gold's own score.

Treat gold v0 as directional: high-severity buyer disagreement is real and should not be ignored, but individual row labels remain debatable.

## 6. Rows needing human / business context

These rows were labeled `Diagnose` with `problem_class != "creative"` because the data alone cannot decide them. ChatGPT or the operator should provide business context before any apply/queue is performed.

| row_id | reason |
|---|---|
| company-01\|...\|company-01-creative-03 | Paused but long-90 ROAS materially above benchmark - investigate why it was stopped (account/policy/exhausted audience) before declaring next move. |
| company-01\|...\|company-01-creative-10 | Same - paused historical winner. |
| company-02\|...\|company-02-creative-04 | Same - paused historical winner. |
| company-02\|...\|company-02-creative-06 | Same - paused historical winner. |
| company-03\|...\|company-03-creative-07 | Mixed signals - benchmark and trend disagree; needs business context. |
| company-07\|...\|company-07-creative-10 | Mixed signals - needs business context. |

## 7. Confirmation: no product code changed

Confirmed. This branch contains only:
- `docs/operator-policy/creative-segmentation-recovery/reports/gold-labels-v0-2026-04-26/FOR_CHATGPT_REVIEW.md` (this file)
- `docs/operator-policy/creative-segmentation-recovery/reports/gold-labels-v0-2026-04-26/gold-labels-v0.json` (machine-readable gold)
- `docs/operator-policy/creative-segmentation-recovery/reports/gold-labels-v0-2026-04-26/gold_labels.py` (deterministic adjudicator for reproducibility)

No source files under `app/`, `lib/`, `apps/`, `packages/`, `prisma/`, `scripts/`, `src/`, `server/`, or any policy / threshold / benchmark / resolver / queue / apply / UI module was touched. `git diff origin/main..HEAD --stat` reflects exactly these three files.

## 8. Confirmation: artifacts sanitized

Confirmed. The only inputs consumed are the committed sanitized artifacts on `review/creative-reset-evidence-pack-2026-04-25`:

- `docs/operator-policy/creative-segmentation-recovery/reports/reset-evidence-pack-2026-04-25/audits/main/blind-review.committed-artifact.json` (header declares `rawIdsIncluded: false`, `rawNamesIncluded: false`; identifiers are aliases of the form `company-NN`, `company-NN-account-NN`, etc.)
- `docs/operator-policy/creative-segmentation-recovery/reports/reset-evidence-pack-2026-04-25/audits/main/creative-audit.committed-artifact.json` (used only for severity comparison against current Adsecute decisions, after gold labels were finalized)

Output sanitization:
- `gold-labels-v0.json` is generated with `ensure_ascii=True` - 0 non-ASCII bytes, 0 bidi/control codepoints.
- `gold_labels.py` is pure ASCII - 0 non-ASCII bytes.
- This markdown file is pure ASCII.

No raw company/account/campaign/creative/customer names, no DB URLs, no tokens, no cookies, no `.env`, no `summary.env`, no private screenshots, no unsanitized live artifacts. No `.env`-extension files in this branch.

---

## Per-row schema (from gold-labels-v0.json)

Each entry in `rows[*]` contains:

- `row_id` (sanitized alias)
- `company_identifier`, `campaign_identifier`, `creative_identifier`
- `active_status`, `campaign_status`, `adset_status`
- raw metric carryover for review: `spend`, `roas`, `recent_roas`, `recent_purchases`, `long90_roas`, `active_benchmark_roas`, `peer_median_spend`, `trust_state`, `baseline_reliability`
- `rubric_blind_decision` - what the deterministic blind rubric from PR #76 said
- `adjudicated_primary_decision` - one of Scale / Cut / Refresh / Protect / Test More / Diagnose
- `actionability` - one of direct / review_only / blocked / diagnose
- `confidence` - 0..100
- `buyer_rationale` - one-sentence buyer explanation
- `problem_class` - one of creative / campaign-context / data-quality / insufficient-signal
- `differs_from_blind_rubric` - boolean
- `change_reason` - present whenever `differs_from_blind_rubric` is true; explains the buyer override
- `current_adsecute_decision_raw` - the original Adsecute label from the non-blind audit
- `current_adsecute_decision_mapped` - mapped to the 6-decision taxonomy
- `current_adsecute_internal_segment`, `current_adsecute_recommended_action` - carried for context
- `severity_vs_adsecute` - severe / high / medium / low / null

## Mandatory adjudication summary

Per the supervisor's instructions, the following rows received explicit re-evaluation:

- **Textbook scale-up: company-05|...|company-05-creative-02** - adjudicated to `Scale` with `actionability=review_only`. Spend $10,446 (1.19x peer median, materially above peer floor), ROAS 10.85 (3.88x benchmark), recent ROAS 12.75 (improving), long-90 8.72 (3.11x benchmark, sustained), 6 recent purchases. The blind rubric labeled this `Protect` because the strict `spend_vs_peer >= 2.0` gate did not fire. Override: when `bench_r >= 3.0` AND `long90 >= 1.5x bench` AND `rec_purchases >= 5` AND trend is healthy, peer-median-level spend is sufficient scalable evidence. Confidence 90.

- **Clear huge-spend loser: company-05|...|company-05-creative-03** - adjudicated to `Cut` with `actionability=direct`. Spend $10,022, ROAS 0.80 (0.27x benchmark), 1 recent purchase, no recovery. Confidence 95. The blind rubric labeled `Test More` and self-admitted the miss; gold v0 fixes this with an explicit "huge-spend severe loser" branch (`spend >= 4000 AND bench_r < 0.4 AND (rec_purchases <= 1 OR rec_roas < 0.4x bench)`).

- **All inactive Adsecute Scale Review rows** - re-evaluated. None are kept as `Scale`. Two routed to `Refresh` (`creative-02`, `creative-05`) because they show recent or long-90 strength; two routed to `Diagnose` (`creative-03`, `creative-10`) because long-90 is materially above benchmark and the buyer needs the campaign-context answer first.

- **All Adsecute Watch rows** - re-evaluated. None are kept as `Watch`. They route to `Refresh`, `Test More`, `Diagnose`, or `Cut` per actual signal shape.

- **All active Adsecute Cut rows with material recent conversions** - re-evaluated. `company-08-creative-01` (16 recent purchases) and `company-08-creative-02` (1 recent purchase) are re-routed to `Refresh` per supervisor rule 7. `company-08-creative-05` (2 recent purchases at 1.52x recent ROAS / lifetime 0.34x bench) stays at `Test More` because the recent recovery is real but lifetime drag warrants a runway before commitment.

- **All lifetime-strong / recent-decay rows** - re-evaluated. New explicit Refresh rule fires when `bench_r >= 0.95 AND bench_recent < 0.55 AND rec_purchases >= 1`.

## Override list (rows where gold v0 disagrees with the original blind rubric)

12 rows. Full detail in `gold-labels-v0.json[rows[*]].change_reason`. Summary:

- 4 rows: `Cut -> Refresh` on paused near-benchmark creatives with remaining viability signal.
- 4 rows: `Refresh -> Diagnose` on paused historical big winners (long-90 >= 1.2x benchmark) where the buyer needs the campaign-context answer first.
- 1 row: `Protect -> Scale` (textbook adjudication on company-05-creative-02).
- 1 row: `Refresh -> Cut` on active sub-60% benchmark losers with thin recent conversions and material spend (severe + sustained).
- 1 row: `Refresh -> Protect` on a sustained above-benchmark winner.
- 1 row: `Protect -> Test More` on an emergent winner with explosive recent trend but low recent volume.
