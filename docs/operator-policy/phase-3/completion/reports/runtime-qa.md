# Runtime QA Report

Phase: Adsecute Phase 3 Completion
Role: Runtime QA Agent

## Scope

This pass only reviewed runtime smoke evidence and wrote this report. No app code, Meta logic, Creative logic, branch merge, or push-to-main action was performed.

## Runtime Smoke Status

Browser runtime smoke is blocked, not passed.

The requested Playwright smoke command failed before reaching the browser scenarios because the commercial smoke setup could not seed the local operator data. The failure happened in:

- `playwright/tests/commercial-auth.setup.ts`
- setup test: `seed commercial smoke operator and sign in through /login`
- artifact: `test-results/commercial-auth.setup.ts-s-76cde-r-and-sign-in-through-login-commercial-setup/error-context.md`
- report artifact: `playwright-report/index.html`

Sanitized failure evidence:

```text
[seed-commercial-smoke-operator] failed Error: connect ECONNREFUSED 127.0.0.1:15432
code: ECONNREFUSED
address: 127.0.0.1
port: 15432
```

`test-results/.last-run.json` also records the Playwright run status as `failed`.

## Blocker

The local PostgreSQL dependency required by the commercial smoke seed is unavailable.

Additional environment checks:

- `nc -z 127.0.0.1 15432` exited non-zero, confirming the local PostgreSQL port was not accepting connections.
- `/Volumes/adsecuteDB` is not mounted. `ls -ld /Volumes/adsecuteDB` returned `No such file or directory`.

This matches the reported failed attempt to start local Postgres with:

```text
node --env-file=.env.local --import tsx scripts/ensure-local-postgres.ts
```

The startup path depends on `/Volumes/adsecuteDB`, which is not available in this environment.

## Connected/Live Validation

Connected/live Meta validation was not run and must not be considered passed.

No connected business smoke evidence was produced in this pass. No tokens, cookies, ad account IDs, business IDs, or secret environment values were inspected or printed.

## Required Owner Action or Waiver

To complete browser runtime smoke, the owner must provide one of:

1. A working local PostgreSQL environment reachable at the configured local host/port, including the expected `/Volumes/adsecuteDB` mount or an equivalent supported database setup.
2. An alternate approved runtime database configuration for the commercial smoke setup.
3. An explicit owner waiver allowing Phase 3 merge without browser runtime smoke.

Without one of these, runtime/browser validation remains blocked.

## Commands / Artifacts Checked

- `find test-results playwright-report -maxdepth 3 -type f`
- `sed -n '1,220p' test-results/commercial-auth.setup.ts-s-76cde-r-and-sign-in-through-login-commercial-setup/error-context.md`
- `sed -n '1,200p' test-results/.last-run.json`
- `sed -n '1,220p' playwright-report/data/1457a7c2acf5a5a6d4db6ab74a4a8c183b1de15e.md`
- `test -d /Volumes/adsecuteDB`
- `nc -z 127.0.0.1 15432`
- `ls -ld /Volumes/adsecuteDB`

## QA Conclusion

Runtime browser smoke: blocked.

Connected/live validation: not run.

Merge readiness from Runtime QA: not approved unless runtime smoke is rerun successfully after the local database blocker is resolved, or the project owner explicitly waives this gate.
