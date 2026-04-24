# Creative Equal-Segment Confusion Matrix

Date: 2026-04-25

This matrix summarizes the equal-segment confusion clusters after Claude's Round 2 review and this final targeted gate-fix pass. Sanitized aliases only.

## Newly Fixed Confusions

| Expected | Before actual | Before count | After actual | After count | Status |
|---|---|---:|---|---:|---|
| Cut | Refresh | 2 | Cut | 2 | fixed |
| Refresh | Watch | 1 | Refresh | 1 | fixed |

## Previously Fixed Confusions Preserved

| Expected | Before earlier actual | Count | Current actual | Status |
|---|---|---:|---|---|
| Refresh | Protect | 3 | Refresh | preserved |
| Cut | Not Enough Data | 2 | Cut | preserved |
| Cut | Watch | 1 | Cut | preserved |

## Remaining Confusion Classes

| Expected | Actual | Status |
|---|---|---|
| Refresh or Cut | Watch | still monitored for lower-spend below-baseline rows that remain below safe Cut/Refresh floors |
| Scale Review or Protect | Watch | documented high-relative case remains below current true-scale peer-spend floor |
| Not Enough Data | Test More | still monitored; thin positive-signal boundary |

## Interpretation

The final fixed confusions are the high-confidence classes from Claude's Round 2 review:

- catastrophic CPA `fatigued_winner` / `refresh_replace` rows should not remain `Refresh`
- validating rows with at-benchmark 30-day performance and zero 7-day ROAS should not remain generic `Watch`

The high-relative Watch trace was intentionally not patched because doing so would broaden Scale Review floors, which was out of scope for this pass.

## Business Impact

- `Refresh` no longer hides the two clearest Cut-shaped CPA blowouts.
- `Watch` is less likely to hide a mature validating trend-collapse row.
- `Cut` recall improves without loosening queue/push/apply safety.
- `Scale` and `Scale Review` policy floors remain unchanged.
