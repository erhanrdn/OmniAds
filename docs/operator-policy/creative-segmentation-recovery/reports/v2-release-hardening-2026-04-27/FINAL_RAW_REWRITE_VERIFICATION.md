# Final Raw Rewrite Verification

CHATGPT_REVIEW_READY: YES
SANITIZED: YES
MERGE_REQUESTED: NO
MAIN_PUSHED: NO

# Commit

Current PR #82 head commit at rewrite verification:
`7094936bfe1365842c116e0e2763fb39a899de7c`

New rewrite commit SHA:
`7094936bfe1365842c116e0e2763fb39a899de7c`

PR #82 commit-list proof:

```text
count 35
last 7094936bfe1365842c116e0e2763fb39a899de7c
contains_7094936 True
match 7094936bfe1365842c116e0e2763fb39a899de7c chore: manually rewrite creative v2 hardening files with LF newlines
```

PR #82 metadata after push:

```text
head_ref wip/creative-decision-os-v2-integration-candidate-2026-04-27
head_sha 7094936bfe1365842c116e0e2763fb39a899de7c
base_ref wip/creative-decision-os-v2-baseline-first-2026-04-26
draft True
state open
commits 35
```

# Git Show Stat

```text
7094936 chore: manually rewrite creative v2 hardening files with LF newlines
 .github/workflows/ci.yml                     | 15 ++++++++----
 lib/creative-v2-no-write-enforcement.test.ts | 34 ++++++++++++++++------------
 scripts/creative-v2-safety-gate.ts           | 14 +++++++++---
 scripts/creative-v2-self-hosted-smoke.ts     | 18 +++++++++++----
 4 files changed, 53 insertions(+), 28 deletions(-)
```

# Local Line Counts

```text
      90 scripts/creative-v2-safety-gate.ts
     160 lib/creative-v2-no-write-enforcement.test.ts
     149 scripts/creative-v2-self-hosted-smoke.ts
     341 .github/workflows/ci.yml
     740 total
```

Local `awk 'length($0)>220 {print FNR ":" length($0)}'` checks produced no
output for all four target files.

# Public Raw Line Counts

```text
scripts/creative-v2-safety-gate.ts       90
lib/creative-v2-no-write-enforcement.test.ts      160
scripts/creative-v2-self-hosted-smoke.ts      149
.github/workflows/ci.yml      341
```

# Checks

```text
git diff --check: passed
npm test: passed, 307 files, 2203 tests
npx tsc --noEmit: passed
npm run build: passed
npm run creative:v2:safety: passed, 9 files, 51 tests
focused Creative/v2 resolver tests: passed, 1 file, 15 tests
focused Creative/v2 preview tests: passed, 5 files, 28 tests
v2 gold eval: passed, macro F1 97.96, severe 0, high 0, medium 2, low 0
forbidden rendered button/text scan: passed
forbidden internal artifact scan: passed
contract parity check: passed
no-write enforcement tests: passed, 2 files, 6 tests
CI YAML parse check: passed
hidden/bidi/control scan: passed, 15 targeted paths
strict non-ASCII scan: passed, 15 targeted paths
restricted filename scan: passed, 15 targeted paths
secret/raw-ID scan: passed, 15 targeted paths
line-length/readability check: passed, 15 targeted paths, max 188
JSON parse checks: passed, 24 tracked JSON files
```

`npm run creative:v2:safety` result:

```json
{
  "creativeV2SafetyGate": "passed",
  "artifactVersion": "gold-v0.1",
  "rowCount": 78,
  "macroF1": 97.96,
  "mismatchCounts": {
    "severe": 0,
    "high": 0,
    "medium": 2,
    "low": 0,
    "none": 76
  },
  "queueApplySafety": {
    "queueEligibleCount": 0,
    "applyEligibleCount": 0,
    "directScaleCount": 0,
    "inactiveDirectScaleCount": 0,
    "watchPrimaryCount": 0,
    "scaleReviewPrimaryCount": 0
  }
}
```

# Readiness

Product-ready: NO.

Merge-ready to main: NO.

PR #82 ready for PR #78 branch merge consideration: NO.

Queue/apply disabled.

Command Center disconnected.

v1 default.

v2 preview off by default.

PR remains Draft.

No main push.
