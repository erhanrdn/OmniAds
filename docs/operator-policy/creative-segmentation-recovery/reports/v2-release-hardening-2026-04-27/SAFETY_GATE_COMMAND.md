# Safety Gate Command

CHATGPT_REVIEW_READY: YES
SANITIZED: YES

# Command

```bash
npm run creative:v2:safety
```

Implementation:

- `package.json`
- `scripts/creative-v2-safety-gate.ts`

# Included Tests And Checks

The command runs focused Vitest coverage for:

- `lib/creative-decision-os-v2.test.ts`
- `lib/creative-decision-os-v2-preview.test.tsx`
- `lib/creative-v2-no-write-enforcement.test.ts`
- `lib/get-route-side-effect-guard.test.ts`
- `src/services/data-service-ai.test.ts`
- `components/creatives/CreativeDecisionSupportSurface.test.tsx`
- `components/creatives/CreativesTableSection.test.tsx`
- `app/(dashboard)/creatives/page.test.tsx`
- `app/api/creatives/decision-os-v2/preview/route.test.ts`

It then evaluates the v2 gold artifact in-process and fails if:

- macro F1 drops below 90.
- severe mismatch count is non-zero.
- high mismatch count is non-zero.
- Watch primary output count is non-zero.
- Scale Review primary output count is non-zero.
- queue eligibility count is non-zero.
- apply eligibility count is non-zero.
- direct Scale count is non-zero.
- inactive direct Scale count is non-zero.

# Contract Parity

`lib/creative-decision-os-v2-preview.test.tsx` encodes the PR #79 v0.1.1
contract expectations for:

- lane labels
- forbidden button/action language
- queue/apply disabled invariant
- Command Center work item prohibition
- v1 replacement prohibition

# CI Status

CI wiring exists. `.github/workflows/ci.yml` now runs:

```bash
npm run test
npm run creative:v2:safety
```

The CI update is pull-request test-only. It does not deploy, does not require
Vercel or Neon, and does not add secrets.

# Successful Local Run

Local command result after the Prettier formatting correction:

```text
Test Files  9 passed (9)
Tests       51 passed (51)
creativeV2SafetyGate: passed
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

# Raw Formatting Correction

The safety gate script was reformatted with Prettier in commit
`73bdee0806a703886d1b98b29b9a4eb9e3d42896`.

Local evidence:

```text
$ wc -l scripts/creative-v2-safety-gate.ts
      82 scripts/creative-v2-safety-gate.ts
$ awk 'length($0)>220 {print FNR ":" length($0)}' scripts/creative-v2-safety-gate.ts

$ python3 -c '...'
scripts/creative-v2-safety-gate.ts LF 82 CR 0 bytes 2578
```

Public Raw evidence:

```text
$ curl -fsSL https://raw.githubusercontent.com/erhanrdn/OmniAds/refs/heads/wip/creative-decision-os-v2-integration-candidate-2026-04-27/scripts/creative-v2-safety-gate.ts | wc -l
      82
$ curl -fsSL https://raw.githubusercontent.com/erhanrdn/OmniAds/refs/heads/wip/creative-decision-os-v2-integration-candidate-2026-04-27/scripts/creative-v2-safety-gate.ts | awk 'length($0)>220 {print FNR ":" length($0)}'
```

The public Raw `awk` check produced no output. The file is readable multi-line
TypeScript with real LF newlines.

# Gate Status

This is a repeatable hard gate command and a CI pull-request check. Main merge
remains blocked until ChatGPT/owner accepts CI evidence and remaining
runtime/product gates.
