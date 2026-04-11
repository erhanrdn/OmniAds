# Phase 03 - Meta Decision OS Release Checklist

## Pre-merge

- `npx tsc --noEmit --pretty false`
- `npx vitest run lib/meta/serving.test.ts lib/meta/decision-os.test.ts lib/command-center.test.ts lib/meta/page-contract.test.ts lib/meta/page-readiness.test.ts lib/meta/ui.test.ts app/api/meta/decision-os/route.test.ts app/api/command-center/route.test.ts app/api/meta/adsets/route.test.ts components/meta/meta-decision-os.test.tsx components/meta/meta-campaign-detail.test.tsx components/meta/meta-campaign-list.test.tsx app/(dashboard)/platforms/meta/page.test.tsx`
- Confirm `decision_os` is present in `lib/meta/page-contract.ts`, `lib/meta/status-types.ts`, and `app/api/meta/status/route.ts`
- Confirm `GET /api/meta/adsets` still works with and without `campaignId`
- Confirm GEO Decision OS still uses shared direct sources and does not introduce route-to-route HTTP.

## Local smoke

- `npm run build`
- `npm run test:smoke:local`
- Reviewer flow:
  - login with seeded reviewer
  - open `/platforms/meta`
  - confirm `Operating Mode`
  - confirm `Today's Plan`
  - confirm `Budget Shift Board`
  - confirm `Winner Scale Candidates`
  - confirm `GEO OS`
  - confirm `Action Core GEOs` and `Watchlist / Pooled Validation` both render honestly
  - confirm strategy / objective / bid / driver chips render on winner and action cards
  - confirm GEO source freshness / partial-state wording is visible when applicable
  - confirm `No-Touch List`
  - select a campaign and confirm `Campaign Role` + `Ad Set Actions`
  - confirm campaign detail shows policy chips without relabeling AI or recommendation surfaces
- Commercial operator flow:
  - login with smoke operator
  - edit commercial settings
  - return to `/platforms/meta`
  - confirm Decision OS reflects the updated commercial truth
  - confirm degraded GEO no-scale wording remains split from deterministic operator wording
- Command Center flow:
  - open `/command-center`
  - confirm `geo_issues` view only contains material `queueEligible` GEO actions

## Deploy

- Merge to `main`
- Wait for CI green
- Deploy exact SHA through the standard Hetzner workflow
- Verify `/api/build-info` returns the exact production SHA
- Verify `/api/release-authority` and `/api/build-info` both point at the same exact live SHA

## Live smoke

- `npm run test:smoke:live`
- Request live JSON from `/api/meta/decision-os`
- Confirm route returns `meta-decision-os.v1`
- Confirm additive `policy` metadata exists on campaign and ad set decision rows
- Confirm additive `winnerScaleCandidates` and `summary.winnerScaleSummary` are present
- Confirm `summary.geoSummary` is present and honest
- Confirm GEO rows are still served when country-only warehouse data exists but broader breakdown surfaces are partial
- Confirm `decision_os` optional surface is `ready` or an honest gated/partial state in `/api/meta/status`
- Request live JSON from `/api/command-center`
- Confirm watchlist / pooled GEO rows do not enter the default action queue
- Confirm existing execution support matrix is unchanged for Meta ad set actions

## Rollback

- Rollback target: pre-V2-03 accepted SHA `eee0726368d762349e7507f31bc5fa8443f15a6e`
- Rollback trigger examples:
  - deterministic decision objects regress shipped Meta behavior
  - reviewer or operator smoke fails
  - production route or page contract breaks
  - `decision_os` blocks the page instead of remaining optional
