# Codex Authorized Runtime Smoke And GitHub Hygiene

Date: 2026-04-28

Verdict: `MAIN_LIVE_NOT_READY__CODEX_RUNTIME_ACCESS_GAP__NO_OWNER_MANUAL_RUN_REQUESTED`

Confidence score: `80/100`

Consolidated #78 WIP limited read-only preview continuation: ACCEPTABLE

Product-ready: NO

Main merge-ready: NO

Live deploy-ready: NO

Queue/apply safe: NO

## Scope

Repository: `https://github.com/erhanrdn/OmniAds`

Branch checked: `wip/creative-decision-os-v2-baseline-first-2026-04-26`

SHA checked: `34d9ae21e34646bfe6493f498616d66a51ce887d`

Report branch: `review/creative-v2-pr78-codex-authorized-runtime-smoke-and-github-hygiene-2026-04-28`

No merge was performed. No deploy was triggered. No product-ready claim was made.

No secret, token, cookie, browser state, DB URL, server credential, domain, account ID, business ID, creative ID, screenshot, session value, or private runtime credential was requested or committed.

No product code, resolver logic, gold labels, v1 behavior, UI behavior, queue/apply behavior, Command Center wiring, DB write path, or Meta/platform write path was changed by this review branch.

## GitHub State Re-Check

PR #78:

```text
state=open
draft=true
merged=false
head.ref=wip/creative-decision-os-v2-baseline-first-2026-04-26
head.sha=34d9ae21e34646bfe6493f498616d66a51ce887d
base.ref=main
base.sha=fa838df2be0a93c445680c42d23f4adadb52bd8f
```

PR #82:

```text
state=closed
draft=true
merged=true
merge_commit_sha=2a2b66d4bc9b8123d45339b3e8287460c4312434
head.ref=wip/creative-decision-os-v2-integration-candidate-2026-04-27
head.sha=63dae7447f3647d76a7874bd45d560a9a8c222cb
base.ref=wip/creative-decision-os-v2-baseline-first-2026-04-26
base.sha=3da2e05cb47f97de89ee42d9af6a64598af8b17a
```

Branch heads:

```text
main: fa838df2be0a93c445680c42d23f4adadb52bd8f
wip/creative-decision-os-v2-baseline-first-2026-04-26: 34d9ae21e34646bfe6493f498616d66a51ce887d
wip/creative-decision-os-v2-integration-candidate-2026-04-27: 63dae7447f3647d76a7874bd45d560a9a8c222cb
```

Conclusion: PR #82 was merged into the PR #78 WIP branch, not main. Main was not touched by the #82/#78 WIP work.

## PR #78 Check-Runs

GitHub check-runs for `34d9ae21e34646bfe6493f498616d66a51ce887d`:

```text
typecheck | status=completed | conclusion=success | annotations=1
test | status=completed | conclusion=success | annotations=1
build | status=completed | conclusion=success | annotations=1
detect-runtime-changes | status=completed | conclusion=skipped | annotations=0
dispatch-deploy | status=completed | conclusion=skipped | annotations=0
publish-web-image | status=completed | conclusion=skipped | annotations=0
publish-worker-image | status=completed | conclusion=skipped | annotations=0
skip-runtime-deploy | status=completed | conclusion=skipped | annotations=0
```

Deploy/publish/runtime jobs were skipped. No live deploy was triggered.

## Prior Codex Preflight Report Verification

Verified report branch:

```text
review/creative-v2-pr78-main-live-readiness-preflight-2026-04-28
```

Verified report path:

```text
docs/operator-policy/creative-segmentation-recovery/reports/v2-main-live-readiness-2026-04-28/CODEX_MAIN_LIVE_READINESS_PREFLIGHT.md
```

Verified report verdict:

```text
MAIN_LIVE_NOT_READY__PREFLIGHT_STATIC_GATES_GREEN__OWNER_RUNTIME_EVIDENCE_REQUIRED
```

Cross-checked prior report decisions:

```text
Product-ready: NO
Main merge-ready: NO
Live deploy-ready: NO
Queue/apply safe: NO
Static gates: green
Runtime no-write/network capture: incomplete
Self-hosted smoke: skipped due missing runtime config
Hidden/bidi GitHub UI clearance: incomplete
```

## Runtime Smoke Access And Config Discovery

Script requirements were inspected in `scripts/creative-v2-self-hosted-smoke.ts`.

Required base environment:

```text
CREATIVE_V2_SMOKE_BASE_URL
```

Optional authenticated context:

```text
CREATIVE_V2_SMOKE_STORAGE_STATE
```

The script captures unsafe runtime requests with these methods:

```text
POST, PUT, PATCH, DELETE
```

Sanitized config presence:

```text
script.creative:v2:self-hosted-smoke=true
CREATIVE_V2_SMOKE_BASE_URL.configured=false initially
CREATIVE_V2_SMOKE_STORAGE_STATE.configured=false
DATABASE_URL.configured=false initially
existing storage-state files found=false
```

Owner-delegated local tunnel/dev setup was attempted using only process-local environment values and without printing private values. The local app started and served `http://localhost:3000`.

Unauthenticated smoke attempt:

```text
CREATIVE_V2_SMOKE_BASE_URL=http://localhost:3000 npm run creative:v2:self-hosted-smoke
FAIL - redirected to login / unauthenticated access gap; page.goto timed out waiting for /creatives networkidle.
```

The app logs showed unauthenticated `/api/auth/me` responses. No private URL, cookie, token, DB URL, storage state, account ID, business ID, creative ID, or screenshot was recorded.

`/api/auth/demo-login` was inspected but not used because it deletes and creates session rows in the database. That would violate the no-DB-write rule for this task.

Runtime smoke result fields:

```text
npm run creative:v2:self-hosted-smoke=FAIL_UNAUTHENTICATED_ACCESS_GAP
unsafeMutationRequests=not_assessed
forbiddenRenderedActionTerms=not_assessed
forbiddenRenderedInternalTerms=not_assessed
v2PreviewOffByDefault=not_assessed
v2PreviewWithFlag=not_assessed
runtimeNetworkCaptureComplete=false
selfHostedSiteEvidence=partial_local_boot_only
selfHostedPostgresEvidence=incomplete_without_authenticated_read_path
```

Conclusion: authorized smoke execution was delegated, but Codex did not have a non-writing authenticated storage/session context. Runtime no-write/network capture evidence remains incomplete. No owner manual run was requested.

## Static Gates

Commands run on PR #78 head `34d9ae21e34646bfe6493f498616d66a51ce887d`:

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

npx vitest run lib/creative-v2-no-write-enforcement.test.ts --reporter=verbose
PASS - 1 test file passed, 5 tests passed

node --import tsx scripts/check-request-path-side-effects.ts --json
PASS - totalFindings=21, previewRouteFindings=0
```

Creative v2 safety counters:

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

## Hidden/Bidi GitHub Hygiene

Byte-level scan scope:

- All PR #78 changed files relative to `origin/main...HEAD`
- `scripts/creative-v2-safety-gate.ts`
- `lib/creative-v2-no-write-enforcement.test.ts`
- `scripts/creative-v2-self-hosted-smoke.ts`
- `.github/workflows/ci.yml`
- Existing main/live readiness report files from the preflight report branch
- Relevant branch/report filenames

Byte-level result:

```text
changedFiles=56
localScannedFiles=56
preflightReportFiles=2
findings=0
```

Public PR diff byte scan:

```text
publicDiffBytes=1723944
publicDiffHiddenBidiCount=0
publicDiffControlByteCount=0
```

Public GitHub PR files HTML inspection still showed hidden/bidi warning template blocks associated with these paths:

```text
.github/workflows/ci.yml
app/(dashboard)/creatives/page.test.tsx
app/(dashboard)/creatives/page.tsx
```

Assessment: byte-level local and public diff scans are clean, but public GitHub HTML still exposes hidden/bidi warning blocks. Without authenticated GitHub UI inspection and exact rendered warning attribution, main-scope GitHub hygiene is not fully cleared. The earlier WIP-only exception is not used as main/product-ready clearance.

## Release-Safety Invariants

v1 remains default: YES

v2 preview remains off-by-default: YES

Evidence:

```text
creativeDecisionOsV2PreviewEnabled =
  searchParams.get("creativeDecisionOsV2Preview") === "1" ||
  searchParams.get("v2Preview") === "1"

creativeDecisionOsV2PreviewQuery.enabled =
  canLoadCreatives && creativeDecisionOsV2PreviewEnabled
```

Queue/apply remains disabled: YES

Command Center remains disconnected: YES

No DB write path was added: YES

No Meta/platform write path was added: YES

No apply/queue execution path exists for v2 preview: YES

v2 preview route remains GET-only/read-only where applicable: YES

UI copy remains read-only decision support: YES

Rendered direct-actionability safety is covered by `npm run creative:v2:safety`. Static grep showed forbidden action terms only in defensive forbidden-term patterns, not as rendered preview commands. `Scale-ready`, `Diagnose`, `Inactive Review`, and `Ready for Buyer Confirmation` remain read-only support labels.

## Remaining Blockers

- Full authenticated self-hosted runtime smoke did not complete because no non-writing authorized storage/session context was available to Codex.
- Runtime no-write/network capture evidence remains incomplete.
- Public GitHub UI still exposes hidden/bidi warning blocks that cannot be fully attributed or cleared without authenticated UI inspection, despite clean byte-level scans.
- Main/live/product-ready release authority has not been granted.
- Queue/apply must remain disabled.
- Command Center must remain disconnected.
- No DB/Meta/platform write path may be added for v2 preview interactions.

## Final Decision Language

Product-ready: NO

Main merge-ready: NO

Live deploy-ready: NO

Queue/apply safe: NO

Consolidated #78 WIP limited read-only preview continuation: ACCEPTABLE

No secrets were requested: YES

No secrets/private values were committed: YES

No merge was performed: YES

No deploy was triggered: YES

No product code, resolver logic, gold labels, v1 behavior, UI behavior, queue/apply behavior, Command Center wiring, DB write paths, or Meta/platform write paths were changed: YES
