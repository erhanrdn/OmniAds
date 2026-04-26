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

This WIP branch adds a pure Creative Decision OS v2 resolver/classifier layer plus focused tests and gold-set evaluation tooling. It does not integrate the resolver into the UI, operator surface, API response path, queue/apply pipeline, or benchmark generation.

This update removes internal artifact wording from emitted resolver output, adds a product-output forbidden-term test, and retunes general Refresh/Test More/Diagnose boundary rules without row ID hardcoding.

The branch evaluates against PR #77 gold-v0.1 from commit `bbb606028136f096f855fea599f6a3648e325078`. Fresh live audit could not run because no database connection string was configured in this shell. The PR remains WIP.

## Dependency On Gold Labels v0.1

- Gold PR: #77, `[CHATGPT-REVIEW] Creative Decision OS adjudicated gold labels v0`
- Gold branch: `review/creative-decision-os-gold-labels-v0-2026-04-26`
- Gold-v0.1 correction commit used: `bbb606028136f096f855fea599f6a3648e325078`
- Gold artifact copied into this WIP branch: `docs/operator-policy/creative-segmentation-recovery/reports/gold-labels-v0-2026-04-26/gold-labels-v0.json`
- Embedded artifact version: `gold-v0.1`

## Files Changed

- `lib/creative-decision-os-v2.ts`
- `lib/creative-decision-os-v2-evaluation.ts`
- `lib/creative-decision-os-v2.test.ts`
- `scripts/creative-decision-os-v2-gold-eval.ts`
- `docs/operator-policy/creative-segmentation-recovery/reports/gold-labels-v0-2026-04-26/gold-labels-v0.json`
- `docs/operator-policy/creative-segmentation-recovery/reports/v2-baseline-first-2026-04-26/gold-evaluation.json`
- `docs/operator-policy/creative-segmentation-recovery/reports/v2-baseline-first-2026-04-26/FOR_CHATGPT_REVIEW.md`

No UI, API, queue/apply, benchmark-generation, or existing operator-surface integration was added.

## Exact Commands Run

- `git fetch origin wip/creative-decision-os-v2-baseline-first-2026-04-26`
- `node --import tsx scripts/creative-decision-os-v2-gold-eval.ts --output=docs/operator-policy/creative-segmentation-recovery/reports/v2-baseline-first-2026-04-26/gold-evaluation.json`
- `/Users/harmelek/Adsecute/node_modules/.bin/vitest run lib/creative-decision-os-v2.test.ts`
- `date '+%Y-%m-%dT%H:%M:%S%z'`
- `CREATIVE_LIVE_FIRM_AUDIT_MAX_ROWS=100000 node --import tsx scripts/creative-live-firm-audit.ts`
- `npx tsc --noEmit`
- `npx vitest run lib/creative-decision-os-v2.test.ts lib/creative-decision-os.test.ts lib/creative-decision-os-source.test.ts lib/creative-operator-policy.test.ts lib/creative-operator-surface.test.ts scripts/creative-live-firm-audit.test.ts app/api/creatives/decision-os/route.test.ts components/creatives/CreativeDecisionSupportSurface.test.tsx components/creatives/CreativesTableSection.test.tsx 'app/(dashboard)/creatives/page-support.test.ts'`
- `npm test`
- `npm run build`
- `git diff --check`
- `git diff --cached --check`
- restricted filename scan for environment-extension files and legacy `summary.env` filenames
- UTF-8 decoded bidi/default-ignorable/control-character scan over PR-changed non-PNG artifacts
- custom secret/key scan over PR-changed non-PNG artifacts
- raw email, URL, and long numeric ID scan over PR-changed non-PNG artifacts

## Test / Typecheck / Build Results

- v2 resolver/gold/product-output tests: passed. `Test Files 1 passed (1)`, `Tests 11 passed (11)`.
- Product-output forbidden-term test: passed with zero violations across all resolver output fields for all 78 gold rows.
- Focused Creative tests: passed. `Test Files 10 passed (10)`, `Tests 174 passed (174)`.
- `npm test`: passed. `Test Files 303 passed (303)`, `Tests 2172 passed (2172)`.
- `npx tsc --noEmit`: passed with no output.
- `npm run build`: passed. Next.js compiled successfully and generated static pages.
- v2 gold evaluation: passed and wrote `gold-evaluation.json`.

## Product-Output Forbidden-Term Scan

Test location: `lib/creative-decision-os-v2.test.ts`

The test evaluates every resolver output field for every row in the 78-row gold artifact. It fails if emitted strings include any of these forbidden terms: `gold`, `json`, `fixture`, `PR`, `ChatGPT`, `Claude`, `Codex`, `WIP`, `internal`, or `labels this row`.

Result: passed, zero emitted-output violations.

## Failed Commands And Exact Errors

### Fresh live audit

- Branch: `wip/creative-decision-os-v2-baseline-first-2026-04-26`
- Timestamp before failure: `2026-04-26T14:17:18+0300`
- Command:

```bash
CREATIVE_LIVE_FIRM_AUDIT_MAX_ROWS=100000 node --import tsx scripts/creative-live-firm-audit.ts
```

- Exact error:

```text
Error: DATABASE_URL is not set. Make sure your PostgreSQL connection string is configured.
    at getDatabaseUrl (/private/tmp/adsecute-v2-baseline-pr/lib/db.ts:366:11)
    at createPool (/private/tmp/adsecute-v2-baseline-pr/lib/db.ts:516:23)
    at getDb (/private/tmp/adsecute-v2-baseline-pr/lib/db.ts:679:47)
    at getCandidateBusinesses (/private/tmp/adsecute-v2-baseline-pr/scripts/creative-segmentation-calibration-lab.ts:843:15)
    at discoverRuntimeEligibleBusinesses (/private/tmp/adsecute-v2-baseline-pr/scripts/creative-live-firm-audit.ts:647:31)
    at runCreativeLiveFirmAudit (/private/tmp/adsecute-v2-baseline-pr/scripts/creative-live-firm-audit.ts:808:29)
    at path (/private/tmp/adsecute-v2-baseline-pr/scripts/creative-live-firm-audit.ts:1094:3)
    at Object.<anonymous> (/private/tmp/adsecute-v2-baseline-pr/scripts/creative-live-firm-audit.ts:1102:1)
    at Module._compile (node:internal/modules/cjs/loader:1692:14)
    at Object.transformer (/Users/harmelek/Adsecute/node_modules/tsx/dist/register-D46fvsV_.cjs:3:1104)
```

- Data unavailable: no fresh live Creative audit rows, no fresh live UI screenshots, and no fresh live branch-vs-v2 decision diff could be produced from the database.

## Gold-Set Score Table

Gold artifact: `docs/operator-policy/creative-segmentation-recovery/reports/gold-labels-v0-2026-04-26/gold-labels-v0.json`

Evaluation artifact: `docs/operator-policy/creative-segmentation-recovery/reports/v2-baseline-first-2026-04-26/gold-evaluation.json`

- Rows evaluated: 78
- Macro F1: 98.95
- Severe mismatches: 0
- High mismatches: 0
- Medium mismatches: 1
- Low mismatches: 0

| Decision | TP | FP | FN | Precision | Recall | F1 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Scale | 1 | 0 | 0 | 100 | 100 | 100 |
| Cut | 7 | 0 | 0 | 100 | 100 | 100 |
| Refresh | 21 | 1 | 0 | 95.45 | 100 | 97.67 |
| Protect | 14 | 0 | 0 | 100 | 100 | 100 |
| Test More | 12 | 0 | 1 | 100 | 92.31 | 96 |
| Diagnose | 22 | 0 | 0 | 100 | 100 | 100 |

## Confusion Matrix

Rows are gold labels. Columns are v2 predictions.

| Gold \ V2 | Scale | Cut | Refresh | Protect | Test More | Diagnose |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Scale | 1 | 0 | 0 | 0 | 0 | 0 |
| Cut | 0 | 7 | 0 | 0 | 0 | 0 |
| Refresh | 0 | 0 | 21 | 0 | 0 | 0 |
| Protect | 0 | 0 | 0 | 14 | 0 | 0 |
| Test More | 0 | 0 | 1 | 0 | 12 | 0 |
| Diagnose | 0 | 0 | 0 | 0 | 0 | 22 |

## Before / After Decision Diff

Current Adsecute mapped decision to v2 decision, aggregate over the 78-row gold set:

| Current mapped decision -> v2 decision | Count |
| --- | ---: |
| Cut -> Diagnose | 1 |
| Cut -> Refresh | 3 |
| Cut -> Test More | 2 |
| Diagnose -> Test More | 2 |
| Protect -> Diagnose | 1 |
| Protect -> Refresh | 6 |
| Protect -> Scale | 1 |
| Protect -> Test More | 2 |
| Refresh -> Cut | 1 |
| Refresh -> Diagnose | 4 |
| Refresh -> Protect | 3 |
| Scale -> Diagnose | 2 |
| Scale -> Protect | 1 |
| Scale -> Refresh | 2 |
| Scale -> Test More | 1 |
| Test More -> Diagnose | 3 |
| Test More -> Protect | 4 |
| Test More -> Refresh | 2 |

Full row-level before/after diff is in `gold-evaluation.json` under `changedFromCurrent`. Changed row count: 41.

## Remaining Mismatch And Buyer-Risk Classification

No severe, high, or low mismatches against gold-v0.1.

| Severity | Row ID | Gold | V2 | Actionability delta | Classification | Buyer risk | Rationale |
| --- | --- | --- | --- | --- | --- | --- | --- |
| medium | `company-07|company-07-account-01|company-07-campaign-01|company-07-adset-01|company-07-creative-06` | Test More | Refresh | direct -> review_only | gold debatable | low | Both outcomes avoid Scale/Cut. v2 treats peer-level spend with severe below-benchmark performance as refresh pressure; gold prefers more delivery due sparse purchase signal. |

## Queue / Apply Safety Table

| Safety check | Count |
| --- | ---: |
| queueEligible true | 0 |
| applyEligible true | 0 |
| direct Scale | 0 |
| inactive direct Scale | 0 |
| Watch primary output | 0 |
| Scale Review primary output | 0 |

## Fresh Live Audit Result

Fresh live audit did not run because `DATABASE_URL` was not configured. The exact command and error are documented above. No raw live rows or customer-identifying screenshots were generated by this WIP branch.

## Known Risks

- The fixture score is against gold-v0.1 only; fresh live audit is unavailable in this shell.
- The v2 resolver is not wired into the operator UI or API response path in this WIP.
- One remaining boundary mismatch remains between Test More and Refresh.
- Queue/apply eligibility is intentionally conservative in this WIP and always false.

## Hygiene / Sanitization

- Artifacts use sanitized row identifiers such as `company-05|company-05-account-01|...`.
- No raw private account names, raw creative names, screenshots, cookies, tokens, database URLs, or environment-extension files are intentionally included.
- Environment-extension artifact scan and legacy `summary.env` filename scan: no files found in PR artifacts.
- `git diff --check` and `git diff --cached --check`: no whitespace errors.
- Hidden/bidirectional Unicode scan: no hidden/bidi Unicode characters found in PR artifacts.
- Disallowed ASCII control-character scan: no findings.
- Custom secret/URL/key scan over PR artifacts: no findings.
- Raw email and long numeric ID scan over PR artifacts: no findings.
- No existing product policy, threshold, UI, queue/apply behavior, or benchmark-generation behavior is modified.
- Product code changed: yes, as v2 resolver/evaluation files and tests only.
- This branch is WIP and not merge-requested.
