# V2-01 Release Checklist

## Preflight

- Run `node --import tsx scripts/verify-release-authority.ts --mode=preflight`
- Run `npm run test`
- Run `npx tsc --noEmit --pretty false`
- Run `npm run build`
- Run existing smoke and serving verification:
  - `node --import tsx scripts/verify-serving-direct-release.ts <businessId> --mode=preflight`
  - `npm run test:smoke:local`

## Required live authority signals

- `https://adsecute.com/api/build-info`
- `https://adsecute.com/api/release-authority`
- `/admin/release-authority`

Release is not complete unless:

- `/api/build-info` returns the release SHA
- `/api/release-authority` returns the same live SHA
- `live vs main`, `docs vs runtime`, and `flags vs runtime` all return `aligned`
- unresolved drift items are empty

## Post-deploy verification

- Run `node --import tsx scripts/verify-release-authority.ts --mode=post_deploy --base-url=https://adsecute.com --expected-build-id=<release_sha>`
- Run `node --import tsx scripts/verify-serving-direct-release.ts <businessId> --mode=post_deploy --base-url=https://adsecute.com --expected-build-id=<release_sha>`
- Run `npm run test:smoke:live`
- Open `/admin/release-authority` as a superadmin and confirm the feature matrix matches the deployed baseline.

## Rollback readiness

- Previous known-good SHA for this baseline starts at `3c13c44772ee510c67cfabc6b77ab05dae33b039` unless a newer rollout record supersedes it.
- Roll back only through the existing exact-SHA deploy workflow.
- After rollback, re-run both:
  - `node --import tsx scripts/verify-release-authority.ts --mode=post_deploy --base-url=https://adsecute.com --expected-build-id=<known_good_sha>`
  - existing live smoke

## Blockers

- `/api/build-info` and `/api/release-authority` disagree on the live SHA
- remote `main` cannot be resolved in release verification
- any surface remains undocumented, drifted, or ambiguously gated
- existing smoke or serving verification fails
