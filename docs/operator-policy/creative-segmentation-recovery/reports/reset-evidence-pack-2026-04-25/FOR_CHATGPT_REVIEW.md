# Creative Decision OS Reset Evidence Pack Handoff

## 1. Executive Summary

This branch contains a sanitized evidence pack only. It does not change product code, policy, thresholds, UI, queue/apply behavior, benchmark logic, or resolver behavior.

The evidence pack inspected `origin/main`, PR #65, PR #74, and a clean stack attempt for PR #65 plus PR #74. Fresh local live DB extraction was blocked by unavailable local DB connectivity, so the live/sanitized audit exports included here are committed sanitized artifacts marked as not fresh local reruns. Exact failed commands and errors are recorded in `live-db-command-failures.json`.

Primary report path:

`docs/operator-policy/creative-segmentation-recovery/reports/reset-evidence-pack-2026-04-25/`

## 2. Branches Inspected

Evidence branch:

- `review/creative-reset-evidence-pack-2026-04-25`
- Base for evidence files: `origin/main`

Inspected refs:

- `origin/main` at `fa838df2be0a93c445680c42d23f4adadb52bd8f`
- `origin/pr/65` at `3a7c5cda41ae83525c31cfc3b4c5772a34030164`
- `origin/pr/74` at `995c59d9e8247c01d0dec47919bf1202bbbb38ec`

Branch status report:

- `branch-status.md`
- `branch-status.json`

Key branch findings:

- PR #65 and PR #74 overlap in `docs/operator-policy/creative-segmentation-recovery/STATE.md`, `lib/creative-operator-policy.test.ts`, and `lib/creative-operator-policy.ts`.
- PR #74 could not be applied after PR #65 without manual conflict resolution.
- Stack attempt conflicted in `docs/operator-policy/creative-segmentation-recovery/STATE.md` and `lib/creative-operator-policy.ts`.
- Changed files for each candidate branch are listed in `branch-status.json`.

## 3. Exact Commands Run

Primary validation and evidence commands are recorded in:

- `test-report.json`
- `live-db-command-failures.json`
- `branch-status.json`
- `screenshots/screenshot-status.json`

Test/build commands used on each runnable branch:

```bash
npm test
npx tsc --noEmit
npm run build
CREATIVE_TESTS="$(git ls-tree -r --name-only HEAD | rg '(^app/.*creatives.*\.test|^app/api/(creatives|meta/creatives).*\.test|^components/creatives/.*\.test|^lib/creative.*\.test|^scripts/creative.*\.test)' | sort | tr '\n' ' ')" && npx vitest run $CREATIVE_TESTS
npx vitest run lib/creative-decision-os.test.ts lib/creative-decision-os-source.test.ts lib/creative-operator-policy.test.ts lib/creative-operator-surface.test.ts scripts/creative-live-firm-audit.test.ts app/api/creatives/decision-os/route.test.ts components/creatives/CreativeDecisionSupportSurface.test.tsx components/creatives/CreativesTableSection.test.tsx 'app/(dashboard)/creatives/page-support.test.ts'
```

Live audit command attempted:

```bash
CREATIVE_LIVE_FIRM_AUDIT_MAX_ROWS=100000 node --import tsx scripts/creative-live-firm-audit.ts
```

Stack command attempted:

```bash
git worktree add --detach /tmp/adsecute-reset-pack-stack origin/pr/65 && cd /tmp/adsecute-reset-pack-stack && git cherry-pick origin/main..origin/pr/74
```

PR metadata commands attempted:

```bash
gh pr view 65 --json number,title,state,isDraft,baseRefName,headRefName,headRepositoryOwner,headRepository,mergeable,url,updatedAt
gh pr view 74 --json number,title,state,isDraft,baseRefName,headRefName,headRepositoryOwner,headRepository,mergeable,url,updatedAt
```

## 4. Test, Typecheck, And Build Results

`origin/main`:

- `npm test`: exit 0, `302` files passed, `2161` tests passed
- `npx tsc --noEmit`: exit 0
- `npm run build`: exit 0
- Focused Creative critical subset: exit 0, `9` files passed, `163` tests passed

PR #65:

- `npm test`: exit 0, `301` files passed, `2188` tests passed
- `npx tsc --noEmit`: exit 0
- `npm run build`: exit 0
- Focused Creative critical subset: exit 0, `9` files passed, `182` tests passed

PR #74:

- `npm test`: exit 0, `302` files passed, `2166` tests passed
- `npx tsc --noEmit`: exit 0
- `npm run build`: exit 0
- Focused Creative critical subset: exit 0, `9` files passed, `168` tests passed

The dynamic all-Creative file-list Vitest command exited 1 with `No test files found`; the stable focused Creative subset passed on all runnable branches.

Detailed logs:

- `logs/main/`
- `logs/pr65/`
- `logs/pr74/`

## 5. Failed Commands And Exact Errors

Recorded in `live-db-command-failures.json`.

Failed or blocked commands:

- `gh pr view 65 --json number,title,state,isDraft,baseRefName,headRefName,headRepositoryOwner,headRepository,mergeable,url,updatedAt`
- `gh pr view 74 --json number,title,state,isDraft,baseRefName,headRefName,headRepositoryOwner,headRepository,mergeable,url,updatedAt`
- Error: `gh auth login required; PR refs were fetched with git instead`

Main live audit first attempt:

- Command: `CREATIVE_LIVE_FIRM_AUDIT_MAX_ROWS=100000 node --import tsx scripts/creative-live-firm-audit.ts`
- Branch: `main`
- Timestamp: `2026-04-26T00:09:52Z`
- Error: `DATABASE_URL is not set. Make sure your PostgreSQL connection string is configured.`

Main live audit rerun:

- Command: `CREATIVE_LIVE_FIRM_AUDIT_MAX_ROWS=100000 node --import tsx scripts/creative-live-firm-audit.ts`
- Branch: `main`
- Timestamp: `2026-04-26T00:10:26Z`
- Error: `connect ECONNREFUSED 127.0.0.1:15432`

PR #65 live audit rerun:

- Command: `CREATIVE_LIVE_FIRM_AUDIT_MAX_ROWS=100000 node --import tsx scripts/creative-live-firm-audit.ts`
- Branch: `pr65`
- Timestamp: `2026-04-26T00:10:32Z`
- Error: `runtimeBlockers: discovery:db_tunnel_connection_refused`

PR #74 live audit rerun:

- Command: `CREATIVE_LIVE_FIRM_AUDIT_MAX_ROWS=100000 node --import tsx scripts/creative-live-firm-audit.ts`
- Branch: `pr74`
- Timestamp: `2026-04-26T00:10:38Z`
- Error: `connect ECONNREFUSED 127.0.0.1:15432`

Unavailable data because of those failures:

- Fresh live Creative audit rows
- Fresh blind review export
- Fresh row decision diff
- Creative UI screenshots for the same live account/date scope

## 6. Artifact Paths

Primary reports:

- `README.md`
- `FOR_CHATGPT_REVIEW.md`
- `branch-status.md`
- `branch-status.json`
- `test-report.md`
- `test-report.json`
- `live-db-command-failures.json`
- `audit-source-status.json`

Audit exports:

- `audits/main/creative-audit.committed-artifact.json`
- `audits/main/creative-audit.committed-artifact.csv`
- `audits/main/blind-review.committed-artifact.json`
- `audits/main/blind-review.committed-artifact.csv`
- `audits/main/fresh-live-rerun-status.json`
- `audits/pr65/creative-audit.committed-artifact.json`
- `audits/pr65/creative-audit.committed-artifact.csv`
- `audits/pr65/blind-review.committed-artifact.json`
- `audits/pr65/blind-review.committed-artifact.csv`
- `audits/pr65/fresh-live-rerun-status.json`
- `audits/pr74/creative-audit.committed-artifact.json`
- `audits/pr74/creative-audit.committed-artifact.csv`
- `audits/pr74/blind-review.committed-artifact.json`
- `audits/pr74/blind-review.committed-artifact.csv`
- `audits/pr74/fresh-live-rerun-status.json`

Diff exports:

- `diffs/main-vs-pr65.committed-artifact-diff.json`
- `diffs/main-vs-pr65.committed-artifact-diff.csv`
- `diffs/main-vs-pr74.committed-artifact-diff.json`
- `diffs/main-vs-pr74.committed-artifact-diff.csv`
- `diffs/pr65-vs-stacked-pr65-pr74.unavailable.json`

Screenshot artifacts:

- `screenshots/screenshot-status.json`
- `screenshots/main-creative-page-attempt.json`
- `screenshots/main-creative-page-attempt.png`

Logs and source artifact folders:

- `logs/`
- `source-artifacts/`

## 7. Main Vs PR #65 Diff Summary

Diff artifact:

- `diffs/main-vs-pr65.committed-artifact-diff.json`
- `diffs/main-vs-pr65.committed-artifact-diff.csv`

Summary:

- Source kind: committed sanitized artifact, not fresh local rerun
- Compared rows: `78`
- Changed rows: `43`
- Primary decision changed rows: `38`
- Actionability changed rows: `24`
- Queue eligibility changed rows: `0`
- Apply eligibility changed rows: `0`

Caveat:

- Committed artifacts use adjacent but different 30-day windows because fresh local live rerun was blocked.

## 8. Main Vs PR #74 Diff Summary

Diff artifact:

- `diffs/main-vs-pr74.committed-artifact-diff.json`
- `diffs/main-vs-pr74.committed-artifact-diff.csv`

Summary:

- Source kind: committed sanitized artifact, not fresh local rerun
- Compared rows: `78`
- Changed rows: `0`
- Primary decision changed rows: `0`
- Actionability changed rows: `0`
- Queue eligibility changed rows: `0`
- Apply eligibility changed rows: `0`

Caveat:

- PR #74 has no fresh branch-specific committed audit artifact in this pack; this comparison uses committed sanitized artifacts only.

## 9. Stacked #65 Plus #74 Summary

Stack artifact:

- `diffs/pr65-vs-stacked-pr65-pr74.unavailable.json`

Result:

- Stacked PR #65 plus PR #74 was unavailable because the stack was not cleanly possible without manual conflict resolution.
- Attempted command: `git worktree add --detach /tmp/adsecute-reset-pack-stack origin/pr/65 && cd /tmp/adsecute-reset-pack-stack && git cherry-pick origin/main..origin/pr/74`
- Conflicted files: `docs/operator-policy/creative-segmentation-recovery/STATE.md`, `lib/creative-operator-policy.ts`

## 10. Live/Sanitized Audit Path

Committed sanitized audit exports are available at:

- `audits/main/creative-audit.committed-artifact.json`
- `audits/main/creative-audit.committed-artifact.csv`
- `audits/pr65/creative-audit.committed-artifact.json`
- `audits/pr65/creative-audit.committed-artifact.csv`
- `audits/pr74/creative-audit.committed-artifact.json`
- `audits/pr74/creative-audit.committed-artifact.csv`

Fresh local live rerun status files:

- `audits/main/fresh-live-rerun-status.json`
- `audits/pr65/fresh-live-rerun-status.json`
- `audits/pr74/fresh-live-rerun-status.json`

## 11. Blind-Review Export Path For Claude

Blind-review exports are available at:

- `audits/main/blind-review.committed-artifact.json`
- `audits/main/blind-review.committed-artifact.csv`
- `audits/pr65/blind-review.committed-artifact.json`
- `audits/pr65/blind-review.committed-artifact.csv`
- `audits/pr74/blind-review.committed-artifact.json`
- `audits/pr74/blind-review.committed-artifact.csv`

## 12. UI Screenshot Paths If Any

Screenshot status:

- `screenshots/screenshot-status.json`

Captured attempt:

- `screenshots/main-creative-page-attempt.png`
- `screenshots/main-creative-page-attempt.json`

The attempt redirected to `/login`, so Creative page top summary/table screenshots for the live account/date scope were not captured.

## 13. No Product Code, Policy, UI, Or Queue/Apply Behavior Changed

Confirmed. This branch commits evidence-pack files only under:

`docs/operator-policy/creative-segmentation-recovery/reports/reset-evidence-pack-2026-04-25/`

No product code, policy, thresholds, UI, queue/apply behavior, benchmark logic, or resolver behavior was changed in this branch.

## 14. Sanitization Confirmation

Confirmed. The committed artifacts use stable aliases for company/account/creative identifiers and do not include raw private account names, raw creative names, `.env` files, secrets, tokens, cookies, DB URLs, SSH details, or private `/tmp` artifacts.

Sanitization and safety checks run before push include:

- `git status --short --branch`
- `git diff --check`
- `git diff --cached --check`
- Custom secret pattern scan over committed evidence-pack artifacts
- Hidden-bidi scan over committed evidence-pack artifacts
- Raw ID/name scan over committed evidence-pack artifacts
- Email scan over committed evidence-pack artifacts
- Restricted filename scan over committed evidence-pack artifacts

External scanners checked but unavailable in this environment:

- `gitleaks`
- `detect-secrets`
- `trufflehog`
- `ripsecrets`

## Hygiene Addendum - 2026-04-26

Codex updated this evidence branch after ChatGPT review to remove environment-style filename extensions from committed evidence logs.

Current summary log paths:

- `logs/main/summary.txt`
- `logs/pr65/summary.txt`
- `logs/pr74/summary.txt`

No product code, policy, threshold, UI, queue/apply behavior, benchmark logic, or resolver behavior changed in this hygiene update.

Additional hygiene checks rerun on the committed report folder:

- `git status --short --branch`
- `git diff --check`
- `git diff --cached --check`
- `.env` extension filename scan
- Hidden/bidirectional Unicode scan
- Non-printing control-character scan, allowing tab/newline/carriage return only
- Custom secret URL/token scan
- Raw numeric ID and email scan
- Raw-name field scan
- Restricted filename scan

Scanner note: a byte-oriented control scan can misclassify valid UTF-8 continuation bytes in Next.js build-log symbols as C1 control code points. The final scan was rerun with UTF-8 decoding before classifying characters.

Final scan result: no environment-extension artifact files remain in this PR branch; no hidden/bidirectional Unicode or disallowed control characters were found in non-PNG evidence artifacts.

## Hygiene Addendum 2 - 2026-04-26

Codex rechecked the PR after ChatGPT reported that GitHub still showed environment-extension files and hidden/bidirectional warnings.

GitHub files-view verification:

- Connector file list for PR #75 shows `logs/main/summary.txt`, `logs/pr65/summary.txt`, and `logs/pr74/summary.txt`.
- Cache-busted public GitHub files view shows extension filters: `.csv`, `.json`, `.log`, `.md`, `.png`, `.txt`; it no longer shows an environment-extension filter.
- Git tree scan for environment-style filenames and legacy summary-log filenames returned no matches for this branch.

GitHub hidden-character warning investigation:

- Cache-busted public GitHub files-view HTML contains GitHub's generic `js-file-alert-template` inside the `js-check-hidden-unicode` diff wrapper for `FOR_CHATGPT_REVIEW.md`.
- Remote raw file scan for `FOR_CHATGPT_REVIEW.md` found no hidden, bidi, default-ignorable, or disallowed control codepoints.
- Local branch-wide UTF-8 decoded scan over PR-changed non-PNG artifacts found no hidden, bidi, default-ignorable, or disallowed control codepoints.
- Therefore there is no exact bad codepoint to remove from the current raw artifact. The exact static HTML source of the warning text is GitHub's alert template, not a character present in the raw file.
