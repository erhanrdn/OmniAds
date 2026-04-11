# V2-06 Release Checklist

## Pre-merge

- [ ] `npx tsc --noEmit --pretty false`
- [ ] targeted Vitest for throughput, feedback, batch, and execution regressions
- [ ] `npm run test`
- [ ] `npm run build`
- [ ] local Playwright reviewer smoke passes
- [ ] local Playwright commercial smoke passes

## Deploy

- [ ] merge candidate is an exact SHA on `main`
- [ ] deploy that exact SHA through the existing Hetzner workflow
- [ ] verify `https://adsecute.com/api/build-info`
- [ ] verify `https://www.adsecute.com/api/build-info`
- [ ] verify `GET /api/release-authority`

## Live Workflow Verification

- [ ] reviewer sees read-only queue, workload cards, and disabled batch or feedback controls
- [ ] commercial operator sees queue budget summary, overflow summary, shift digest, and feedback summary
- [ ] commercial operator can run status-only batch actions
- [ ] commercial operator can submit action feedback and queue-gap feedback
- [ ] Meta deep link opens with the expected `campaignId`
- [ ] Creative deep-link behavior remains unchanged

## Execution Regression Verification

- [ ] execution preview remains live
- [ ] support badge remains visible
- [ ] apply stays disabled unless the existing canary flags explicitly allow it
- [ ] audit slice remains visible

## Rollback Readiness

- [ ] previous known-good SHA recorded
- [ ] rollback can redeploy the previous exact SHA without dropping additive throughput or feedback tables
- [ ] post-rollback build-info and smoke verification path is documented
