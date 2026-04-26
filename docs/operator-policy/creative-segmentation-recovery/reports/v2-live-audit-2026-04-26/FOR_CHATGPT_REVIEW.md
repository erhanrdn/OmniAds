CHATGPT_REVIEW_READY: YES
ROLE: CODEX_WIP_IMPLEMENTATION
BRANCH: wip/creative-decision-os-v2-baseline-first-2026-04-26
HEAD_COMMIT: see PR body
PRIMARY_REPORT_PATH: docs/operator-policy/creative-segmentation-recovery/reports/v2-live-audit-2026-04-26/
HANDOFF_FILE: docs/operator-policy/creative-segmentation-recovery/reports/v2-live-audit-2026-04-26/FOR_CHATGPT_REVIEW.md
SANITIZED: YES
PRODUCT_CODE_CHANGED: YES
MERGE_REQUESTED: NO
MAIN_PUSHED: NO

# Creative Decision OS v2 Live Audit

## Executive Summary

Fresh DB-backed live audit completed through the local tunnel and wrote sanitized v2 resolver artifacts for 8 businesses, 9 accounts, and 303 creative rows.

This update fixes the live boundary defect where active historical winners with zero recent ROAS and zero recent purchases could still emit Protect. It also makes actionability conservative when blocker reasons, degraded truth, data-quality risk, source blockers, or campaign context blockers are present.

The resolver remains pure and unintegrated. No UI, API, queue/apply behavior, or benchmark generation was added.

## Artifact Paths

- `docs/operator-policy/creative-segmentation-recovery/reports/v2-live-audit-2026-04-26/FOR_CHATGPT_REVIEW.md`
- `docs/operator-policy/creative-segmentation-recovery/reports/v2-live-audit-2026-04-26/live-audit-sanitized.json`
- `docs/operator-policy/creative-segmentation-recovery/reports/v2-live-audit-2026-04-26/live-audit-sanitized.csv`
- `docs/operator-policy/creative-segmentation-recovery/reports/v2-live-audit-2026-04-26/live-decision-diff-main-vs-v2.json`
- `docs/operator-policy/creative-segmentation-recovery/reports/v2-live-audit-2026-04-26/live-safety-summary.json`

## What Changed

- Added a general recent-stop rule before Protect.
- Active creatives with credible lifetime/long-window strength, mature enough spend, recent purchases 0, and recent ROAS 0 or severe recent benchmark decay route away from Protect.
- Refresh/review_only is emitted when creative fatigue or creative refresh is the likely buyer action.
- Diagnose/diagnose is emitted when source/trust/campaign context makes the stopped-converting state ambiguous.
- Direct actionability is downgraded to review_only for non-Diagnose outputs with blocker reasons.
- Test More under degraded truth or data-quality risk is review_only instead of direct.
- Cut direct actionability now requires clear severe loser evidence without recent conversion/context/source blockers.

## Exact Defect Class Fixed

Active historical or long-window winner, recent purchases equal to 0, recent ROAS equal to 0 or severely below benchmark, and enough spend maturity must not emit Protect.

Rows that triggered the live defect and are now routed away from Protect by the general rule:

- `company-05|company-05-account-01|company-05-campaign-02|company-05-adset-01|company-05-creative-11`
- `company-07|company-07-account-01|company-07-campaign-01|company-07-adset-01|company-07-creative-11`

## Exact Live Audit Command

The live DB URL was configured in-process through the local tunnel. The value is omitted from committed artifacts.

```bash
<database connection configured via local tunnel; value omitted> DB_QUERY_TIMEOUT_MS=60000 DB_CONNECTION_TIMEOUT_MS=30000 CREATIVE_LIVE_ENV_DIR=/Users/harmelek/Adsecute CREATIVE_LIVE_FIRM_AUDIT_MAX_ROWS=100000 node --import tsx scripts/creative-decision-os-v2-live-audit.ts
```

## Live Audit Before / After

| Metric | Before this update | After this update |
| --- | ---: | ---: |
| Businesses audited | 8 | 8 |
| Accounts audited | 9 | 9 |
| Creative rows audited | 303 | 303 |
| Main vs v2 changed rows | 99 | 105 |
| v2 Scale | 1 | 1 |
| v2 Cut | 15 | 15 |
| v2 Refresh | 42 | 37 |
| v2 Protect | 16 | 17 |
| v2 Test More | 35 | 40 |
| v2 Diagnose | 194 | 193 |

## Decision Distribution After Fix

| Decision | Current | V2 |
| --- | ---: | ---: |
| Scale | 3 | 1 |
| Cut | 29 | 15 |
| Refresh | 30 | 37 |
| Protect | 10 | 17 |
| Test More | 20 | 40 |
| Diagnose | 211 | 193 |

## Changed Rows By Transition After Fix

| Transition | Count |
| --- | ---: |
| Refresh -> Protect | 5 |
| Test More -> Refresh | 4 |
| Scale -> Protect | 1 |
| Diagnose -> Test More | 24 |
| Refresh -> Test More | 7 |
| Test More -> Diagnose | 13 |
| Protect -> Refresh | 5 |
| Refresh -> Diagnose | 4 |
| Diagnose -> Refresh | 8 |
| Diagnose -> Protect | 7 |
| Cut -> Test More | 5 |
| Protect -> Test More | 1 |
| Test More -> Protect | 1 |
| Diagnose -> Cut | 3 |
| Scale -> Refresh | 1 |
| Protect -> Scale | 1 |
| Cut -> Diagnose | 7 |
| Refresh -> Cut | 1 |
| Cut -> Refresh | 6 |
| Scale -> Test More | 1 |

## Live Safety Table Before / After

| Safety check | Before this update | After this update |
| --- | ---: | ---: |
| direct Scale | 0 | 0 |
| inactive direct Scale | 0 | 0 |
| queueEligible true | 0 | 0 |
| applyEligible true | 0 | 0 |
| Watch primary | 0 | 0 |
| Scale Review primary | 0 | 0 |
| Rows with blockerReasons | 33 | 107 |
| Direct action despite source/campaign blockers | 52 | 0 |
| Test More direct on degraded/data-quality risk | 27 | 0 |
| Protect despite recent severe decay | 2 | 0 |
| Cut on active creatives with recent conversions | 1 | 1 |
| Refresh despite stable above-benchmark performance | 3 | 1 |

Remaining direct-action exceptions: none.

Remaining degraded/data-quality Test More direct exceptions: none.

Remaining watchlist notes:

- The remaining Cut-on-active-with-recent-conversions row is `company-05|company-05-account-01|company-05-campaign-03|company-05-adset-02|company-05-creative-03`. It emits Cut/review_only with blocker reason `cut_requires_buyer_review`; it is not a direct Cut.
- The remaining Refresh-despite-stable-above-benchmark row is `company-04|company-04-account-01|company-04-campaign-06|company-04-adset-05|company-04-creative-14`. It is inactive and emits Refresh/review_only with campaign/source blocker reasons.

## Top 20 Highest-Spend Decisions After Fix

| Row ID | Spend | Current -> V2 | Actionability | Risk | Tags |
| --- | ---: | --- | --- | --- | --- |
| `company-05\|company-05-account-01\|company-05-campaign-06\|company-05-adset-05\|company-05-creative-46` | 124046.89 | Refresh -> Refresh | review_only | medium | inactive_historical_signal, refresh_before_relaunch |
| `company-05\|company-05-account-01\|company-05-campaign-06\|company-05-adset-06\|company-05-creative-47` | 61027.88 | Protect -> Refresh | review_only | medium | inactive_historical_signal, refresh_before_relaunch |
| `company-05\|company-05-account-01\|company-05-campaign-06\|company-05-adset-07\|company-05-creative-48` | 57588.45 | Refresh -> Cut | review_only | high | inactive_confirmed_loser, below_benchmark, no_recovery |
| `company-05\|company-05-account-01\|company-05-campaign-06\|company-05-adset-05\|company-05-creative-49` | 33858.47 | Protect -> Refresh | review_only | medium | inactive_historical_signal, refresh_before_relaunch |
| `company-05\|company-05-account-01\|company-05-campaign-06\|company-05-adset-06\|company-05-creative-50` | 33045.48 | Cut -> Diagnose | diagnose | medium | inactive_creative, unclear_buyer_action |
| `company-05\|company-05-account-01\|company-05-campaign-06\|company-05-adset-05\|company-05-creative-51` | 29265.56 | Protect -> Refresh | review_only | medium | inactive_historical_signal, refresh_before_relaunch |
| `company-05\|company-05-account-01\|company-05-campaign-06\|company-05-adset-05\|company-05-creative-52` | 28450.98 | Refresh -> Diagnose | diagnose | high | inactive_winner_status_question, campaign_context_diagnosis |
| `company-05\|company-05-account-01\|company-05-campaign-06\|company-05-adset-05\|company-05-creative-53` | 26077.54 | Refresh -> Refresh | review_only | medium | inactive_historical_signal, refresh_before_relaunch |
| `company-05\|company-05-account-01\|company-05-campaign-06\|company-05-adset-05\|company-05-creative-54` | 25506.30 | Diagnose -> Cut | review_only | high | inactive_confirmed_loser, below_benchmark, no_recovery |
| `company-05\|company-05-account-01\|company-05-campaign-06\|company-05-adset-06\|company-05-creative-55` | 23522.86 | Diagnose -> Refresh | review_only | medium | inactive_historical_signal, refresh_before_relaunch |
| `company-05\|company-05-account-01\|company-05-campaign-06\|company-05-adset-05\|company-05-creative-56` | 16255.87 | Protect -> Refresh | review_only | medium | inactive_historical_signal, refresh_before_relaunch |
| `company-05\|company-05-account-01\|company-05-campaign-01\|company-05-adset-01\|company-05-creative-01` | 13373.07 | Protect -> Protect | review_only | low | around_benchmark_stable, protect |
| `company-05\|company-05-account-01\|company-05-campaign-06\|company-05-adset-07\|company-05-creative-57` | 12644.77 | Cut -> Cut | review_only | high | inactive_confirmed_loser, below_benchmark, no_recovery |
| `company-05\|company-05-account-01\|company-05-campaign-02\|company-05-adset-01\|company-05-creative-02` | 10118.73 | Protect -> Scale | review_only | high | textbook_scale_shape, above_benchmark, recent_strength, operator_review_required |
| `company-05\|company-05-account-01\|company-05-campaign-03\|company-05-adset-02\|company-05-creative-03` | 10022.46 | Cut -> Cut | review_only | critical | huge_spend_severe_loser, below_benchmark, no_recovery |
| `company-05\|company-05-account-01\|company-05-campaign-03\|company-05-adset-02\|company-05-creative-04` | 8765.22 | Diagnose -> Protect | review_only | low | stable_above_benchmark_winner, protect_before_scale |
| `company-08\|company-08-account-01\|company-08-campaign-01\|company-08-adset-01\|company-08-creative-01` | 8295.35 | Cut -> Refresh | review_only | high | active_conversions_below_benchmark, refresh_before_cut |
| `company-05\|company-05-account-01\|company-05-campaign-04\|company-05-adset-03\|company-05-creative-05` | 6991.75 | Diagnose -> Test More | review_only | medium | weak_read_with_conversion, test_more_before_cut |
| `company-05\|company-05-account-01\|company-05-campaign-03\|company-05-adset-02\|company-05-creative-06` | 6686.77 | Cut -> Cut | review_only | critical | huge_spend_severe_loser, below_benchmark, no_recovery |
| `company-05\|company-05-account-01\|company-05-campaign-05\|company-05-adset-04\|company-05-creative-07` | 6314.72 | Cut -> Cut | review_only | critical | huge_spend_severe_loser, below_benchmark, no_recovery |

## Top 20 Highest-Risk Changes After Fix

| Row ID | Spend | Current -> V2 | Actionability | Risk | Tags |
| --- | ---: | --- | --- | --- | --- |
| `company-05\|company-05-account-01\|company-05-campaign-06\|company-05-adset-07\|company-05-creative-48` | 57588.45 | Refresh -> Cut | review_only | high | inactive_confirmed_loser, below_benchmark, no_recovery |
| `company-05\|company-05-account-01\|company-05-campaign-06\|company-05-adset-05\|company-05-creative-54` | 25506.30 | Diagnose -> Cut | review_only | high | inactive_confirmed_loser, below_benchmark, no_recovery |
| `company-05\|company-05-account-01\|company-05-campaign-02\|company-05-adset-01\|company-05-creative-02` | 10118.73 | Protect -> Scale | review_only | high | textbook_scale_shape, above_benchmark, recent_strength, operator_review_required |
| `company-08\|company-08-account-01\|company-08-campaign-01\|company-08-adset-01\|company-08-creative-01` | 8295.35 | Cut -> Refresh | review_only | high | active_conversions_below_benchmark, refresh_before_cut |
| `company-05\|company-05-account-01\|company-05-campaign-06\|company-05-adset-07\|company-05-creative-58` | 5025.29 | Diagnose -> Cut | review_only | high | inactive_confirmed_loser, below_benchmark, no_recovery |
| `company-08\|company-08-account-02\|company-08-campaign-02\|company-08-adset-02\|company-08-creative-02` | 4365.02 | Cut -> Refresh | review_only | high | active_conversions_below_benchmark, refresh_before_cut |
| `company-06\|company-06-account-01\|company-06-campaign-01\|company-06-adset-01\|company-06-creative-01` | 1701.51 | Cut -> Refresh | review_only | high | active_conversions_below_benchmark, refresh_before_cut |
| `company-01\|company-01-account-01\|company-01-campaign-02\|company-01-adset-02\|company-01-creative-02` | 833.63 | Test More -> Refresh | review_only | high | lifetime_strong_recent_decay, refresh_before_cut |
| `company-04\|company-04-account-01\|company-04-campaign-08\|company-04-adset-05\|company-04-creative-17` | 286.87 | Diagnose -> Cut | review_only | high | inactive_confirmed_loser, below_benchmark, no_recovery |
| `company-04\|company-04-account-01\|company-04-campaign-01\|company-04-adset-01\|company-04-creative-02` | 151.25 | Diagnose -> Refresh | review_only | high | active_conversions_below_benchmark, refresh_before_cut |
| `company-03\|company-03-account-01\|company-03-campaign-01\|company-03-adset-01\|company-03-creative-05` | 132.06 | Diagnose -> Refresh | review_only | high | active_conversions_below_benchmark, refresh_before_cut |
| `company-05\|company-05-account-01\|company-05-campaign-06\|company-05-adset-05\|company-05-creative-52` | 28450.98 | Refresh -> Diagnose | diagnose | high | inactive_winner_status_question, campaign_context_diagnosis |
| `company-01\|company-01-account-01\|company-01-campaign-04\|company-01-adset-07\|company-01-creative-27` | 983.91 | Refresh -> Diagnose | diagnose | high | inactive_historical_winner, campaign_context_blocked |
| `company-07\|company-07-account-01\|company-07-campaign-01\|company-07-adset-01\|company-07-creative-07` | 277.11 | Refresh -> Diagnose | diagnose | high | strong_history_recent_stop, diagnose_before_refresh |
| `company-05\|company-05-account-01\|company-05-campaign-06\|company-05-adset-06\|company-05-creative-47` | 61027.88 | Protect -> Refresh | review_only | medium | inactive_historical_signal, refresh_before_relaunch |
| `company-05\|company-05-account-01\|company-05-campaign-06\|company-05-adset-05\|company-05-creative-49` | 33858.47 | Protect -> Refresh | review_only | medium | inactive_historical_signal, refresh_before_relaunch |
| `company-05\|company-05-account-01\|company-05-campaign-06\|company-05-adset-05\|company-05-creative-51` | 29265.56 | Protect -> Refresh | review_only | medium | inactive_historical_signal, refresh_before_relaunch |
| `company-05\|company-05-account-01\|company-05-campaign-06\|company-05-adset-06\|company-05-creative-55` | 23522.86 | Diagnose -> Refresh | review_only | medium | inactive_historical_signal, refresh_before_relaunch |
| `company-05\|company-05-account-01\|company-05-campaign-06\|company-05-adset-05\|company-05-creative-56` | 16255.87 | Protect -> Refresh | review_only | medium | inactive_historical_signal, refresh_before_relaunch |
| `company-05\|company-05-account-01\|company-05-campaign-04\|company-05-adset-03\|company-05-creative-05` | 6991.75 | Diagnose -> Test More | review_only | medium | weak_read_with_conversion, test_more_before_cut |

## Gold-v0.1 Evaluation After Live Fix

- Rows evaluated: 78
- Macro F1: 97.96
- Severe mismatches: 0
- High mismatches: 0
- Medium mismatches: 2
- Low mismatches: 0
- Scale F1: 100
- Cut F1: 100
- Refresh F1: 95.45
- Protect F1: 96.3
- Test More F1: 96
- Diagnose F1: 100

## Verification

- `npm test`: passed. `Test Files 303 passed (303)`, `Tests 2176 passed (2176)`.
- `npx tsc --noEmit`: passed with no output.
- `npm run build`: passed.
- Focused Creative tests: passed. `Test Files 6 passed (6)`, `Tests 155 passed (155)`.
- v2 gold eval: passed.
- Product-output forbidden-term test: passed. `Test Files 1 passed (1)`, `Tests 1 passed | 14 skipped (15)`.
- Formatting hygiene test: passed as part of `lib/creative-decision-os-v2.test.ts`.
- Hidden/bidi/control scan: passed for 10 changed files.
- Restricted filename scan: passed for 10 changed files.
- Secret/raw-ID scan: passed for 10 changed files.

## GitHub Hidden / Bidi Warning Check

Local hidden/bidi/control scan passed for all changed files. After push, PR files and PR view will be inspected. If a warning remains, the exact file, codepoint, and line/context will be documented in the PR body.

## Sanitization

Artifacts use sanitized aliases only. No raw customer names, raw account names, raw creative names, raw account IDs, private screenshots, tokens, cookies, DB URLs, SSH details, or environment-extension files are intentionally included.

This PR remains Draft and resolver-only WIP.
