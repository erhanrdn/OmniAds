# ChatGPT Pro Review: PR #84 Round 2

## Verbatim Review Text Provided

ChatGPT Pro reviewed PR #84 (Canonical decision resolver — H1+H2 + plan v1) and identified bugs that must be fixed before any production-facing merge or rollout. Two of the three reported bugs are confirmed by independent verification of the branch on `origin/codex/canonical-decision-refactor`. The third claim that several new TS files are minified one-liners is incorrect; those files are normally formatted. Ignore the formatting claim and focus on the two real bugs and plan-level tightening.

### Confirmed Bug 1: Mature Zero-Purchase Leakage Is Unreachable

File: `lib/creative-canonical-decision.ts`.

The zero-purchase leak branch only fires when `evidenceMaturity < 0.25`. But evidence maturity is a weighted mean of spend maturity, purchase maturity, and impression maturity. With zero purchases, purchase maturity is `0`, but mature spend and impressions push evidence above `0.25` exactly when the branch matters most.

Worked example using defaults:

```text
spend=420, purchases=0, impressions=9000
spendMaturity      = 1.0
purchaseMaturity   = 0.0
impressionMaturity = 1.0
evidenceMaturity   = 0.35*1 + 0.45*0 + 0.20*1 = 0.55
```

Required fix: hoist zero-purchase leakage above the low-evidence gate. The ordering should be measurement invalid, zero-purchase leak, low evidence, hard cut, rest. The hard-cut branch should also admit zero-purchase mature losers as a secondary path.

Required tests:

- Mature zero-purchase leakage at `$420` spend, `0` purchases, `9000` impressions resolves to `cut` and is not blocked.
- Mature zero-purchase leakage at `$800` spend, `0` purchases, `12000` impressions does not silently fall back to `test_more`.

### Confirmed Bug 2: Confidence Collapses To About 0.20 In Zero-Feedback State

File: `lib/creative-decision-confidence.ts`.

Current shrinkage pushed both evidence and consistency toward `0.5` when `feedbackCount=0`, so launch-state confidence became approximately `0.5 * 0.5 * 0.8 = 0.20`. That suppresses critical realtime override alarms because `lib/creative-calibration-store.ts` required confidence `>=0.72`.

Required fix: decouple deterministic signal confidence from calibration confidence. Deterministic confidence should be a weighted mean of evidence maturity, signal consistency, and calibration freshness. Calibration history should cap that value rather than collapse it:

```text
feedbackCount < 20  -> cap 0.72
feedbackCount < 50  -> cap 0.82
feedbackCount < 100 -> cap 0.90
otherwise           -> cap 0.95
```

The public confidence shape should expose `value`, `deterministic`, and `calibrationCap`.

The realtime queue should also not require `purchases > 4`; critical overrides should queue when confidence is high, spend is very mature, or the user marks the override as strong.

Required tests:

- Clear uncalibrated winner confidence does not collapse to `0.20`.
- Critical mature-spend override queues realtime even when feedback count is zero.
- Calibration cap rises with feedback count.

### Not A Bug

The claim that new TypeScript files are one-line/minified is rejected. The files are normally formatted; the observation came from a GitHub raw render artifact.

### Plan Tightening

PT-1: H4 severe override threshold must be tiered:

- critical high-confidence override rate `<=1%` as hard stop.
- high plus critical override rate `<=3%` as warning/investigation.
- all severe override rate `<=5%` as internal early-warning only.
- track overdiagnose override rate separately.

PT-2: H4 observability must include business-level metrics:

- canonical-vs-legacy action delta per business.
- readiness distribution per business.
- confidence histogram per business.
- reason chip distribution.
- fallback/re-run badge rate.
- per-business diagnose rate.
- critical realtime queue volume.
- LLM enrichment call/cost/error if enabled.

PT-3: H3 calibration activation must be manual. Fifty user labels produce bounded threshold suggestions only. Activation requires holdout validation, no severe-error increase, no diagnose collapse, no scale/cut contradiction increase, and manual approval.

## Resolution Note

Accepted and addressed: both confirmed bugs plus PT-1, PT-2, and PT-3. Rejected: the TypeScript formatting/minification claim, because local file checks confirmed normal formatting. Code fixes are in `lib/creative-canonical-decision.ts`, `lib/creative-decision-confidence.ts`, and `lib/creative-calibration-store.ts`; tests are in `lib/creative-canonical-decision.test.ts`, `lib/creative-decision-confidence.test.ts`, and `lib/creative-calibration-store.test.ts`; plan tightening is in `IMPLEMENTATION-PLAN-V1.md`.
