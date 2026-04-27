CHATGPT_REVIEW_READY: YES
ROLE: CODEX_WIP_IMPLEMENTATION
BRANCH: wip/creative-decision-os-v2-baseline-first-2026-04-26
HEAD_COMMIT: see PR body
PRIMARY_REPORT_PATH: docs/operator-policy/creative-segmentation-recovery/reports/v2-baseline-first-2026-04-26/
HANDOFF_FILE: docs/operator-policy/creative-segmentation-recovery/reports/v2-baseline-first-2026-04-26/FOR_CHATGPT_REVIEW.md
SANITIZED: YES
PRODUCT_CODE_CHANGED: YES
MERGE_REQUESTED: NO
MAIN_PUSHED: NO

# Creative Decision OS v2 baseline-first WIP

## Executive Summary

This branch remains a resolver-only Creative Decision OS v2 candidate. The resolver is still not integrated into the UI, API response path, queue/apply pipeline, or benchmark generation.

This update fixes the live-audit boundary defect where active historical winners with zero recent ROAS and zero recent purchases could still emit Protect. It also makes actionability more conservative when blocker reasons, degraded truth, data-quality risk, source blockers, or campaign context blockers are present.

No row IDs were hardcoded. The change is a general buyer rule plus actionability semantics.

## Dependency On Gold Labels v0.1

- Gold PR: #77, `[CHATGPT-REVIEW] Creative Decision OS adjudicated gold labels v0`
- Gold branch: `review/creative-decision-os-gold-labels-v0-2026-04-26`
- Gold-v0.1 correction commit used: `bbb606028136f096f855fea599f6a3648e325078`
- Gold artifact copied into this WIP branch: `docs/operator-policy/creative-segmentation-recovery/reports/gold-labels-v0-2026-04-26/gold-labels-v0.json`
- Embedded artifact version: `gold-v0.1`

## What Changed

- Added a general recent-stop rule before Protect: active creatives with credible lifetime/long-window strength, zero recent purchases, zero recent ROAS or severe recent benchmark decay, and enough spend maturity no longer emit Protect.
- Routes recent-stop historical winners to Refresh/review_only when the likely buyer action is creative refresh.
- Routes recent-stop historical winners to Diagnose/diagnose when source, trust, or campaign context makes the buyer action ambiguous.
- Downgrades direct actionability to review_only whenever non-Diagnose outputs carry blocker reasons.
- Keeps Scale review_only and Diagnose diagnose.
- Keeps Test More under degraded truth or data-quality risk review_only instead of direct.
- Adds a Cut safety blocker when a direct Cut has active-state uncertainty, recent conversions, or lacks severe loser evidence.
- Adds synthetic regression tests for both recent-stop paths.
- Adds a source/campaign blocker actionability regression test.
- Adds a formatting hygiene test for v2 source/test/script files.

## Why It Changed

The live DB audit found active historical winners with recent ROAS 0 and recent purchases 0 that were still being protected as stable winners. A buyer should not protect a creative that has stopped converting in the recent window without either refreshing the creative or diagnosing whether status/source/campaign context explains the stop.

The same audit also showed product-facing direct actionability on rows with blockers. Queue/apply stayed conservative, but the resolver's actionability label needed to match buyer safety expectations.

## Exact Defect Class Fixed

Active creative with credible lifetime or long-window strength, mature enough spend, recent purchases equal to 0, and recent ROAS equal to 0 or severely below benchmark must not emit Protect.

Live defect rows covered by the general rule:

- `company-05|company-05-account-01|company-05-campaign-02|company-05-adset-01|company-05-creative-11`
- `company-07|company-07-account-01|company-07-campaign-01|company-07-adset-01|company-07-creative-11`

## Files Changed

- `lib/creative-decision-os-v2.ts`
- `lib/creative-decision-os-v2.test.ts`
- `scripts/creative-decision-os-v2-live-audit.ts`
- `docs/operator-policy/creative-segmentation-recovery/reports/v2-baseline-first-2026-04-26/gold-evaluation.json`
- `docs/operator-policy/creative-segmentation-recovery/reports/v2-baseline-first-2026-04-26/FOR_CHATGPT_REVIEW.md`
- `docs/operator-policy/creative-segmentation-recovery/reports/v2-live-audit-2026-04-26/FOR_CHATGPT_REVIEW.md`
- `docs/operator-policy/creative-segmentation-recovery/reports/v2-live-audit-2026-04-26/live-audit-sanitized.json`
- `docs/operator-policy/creative-segmentation-recovery/reports/v2-live-audit-2026-04-26/live-audit-sanitized.csv`
- `docs/operator-policy/creative-segmentation-recovery/reports/v2-live-audit-2026-04-26/live-decision-diff-main-vs-v2.json`
- `docs/operator-policy/creative-segmentation-recovery/reports/v2-live-audit-2026-04-26/live-safety-summary.json`

No UI, API, queue/apply, benchmark-generation, or existing operator-surface integration was added.

## Exact Commands Run

- `node --import tsx scripts/creative-decision-os-v2-gold-eval.ts --output=docs/operator-policy/creative-segmentation-recovery/reports/v2-baseline-first-2026-04-26/gold-evaluation.json`
- `/Users/harmelek/Adsecute/node_modules/.bin/vitest run lib/creative-decision-os-v2.test.ts`
- `npx tsc --noEmit`
- `npm test`
- `npm run build`
- `npx vitest run lib/creative-decision-os-v2.test.ts lib/creative-decision-os.test.ts lib/creative-operator-policy.test.ts lib/creative-operator-surface.test.ts lib/creative-decision-os-source.test.ts scripts/creative-live-firm-audit.test.ts`
- `npx vitest run lib/creative-decision-os-v2.test.ts -t "keeps emitted resolver output free of internal artifact wording"`
- `<database connection configured via local tunnel; value omitted> DB_QUERY_TIMEOUT_MS=60000 DB_CONNECTION_TIMEOUT_MS=30000 CREATIVE_LIVE_ENV_DIR=/Users/harmelek/Adsecute CREATIVE_LIVE_FIRM_AUDIT_MAX_ROWS=100000 node --import tsx scripts/creative-decision-os-v2-live-audit.ts`
- `git diff --check`
- `git diff --cached --check`
- restricted filename scan for environment-extension files and legacy `summary.env` filenames
- UTF-8 decoded bidi/default-ignorable/control-character scan over PR-changed non-PNG artifacts
- custom secret/key scan over PR-changed non-PNG artifacts
- raw email, URL, and long numeric ID scan over PR-changed non-PNG artifacts

## Test / Typecheck / Build Results

- v2 resolver/gold/product-output/formatting tests: passed. `Test Files 1 passed (1)`, `Tests 15 passed (15)`.
- Product-output forbidden-term test: passed. `Test Files 1 passed (1)`, `Tests 1 passed | 14 skipped (15)`.
- Focused Creative tests: passed. `Test Files 6 passed (6)`, `Tests 155 passed (155)`.
- `npm test`: passed. `Test Files 303 passed (303)`, `Tests 2176 passed (2176)`.
- `npx tsc --noEmit`: passed with no output.
- `npm run build`: passed. Next.js compiled successfully and generated static pages.
- v2 gold evaluation: passed and wrote `gold-evaluation.json`.
- Fresh live audit: passed and wrote the sanitized live audit artifacts.

## Product-Output Forbidden-Term Scan

Test location: `lib/creative-decision-os-v2.test.ts`

The test evaluates every resolver output field for every row in the 78-row gold artifact. It fails if emitted strings include any of these forbidden terms: `gold`, `json`, `fixture`, `PR`, `ChatGPT`, `Claude`, `Codex`, `WIP`, `internal`, or `labels this row`.

Result: passed, zero emitted-output violations.

## Source Formatting Hygiene

The v2 formatting hygiene test checks line count and average line length for:

- `lib/creative-decision-os-v2.ts`
- `lib/creative-decision-os-v2.test.ts`
- `scripts/creative-decision-os-v2-live-audit.ts`

Result: passed. Current line counts are 791, 294, and 562 respectively.

## Gold-v0.1 Score Before / After

| Metric | Before this update | After this update |
| --- | ---: | ---: |
| Rows evaluated | 78 | 78 |
| Macro F1 | 98.95 | 97.96 |
| Severe mismatches | 0 | 0 |
| High mismatches | 0 | 0 |
| Medium mismatches | 1 | 2 |
| Low mismatches | 0 | 0 |
| Scale F1 | 100 | 100 |
| Cut F1 | 100 | 100 |
| Refresh F1 | 97.67 | 95.45 |
| Protect F1 | 100 | 96.3 |
| Test More F1 | 96 | 96 |
| Diagnose F1 | 100 | 100 |

The score change comes from adding the live-defect recent-stop rule. It creates one additional medium Protect-vs-Refresh fixture mismatch while removing the live Protect safety defect.

## Gold-v0.1 Score Table After Fix

Evaluation artifact: `docs/operator-policy/creative-segmentation-recovery/reports/v2-baseline-first-2026-04-26/gold-evaluation.json`

| Decision | TP | FP | FN | Precision | Recall | F1 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Scale | 1 | 0 | 0 | 100 | 100 | 100 |
| Cut | 7 | 0 | 0 | 100 | 100 | 100 |
| Refresh | 21 | 2 | 0 | 91.3 | 100 | 95.45 |
| Protect | 13 | 0 | 1 | 100 | 92.86 | 96.3 |
| Test More | 12 | 0 | 1 | 100 | 92.31 | 96 |
| Diagnose | 22 | 0 | 0 | 100 | 100 | 100 |

## Confusion Matrix After Fix

Rows are gold labels. Columns are v2 predictions.

| Gold \ V2 | Scale | Cut | Refresh | Protect | Test More | Diagnose |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Scale | 1 | 0 | 0 | 0 | 0 | 0 |
| Cut | 0 | 7 | 0 | 0 | 0 | 0 |
| Refresh | 0 | 0 | 21 | 0 | 0 | 0 |
| Protect | 0 | 0 | 1 | 13 | 0 | 0 |
| Test More | 0 | 0 | 1 | 0 | 12 | 0 |
| Diagnose | 0 | 0 | 0 | 0 | 0 | 22 |

## Remaining Gold Mismatches

No severe, high, or low mismatches against gold-v0.1.

| Severity | Row ID | Gold | V2 | Classification | Buyer risk | Rationale |
| --- | --- | --- | --- | --- | --- | --- |
| medium | `company-05|company-05-account-01|company-05-campaign-02|company-05-adset-01|company-05-creative-09` | Protect | Refresh | live-defect coverage tradeoff | medium | Gold treats the row as protectable; v2 now treats zero recent purchases and zero recent ROAS on a historically strong active creative as refresh pressure. |
| medium | `company-07|company-07-account-01|company-07-campaign-01|company-07-adset-01|company-07-creative-06` | Test More | Refresh | gold debatable | low | Both outcomes avoid Scale/Cut. v2 treats peer-level spend with severe below-benchmark performance as refresh pressure; gold prefers more delivery due sparse purchase signal. |

## Queue / Apply Safety Table

| Safety check | Count |
| --- | ---: |
| queueEligible true | 0 |
| applyEligible true | 0 |
| direct Scale | 0 |
| inactive direct Scale | 0 |
| Watch primary output | 0 |
| Scale Review primary output | 0 |

## Fresh Live Audit Addendum

Fresh DB-backed live audit completed through a local tunnel with `DATABASE_URL` configured in-process and omitted from committed artifacts.

Live audit artifact folder: `docs/operator-policy/creative-segmentation-recovery/reports/v2-live-audit-2026-04-26/`

Artifacts:

- `docs/operator-policy/creative-segmentation-recovery/reports/v2-live-audit-2026-04-26/FOR_CHATGPT_REVIEW.md`
- `docs/operator-policy/creative-segmentation-recovery/reports/v2-live-audit-2026-04-26/live-audit-sanitized.json`
- `docs/operator-policy/creative-segmentation-recovery/reports/v2-live-audit-2026-04-26/live-audit-sanitized.csv`
- `docs/operator-policy/creative-segmentation-recovery/reports/v2-live-audit-2026-04-26/live-decision-diff-main-vs-v2.json`
- `docs/operator-policy/creative-segmentation-recovery/reports/v2-live-audit-2026-04-26/live-safety-summary.json`

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

The remaining Cut-on-active-with-recent-conversions watchlist row is review_only with blocker reason `cut_requires_buyer_review`. The remaining Refresh-despite-stable-above-benchmark watchlist row is inactive and review_only with campaign/source blocker reasons.

## Known Risks

- The v2 resolver is not wired into the operator UI or API response path in this branch.
- The added recent-stop rule intentionally prioritizes the fresh live defect over one gold-v0.1 Protect boundary row.
- The live audit is sanitized evidence for review; it is not a launch claim.
- Queue/apply eligibility is intentionally conservative and always false in this branch.

## Hygiene / Sanitization

- Artifacts use sanitized row identifiers such as `company-05|company-05-account-01|...`.
- No raw private account names, raw creative names, screenshots, cookies, tokens, database URLs, SSH details, or environment-extension files are intentionally included.
- Environment-extension artifact scan and legacy `summary.env` filename scan: passed for 10 changed files.
- `git diff --check`: passed.
- `git diff --cached --check`: passed.
- Hidden/bidirectional Unicode scan: passed for 10 changed files.
- Disallowed ASCII control-character scan: passed for 10 changed files.
- GitHub files/PR view hidden-Unicode inspection: no active file-specific warning after template blocks were excluded from the fetched GitHub HTML. The remaining warning text is only GitHub's reusable hidden-character alert template.
- Custom secret/URL/key scan over PR artifacts: passed for 10 changed files.
- Raw email and long numeric ID scan over PR artifacts: passed for 10 changed files.
- Product code changed: yes, v2 resolver/test/report-only audit script changes only.
- This branch is WIP and not merge-requested.
