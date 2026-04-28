# Happy Harbor - Faz A Sample Stratification

## Source

- Generated at: 2026-04-28T17:54:18.213Z
- Source artifact: `/tmp/adsecute-creative-live-firm-audit-local.json`
- Source audit generated at: 2026-04-28T17:38:31.951Z
- Source audit window: 2026-03-29 to 2026-04-27 (30 completed days, excludes today)
- Source universe: 304 creative rows across 8 runtime-readable active Meta businesses
- Sample: 200 rows
- Fresh rerun note: completed on 2026-04-28 through the owner-provided SSH DB tunnel and local dev runtime.
- Inspected source row excluded from sample: 1

## Business And Spend Tier

| Business | Spend tier | 30d spend | Active Meta accounts | Source rows | Sample rows |
| --- | --- | --- | --- | --- | --- |
| company-01 | large | 10837.79 | 1 | 35 | 21 |
| company-02 | medium | 8041.91 | 1 | 8 | 8 |
| company-03 | medium | 2109.25 | 1 | 16 | 10 |
| company-04 | medium | 4247.51 | 1 | 47 | 37 |
| company-05 | large | 560031.09 | 2 | 59 | 54 |
| company-06 | medium | 2408.86 | 1 | 66 | 25 |
| company-07 | medium | 7095.37 | 1 | 33 | 12 |
| company-08 | large | 31740.69 | 2 | 40 | 33 |

| Spend tier | Sample rows |
| --- | --- |
| large | 108 |
| medium | 92 |

No small-tier business (<$1k/30d) exists in the runtime-readable live cohort, so the small-tier >=20% target is not mathematically satisfiable. Medium and large tiers are both represented above 20%.

## Required A.2 Axes

| Active status | Rows |
| --- | --- |
| false | 66 |
| true | 134 |

| Baseline reliability | Rows |
| --- | --- |
| medium | 6 |
| strong | 194 |

| Campaign is test-like | Rows |
| --- | --- |
| false | 83 |
| true | 117 |

Lifecycle state is an Adsecute label, so row-level values are HMAC-masked in `sample-200.json`. Aggregate counts are shown here only for auditability.

| Lifecycle state | Rows |
| --- | --- |
| blocked | 6 |
| comeback_candidate | 16 |
| fatigued_winner | 32 |
| retired | 15 |
| scale_ready | 3 |
| stable_winner | 18 |
| validating | 110 |

## Full Verdict Surface Coverage

Current Adsecute primary-decision aggregate is shown only as a sample-distribution check; row-level labels remain masked.

| Current Adsecute primary decision | Rows |
| --- | --- |
| Cut | 22 |
| Diagnose | 129 |
| Protect | 8 |
| Refresh | 33 |
| Scale | 4 |
| Test More | 4 |

| Codex rating action family | Rows |
| --- | --- |
| Cut | 9 |
| Diagnose | 34 |
| Protect | 8 |
| Refresh | 13 |
| Scale | 10 |
| Test More | 126 |

| Codex rating headline | Rows |
| --- | --- |
| Needs Diagnosis | 34 |
| Scale Fatiguing | 3 |
| Scale Performer | 9 |
| Scale Underperformer | 7 |
| Test Inconclusive | 126 |
| Test Loser | 12 |
| Test Winner | 9 |

| Codex rating phase | Rows |
| --- | --- |
| post-scale | 99 |
| scale | 13 |
| test | 88 |

## Masking

- Row-level fields `currentUserFacingSegment`, `currentDecisionOsInternalSegment`, `lifecycleState`, `primaryAction`, `operatorPrimaryDecision`, `subTone`, `actionability`, `actionReadiness`, and `oldRuleChallengerSegment` are represented only as HMAC-SHA256 values in the sample.
- The private reveal file is `docs/team-comms/happy-harbor/audit-A/_revealed-labels.private.json` and is covered by `.gitignore`.
- Generated instruction/reason copy from Adsecute is intentionally omitted from the sample because it leaks decisions in plain language.

