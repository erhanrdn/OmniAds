# Codex Main/Live Readiness Preflight

Date: 2026-04-28

Verdict: `MAIN_LIVE_NOT_READY__PREFLIGHT_STATIC_GATES_GREEN__OWNER_RUNTIME_EVIDENCE_REQUIRED`

Confidence score: `82/100`

Consolidated #78 WIP limited read-only preview continuation: ACCEPTABLE

Product-ready: NO

Main merge-ready: NO

Live deploy-ready: NO

Queue/apply safe: NO

## Scope

Repository: `https://github.com/erhanrdn/OmniAds`

Branch checked: `wip/creative-decision-os-v2-baseline-first-2026-04-26`

SHA checked: `34d9ae21e34646bfe6493f498616d66a51ce887d`

Report branch: `review/creative-v2-pr78-main-live-readiness-preflight-2026-04-28`

No merge was performed. No deploy was triggered. No secret, token, cookie, browser state, DB URL, server credential, domain, session value, or private runtime credential was requested.

No product code, resolver logic, gold labels, v1 behavior, UI behavior, queue/apply behavior, Command Center wiring, DB write paths, or Meta/platform write paths were changed by this preflight.

## GitHub State Verification

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

Conclusion: PR #82 was merged into the PR #78 WIP branch, not main.

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

Branch heads:

```text
main: fa838df2be0a93c445680c42d23f4adadb52bd8f
wip/creative-decision-os-v2-baseline-first-2026-04-26: 34d9ae21e34646bfe6493f498616d66a51ce887d
wip/creative-decision-os-v2-integration-candidate-2026-04-27: 63dae7447f3647d76a7874bd45d560a9a8c222cb
```

Conclusion: main was not touched by the #82 consolidation.

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

The successful jobs had GitHub Actions Node.js 20 deprecation warnings only. Deploy, publish, and runtime deploy jobs were skipped. No live deploy was triggered.

## Claude Post-Consolidation Review

Verified branch:

```text
review/creative-v2-pr78-claude-post-consolidation-release-safety-review-2026-04-28
```

Verified report path:

```text
docs/operator-policy/creative-segmentation-recovery/reports/v2-integration-candidate-2026-04-27/CLAUDE_POST_CONSOLIDATION_RELEASE_SAFETY_REVIEW.md
```

Verified report branch head:

```text
ae487ae6acf030f213fbf010eece494dfcbe9c7d
```

Cross-checked explicit Claude decisions:

```text
CONSOLIDATED_PR78_WIP_ACCEPTABLE_FOR_CONTINUED_LIMITED_READ_ONLY_PREVIEW_ONLY
Product-ready: NO
Main merge-ready: NO
Live deploy-ready: NO
Queue/apply safe: NO
```

Claude's claims align with this preflight where independently checkable: PR #82 merged into the WIP base, PR #78 remains Draft, PR #78 CI is green, deploy/publish jobs are skipped, and main is unchanged.

## Local Gates

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

## Self-Hosted Runtime Smoke

Self-hosted smoke was skipped.

Configuration presence check:

```text
script.creative:v2:self-hosted-smoke=true
CREATIVE_V2_SMOKE_BASE_URL.configured=false
CREATIVE_V2_SMOKE_STORAGE_STATE.configured=false
```

Runtime no-write evidence is incomplete because the authenticated self-hosted smoke was not run. This remains an open main/live/product-ready blocker. The active infrastructure assumption remains self-hosted site plus self-hosted PostgreSQL; Vercel/Neon are not accepted as active release evidence.

## Static Runtime/No-Write Evidence

Focused no-write enforcement:

```text
npx vitest run lib/creative-v2-no-write-enforcement.test.ts --reporter=verbose
PASS - 1 test file passed, 5 tests passed
```

Transitive GET side-effect scanner:

```text
node --import tsx scripts/check-request-path-side-effects.ts --json
totalFindings=21
previewRouteFindings=0
```

Static route/source inspection:

- `app/api/creatives/decision-os-v2/preview/route.ts` exports `GET` only for the preview route.
- `src/services/data-service-ai.ts` calls `/api/creatives/decision-os-v2/preview` with `method: "GET"`.
- The v2 preview API adds `creativeDecisionOsV2Preview=1` only when the caller passes `enabled: true`.
- Existing non-v2 actions such as share/run analysis still have POST paths, but the v2 preview path remains GET-only and read-only.
- Static tests assert the preview route, preview model, and preview component stay detached from DB, platform, Meta, and Command Center write boundaries.

Static guarantees are green. Runtime network capture guarantees are incomplete until the authenticated owner smoke runs in the authorized self-hosted environment.

## Hidden/Bidi/Control Scan

Scan scope:

- All PR #78 changed files relative to `origin/main...HEAD`
- `scripts/creative-v2-safety-gate.ts`
- `lib/creative-v2-no-write-enforcement.test.ts`
- `scripts/creative-v2-self-hosted-smoke.ts`
- `.github/workflows/ci.yml`

Result:

```text
changedFiles=56
scannedFiles=56
findings=0
```

Authenticated GitHub UI diff banner state was not inspected because this preflight did not use GitHub auth or request credentials. The earlier WIP-only hidden/bidi exception is not treated as main/product-ready clearance.

## Release-Safety Invariants

v1 remains default: YES

Evidence: the existing Creative Decision OS snapshot query remains enabled by the normal creative page load path. The v2 preview query is separately gated.

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

Evidence: `npm run creative:v2:safety` reports queue/apply/direct scale/watch/scale-review counters at zero.

Command Center remains disconnected: YES

Evidence: static no-write enforcement checks the v2 preview route/model/component for Command Center boundary patterns, and the focused test passes.

No DB write path was added: YES

No Meta/platform write path was added: YES

No apply/queue execution path exists for v2 preview: YES

Route remains GET-only where applicable: YES

UI direct-actionability copy:

- Rendered v2 safety tests passed.
- Static grep showed forbidden action terms only in the defensive forbidden-term list inside `lib/creative-decision-os-v2-preview.ts`, not as rendered preview commands.
- Rendered/support copy includes `Scale-ready`, `Diagnose`, `Inactive Review`, and `Ready for Buyer Confirmation`; these remain read-only decision support labels, not automated action commands.

Buyer-safety assessment: static buyer-facing guardrails are acceptable for continued WIP limited read-only preview, but not enough for main/live/product-ready without runtime smoke.

Release-safety assessment: local gates and static no-write gates are green, but main/live release remains blocked by missing authenticated self-hosted runtime evidence.

## Deploy/Live Gating

Workflow assessment:

- `.github/workflows/ci.yml` runs typecheck/test/build for PRs.
- Runtime detect, image publish, and deploy dispatch jobs require `github.event_name == 'push'` and `github.ref == 'refs/heads/main'`.
- `publish-web-image` and `publish-worker-image` also require runtime change detection before pushing images.
- `dispatch-deploy` dispatches `deploy-hetzner.yml` only from main push conditions and successful image publish jobs.
- `deploy-hetzner.yml` is workflow-dispatch driven, validates an exact SHA, and can require current main head.
- `post-deploy-verify.yml` is workflow-dispatch driven and report-only.

PR #78 did not trigger live deployment. Deploy/publish/runtime jobs on the PR #78 head were skipped.

Vercel/Neon assessment:

- No active GitHub deploy workflow for Vercel was found in this preflight scope.
- `package.json` still contains `@neondatabase/serverless`, but active release/deploy workflows are Hetzner/self-hosted oriented.
- Main/live readiness must use self-hosted site plus self-hosted PostgreSQL evidence, not Vercel/Neon assumptions.

## Remaining Blockers

Main/live/product-ready blockers:

- Authenticated self-hosted runtime smoke must run against authorized self-hosted site and self-hosted PostgreSQL configuration.
- Runtime no-write/network capture evidence must confirm no unsafe POST/PUT/PATCH/DELETE or other write requests from v2 preview interactions.
- Authenticated GitHub UI hidden/bidi/diff banner state was not inspected.
- Release authority must explicitly clear main/live/product-ready after runtime evidence exists.
- Queue/apply must remain disabled until separately approved.
- Command Center must remain disconnected until separately approved.
- No DB/Meta/platform write path may be added for v2 preview interactions.

## Final Decision Language

Product-ready: NO

Main merge-ready: NO

Live deploy-ready: NO

Consolidated #78 WIP limited read-only preview continuation: ACCEPTABLE

Queue/apply safe: NO

Main was not touched: YES

No live deploy was triggered: YES

No secrets were requested: YES

No product code, resolver logic, gold labels, v1 behavior, UI behavior, queue/apply behavior, Command Center wiring, DB write paths, or Meta/platform write paths were changed: YES
