CHATGPT_REVIEW_READY: YES
ROLE: CODEX_WIP_IMPLEMENTATION
BRANCH: wip/creative-decision-os-v2-baseline-first-2026-04-26
HEAD_COMMIT: see Draft PR metadata after push
PRIMARY_REPORT_PATH: docs/operator-policy/creative-segmentation-recovery/reports/v2-baseline-first-2026-04-26/
HANDOFF_FILE: docs/operator-policy/creative-segmentation-recovery/reports/v2-baseline-first-2026-04-26/FOR_CHATGPT_REVIEW.md
SANITIZED: YES
PRODUCT_CODE_CHANGED: YES
MERGE_REQUESTED: NO
MAIN_PUSHED: NO

# Creative Decision OS v2 baseline-first WIP

## Executive Summary

This WIP branch adds a pure Creative Decision OS v2 resolver/classifier layer plus focused tests and gold-set evaluation tooling. It does not integrate the resolver into the UI, operator surface, queue/apply pipeline, or benchmark generation. Existing queue/apply behavior is not loosened; v2 emits `queueEligible: false` and `applyEligible: false` for every evaluated fixture row.

Gold-label dependency exists as PR #77, branch `review/creative-decision-os-gold-labels-v0-2026-04-26`, commit `6a2450e963d7a6ba741fd884c8818edd7c416fb2`. This WIP was based on `origin/main` commit `fa838df2be0a93c445680c42d23f4adadb52bd8f`.

Fresh live audit could not run because no database connection string was configured in this shell. The PR remains WIP.

## Dependency On Gold Labels v0

- Gold PR: #77, `[CHATGPT-REVIEW] Creative Decision OS adjudicated gold labels v0`
- Gold branch: `review/creative-decision-os-gold-labels-v0-2026-04-26`
- Gold commit used: `6a2450e963d7a6ba741fd884c8818edd7c416fb2`
- Gold artifact copied into this WIP branch: `docs/operator-policy/creative-segmentation-recovery/reports/gold-labels-v0-2026-04-26/gold-labels-v0.json`
- Note: PR #77 handoff text describes the huge-spend loser row `company-05|company-05-account-01|company-05-campaign-03|company-05-adset-02|company-05-creative-03` as Cut/direct, but the machine-readable `gold-labels-v0.json` labels that row `Test More`. This WIP follows the Part C rule for huge-spend severe losers and therefore emits `Cut` for that row, creating one medium mismatch against the JSON.

## Files Changed

- `lib/creative-decision-os-v2.ts`
- `lib/creative-decision-os-v2-evaluation.ts`
- `lib/creative-decision-os-v2.test.ts`
- `scripts/creative-decision-os-v2-gold-eval.ts`
- `docs/operator-policy/creative-segmentation-recovery/reports/gold-labels-v0-2026-04-26/gold-labels-v0.json`
- `docs/operator-policy/creative-segmentation-recovery/reports/v2-baseline-first-2026-04-26/gold-evaluation.json`
- `docs/operator-policy/creative-segmentation-recovery/reports/v2-baseline-first-2026-04-26/FOR_CHATGPT_REVIEW.md`

## Exact Commands Run

- `git ls-remote --heads origin 'review/creative-decision-os-gold-labels-v0-2026-04-26' 'wip/creative-decision-os-v2-baseline-first-2026-04-26'`
- `git fetch origin main review/creative-decision-os-gold-labels-v0-2026-04-26`
- `git worktree add -B wip/creative-decision-os-v2-baseline-first-2026-04-26 /tmp/adsecute-v2-baseline-pr origin/main`
- `git checkout origin/review/creative-decision-os-gold-labels-v0-2026-04-26 -- docs/operator-policy/creative-segmentation-recovery/reports/gold-labels-v0-2026-04-26/gold-labels-v0.json`
- `/Users/harmelek/Adsecute/node_modules/.bin/vitest run lib/creative-decision-os-v2.test.ts`
- `npm test`
- `npx tsc --noEmit`
- `npx vitest run lib/creative-decision-os-v2.test.ts lib/creative-decision-os.test.ts lib/creative-decision-os-source.test.ts lib/creative-operator-policy.test.ts lib/creative-operator-surface.test.ts scripts/creative-live-firm-audit.test.ts app/api/creatives/decision-os/route.test.ts components/creatives/CreativeDecisionSupportSurface.test.tsx components/creatives/CreativesTableSection.test.tsx 'app/(dashboard)/creatives/page-support.test.ts'`
- `npm run build`
- `node --import tsx scripts/creative-decision-os-v2-gold-eval.ts --output=docs/operator-policy/creative-segmentation-recovery/reports/v2-baseline-first-2026-04-26/gold-evaluation.json`
- `CREATIVE_LIVE_FIRM_AUDIT_MAX_ROWS=100000 node --import tsx scripts/creative-live-firm-audit.ts`
- `date -Is`
- `date '+%Y-%m-%dT%H:%M:%S%z'`
- `git status --short --branch`
- `git diff --cached --name-status`
- `git diff --check`
- `git diff --cached --check`
- `find docs/operator-policy/creative-segmentation-recovery/reports -name '*.env' -print`
- `find docs/operator-policy/creative-segmentation-recovery/reports -name 'summary.env' -print`
- `command -v gitleaks || command -v trufflehog || command -v detect-secrets || command -v secret-scan || true`
- `perl -CS -e 'my $bad=0; for my $f (@ARGV) { open my $fh, "<:encoding(UTF-8)", $f or next; my $line=0; while (my $s=<$fh>) { $line++; if ($s =~ /[\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2066}-\x{2069}\x{FEFF}]/) { print "$f:$line hidden_or_bidi_unicode\n"; $bad=1; } } } print "no hidden/bidi unicode characters found in staged files\n" unless $bad; exit $bad' $(git diff --cached --name-only)`
- `perl -e 'my $bad=0; for my $f (@ARGV) { open my $fh, "<", $f or next; my $line=0; while (my $s=<$fh>) { $line++; if ($s =~ /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/) { print "$f:$line control_character\n"; $bad=1; } } } print "no disallowed ASCII control characters found in staged files\n" unless $bad; exit $bad' $(git diff --cached --name-only)`
- `rg -n --pcre2 '(postgres(?:ql)?[:][/][/]|mysql[:][/][/]|mongodb(?:\+srv)?[:][/][/]|redis[:][/][/]|BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]+|gh[pousr]_[A-Za-z0-9_]{30,})' $(git diff --cached --name-only)`
- `rg -n --pcre2 '([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|https?://|\b\d{12,}\b)' $(git diff --cached --name-only)`

## Test / Typecheck / Build Results

- `npm test`: passed. `Test Files 303 passed (303)`, `Tests 2171 passed (2171)`.
- `npx tsc --noEmit`: passed with no output.
- `npm run build`: passed. Next.js compiled successfully and generated static pages.
- Focused Creative tests: passed. `Test Files 10 passed (10)`, `Tests 173 passed (173)`.
- v2 resolver/gold tests: passed. `Test Files 1 passed (1)`, `Tests 10 passed (10)`.

## Failed Commands And Exact Errors

### Fresh live audit

- Branch: `wip/creative-decision-os-v2-baseline-first-2026-04-26`
- Timestamp recorded after failure with portable date command: `2026-04-26T04:32:12+0300`
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

### Timestamp helper

- Command:

```bash
date -Is
```

- Exact error:

```text
date: invalid argument 's' for -I
```

- Follow-up command succeeded:

```bash
date '+%Y-%m-%dT%H:%M:%S%z'
```

## Gold-Set Score Table

Gold artifact: `docs/operator-policy/creative-segmentation-recovery/reports/gold-labels-v0-2026-04-26/gold-labels-v0.json`

Evaluation artifact: `docs/operator-policy/creative-segmentation-recovery/reports/v2-baseline-first-2026-04-26/gold-evaluation.json`

- Rows evaluated: 78
- Macro F1: 91.27
- Severe mismatches: 0
- High mismatches: 0
- Medium mismatches: 6
- Low mismatches: 2

| Decision | TP | FP | FN | Precision | Recall | F1 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Scale | 1 | 0 | 0 | 100 | 100 | 100 |
| Cut | 4 | 1 | 0 | 80 | 100 | 88.89 |
| Refresh | 19 | 3 | 2 | 86.36 | 90.48 | 88.37 |
| Protect | 13 | 0 | 1 | 100 | 92.86 | 96.3 |
| Test More | 13 | 4 | 3 | 76.47 | 81.25 | 78.79 |
| Diagnose | 20 | 0 | 2 | 100 | 90.91 | 95.24 |

## Confusion Matrix

Rows are gold labels. Columns are v2 predictions.

| Gold \ V2 | Scale | Cut | Refresh | Protect | Test More | Diagnose |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Scale | 1 | 0 | 0 | 0 | 0 | 0 |
| Cut | 0 | 4 | 0 | 0 | 0 | 0 |
| Refresh | 0 | 0 | 19 | 0 | 2 | 0 |
| Protect | 0 | 0 | 1 | 13 | 0 | 0 |
| Test More | 0 | 1 | 2 | 0 | 13 | 0 |
| Diagnose | 0 | 0 | 0 | 0 | 2 | 20 |

## Before / After Decision Diff

Current Adsecute mapped decision to v2 decision, aggregate over the 78-row gold set:

| Current mapped decision -> v2 decision | Count |
| --- | ---: |
| Cut -> Diagnose | 1 |
| Cut -> Refresh | 3 |
| Cut -> Test More | 4 |
| Diagnose -> Refresh | 1 |
| Diagnose -> Test More | 1 |
| Protect -> Refresh | 5 |
| Protect -> Scale | 1 |
| Protect -> Test More | 4 |
| Refresh -> Cut | 1 |
| Refresh -> Diagnose | 3 |
| Refresh -> Protect | 2 |
| Refresh -> Test More | 2 |
| Scale -> Diagnose | 2 |
| Scale -> Protect | 1 |
| Scale -> Refresh | 2 |
| Scale -> Test More | 1 |
| Test More -> Diagnose | 3 |
| Test More -> Protect | 4 |
| Test More -> Refresh | 2 |

Full row-level before/after diff is in `gold-evaluation.json` under `changedFromCurrent`. Changed row count: 43.

## Severe / High / Medium Mismatch List

No severe mismatches and no high mismatches against gold v0.

Medium mismatches:

| Row ID | Gold | V2 | Gold actionability | V2 actionability | V2 reason tags |
| --- | --- | --- | --- | --- | --- |
| `company-03|company-03-account-01|company-03-campaign-01|company-03-adset-01|company-03-creative-05` | Test More | Refresh | direct | review_only | active_conversions_below_benchmark, refresh_before_cut |
| `company-03|company-03-account-01|company-03-campaign-01|company-03-adset-01|company-03-creative-06` | Protect | Refresh | direct | review_only | around_benchmark_recent_decay, refresh_candidate |
| `company-05|company-05-account-01|company-05-campaign-03|company-05-adset-02|company-05-creative-03` | Test More | Cut | direct | direct | huge_spend_severe_loser, below_benchmark, no_recovery |
| `company-07|company-07-account-01|company-07-campaign-01|company-07-adset-01|company-07-creative-06` | Test More | Refresh | direct | review_only | below_benchmark, creative_refresh_candidate |
| `company-07|company-07-account-01|company-07-campaign-01|company-07-adset-01|company-07-creative-09` | Refresh | Test More | review_only | direct | below_benchmark, recent_conversion_rebound |
| `company-08|company-08-account-01|company-08-campaign-02|company-08-adset-06|company-08-creative-07` | Refresh | Test More | review_only | direct | below_benchmark, degraded_truth, needs_more_delivery |

Low mismatches:

| Row ID | Gold | V2 | Gold actionability | V2 actionability | V2 reason tags |
| --- | --- | --- | --- | --- | --- |
| `company-07|company-07-account-01|company-07-campaign-01|company-07-adset-01|company-07-creative-10` | Diagnose | Test More | diagnose | direct | weak_read_with_conversion, test_more_before_cut |
| `company-08|company-08-account-01|company-08-campaign-02|company-08-adset-06|company-08-creative-10` | Diagnose | Test More | diagnose | direct | degraded_truth, below_peer_spend, confirm_before_cut |

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

- Gold v0 PR #77 has a machine-readable/text inconsistency for the huge-spend loser row listed above.
- The v2 resolver is not wired into the operator UI or API response path in this WIP.
- The fixture score is against gold v0 only; fresh live audit is unavailable in this shell.
- Queue/apply eligibility is intentionally conservative in this WIP and always false.

## Hygiene / Sanitization

- Artifacts use sanitized row identifiers such as `company-05|company-05-account-01|...`.
- No raw private account names, raw creative names, screenshots, cookies, tokens, DB URLs, or `.env` files are intentionally included.
- `.env` and `summary.env` artifact scan: no files found.
- `git diff --check` and `git diff --cached --check`: no whitespace errors.
- Hidden/bidirectional Unicode scan: no hidden/bidi Unicode characters found in staged files.
- Disallowed ASCII control-character scan: no findings.
- External secret scanners checked: `gitleaks`, `trufflehog`, `detect-secrets`, and `secret-scan` were not available on PATH.
- Custom secret/URL/key scan over staged files: no findings.
- Raw identifier scan over staged files for emails, URLs, and long numeric IDs: no findings.
- No product policy, threshold, UI, queue/apply behavior, or benchmark-generation behavior is modified in existing product paths.
- Product code changed: yes, as new v2 resolver/evaluation files and tests only.
- This branch is WIP and not merge-requested.
