# Phase 04 - Creative Decision OS Release Checklist

## Pre-merge

- `npx tsc --noEmit --pretty false`
- `npx vitest run lib/creative-decision-os.test.ts app/api/creatives/decision-os/route.test.ts app/api/ai/creatives/decisions/route.test.ts app/api/ai/creatives/commentary/route.test.ts app/(dashboard)/creatives/page-support.test.ts components/creatives/CreativeDecisionOsOverview.test.tsx components/creatives/creative-commercial-context-card.test.tsx`
- `npx vitest run lib/meta/__tests__/creatives-copy.test.ts lib/meta/__tests__/creatives-row-mappers.test.ts lib/meta/__tests__/creatives-preview.test.ts lib/meta/__tests__/creatives-service-support.test.ts lib/meta/__tests__/creatives-fetchers.test.ts lib/meta/__tests__/creatives-service.test.ts lib/meta/__tests__/creatives-snapshot-helpers.test.ts`
- Confirm `CREATIVE_DECISION_OS_V1` and `CREATIVE_DECISION_OS_CANARY_BUSINESSES` are documented and default-safe
- Confirm `Decision Signals`, `AI Commentary`, and `Operating Mode` wording remains unchanged
- Confirm export/share parity and `/copies` tests remain green

## Local smoke

- `npm run build`
- `npm run test:smoke:local`
- Reviewer flow:
  - login with seeded reviewer
  - open `/creatives`
  - confirm `Recommendations` overview is visible
  - confirm lifecycle board, operator queues, family board, and pattern board render
  - confirm row-level `Decision Signals` still render
  - filter via a queue and a family card
  - open a creative and confirm deterministic decision, deployment matrix, benchmark evidence, fatigue evidence, commercial context, and AI commentary
- Commercial operator flow:
  - login with smoke operator
  - update commercial settings
  - return to `/creatives`
  - confirm `Operating Mode` still influences creative deployment guidance

## Deploy

- Merge to `main`
- Wait for CI green
- Deploy the exact SHA through the standard Hetzner workflow
- Verify `https://adsecute.com/api/build-info` and `https://www.adsecute.com/api/build-info` both return the deployed SHA

## Live smoke

- `npm run test:smoke:live`
- Request live JSON from `/api/creatives/decision-os`
- Confirm route returns `creative-decision-os.v1`
- Confirm `/creatives` shows the overview boards plus preserved `Decision Signals` and `AI Commentary`

## Rollback

- Rollback target: Phase 03 accepted SHA `598e7091b59e6187996f9d51151614815b7e7c91`
- Rollback trigger examples:
  - deterministic lifecycle or deployment guidance regresses shipped creative behavior
  - reviewer or operator smoke fails
  - export/share truth regresses
  - route or page contract breaks
  - AI commentary starts implying authority it does not have
