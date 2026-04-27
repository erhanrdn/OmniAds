CHATGPT_REVIEW_READY: YES
ROLE: CODEX_WIP_RELEASE_HARDENING
BRANCH: wip/creative-decision-os-v2-integration-candidate-2026-04-27
PR: #82
PRIMARY_REPORT_PATH: docs/operator-policy/creative-segmentation-recovery/reports/v2-release-hardening-2026-04-27/FOR_CHATGPT_REVIEW.md
SANITIZED: YES
MERGE_REQUESTED: NO
MAIN_PUSHED: NO

# Executive Summary

This hardening pass keeps Draft PR #82 as the canonical WIP integration
candidate. PR #81 is superseded as the merge surface and remains available for
audit/history. Future Creative Decision OS v2 hardening work should land on PR
#82 unless ChatGPT says otherwise. PR #78 remains the resolver base. Main
remains untouched.

This is not product-ready work and not main-merge work.

Active formatting correction after ChatGPT review:

- Formatting commit:
  `4cf6c1a0e83a1fc05b18862326d04a49c11f3e8d`
- Final WIP merge-consideration report:
  `docs/operator-policy/creative-segmentation-recovery/reports/v2-release-hardening-2026-04-27/FINAL_WIP_MERGE_CONSIDERATION.md`
- Public raw verification confirmed the active hardening source/YAML files are
  readable multi-line files with no lines over 220 characters.

Public raw formatting evidence:

| File | Public raw line count | Lines over 220 chars |
| --- | ---: | --- |
| `scripts/creative-v2-safety-gate.ts` | 73 | none |
| `lib/creative-v2-no-write-enforcement.test.ts` | 120 | none |
| `scripts/creative-v2-self-hosted-smoke.ts` | 131 | none |
| `.github/workflows/ci.yml` | 333 | none |

Product-ready: NO.

Merge-ready to main: NO.

Queue/apply: disabled.

Command Center: disconnected.

v1: default.

v2 preview: off by default.

Self-hosted site/DB: active infra.

Vercel/Neon: deprecated.

PR #82 remains Draft.

No main push.

# What Changed

- Added focused network/no-write enforcement tests for the v2 preview endpoint,
  client fetch path, row detail/open path, preview model, and preview component.
- Added `npm run creative:v2:safety` as a repeatable hard gate command.
- Wired `npm run creative:v2:safety` into the pull-request CI test job.
- Added `npm run creative:v2:self-hosted-smoke` as a manual self-hosted smoke
  runner for authorized environments.
- Strengthened deterministic direct-actionability substitute coverage.
- Added this release-hardening report packet.
- Updated PR #81 body to state it is superseded by Draft PR #82.

# What Did Not Change

- No resolver threshold changed.
- No gold labels changed.
- No v1 behavior changed.
- No queue/apply path was enabled.
- No Command Center path was wired.
- No DB write path was added.
- No Meta/platform write path was added.
- No production deployment was triggered.
- No main branch was touched.

# Network No-Write Test Result

Result: passed locally through `npm run creative:v2:safety`.

Covered files:

- `app/api/creatives/decision-os-v2/preview/route.ts`
- `app/api/creatives/decision-os-v2/preview/route.test.ts`
- `src/services/data-service-ai.ts`
- `src/services/data-service-ai.test.ts`
- `lib/creative-v2-no-write-enforcement.test.ts`
- `lib/creative-decision-os-v2-preview.test.tsx`
- `components/creatives/CreativeDecisionOsV2PreviewSurface.tsx`
- `app/(dashboard)/creatives/page.tsx`
- `app/(dashboard)/creatives/page.test.tsx`

Assertions added:

- The preview route exports GET only and has no POST/PUT/PATCH/DELETE handler.
- The preview client uses GET only, no request body, and `cache: "no-store"`.
- The transitive GET side-effect scanner reports zero findings for the v2
  preview route.
- Preview model/component code does not import DB, Meta, Command Center, or
  execution/apply boundaries.
- Row detail/open interactions route only to the existing local drawer state and
  do not call fetch, mutation, Command Center, queue/apply, DB, or Meta paths.

# Safety Gate Command Result

Command: `npm run creative:v2:safety`.

Local result: passed.

Included coverage:

- forbidden rendered button/action text scan
- forbidden internal artifact text scan
- PR #79 v0.1.1 contract parity expectations
- Watch primary output equals 0
- Scale Review primary output equals 0
- queue/apply eligibility equals 0
- v2 preview off-by-default invariant
- route-level GET side-effect scanner
- no-write enforcement tests
- v2 gold eval safety counters

# CI/Manual Gate Status

CI wiring exists for pull requests. `.github/workflows/ci.yml` now runs:

```bash
npm run test
npm run creative:v2:safety
```

This adds no Vercel/Neon assumptions, no deploy behavior, and no secrets.

# Runtime Smoke Result

Not executed by Codex.

Exact blocker: this shell does not have an authenticated self-hosted browser
state and Codex did not ask for a domain, DB URL, token, cookie, server
credential, browser session value, or secret.

Added manual runner:

```bash
npm run creative:v2:self-hosted-smoke
```

The runner requires an authorized local environment to provide its own
`CREATIVE_V2_SMOKE_BASE_URL` and optional local storage-state file. It prints
sanitized path-only network evidence and does not record domains, credentials,
raw account names, raw creative names, cookies, tokens, DB URLs, or server
details.

# Direct-Actionability Substitute Result

Result: passed through `lib/creative-decision-os-v2-preview.test.tsx`.

The deterministic substitute now proves:

- review_only Scale ranks above direct Protect/Test More.
- high-spend Cut ranks above direct Protect/Test More.
- direct Protect/Test More rows stay in Ready for Buyer Confirmation and not
  Today Priority by default.
- direct rows can also appear in Today Priority only when urgency qualifies.
- Diagnose rows stay out of Ready for Buyer Confirmation.
- Empty direct-lane copy remains safe and understandable.

This is substitute evidence only. Product-ready live evidence remains open
until ChatGPT accepts a substitute or a workspace renders direct rows.

# Diagnose Volume Audit Result

Using the existing sanitized live audit:

| Class | Rows |
| --- | ---: |
| insufficient-signal | 96 |
| data-quality | 51 |
| inactive_creative | 45 |
| campaign-context | 1 |

Total Diagnose rows: 193 of 303.

Recommendation: UI framing is enough for the current WIP stage. Diagnose should
remain collapsed/grouped and should be treated as an investigation backlog, not
a confirmation/action lane. No resolver policy change was made.

Product-ready blocker remains open for Diagnose volume/framing review.

# GitHub/Review Warning Audit Result

GitHub connector evidence:

| PR | Review submissions | Review threads | Combined comments |
| --- | ---: | ---: | ---: |
| #78 | 0 | 0 | 0 |
| #79 | 0 | 0 | 0 |
| #80 | 0 | 0 | 0 |
| #81 | 0 | 0 | 0 |
| #82 | 0 | 0 | 0 |

Local `gh` is not authenticated. An unauthenticated public API attempt was
partially rate-limited, so the GitHub connector was used for the final
normalized review/thread/comment evidence. Codex did not ask for a token or run
`gh auth login`.

If an owner sees unresolved warnings in authenticated GitHub UI that are not
visible through the connector evidence above, that remains an owner-side gate.

# Hidden/Bidi Exception Scope

The existing hidden/bidi exception remains scoped only to PR #78-branch WIP
consideration. It is not product-ready clearance and not main-merge clearance.
No new hidden/bidi/control codepoints were introduced by this hardening pass.

# Test/Typecheck/Build Results

Local command results after the formatting correction:

| Command/check | Result |
| --- | --- |
| `git diff --check` | passed |
| CI YAML parse check | passed |
| `npm test` | passed, 307 files, 2203 tests |
| `npx tsc --noEmit` | passed |
| `npm run build` | passed |
| focused Creative/v2 Vitest run | passed, 9 files, 51 tests |
| `npm run creative:v2:safety` | passed, 9 files, 51 tests plus gold safety counters |
| v2 gold eval | passed, macro F1 97.96, severe 0, high 0 |
| hidden/bidi/control scan | passed, 18 changed paths checked |
| strict non-ASCII scan | passed, 18 changed paths checked |
| restricted filename scan | passed, 18 changed paths checked |
| secret/raw-ID scan | passed, 18 changed paths checked |
| line-length/readability check | passed, 18 changed paths checked, max 220 |
| JSON parse checks | passed, 24 tracked JSON files |

Targeted final formatting scans after the public raw verification also passed:

- hidden/bidi/control scan: 12 targeted paths checked.
- strict non-ASCII scan: 12 targeted paths checked.
- line-length/readability check: 12 targeted paths checked, max 220.
- restricted filename scan: 12 targeted paths checked.
- secret/raw-ID scan: 12 targeted paths checked.

Safety counter result from `npm run creative:v2:safety`:

```text
artifactVersion: gold-v0.1
rowCount: 78
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

# Canonical WIP Status

PR #82 may remain canonical WIP: YES.

PR #82 may be considered for merge into PR #78 branch: not decided by Codex.
The branch is hardened for ChatGPT/owner review, but fresh authenticated
self-hosted runtime smoke remains open from this shell.

# Remaining Blockers

See `RELEASE_HARDENING_BLOCKERS.md` for split blockers:

- blocks PR #82 to PR #78 merge
- blocks main merge
- blocks product-ready
