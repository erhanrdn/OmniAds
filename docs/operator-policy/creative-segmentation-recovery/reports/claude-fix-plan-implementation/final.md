# Claude Fix Plan Implementation

Date: 2026-04-25

Branch: `feature/adsecute-creative-claude-fix-plan-implementation`

## Executive Result

Claude's concrete fix plan was implemented narrowly. The pass improves the represented macro replay to `91/100`, but Creative Recovery is still not accepted because the supervisor target is `90+` for every represented segment and `Watch` remains below that floor at `83/100`.

This pass did not change taxonomy, Scale / Scale Review floors, queue/push/apply safety, benchmark scope authority, Commercial Truth, or old-rule challenger authority.

## Fresh Baseline

At branch start, the current `main` state was PR #63:

- macro replay: `87/100`
- raw replay accuracy: `87%`
- Watch: `75/100`
- Refresh: `84/100`
- Protect: `83/100`
- Test More: `83/100`
- Not Enough Data: `88/100`
- Cut recall: about `92%`

A fresh live-firm audit was rerun on this branch after the patch using the corrected Decision OS source path:

- readable businesses: `8`
- sampled creatives: `78`
- Scale: `0`
- Scale Review: `7`
- Test More: `7`
- Protect: `1`
- Watch: `11`
- Refresh: `20`
- Retest: `2`
- Cut: `11`
- Campaign Check: `0`
- Not Enough Data: `14`
- Not eligible for evaluation: `5`

The direct audit artifact was updated at `docs/operator-policy/creative-segmentation-recovery/reports/live-firm-audit/artifacts/sanitized-live-firm-audit.json`. The local private reference was written to `/tmp/adsecute-creative-live-firm-audit-local.json` and is not committed.

## Fixes Implemented

### Fix 1: Validating Trend-Collapse Refresh

Status: partially already fixed by PR #63; narrowed update applied.

The mature validating trend-collapse path already had evidence guards for spend maturity, purchases, impressions, and creative age. This pass widened the collapse threshold from `0.20` to `0.25` while preserving the existing evidence floor.

Result:

- mature validating + quarter-trend collapse -> `Refresh`
- very new / under-sampled validating dips -> not `Refresh`
- severe failure still routes to `Cut`

### Fix 2: CPA Blocker on Fatigued / Refresh-Replace

Status: already fixed by PR #61 and preserved.

Deterministic replay still routes the reviewed catastrophic CPA rows to `Cut`:

- `company-03 / company-03-creative-01` shape: CPA about `12.7x` median, ROAS about `0.11x` benchmark -> `Cut`
- `company-07 / company-07-creative-01` shape: CPA about `2.9x` median with zero recent read and below-benchmark ROAS -> `Cut`

No new broad CPA threshold was added for this path.

### Fix 3: NED-to-Cut for Mature One-Purchase Catastrophic CPA

Status: implemented.

Added a narrow `Cut` admission path for blocked/validating rows with:

- `1-3` purchases
- CPA at least `3.0x` peer median CPA
- ROAS at or below `0.4x` active benchmark
- spend at least `max(300, 2x peer median spend)`
- at least `8000` impressions
- creative age greater than `10` days

This prevents mature catastrophic CPA rows from remaining `Not Enough Data` solely because purchase count is low.

### Fix 4: Protect Trend-Collapse Sensitivity

Status: implemented.

Stable winners now use a tiered collapse rule:

- benchmark ratio `>= 1.0` and `< 1.4`: trend ratio `<= 0.50` can route to `Refresh`
- benchmark ratio `>= 1.4`: the stricter `<= 0.40` collapse threshold remains

This prevents mild above-baseline winners with meaningful recent collapse from staying passive `Protect`, while preserving strong winners that only have a moderate dip.

### Fix 5: Test More Thin-Spend Sensitivity

Status: implemented.

Under-sampled positives now need meaningful Test More evidence:

- spend at least `max(60, 0.5x peer median spend)`
- and either ROAS at least `0.8x` baseline or a strong relative signal

Thin-spend weak-ratio positives now remain `Not Enough Data` instead of `Test More`. Strong-relative thin-spend positives can still become `Test More`.

## High-Relative Watch Investigation

Sanitized trace: `company-05 / company-05-creative-04`.

Current outcome: `Watch`.

Trace result:

- strong relative ROAS signal is present
- purchases are present
- campaign is not explicit test-campaign context
- primary action is `keep_in_test`
- Commercial Truth is missing/degraded
- current Scale Review path does not admit the row because it is not scale intent / explicit test-campaign review intent and does not clear the true-scale peer-spend floor

No code change was made. Changing this row would require a new narrow floor-policy decision for high-relative non-test Watch rows. That is the next recommended fix if Watch must reach `90+`.

## After Scores

Deterministic replay of Claude's represented mismatch set after this pass:

| Metric | Before | After |
|---|---:|---:|
| Macro segment score | `87/100` | `91/100` |
| Raw row accuracy | `87%` | `91%` |
| Watch | `75/100` | `83/100` |
| Refresh | `84/100` | `91/100` |
| Protect | `83/100` | `90/100` |
| Test More | `83/100` | `90/100` |
| Not Enough Data | `88/100` | `92/100` |
| Cut recall | `~92%` | `~94%` |
| pdf-company-01 | `80/100` | `90/100` |
| pdf-company-02 | `82/100` | `90/100` |

`Watch` remains below the owner target. This pass therefore does not claim acceptance.

## Remaining Blocker

The remaining represented segment below `90+` is `Watch`.

Likely next narrow fix:

- define a high-relative non-test Watch floor policy for rows like `company-05 / company-05-creative-04`
- decide whether a strong relative row that is not an explicit test campaign and does not clear current true-scale spend floors should remain `Watch`, become `Scale Review`, or become a clearer `Test More`/review state
- keep Scale / Scale Review push/apply safety unchanged

## Validation Summary

Targeted tests added or preserved:

- validating + quarter-trend collapse + mature evidence -> `Refresh`
- validating + thin evidence / very new dip -> not `Refresh`
- fatigued catastrophic CPA reviewed rows -> `Cut`
- mature one-purchase catastrophic CPA -> `Cut`
- low-spend or missing-CPA one-purchase rows -> not `Cut`
- mild above-baseline stable winner + trend collapse -> `Refresh`
- stronger stable winner with same mild trend dip -> `Protect`
- thin-spend weak-ratio positive -> `Not Enough Data`
- strong-relative thin-spend positive -> `Test More`

The updated audit helper now waits for local snapshot refresh tasks before restoring its local fetch guard, so the direct audit run does not fail after writing artifacts.

## Recommendation

Do not ask Claude for final acceptance yet if the owner requires every represented segment at `90+`. The next pass should be a narrow Watch floor-policy pass, focused only on high-relative non-test Watch rows and any remaining Watch cases that independent review still marks as action-worthy.
