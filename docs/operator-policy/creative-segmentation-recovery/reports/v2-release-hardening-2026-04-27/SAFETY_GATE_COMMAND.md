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

Local command result:

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

# Gate Status

This is now a repeatable hard gate command and a CI pull-request check. Main
merge remains blocked until ChatGPT/owner accepts CI evidence and remaining
runtime/product gates.
