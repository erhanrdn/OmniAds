# 21-23. Negative Tests, Backtest, Confidence Calibration

## Negative And Invariant Tests Added

Added `scripts/creative-decision-center-v21-spike.test.ts`.

| Invariant | Test coverage |
|---|---|
| No row-level `brief_variation` | Generated shadow rows cannot contain it |
| No `fix_delivery` without proof | Shadow output must use `active_no_spend_24h` and no missing data |
| No `fix_policy` without proof | Shadow output must use `disapproved_or_limited` and no missing data |
| No high-confidence scale/cut with missing data | Artifact test caps high confidence |
| Campaign paused must not become `fix_delivery` | Fixture test checks paused campaign |
| Policy overrides performance | Disapproved fixture must become `fix_policy` |
| UI must not compute `buyerAction` | Static scan of Creative UI paths for buyerAction computation |
| Metamorphic config sensitivity | Aggressive/conservative configs must not create unsafe scale/cut |

Run:

```bash
npx vitest run scripts/creative-decision-center-v21-spike.test.ts
```

Result: 1 file / 6 tests passed after the addendum.

## Required Future Invariants

| Required invariant | Current status |
|---|---|
| stale data lowers confidence or becomes diagnose_data | fixture-backed only |
| benchmark strong -> weak lowers confidence | config sensitivity proxy only |
| campaign active -> paused removes fix_delivery | fixture-backed |
| reviewStatus disapproved overrides performance | fixture-backed |
| launch age under threshold blocks scale/cut | fixture-backed |
| aggregate decisions do not attach random creativeId | design-only; needs aggregate contract tests |
| no hidden network call in resolver | design-only; add reproducibility test with dependency scan |

## Historical Outcome Backtest

Not run.

| Requirement | Status | Missing |
|---|---|---|
| Snapshot/date T | blocked | read-only DB access / snapshot sample |
| Outcomes T+3/T+7/T+14 | blocked | historical snapshot loader and outcome join |
| Action precision proxy | blocked | target action labels + future outcomes |
| False positive/negative examples | blocked | same |

What must be logged now:

| Log field | Why |
|---|---|
| `decisionCenterSnapshotId` | Join decisions to outcomes |
| `featureRowHash` | Reproducibility |
| `creativeId/adId/familyId/accountId/campaignId/adsetId` | Identity joins |
| `primaryDecision`, `buyerAction`, `problemClass`, `actionability` | Evaluation dimensions |
| `confidence`, `priority`, `maturity` | Calibration |
| `missingData`, `dataFreshness`, `targetSource`, `benchmarkReliability` | Explain failures |
| T+3/T+7/T+14 metrics | Backtest outcome |

Do not claim confidence improvements until this exists.

## Confidence, Priority, Maturity Audit

Current V2 confidence is rule-adjusted, not calibrated. Evidence: `confidence()` in `lib/creative-decision-os-v2.ts` lines 126-130 adds benchmark/trust adjustments and clamps 45-94. V2 caps indirectly for unreliable benchmark via blockers, but it does not know stale data, missing target, launch age, policy proof, or delivery proof.

| Concept | Definition | Example |
|---|---|---|
| maturity | enough evidence to judge performance | Mature high spend loser, low confidence if attribution degraded |
| confidence | trust in recommendation correctness | Low when target/benchmark/truth missing |
| priority | urgency/business impact | High priority delivery issue can be low confidence |

Band proposal:

| Band | Confidence | Priority | Maturity |
|---|---|---|---|
| high | >= 78 and no required-data gaps | critical/high business impact | mature |
| medium | 62-77 or minor gaps | meaningful but not urgent | actionable/learning |
| low | < 62 or required proof missing | low impact or diagnostic | too_early |

Required confidence caps:

| Condition | Max confidence / behavior |
|---|---|
| stale data | max 55 or `diagnose_data` |
| missing benchmark | max 60; no high-confidence scale/cut |
| missing target | max 60 for scale/cut |
| weak attribution/truth | max 55 or diagnose |
| insufficient maturity | max 65; no scale/cut except explicit severe rule |
| missing policy/delivery proof | disable `fix_policy`/`fix_delivery`; fallback diagnose_data |

Valid combinations:

| Combination | Example |
|---|---|
| high priority + low confidence | active row appears no-spend but campaign/adset status missing |
| mature + low confidence | mature spend but attribution degraded |
| low maturity + high priority | new launch disapproved |
| low priority + high confidence | protected stable winner with no action needed |

