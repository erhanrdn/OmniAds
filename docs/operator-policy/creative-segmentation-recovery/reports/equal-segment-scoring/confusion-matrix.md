# Creative Equal-Segment Confusion Matrix

Date: 2026-04-25

This matrix summarizes the represented equal-segment confusion clusters after the Claude fix-plan implementation and Watch floor-policy fix. Sanitized aliases only.

## Newly Fixed Confusions

| Expected | Before actual | Before count | After actual | After count | Status |
|---|---|---:|---|---:|---|
| Cut | Not Enough Data | 1 | Cut | 1 | fixed by one-purchase catastrophic CPA path |
| Refresh | Protect | 1 | Refresh | 1 | fixed by tiered Protect trend-collapse threshold |
| Not Enough Data | Test More | 2 | Not Enough Data | 2 | fixed by thin-spend Test More evidence floor |
| Refresh | Watch | 1 | Refresh | 1 | quarter-trend validating collapse preserved |
| Scale Review | Watch | 1 | Scale Review | 1 | fixed by high-relative non-test review-only gate |
| Refresh | Watch | 1 | Refresh | 1 | fixed by Round 5 below-baseline validating collapse gate |

## Previously Fixed Confusions Preserved

| Expected | Earlier actual | Count | Current actual | Status |
|---|---|---:|---|---|
| Cut | Refresh | 2 | Cut | preserved |
| Refresh | Watch | 1 | Refresh | preserved |
| Cut | Watch | 1 | Cut | preserved |
| Cut | Not Enough Data | 2 | Cut | preserved |

## Remaining Confusion Classes

| Expected | Actual | Status |
|---|---|---|
| Refresh or Cut | Watch | reduced; the clear Round 5 Watch miss is fixed, remaining Watch rows are below safe evidence floors or ambiguous |
| Watch | Protect | unresolved borderline under Claude Round 4 independent scoring; no safe no-touch policy change made in Round 5 |
| Scale | not represented | no valid expected examples in represented set |
| Campaign Check | not represented | no valid expected examples in represented set |

## Interpretation

The fixed confusions are exactly the high-confidence classes from Claude's fix plan:

- one-purchase catastrophic CPA rows should not stay `Not Enough Data`
- mild above-baseline protected winners with a meaningful collapse should not remain passive `Protect`
- thin-spend weak-ratio positives should not become `Test More`
- validating trend-collapse admission remains mature-evidence guarded
- mature high-relative non-test rows should not remain passive `Watch` when they have strong baseline-backed evidence and no context blocker
- materially below-benchmark validating rows with zero recent ROAS should not remain passive `Watch` when spend/purchase/impression evidence is meaningful

## Business Impact

- `Cut` recall improves without granting push/apply authority.
- `Refresh` catches more meaningful collapse without promoting very new creatives.
- `Test More` is cleaner and less likely to mask thin evidence.
- `Protect` is less likely to hide mild above-baseline collapse.
- `Watch` has the clear Round 5 miss fixed; strict final acceptance still depends on whether the remaining Protect/no-touch borderline is accepted or separately fixed.
