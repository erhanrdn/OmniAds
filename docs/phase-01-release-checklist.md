# Phase 01 Release Checklist

## Scope gate

Release only if the change stays within Phase 01:

- metric truth cleanup
- deterministic-vs-AI naming cleanup
- reviewer login + browser smoke harness
- release docs and verification path

Do not mix in Phase 02+ product work.

## Local preflight

Run these from the repo root on the release candidate commit:

```bash
npm run test
npx tsc --noEmit
npm run build
npm run playwright:install
npm run test:smoke:local
node --import tsx scripts/verify-serving-direct-release.ts f8a3b5ac-588c-462f-8702-11cd24ff3cd2 --mode=preflight
```

Expected result:

- tests pass
- typecheck passes
- build passes
- local Playwright smoke passes with reviewer login through `/login`
- preflight release verification returns `pass`

`lint` is intentionally recorded as not applicable for this phase because the repo does not define a lint script.

## Reviewer auth rules

- Trusted smoke/signoff path: `/login`
- Untrusted demo convenience path: `/api/auth/demo-login`
- Reviewer seed script:
  - `node scripts/seed-reviewer-account.mjs`
- Password policy:
  - preferred: set `SHOPIFY_REVIEWER_PASSWORD`
  - fallback: runtime-only generated password
  - never commit reviewer credentials to docs or code

## Release execution

1. Confirm the release candidate commit is on `main`.
2. Push the exact commit SHA to `origin/main`.
3. Watch `.github/workflows/ci.yml`:
   - `build-test`
   - `publish-images` when runtime-affecting files changed
   - `dispatch-deploy`
4. Watch `.github/workflows/deploy-hetzner.yml` for the same SHA.

Expected production deploy contract:

- images are published with the exact commit SHA tag
- deploy workflow is dispatched with that exact SHA
- the deploy is skipped only when the SHA is no longer the current `main` head

## Post-deploy verification

Resolve the release SHA locally:

```bash
git rev-parse HEAD
```

Then run:

```bash
curl -fsS https://adsecute.com/api/build-info
node --import tsx scripts/verify-serving-direct-release.ts f8a3b5ac-588c-462f-8702-11cd24ff3cd2 --mode=post_deploy --base-url=https://adsecute.com --expected-build-id=<release_sha>
npm run test:smoke:live
```

Release is only complete when:

- `/api/build-info` returns the same exact SHA
- post-deploy verification passes
- live Playwright smoke passes

## Required artifacts

Capture and retain:

- full output from `npm run test`
- full output from `npx tsc --noEmit`
- full output from `npm run build`
- full output from preflight and post-deploy verification commands
- `playwright-report/`
- `test-results/`
- smoke screenshots:
  - `meta-smoke.png`
  - `creatives-smoke.png`

## Release blockers

Do not ship Phase 01 if any of the following are still true:

- Meta recommendations still render as AI wording
- Meta status truth class still uses `ai_exception`
- creative decisions return `source: "ai"`
- CSV/share payloads still drift from mapper truth for clicks, link CTR, or click-to-cart/purchase metrics
- reviewer smoke still depends on `/api/auth/demo-login`
- local or live smoke fails
- `/api/build-info` does not match the release SHA

## Rollback

Rollback path is the existing exact-SHA deploy flow:

1. identify the previous known-good production SHA
2. dispatch `deploy-hetzner.yml` with that SHA
3. rerun:
   - `/api/build-info`
   - post-deploy verification
   - live smoke

Rollback readiness is acceptable only if the previous known-good SHA is still available in GHCR and on `main` history.
