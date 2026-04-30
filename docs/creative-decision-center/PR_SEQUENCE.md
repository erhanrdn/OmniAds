# PR Sequence

| PR | title | purpose | files likely touched | behavior change | tests | acceptance criteria | rollback | risk | dependency |
|---:|---|---|---|---|---|---|---|---|---|
| 1 | context pack + vocabulary mapping framework | preserve handoff context and migration rules | `docs/creative-decision-center/*`, `AGENTS.md` | no | docs validation | context pack exists and points to START_HERE | revert docs | low | none |
| 2 | golden fixtures + invariant tests | lock behavior before resolver changes | fixture/test files | no | golden + invariant tests | required cases executable | remove tests | low | PR1 |
| 3 | data readiness + shadow scripts | prove missing fields and compare old/new | scripts/docs/tests | no | script tests | read-only, redacted, no writes | disable scripts | medium | PR2 |
| 4 | V2.1 contract types only | define contracts | `lib` type files | no | type/validator tests | no runtime path change | revert | low | PR2 |
| 5 | config-as-data | central thresholds | config module | minimal/no | config tests | thresholds not scattered | default config fallback | medium | PR4 |
| 6 | deterministic buyer adapter shadow mode | map engine to buyerAction | adapter module + tests | shadow only | adapter/golden tests | no UI default | flag off | medium | PR4-5 |
| 7 | `decisionCenter` response behind flag | additive API shape | snapshot/route response | behind flag | compatibility tests | old response still works | flag off | high | PR6 |
| 8 | minimal drawer reads `decisionCenter` | explain why | drawer/detail components | behind flag | UI tests | engine root visible | flag off | medium | PR7 |
| 9 | Today Brief behind flag | top actions | component/page | behind flag | UI tests | no sorting needed for top actions | flag off | medium | PR7 |
| 10 | Action Board behind flag | buckets | component/page | behind flag | UI tests | buckets from contract only | flag off | medium | PR7 |
| 11 | Table badges migrate to buyerAction | row scanning | table component | behind flag | UI tests | old fallback works | flag off | medium | PR7 |
| 12 | aggregate decisions behind flag | page/family alerts | aggregate builder | behind flag | aggregate tests | no row brief_variation | flag off | high | data readiness |
| 13 | observability metrics | monitor rollout | telemetry/logging | additive | telemetry tests | no PII, metrics emitted | disable telemetry | medium | PR7 |
| 14 | legacy deprecation guardrails | prevent regression | import/static checks | no | static tests | no new legacy UI imports | remove guard | medium | stable V2.1 |

Do not merge too much into one PR. Prefer explicit rollback per PR.

## PR Acceptance Notes

### PR 1

- Must contain context only.
- Must not change runtime behavior.
- Must make future AI chats start from `START_HERE.md`.

### PR 2

- Must add golden fixtures and invariant tests before resolver edits.
- Expected failures are acceptable if clearly marked.
- Resolver behavior should still be unchanged.

### PR 3

- Must keep all scripts non-production and read-only.
- Must record live DB/API status explicitly.
- Must not require production secrets for fixture mode.

### PR 4

- Must add contracts/types without wiring UI or routes to new behavior.
- Must keep `primaryDecision` and `buyerAction` separate.

### PR 5

- Must centralize thresholds.
- Must prevent resolver code from scattering hard-coded constants.

### PR 6

- Must run adapter in shadow mode only.
- Must prove adapter is deterministic and table-driven.
- Must not become a hidden second decision engine.

### PR 7

- Must add `decisionCenter` additively.
- Must preserve old `decisionOs` response shape and old snapshot rendering.

### PR 8

- Must show engine root in the drawer.
- Must not hide missing data, blockers, actionability, or problem class.

### PR 9

- Must render Today Brief from `decisionCenter`.
- Must not compute top actions in UI.

### PR 10

- Must render Action Board buckets from `buyerAction`.
- Must not derive buckets from V1/operator fields when `decisionCenter` exists.

### PR 11

- Must keep table fallback for old snapshots.
- Must not leave buyer-facing labels blank on missing data.

### PR 12

- Must keep `brief_variation` aggregate-only.
- Must disable aggregate actions when required family/supply data is missing.

### PR 13

- Must avoid PII and raw account identifiers in logs.
- Must include conflict, missing-data, and fallback metrics.

### PR 14

- Must not delete legacy systems until imports are gone and old snapshots render.
- Must add guardrails only after replacement paths are stable.
