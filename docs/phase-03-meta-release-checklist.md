# Phase 03 - Meta Decision OS Release Checklist

## Pre-merge

- `npx tsc --noEmit --pretty false`
- `npx vitest run lib/meta/decision-os.test.ts lib/meta/page-contract.test.ts lib/meta/page-readiness.test.ts lib/meta/ui.test.ts app/api/meta/decision-os/route.test.ts app/api/meta/adsets/route.test.ts components/meta/meta-decision-os.test.tsx components/meta/meta-campaign-detail.test.tsx components/meta/meta-campaign-list.test.tsx app/(dashboard)/platforms/meta/page.test.tsx`
- Confirm `decision_os` is present in `lib/meta/page-contract.ts`, `lib/meta/status-types.ts`, and `app/api/meta/status/route.ts`
- Confirm `GET /api/meta/adsets` still works with and without `campaignId`

## Local smoke

- `npm run build`
- `npm run test:smoke:local`
- Reviewer flow:
  - login with seeded reviewer
  - open `/platforms/meta`
  - confirm `Operating Mode`
  - confirm `Today's Plan`
  - confirm `Budget Shift Board`
  - confirm `GEO OS`
  - confirm `No-Touch List`
  - select a campaign and confirm `Campaign Role` + `Ad Set Actions`
- Commercial operator flow:
  - login with smoke operator
  - edit commercial settings
  - return to `/platforms/meta`
  - confirm Decision OS reflects the updated commercial truth

## Deploy

- Merge to `main`
- Wait for CI green
- Deploy exact SHA through the standard Hetzner workflow
- Verify `/api/build-info` returns the exact production SHA

## Live smoke

- `npm run test:smoke:live`
- Request live JSON from `/api/meta/decision-os`
- Confirm route returns `meta-decision-os.v1`
- Confirm `decision_os` optional surface is `ready` or an honest gated/partial state in `/api/meta/status`

## Rollback

- Rollback target: Phase 02 accepted SHA `0a28d4633bfd34f595c53a360a670e3b906b6e8f`
- Rollback trigger examples:
  - deterministic decision objects regress shipped Meta behavior
  - reviewer or operator smoke fails
  - production route or page contract breaks
  - `decision_os` blocks the page instead of remaining optional
