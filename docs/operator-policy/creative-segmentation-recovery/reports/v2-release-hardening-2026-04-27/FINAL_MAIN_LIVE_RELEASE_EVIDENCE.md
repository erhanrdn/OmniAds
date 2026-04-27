# Creative v2 Main/Live Release Evidence

Date: 2026-04-28

## Scope

- Release target: Creative Decision OS v2 preview branch for PR #78.
- Public behavior remains opt-in only for the v2 preview route and query flags.
- Queue/apply paths remain disabled for Creative v2. No schema migration is expected for this release.

## Code Change

- Scoped the self-hosted smoke assertion for `Scale-ready` under the Creative v2 above-fold container to avoid the duplicate-text locator match.
- Kept the smoke script interface unchanged.

## Local Gates

- `git diff --check`: pass
- hidden/bidi/control byte scan over release diff: pass
- `npm test`: pass
- `npx tsc --noEmit`: pass
- `npm run build`: pass
- `npm run creative:v2:safety`: pass
- `npx vitest run lib/creative-v2-no-write-enforcement.test.ts --reporter=verbose`: pass
- `node --import tsx scripts/check-request-path-side-effects.ts --json`: pass, no preview route side-effect finding

## Local DB Smoke

- Local tunnel-backed dev runtime: pass
- Authenticated Creative v2 self-hosted smoke: pass
- Preview hidden without flag: pass
- Preview visible with flag: pass
- Forbidden action/internal terms: zero
- Unsafe mutation requests: zero
- Temporary storage state removed after smoke.

## Production Control Plane

- Meta deploy gate: pass
- Meta release gate: pass
- Meta repair plan: empty
- Google Ads deploy gate: pass
- Google Ads release gate: pass
- Google Ads repair plan: empty
- Public ingress smoke for `/about`: pass

## Notes

- Local `sync:control-plane-verify` over the SSH DB tunnel timed out on production-sized gate reads; production runtime control-plane refresh and public build metadata were used as the source of truth for the final gate snapshot.
- The evidence intentionally omits raw URLs, database strings, cookies, account IDs, business IDs, screenshots, and private values.
