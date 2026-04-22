# Phase 3.1 PR Validation Regression QA

Date: 2026-04-22
Repo: `/Users/harmelek/Adsecute`
Scope: Phase 3.1 regression validation for decision-range firewall, provenance gating, Command Center workflow identity, and legacy/snapshot contextual-only behavior.

## Summary

- Targeted Phase 3.1 regression tests passed.
- TypeScript typecheck passed.
- `git diff --check` passed.
- Production build passed.
- `npm run lint` was not run because `package.json` does not define a `lint` script.

## Validation Commands And Results

### Phase 3.1 regression suite

```bash
npx vitest run lib/operator-decision-metadata.test.ts lib/meta/decision-os.test.ts lib/creative-decision-os.test.ts lib/command-center.test.ts lib/command-center-execution-service.test.ts app/api/command-center/route.test.ts
```

Result:

- `6` test files passed
- `44` tests passed

Coverage verified here:

- same `decisionAsOf` plus different analytics range keeps Meta decision fingerprints stable
- same `decisionAsOf` plus different analytics range keeps Creative decision fingerprints stable
- same `decisionAsOf` plus different analytics range keeps Command Center action fingerprints stable
- different `decisionAsOf` can change Command Center primary action fingerprints
- missing provenance blocks queue eligibility and push eligibility

```bash
npx vitest run app/api/command-center/actions/route.test.ts app/api/command-center/execution/route.test.ts app/api/command-center/execution/apply/route.test.ts app/api/command-center/execution/rollback/route.test.ts
```

Result:

- `4` test files passed
- `8` tests passed

Coverage verified here:

- workflow action lookup and execution routes remain fingerprint-driven
- apply and rollback routes preserve the command-center execution guardrails

```bash
npx vitest run app/api/google-ads/advisor/route.test.ts components/google/google-advisor-panel.test.tsx components/meta/meta-campaign-detail.test.tsx
```

Result:

- `3` test files passed
- `22` tests passed

Coverage verified here:

- legacy fallback recommendations remain selected-range context only
- snapshot compatibility remains honestly labeled during transition
- fallback context is rendered as contextual, not authoritative, surface content

### Repo checks

```bash
npx tsc --noEmit
```

Result:

- passed

```bash
git diff --check
```

Result:

- passed

```bash
npm run build
```

Result:

- passed

```bash
npm run lint
```

Result:

- not run
- no `lint` script is defined in `package.json`

## Notes

- The regression suite covers the requested Phase 3.1 fingerprint invariants and provenance gates directly in `lib/meta/decision-os.test.ts`, `lib/creative-decision-os.test.ts`, `lib/command-center.test.ts`, and `lib/command-center-execution-service.test.ts`.
- Legacy fallback and snapshot-context behavior is covered by the Google advisor and Meta campaign detail tests, which keep selected-range data contextual-only.
- No application code was modified for this validation run.
