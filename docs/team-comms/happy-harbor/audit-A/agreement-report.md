# Happy Harbor - Faz A.5 Agreement Report

## Summary

- Generated at: 2026-04-28T21:00:48.624Z
- Rows joined: 200
- Reveal join: 200/200
- HMAC integrity: 1800/1800
- Raters: Adsecute current labels, Codex rating, Claude rating
- Direction note: pair-wise severity uses the first rater as the reference argument to `classifyV2MismatchSeverity`; Adsecute is not treated as ground truth.

## Kappa

| Pair | Axis | Matches | Rows | Agreement | Cohen kappa |
| --- | --- | --- | --- | --- | --- |
| adsecute_vs_codex | action | 44 | 200 | 22% | 0.0925 |
| adsecute_vs_codex | headline | 42 | 200 | 21% | 0.0884 |
| adsecute_vs_codex | actionReadiness | 195 | 200 | 97.5% | 0.9175 |
| adsecute_vs_claude | action | 83 | 200 | 41.5% | 0.122 |
| adsecute_vs_claude | headline | 79 | 200 | 39.5% | 0.0936 |
| adsecute_vs_claude | actionReadiness | 68 | 200 | 34% | -0.3285 |
| codex_vs_claude | action | 38 | 200 | 19% | -0.1355 |
| codex_vs_claude | headline | 38 | 200 | 19% | -0.1288 |
| codex_vs_claude | actionReadiness | 71 | 200 | 35.5% | -0.2671 |

| Axis | Fleiss kappa | Observed agreement | Expected agreement |
| --- | --- | --- | --- |
| action | -0.0436 | 27.5% | 30.53% |
| headline | -0.0551 | 26.5% | 30.34% |
| actionReadiness | -0.0666 | 55.67% | 58.43% |

## Action Severity

Severity is computed on canonical action primary decisions with `classifyV2MismatchSeverity` from `lib/creative-decision-os-v2-evaluation.ts`.

| Pair | Severe | High | Medium | Low | None |
| --- | --- | --- | --- | --- | --- |
| adsecute_vs_codex | 0 | 10 | 45 | 101 | 44 |
| adsecute_vs_claude | 0 | 13 | 37 | 67 | 83 |
| codex_vs_claude | 0 | 7 | 29 | 126 | 38 |

## Confusion Matrices

### adsecute_vs_codex

#### action

| ref \ pred | scale | keep_testing | protect | refresh | cut | diagnose |
| --- | --- | --- | --- | --- | --- | --- |
| scale | 1 | 2 | 1 | 0 | 0 | 0 |
| keep_testing | 0 | 1 | 2 | 1 | 0 | 0 |
| protect | 2 | 6 | 0 | 0 | 0 | 0 |
| refresh | 4 | 17 | 5 | 4 | 3 | 0 |
| cut | 0 | 18 | 0 | 0 | 4 | 0 |
| diagnose | 3 | 82 | 0 | 8 | 2 | 34 |

#### headline

| ref \ pred | Test Winner | Test Loser | Test Inconclusive | Scale Performer | Scale Underperformer | Scale Fatiguing | Needs Diagnosis |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Test Winner | 1 | 0 | 2 | 2 | 0 | 0 | 0 |
| Test Loser | 0 | 3 | 15 | 0 | 0 | 0 | 0 |
| Test Inconclusive | 0 | 0 | 1 | 1 | 0 | 1 | 0 |
| Scale Performer | 4 | 1 | 7 | 2 | 0 | 0 | 0 |
| Scale Underperformer | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Scale Fatiguing | 1 | 3 | 16 | 4 | 3 | 1 | 0 |
| Needs Diagnosis | 3 | 5 | 85 | 0 | 4 | 1 | 34 |

#### actionReadiness

| ref \ pred | ready | needs_review | blocked |
| --- | --- | --- | --- |
| ready | 0 | 0 | 0 |
| needs_review | 5 | 161 | 0 |
| blocked | 0 | 0 | 34 |

### adsecute_vs_claude

#### action

| ref \ pred | scale | keep_testing | protect | refresh | cut | diagnose |
| --- | --- | --- | --- | --- | --- | --- |
| scale | 0 | 0 | 1 | 0 | 0 | 3 |
| keep_testing | 0 | 0 | 1 | 0 | 0 | 3 |
| protect | 1 | 0 | 1 | 1 | 5 | 0 |
| refresh | 1 | 9 | 6 | 11 | 4 | 2 |
| cut | 0 | 0 | 0 | 1 | 3 | 18 |
| diagnose | 1 | 53 | 0 | 4 | 3 | 68 |

#### headline

| ref \ pred | Test Winner | Test Loser | Test Inconclusive | Scale Performer | Scale Underperformer | Scale Fatiguing | Needs Diagnosis |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Test Winner | 0 | 0 | 0 | 1 | 0 | 0 | 4 |
| Test Loser | 0 | 0 | 0 | 0 | 0 | 0 | 18 |
| Test Inconclusive | 0 | 0 | 0 | 0 | 0 | 0 | 3 |
| Scale Performer | 1 | 0 | 1 | 3 | 5 | 4 | 0 |
| Scale Underperformer | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Scale Fatiguing | 1 | 0 | 8 | 5 | 5 | 8 | 1 |
| Needs Diagnosis | 1 | 5 | 53 | 0 | 0 | 5 | 68 |

#### actionReadiness

| ref \ pred | ready | needs_review | blocked |
| --- | --- | --- | --- |
| ready | 0 | 0 | 0 |
| needs_review | 4 | 68 | 94 |
| blocked | 0 | 34 | 0 |

### codex_vs_claude

#### action

| ref \ pred | scale | keep_testing | protect | refresh | cut | diagnose |
| --- | --- | --- | --- | --- | --- | --- |
| scale | 3 | 0 | 1 | 4 | 0 | 2 |
| keep_testing | 0 | 25 | 3 | 7 | 13 | 78 |
| protect | 0 | 0 | 5 | 1 | 0 | 2 |
| refresh | 0 | 1 | 0 | 4 | 1 | 7 |
| cut | 0 | 2 | 0 | 1 | 1 | 5 |
| diagnose | 0 | 34 | 0 | 0 | 0 | 0 |

#### headline

| ref \ pred | Test Winner | Test Loser | Test Inconclusive | Scale Performer | Scale Underperformer | Scale Fatiguing | Needs Diagnosis |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Test Winner | 3 | 0 | 0 | 0 | 0 | 4 | 2 |
| Test Loser | 0 | 1 | 2 | 0 | 0 | 2 | 7 |
| Test Inconclusive | 0 | 4 | 25 | 3 | 9 | 7 | 78 |
| Scale Performer | 0 | 0 | 0 | 6 | 0 | 1 | 2 |
| Scale Underperformer | 0 | 0 | 1 | 0 | 1 | 1 | 4 |
| Scale Fatiguing | 0 | 0 | 0 | 0 | 0 | 2 | 1 |
| Needs Diagnosis | 0 | 0 | 34 | 0 | 0 | 0 | 0 |

#### actionReadiness

| ref \ pred | ready | needs_review | blocked |
| --- | --- | --- | --- |
| ready | 4 | 1 | 0 |
| needs_review | 0 | 67 | 94 |
| blocked | 0 | 34 | 0 |

## Top-10 Severe/High Disagreements

| rowId | business | spend | ROAS | recent/long ROAS | pair severities | Adsecute | Codex | Claude |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| company-05\|company-05-account-01\|company-05-campaign-07\|company-05-adset-06\|company-05-creative-53 | company-05 | 22917.96 | 4.74 |  | adsecute_vs_codex:high, codex_vs_claude:high | scale / Scale Fatiguing / refresh / needs_review | post-scale / Scale Performer / scale / ready / 0.8 | scale / Scale Performer / protect / needs_review / 0.95 |
| company-05\|company-05-account-01\|company-05-campaign-04\|company-05-adset-02\|company-05-creative-04 | company-05 | 9272.39 | 10.44 | 1.58 | adsecute_vs_codex:high, adsecute_vs_claude:high | scale / Scale Performer / protect / needs_review | test / Test Winner / scale / needs_review / 0.83 | test / Test Winner / scale / needs_review / 0.95 |
| company-05\|company-05-account-01\|company-05-campaign-04\|company-05-adset-02\|company-05-creative-08 | company-05 | 5375.69 | 5.6 | 0 | adsecute_vs_codex:high, codex_vs_claude:high | scale / Scale Performer / refresh / needs_review | test / Test Winner / scale / needs_review / 0.83 | post-scale / Scale Fatiguing / refresh / needs_review / 0.95 |
| company-02\|company-02-account-01\|company-02-campaign-01\|company-02-adset-01\|company-02-creative-03 | company-02 | 740.3 | 4.3 | 0.666 | adsecute_vs_codex:high, adsecute_vs_claude:high | scale / Scale Fatiguing / refresh / needs_review | test / Test Winner / scale / ready / 0.83 | test / Test Winner / scale / ready / 0.95 |
| company-07\|company-07-account-01\|company-07-campaign-01\|company-07-adset-01\|company-07-creative-04 | company-07 | 433 | 7.33 | 0.011 | adsecute_vs_codex:high, codex_vs_claude:high | scale / Scale Performer / refresh / needs_review | test / Test Winner / scale / needs_review / 0.83 | post-scale / Scale Fatiguing / refresh / needs_review / 0.95 |
| company-01\|company-01-account-01\|company-01-campaign-02\|company-01-adset-05\|company-01-creative-05 | company-01 | 398.89 | 8.04 | 0.843 | adsecute_vs_codex:high, adsecute_vs_claude:high | scale / Test Winner / scale / needs_review | scale / Scale Performer / protect / needs_review / 0.8 | scale / Scale Performer / protect / needs_review / 0.95 |
| company-07\|company-07-account-01\|company-07-campaign-01\|company-07-adset-01\|company-07-creative-06 | company-07 | 363.59 | 1.79 | 0 | adsecute_vs_codex:high, codex_vs_claude:high | scale / Scale Fatiguing / refresh / needs_review | test / Test Loser / cut / needs_review / 0.8 | post-scale / Scale Fatiguing / refresh / needs_review / 0.85 |
| company-02\|company-02-account-01\|company-02-campaign-01\|company-02-adset-01\|company-02-creative-06 | company-02 | 285.88 | 7.76 | 0.507 | adsecute_vs_codex:high, codex_vs_claude:high | scale / Scale Performer / protect / needs_review | test / Test Winner / scale / needs_review / 0.83 | post-scale / Scale Fatiguing / refresh / needs_review / 0.95 |
| company-05\|company-05-account-01\|company-05-campaign-07\|company-05-adset-06\|company-05-creative-46 | company-05 | 116470.74 | 2.37 |  | adsecute_vs_claude:high | scale / Scale Fatiguing / refresh / needs_review | post-scale / Test Inconclusive / keep_testing / needs_review / 0.7 | scale / Scale Underperformer / cut / needs_review / 0.95 |
| company-05\|company-05-account-01\|company-05-campaign-07\|company-05-adset-07\|company-05-creative-47 | company-05 | 56759.17 | 2.66 |  | adsecute_vs_claude:high | scale / Scale Fatiguing / refresh / needs_review | post-scale / Test Inconclusive / keep_testing / needs_review / 0.7 | scale / Scale Underperformer / cut / needs_review / 0.95 |

## Deep-Dive Notes

### company-05|company-05-account-01|company-05-campaign-07|company-05-adset-06|company-05-creative-53

Business company-05; spend 22917.96; ROAS 4.74; recent/long ROAS null; validation favorable; trust live_confident.

- Adsecute: scale / Scale Fatiguing / refresh / needs_review — current=Refresh; lifecycle=fatigued_winner; operator=refresh; subTone=default
- Codex: post-scale / Scale Performer / scale / ready / 0.8 — Spend and purchases are mature and efficiency is at or above benchmark, so preserve the winner unless validation supports more scale.
- Claude: scale / Scale Performer / protect / needs_review / 0.95 — Scale performer: $22918 spend at 4.74 ROAS (1.63× break-even) with stable recent7/long90 ratio NaN.
- Severe/high pairs: adsecute_vs_codex refresh->scale (high); codex_vs_claude scale->protect (high)

### company-05|company-05-account-01|company-05-campaign-04|company-05-adset-02|company-05-creative-04

Business company-05; spend 9272.39; ROAS 10.44; recent/long ROAS 1.58; validation unfavorable; trust live_confident.

- Adsecute: scale / Scale Performer / protect / needs_review — current=Protect; lifecycle=stable_winner; operator=protect; subTone=default
- Codex: test / Test Winner / scale / needs_review / 0.83 — The test has enough evidence and materially beats the benchmark/ROAS threshold, making it a scale candidate.
- Claude: test / Test Winner / scale / needs_review / 0.95 — Test winner: ROAS 10.44 is 3.60× business break-even (2.90) with 10 purchases on $9272 spend.
- Severe/high pairs: adsecute_vs_codex protect->scale (high); adsecute_vs_claude protect->scale (high)

### company-05|company-05-account-01|company-05-campaign-04|company-05-adset-02|company-05-creative-08

Business company-05; spend 5375.69; ROAS 5.6; recent/long ROAS 0; validation unfavorable; trust live_confident.

- Adsecute: scale / Scale Performer / refresh / needs_review — current=Refresh; lifecycle=stable_winner; operator=refresh; subTone=default
- Codex: test / Test Winner / scale / needs_review / 0.83 — The test has enough evidence and materially beats the benchmark/ROAS threshold, making it a scale candidate.
- Claude: post-scale / Scale Fatiguing / refresh / needs_review / 0.95 — Fatiguing: recent7d ROAS 0.00 vs long90d 5.81 (ratio 0.00) — performance has decayed; refresh angle/format.
- Severe/high pairs: adsecute_vs_codex refresh->scale (high); codex_vs_claude scale->refresh (high)

### company-02|company-02-account-01|company-02-campaign-01|company-02-adset-01|company-02-creative-03

Business company-02; spend 740.3; ROAS 4.3; recent/long ROAS 0.666; validation favorable; trust live_confident.

- Adsecute: scale / Scale Fatiguing / refresh / needs_review — current=Refresh; lifecycle=fatigued_winner; operator=refresh; subTone=default
- Codex: test / Test Winner / scale / ready / 0.83 — The test has enough evidence and materially beats the benchmark/ROAS threshold, making it a scale candidate.
- Claude: test / Test Winner / scale / ready / 0.95 — Test winner: ROAS 4.30 is 1.62× business break-even (2.66) with 12 purchases on $740 spend.
- Severe/high pairs: adsecute_vs_codex refresh->scale (high); adsecute_vs_claude refresh->scale (high)

### company-07|company-07-account-01|company-07-campaign-01|company-07-adset-01|company-07-creative-04

Business company-07; spend 433; ROAS 7.33; recent/long ROAS 0.011; validation missing; trust live_confident.

- Adsecute: scale / Scale Performer / refresh / needs_review — current=Refresh; lifecycle=stable_winner; operator=refresh; subTone=default
- Codex: test / Test Winner / scale / needs_review / 0.83 — The test has enough evidence and materially beats the benchmark/ROAS threshold, making it a scale candidate.
- Claude: post-scale / Scale Fatiguing / refresh / needs_review / 0.95 — Fatiguing: recent7d ROAS 0.07 vs long90d 6.48 (ratio 0.01) — performance has decayed; refresh angle/format.
- Severe/high pairs: adsecute_vs_codex refresh->scale (high); codex_vs_claude scale->refresh (high)

### company-01|company-01-account-01|company-01-campaign-02|company-01-adset-05|company-01-creative-05

Business company-01; spend 398.89; ROAS 8.04; recent/long ROAS 0.843; validation missing; trust live_confident.

- Adsecute: scale / Test Winner / scale / needs_review — current=Scale; lifecycle=stable_winner; operator=scale; subTone=review_only
- Codex: scale / Scale Performer / protect / needs_review / 0.8 — Spend and purchases are mature and efficiency is at or above benchmark, so preserve the winner unless validation supports more scale.
- Claude: scale / Scale Performer / protect / needs_review / 0.95 — Scale performer: $399 spend at 8.04 ROAS (2.43× break-even) with stable recent7/long90 ratio 0.84.
- Severe/high pairs: adsecute_vs_codex scale->protect (high); adsecute_vs_claude scale->protect (high)

### company-07|company-07-account-01|company-07-campaign-01|company-07-adset-01|company-07-creative-06

Business company-07; spend 363.59; ROAS 1.79; recent/long ROAS 0; validation missing; trust live_confident.

- Adsecute: scale / Scale Fatiguing / refresh / needs_review — current=Refresh; lifecycle=fatigued_winner; operator=refresh; subTone=default
- Codex: test / Test Loser / cut / needs_review / 0.8 — The test has enough spend to read, but conversion volume or efficiency is below the benchmark tolerance.
- Claude: post-scale / Scale Fatiguing / refresh / needs_review / 0.85 — Fatiguing: recent7d ROAS 0.00 vs long90d 1.79 (ratio 0.00) — performance has decayed; refresh angle/format.
- Severe/high pairs: adsecute_vs_codex refresh->cut (high); codex_vs_claude cut->refresh (high)

### company-02|company-02-account-01|company-02-campaign-01|company-02-adset-01|company-02-creative-06

Business company-02; spend 285.88; ROAS 7.76; recent/long ROAS 0.507; validation unfavorable; trust live_confident.

- Adsecute: scale / Scale Performer / protect / needs_review — current=Protect; lifecycle=stable_winner; operator=protect; subTone=default
- Codex: test / Test Winner / scale / needs_review / 0.83 — The test has enough evidence and materially beats the benchmark/ROAS threshold, making it a scale candidate.
- Claude: post-scale / Scale Fatiguing / refresh / needs_review / 0.95 — Fatiguing: recent7d ROAS 2.75 vs long90d 5.42 (ratio 0.51) — performance has decayed; refresh angle/format.
- Severe/high pairs: adsecute_vs_codex protect->scale (high); codex_vs_claude scale->refresh (high)

### company-05|company-05-account-01|company-05-campaign-07|company-05-adset-06|company-05-creative-46

Business company-05; spend 116470.74; ROAS 2.37; recent/long ROAS null; validation unfavorable; trust live_confident.

- Adsecute: scale / Scale Fatiguing / refresh / needs_review — current=Refresh; lifecycle=fatigued_winner; operator=refresh; subTone=default
- Codex: post-scale / Test Inconclusive / keep_testing / needs_review / 0.7 — The creative has some signal but not enough clean relative evidence to promote, protect, refresh, or cut decisively.
- Claude: scale / Scale Underperformer / cut / needs_review / 0.95 — Marginal scale economics: ROAS 2.37 (0.80× break-even) — not enough margin to justify continued scale spend.
- Severe/high pairs: adsecute_vs_claude refresh->cut (high)

### company-05|company-05-account-01|company-05-campaign-07|company-05-adset-07|company-05-creative-47

Business company-05; spend 56759.17; ROAS 2.66; recent/long ROAS null; validation unfavorable; trust live_confident.

- Adsecute: scale / Scale Fatiguing / refresh / needs_review — current=Refresh; lifecycle=fatigued_winner; operator=refresh; subTone=default
- Codex: post-scale / Test Inconclusive / keep_testing / needs_review / 0.7 — The creative has some signal but not enough clean relative evidence to promote, protect, refresh, or cut decisively.
- Claude: scale / Scale Underperformer / cut / needs_review / 0.95 — Marginal scale economics: ROAS 2.66 (0.90× break-even) — not enough margin to justify continued scale spend.
- Severe/high pairs: adsecute_vs_claude refresh->cut (high)

