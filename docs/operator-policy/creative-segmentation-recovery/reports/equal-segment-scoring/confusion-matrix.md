# Creative Equal-Segment Confusion Matrix

Date: 2026-04-25

## 2026-04-25 Media Buyer Scoring Engine Update

No new current-code confusion matrix was generated in the media-buyer scoring engine pass. The live audit rerun was blocked by repeated database query timeouts. This document remains the prior PR #65 confusion summary until a fresh current-code artifact is available.

This matrix summarizes the represented equal-segment confusion clusters after the Claude fix-plan implementation, Watch floor-policy fix, Round 5 closure, Protect boundary investigation, and Round 6 Watch-edge verification. Sanitized aliases only.

## Newly Fixed Confusions

| Expected | Before actual | Before count | After actual | After count | Status |
|---|---|---:|---|---:|---|
| Cut | Not Enough Data | 1 | Cut | 1 | fixed by one-purchase catastrophic CPA path |
| Refresh | Protect | 1 | Refresh | 1 | fixed by tiered Protect trend-collapse threshold |
| Not Enough Data | Test More | 2 | Not Enough Data | 2 | fixed by thin-spend Test More evidence floor |
| Refresh | Watch | 1 | Refresh | 1 | quarter-trend validating collapse preserved |
| Scale Review | Watch | 1 | Scale Review | 1 | fixed by high-relative non-test review-only gate |
| Refresh | Watch | 1 | Refresh | 1 | fixed by Round 5 below-baseline validating collapse gate; Round 6 verified the same target shape |
| Watch | Protect | 1 | Watch | 1 | fixed by Protect/no-touch below-benchmark high-CPA guard |

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
| Watch | Protect | fixed for the reviewed high-volume below-benchmark high-CPA no-touch shape |
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
- high-volume stable no-touch rows below benchmark with elevated CPA should not remain passive `Protect`

## Business Impact

- `Cut` recall improves without granting push/apply authority.
- `Refresh` catches more meaningful collapse without promoting very new creatives.
- `Test More` is cleaner and less likely to mask thin evidence.
- `Protect` is less likely to hide mild above-baseline collapse.
- `Watch` has the clear Round 5 miss fixed, and the remaining reviewed Protect/no-touch borderline now routes to Watch.
