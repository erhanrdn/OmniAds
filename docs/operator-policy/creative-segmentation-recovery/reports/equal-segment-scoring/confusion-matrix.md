# Creative Equal-Segment Confusion Matrix

Date: 2026-04-25

This matrix summarizes the equal-segment review confusion clusters before and after the gate-fix pass. It uses sanitized aliases only.

## Fixed Confusions

| Expected | Before actual | Before count | After actual | After count | Status |
|---|---|---:|---|---:|---|
| Refresh | Protect | 3 | Refresh | 3 | fixed |
| Cut | Not Enough Data | 2 | Cut | 2 | fixed |
| Cut | Watch | 1 | Cut | 1 | fixed |

## Remaining Confusion Classes

| Expected | Actual | Status |
|---|---|---|
| Watch | Refresh | still monitored; mostly lifecycle/fatigue wording boundary |
| Not Enough Data | Test More | still monitored; thin-spend positive-signal boundary |
| Cut | Refresh | still monitored; severe CPA/fatigue boundary |

## Interpretation

The fixed confusions were the high-confidence, cross-account classes from the equal-segment audit:

- trend-collapsed protected winners should not remain `Protect`
- blocked CPA blowouts should not remain `Not Enough Data`
- high-spend mature below-baseline rows should not remain `Watch` only because 7d data is unavailable

The remaining confusion classes are lower-confidence product-boundary issues and were intentionally not bundled into this pass.

## Business Impact

- The `Protect` segment is safer for operators because recent collapse can now break out into `Refresh`.
- The `Watch` segment is less likely to hide mature high-spend losers.
- `Not Enough Data` is less likely to hide blocked lifecycle rows with enough CPA/ROAS evidence to call a review-safe `Cut`.
- Queue/push/apply authority remains unchanged.
