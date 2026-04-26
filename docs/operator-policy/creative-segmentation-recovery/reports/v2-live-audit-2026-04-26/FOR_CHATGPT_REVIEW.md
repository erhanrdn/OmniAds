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

Fresh DB-backed live audit completed through the local SSH tunnel and wrote sanitized v2 resolver artifacts for 8 businesses, 9 accounts, and 303 creative rows.

The resolver remains pure and unintegrated. No resolver logic, thresholds, gold labels, UI, API, queue/apply behavior, or benchmark generation were changed for this live-audit update.

## Artifact Paths

- `docs/operator-policy/creative-segmentation-recovery/reports/v2-live-audit-2026-04-26/FOR_CHATGPT_REVIEW.md`
- `docs/operator-policy/creative-segmentation-recovery/reports/v2-live-audit-2026-04-26/live-audit-sanitized.json`
- `docs/operator-policy/creative-segmentation-recovery/reports/v2-live-audit-2026-04-26/live-audit-sanitized.csv`
- `docs/operator-policy/creative-segmentation-recovery/reports/v2-live-audit-2026-04-26/live-decision-diff-main-vs-v2.json`
- `docs/operator-policy/creative-segmentation-recovery/reports/v2-live-audit-2026-04-26/live-safety-summary.json`

## Exact Command

The live DB URL was configured in-process through the local tunnel. The value is omitted from committed artifacts.

```bash
<database connection configured via local tunnel; value omitted> DB_QUERY_TIMEOUT_MS=60000 DB_CONNECTION_TIMEOUT_MS=30000 CREATIVE_LIVE_ENV_DIR=/Users/harmelek/Adsecute CREATIVE_LIVE_FIRM_AUDIT_MAX_ROWS=100000 node --import tsx scripts/creative-decision-os-v2-live-audit.ts
```

## Live Audit Summary

| Metric | Value |
| --- | ---: |
| Businesses audited | 8 |
| Accounts audited | 9 |
| Creative rows audited | 303 |
| Main vs v2 changed rows | 99 |
| direct Scale | 0 |
| inactive direct Scale | 0 |
| queueEligible true | 0 |
| applyEligible true | 0 |
| Watch primary | 0 |
| Scale Review primary | 0 |
| Rows with blockerReasons | 33 |
| Direct action despite source/campaign blockers | 52 |
| Test More direct on degraded/data-quality risk | 27 |
| Cut on active creatives with recent conversions | 1 |
| Protect despite recent severe decay | 2 |
| Refresh despite stable above-benchmark performance | 3 |

## Decision Distribution

| Decision | Current | V2 |
| --- | ---: | ---: |
| Scale | 3 | 1 |
| Cut | 29 | 15 |
| Refresh | 30 | 42 |
| Protect | 10 | 16 |
| Test More | 20 | 35 |
| Diagnose | 211 | 194 |

## Changed Rows By Transition

| Transition | Count |
| --- | ---: |
| Cut -> Diagnose | 7 |
| Cut -> Refresh | 6 |
| Cut -> Test More | 5 |
| Diagnose -> Cut | 3 |
| Diagnose -> Protect | 8 |
| Diagnose -> Refresh | 8 |
| Diagnose -> Test More | 22 |
| Protect -> Refresh | 5 |
| Protect -> Scale | 1 |
| Protect -> Test More | 1 |
| Refresh -> Cut | 1 |
| Refresh -> Diagnose | 3 |
| Refresh -> Protect | 4 |
| Refresh -> Test More | 4 |
| Scale -> Diagnose | 1 |
| Scale -> Refresh | 1 |
| Scale -> Test More | 1 |
| Test More -> Diagnose | 13 |
| Test More -> Protect | 1 |
| Test More -> Refresh | 4 |

## Required Watchlists

Full row lists are in `live-safety-summary.json`.

- Direct action despite source/campaign blockers: 52 rows.
- Test More direct on degraded/data-quality risk: 27 rows.
- Cut on active creatives with recent conversions: 1 row.
- Protect despite recent severe decay: 2 rows.
- Refresh despite stable above-benchmark performance: 3 rows.

## Top-Spend And Top-Risk Lists

- Top 20 highest-spend v2 decisions are in `live-safety-summary.json` under `top20HighestSpendV2Decisions`.
- Top 20 highest-risk decision changes are in `live-safety-summary.json` under `top20HighestRiskDecisionChanges`.

## Non-Final Attempts

The first DB-configured attempt used the default 8-second DB query timeout and failed with:

```text
Error: Database query timed out after 8000ms.
```

A second attempt generated the same artifact class but exited nonzero after artifact write because no local dev server was running for a background snapshot-warm fetch:

```text
TypeError: fetch failed
cause: ECONNREFUSED ::1:3000 / 127.0.0.1:3000
```

The committed live-audit artifacts come from the guarded successful rerun with `DB_QUERY_TIMEOUT_MS=60000` and a local API refresh guard inside the report-only audit script.

## Verification

- `npm test`: passed.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed.
- Focused Creative tests: passed.
- v2 gold eval: passed.
- Product-output forbidden-term test: passed.
- Hidden/bidi/control scan: passed.
- Restricted filename scan: passed.
- Secret/raw-ID scan: passed.

## Sanitization

Artifacts use sanitized aliases only. No raw customer names, raw account names, raw creative names, raw account IDs, private screenshots, tokens, cookies, DB URLs, SSH details, or environment-extension files are intentionally included.

This PR remains Draft and resolver-only WIP.
