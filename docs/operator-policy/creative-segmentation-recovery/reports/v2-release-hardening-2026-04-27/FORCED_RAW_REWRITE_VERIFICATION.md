# Forced Raw Rewrite Verification

Date: 2026-04-27

Active branch: `wip/creative-decision-os-v2-integration-candidate-2026-04-27`

## Rewrite Commit

New commit SHA: `9c08a7944ef5efeda9265cfac540d4bd6c53bed4`

Commit subject: `chore: force rewrite creative v2 hardening files`

`git show --stat --oneline -1`:

```text
9c08a79 chore: force rewrite creative v2 hardening files
 .github/workflows/ci.yml                     | 1 +
 lib/creative-v2-no-write-enforcement.test.ts | 4 ++--
 scripts/creative-v2-safety-gate.ts           | 7 ++-----
 scripts/creative-v2-self-hosted-smoke.ts     | 1 +
 4 files changed, 6 insertions(+), 7 deletions(-)
```

## Public Raw Line Counts

```text
curl -fsSL https://raw.githubusercontent.com/erhanrdn/OmniAds/refs/heads/wip/creative-decision-os-v2-integration-candidate-2026-04-27/scripts/creative-v2-safety-gate.ts | wc -l
      87

curl -fsSL https://raw.githubusercontent.com/erhanrdn/OmniAds/refs/heads/wip/creative-decision-os-v2-integration-candidate-2026-04-27/lib/creative-v2-no-write-enforcement.test.ts | wc -l
     160

curl -fsSL https://raw.githubusercontent.com/erhanrdn/OmniAds/refs/heads/wip/creative-decision-os-v2-integration-candidate-2026-04-27/scripts/creative-v2-self-hosted-smoke.ts | wc -l
     150

curl -fsSL https://raw.githubusercontent.com/erhanrdn/OmniAds/refs/heads/wip/creative-decision-os-v2-integration-candidate-2026-04-27/.github/workflows/ci.yml | wc -l
     342
```

## Checks

```text
git diff --check
PASS

npm test
PASS - 307 test files passed, 2203 tests passed

npx tsc --noEmit
PASS

npm run build
PASS

npm run creative:v2:safety
PASS - 9 test files passed, 51 tests passed
macroF1: 97.96
severe: 0
high: 0
queueEligibleCount: 0
applyEligibleCount: 0
directScaleCount: 0
inactiveDirectScaleCount: 0
watchPrimaryCount: 0
scaleReviewPrimaryCount: 0
```

## Release Position

Product-ready: NO

Merge-ready to main: NO

PR #82 ready for PR #78 branch merge consideration: NO

Queue/apply disabled: YES

Command Center disconnected: YES

v1 default: YES

v2 preview off by default: YES

PR remains Draft: YES

No main push: YES
