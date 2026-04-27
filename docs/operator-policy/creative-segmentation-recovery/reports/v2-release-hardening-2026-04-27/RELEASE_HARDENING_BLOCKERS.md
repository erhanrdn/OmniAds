# Release Hardening Blockers

CHATGPT_REVIEW_READY: YES
SANITIZED: YES
MERGE_REQUESTED: NO
MAIN_PUSHED: NO

# Current Decision

Product-ready: NO.

Merge-ready to main: NO.

PR #82 ready for PR #78 branch merge consideration: NO.

PR #82 remains Draft. Main was not pushed.

# Current PR Evidence

Active branch:
`wip/creative-decision-os-v2-integration-candidate-2026-04-27`

Current PR #82 head at Raw verification:
`ca76bf5ff0931d94f3a3ef68eebae2690ef22179`

New newline-normalization commit:
`ca76bf5ff0931d94f3a3ef68eebae2690ef22179`

GitHub confirmed:

```text
commit_exists ca76bf5ff0931d94f3a3ef68eebae2690ef22179
pr_commits_count 31
last ca76bf5ff0931d94f3a3ef68eebae2690ef22179
contains_ca76bf5 True
draft True
state open
```

# Raw Formatting Status

The target files are public Raw multi-line LF files:

```text
scripts/creative-v2-safety-gate.ts: local 82 lines, public Raw 82 lines
lib/creative-v2-no-write-enforcement.test.ts: local 156 lines, public Raw 156 lines
scripts/creative-v2-self-hosted-smoke.ts: local 141 lines, public Raw 141 lines
.github/workflows/ci.yml: local 336 lines, public Raw 336 lines
```

All local and public Raw max-line checks for these four files produced no
output for `awk 'length($0)>220 {print FNR ":" length($0)}'`.

Byte-level diagnosis before and after formatter normalization was identical:

```text
scripts/creative-v2-safety-gate.ts bytes 2578 LF 82 CR 0 U+2028 0 U+2029 0 NEL 0
lib/creative-v2-no-write-enforcement.test.ts bytes 5430 LF 156 CR 0 U+2028 0 U+2029 0 NEL 0
scripts/creative-v2-self-hosted-smoke.ts bytes 4135 LF 141 CR 0 U+2028 0 U+2029 0 NEL 0
.github/workflows/ci.yml bytes 10318 LF 336 CR 0 U+2028 0 U+2029 0 NEL 0
```

The release-hardening Markdown reports were also inspected. All `*.md` reports
in this directory have real LF newlines and no CR, U+2028, U+2029, or NEL.

# Closed Local Hardening Items

| Item | Status |
| --- | --- |
| Public Raw formatting for four target files | closed |
| Local LF byte verification | closed |
| Markdown report collapsed-line inspection | closed |
| Focused Creative/v2 resolver tests | closed |
| Focused Creative/v2 preview tests | closed |
| No-write enforcement tests | closed |
| v2 gold eval | closed, macro F1 97.96 |
| Severe/high mismatch blocker | closed, severe 0, high 0 |
| Queue/apply/direct-scale counters | closed, all 0 |
| Forbidden rendered button/text scan | closed |
| Forbidden internal artifact scan | closed |
| Contract parity check | closed |
| Hidden/bidi/control scan on target set | closed |
| Strict non-ASCII scan on target set | closed |
| Restricted filename scan on target set | closed |
| Secret/raw-ID scan on target set | closed |
| JSON parse checks | closed, 24 tracked JSON files |

# Open Blockers

| Blocker | Status |
| --- | --- |
| Product readiness | open |
| Main merge readiness | open |
| PR #78 branch merge consideration | open |
| Authenticated self-hosted runtime smoke | open |
| Network-level no-write capture in authenticated runtime | open |
| Main-merge hidden/bidi clearance | open; current exception is WIP scoped |
| ChatGPT acceptance of corrected public Raw evidence | open |

# Safety-Gate Result

`npm run creative:v2:safety` passed with:

```text
artifactVersion gold-v0.1
rowCount 78
macroF1 97.96
severe 0
high 0
medium 2
low 0
queueEligibleCount 0
applyEligibleCount 0
directScaleCount 0
inactiveDirectScaleCount 0
watchPrimaryCount 0
scaleReviewPrimaryCount 0
```

# Self-Hosted Runtime Smoke

Status: not executed against self-hosted runtime.

Command was run locally without credential-bearing config and failed safely:

```text
CREATIVE_V2_SMOKE_BASE_URL is required locally to run the self-hosted smoke.
Do not paste or commit domains, tokens, cookies, DB URLs, or credentials.
```

Codex did not ask for domain, DB URL, cookie, token, session, server
credential, or secret.

# Runtime Invariants

Queue/apply disabled.

Command Center disconnected.

v1 default.

v2 preview off by default.

Self-hosted site/DB active infra.

Vercel/Neon deprecated.

No DB/Meta/platform write path added.
