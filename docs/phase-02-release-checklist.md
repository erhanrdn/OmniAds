# Phase 02 Release Checklist

## Preflight

- Run `npm run db:migrate`
- Run `npm test`
- Run `npx tsc --noEmit`
- Run `npm run build`
- Run `npm run test:smoke:local`

## Smoke Accounts

- Reviewer flow
  - `scripts/seed-reviewer-account.mjs`
  - read-only on canonical demo business
- Commercial smoke operator
  - `scripts/seed-commercial-smoke-operator.mjs`
  - collaborator on canonical demo business
  - resets commercial-truth tables to a known baseline before each smoke run

## Local Browser Smoke

- reviewer smoke keeps Meta recommendations + Creative deterministic/AI flows intact
- commercial smoke edits `/settings`, verifies Meta `Operating Mode`, verifies Creative `Commercial Context`

## Deploy

- commit on `main`
- push to `origin/main`
- let CI publish the exact-SHA image
- let `deploy-hetzner.yml` roll the release

## Post-Deploy Verification

- verify `https://adsecute.com/api/build-info`
- run `npm run test:smoke:live`
- if a session cookie is available, run:

```bash
node --import tsx scripts/verify-serving-direct-release.ts <businessId> \
  --mode=post_deploy \
  --base-url=https://adsecute.com \
  --expected-build-id=<sha> \
  --session-cookie-file=<cookie-file>
```

If no authenticated cookie is available, record that the direct authenticated HTTP check was intentionally skipped and rely on build-info plus live browser smoke.

## Rollback Readiness

- keep the previous known-good SHA
- revert the release on `main`
- push and wait for the exact-SHA deploy
- verify `/api/build-info`
- rerun live smoke
