# V2-01 Rollout Runbook

## Purpose

This runbook adds release-authority verification on top of the existing exact-SHA deploy discipline.

It does not replace:

- `docs/phase-01-release-checklist.md`
- `docs/phase-05-release-checklist.md`
- `docs/phase-06-release-checklist.md`
- `docs/architecture/serving-direct-production-release-runbook.md`

It adds one rule: the deployed baseline is not authoritative unless `/api/release-authority` agrees with `/api/build-info`.

## Rollout steps

1. Confirm the release candidate SHA on `main`.
2. Run local preflight:
   - `node --import tsx scripts/verify-release-authority.ts --mode=preflight`
   - existing tests, build, and smoke commands
3. Merge to `main` and let CI publish exact-SHA images.
4. Let the existing Hetzner workflow deploy that exact SHA.
5. After deploy, verify:
   - `https://adsecute.com/api/build-info`
   - `https://adsecute.com/api/release-authority`
   - `/admin/release-authority`
6. Run:

```bash
node --import tsx scripts/verify-release-authority.ts \
  --mode=post_deploy \
  --base-url=https://adsecute.com \
  --expected-build-id=<release_sha>
```

7. Run the existing live smoke suite and direct serving verification.

## Rollback

1. Identify the previous known-good full SHA.
2. Deploy it through the existing `Deploy to Hetzner` workflow.
3. Re-run:

```bash
node --import tsx scripts/verify-release-authority.ts \
  --mode=post_deploy \
  --base-url=https://adsecute.com \
  --expected-build-id=<known_good_sha>
```

4. Re-run existing live smoke and `verify-serving-direct-release`.

## Operator interpretation rules

- `flagged` is acceptable when the manifest says the gate is intentional.
- `legacy` is acceptable only when the canonical replacement is also explicit.
- `unknown` is not acceptable for release signoff.
- `drifted` is not acceptable for release signoff unless the rollout record explains why the drift is intentionally tolerated.
