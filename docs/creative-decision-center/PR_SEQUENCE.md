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

