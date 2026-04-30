# 31-35. UI States, Copy, PR Plan, Sunset, Go/No-Go

## UI Empty/Error/Loading States

| State | Today Brief | Action Board | Table | Drawer |
|---|---|---|---|---|
| no account selected | hidden; business empty state | hidden | hidden | hidden |
| no creatives | "No creative rows in selected range" | empty buckets | empty table | unavailable |
| no spend | diagnose/test_more only | no scale/cut | show spend 0 | explain insufficient evidence |
| no Meta connection | integration empty state | hidden | hidden | hidden |
| Meta sync stale | diagnose_data brief | disabled hard-action buckets | stale badge | freshness blocker |
| missing benchmark | cap confidence | show weak benchmark | weak benchmark badge | target/benchmark section |
| missing target | no high-confidence scale/cut | review-only | target unknown badge | target unknown |
| policy data unavailable | no fix_policy | disabled/fallback | missing policy badge | missingData |
| delivery data unavailable | no fix_delivery | disabled/fallback | missing delivery badge | missingData |
| old snapshot only | label "Legacy Decision OS" | legacy disabled or mapped read-only | legacy badges | legacy section |
| generation failed | error with retry | hidden | table still loads metrics | error detail |
| preview missing | decision still visible but preview missing badge | card fallback | preview placeholder | preview blocker |
| user lacks permission | API 403 | API 403 | API 403 | API 403 |
| loading | skeleton | skeleton | table skeleton | drawer loading |
| partially loaded | no confident recs | disabled hard buckets | partial data badge | missingData |

## Copy And UX Language

| buyerAction | English label | Turkish label | oneLine template | nextStep | warning |
|---|---|---|---|---|---|
| scale | Scale review | Scale incele | `{name} is above target with enough purchase evidence.` | `Review budget/context before scaling.` | `Review required; no auto-scale.` |
| cut | Cut review / Pause review | Kapatmayı incele | `{name} is materially below target with no recovery signal.` | `Confirm no tracking or delivery blocker, then pause/replace.` | `Do not cut if launch/maturity data is missing.` |
| refresh | Refresh | Yenile | `{name} shows fatigue pressure.` | `Brief a new variant or rotate the angle.` | `Fatigue requires composite trend proof.` |
| protect | Protect | Koru | `{name} is a stable winner.` | `Keep live; avoid unnecessary edits.` | `Short-term volatility is not a cut reason.` |
| test_more | Test more | Daha fazla test | `{name} needs more evidence.` | `Let the test collect the required sample.` | `Not enough signal for scale/cut.` |
| watch_launch | Watch launch | Launch izle | `{name} is still inside the launch window.` | `Check again after the launch window or maturity threshold.` | `No hard cut/scale yet.` |
| fix_delivery | Fix delivery | Delivery düzelt | `{name} is active but has no verified spend/impressions.` | `Check ad, adset, campaign, audience, budget, and learning state.` | `Requires active status + no-spend proof.` |
| fix_policy | Fix policy | Policy düzelt | `{name} is rejected or limited.` | `Review rejection/limited reason and revise creative.` | `Do not judge performance before policy is fixed.` |
| diagnose_data | Diagnose data | Veriyi teşhis et | `{name} is missing required decision data.` | `Resolve missing fields: {missingData}.` | `No confident recommendation until data is fixed.` |

Bad copy to avoid: "Kill", "Scale now", "Winner" for new launch, "Last 24h" when source is daily insights, "AI says", "Guaranteed".

## PR-Level Implementation Plan

| PR | Title | Purpose | Files likely touched | Behavior change | Tests | Acceptance | Rollback | Risk | Dependency |
|---:|---|---|---|---|---|---|---|---|---|
| 1 | Audit docs + import graph | Baseline evidence | `docs/creative-decision-center/*` | no | n/a | docs reviewed | revert docs | low | none |
| 2 | Golden + invariant fixtures | Lock expected behavior | tests/fixtures/scripts | no | golden/invariant | failing tests acceptable if marked | remove tests | low | PR1 |
| 3 | Read-only data readiness loader | Live coverage proof | scripts only | no | script tests | no writes; redacted | disable script | medium | DB env |
| 4 | V2.1 contract types | Add contracts | lib types only | no | type/validator tests | no runtime import | revert | low | PR2 |
| 5 | Config-as-data | Central thresholds | config module | no/minimal | config tests | no hardcoded thresholds | default config | medium | PR4 |
| 6 | Buyer adapter shadow mode | Deterministic mapping | adapter + tests | shadow only | adapter/golden | no UI change | flag off | medium | PR4-5 |
| 7 | Add `decisionCenter` shape | API additive field | snapshot response | behind flag | compat tests | old response still works | flag off | high | PR6 |
| 8 | Minimal drawer | Render rowDecision | drawer/detail | behind flag | UI tests | engine root visible | flag off | medium | PR7 |
| 9 | Today Brief | Top actions | Creative page component | behind flag | UI tests | 60s criteria | flag off | medium | PR7 |
| 10 | Action Board | Buckets | new component | behind flag | UI tests | no UI decision compute | flag off | medium | PR7 |
| 11 | Table badges | buyerAction column | table | behind flag | UI tests | old fallback | flag off | medium | PR7 |
| 12 | Aggregates | page/family decisions | aggregate builder | behind flag | aggregate tests | no row brief_variation | flag off | high | data |
| 13 | Observability | metrics/events | telemetry | additive | telemetry tests | no PII | disable event | medium | PR7 |
| 14 | Legacy deprecation guardrails | import restrictions | lint/test scripts | no | static tests | no new legacy UI imports | remove guard | medium | stable V2.1 |

## Sunset Criteria

| System | Decision | Must happen first | Metrics/tests | Timeline |
|---|---|---|---|---|
| V1 `creative-decision-os` | absorb/delete later | decisionCenter renders all MVP; old snapshots adapt | 30 days stable, old snapshot tests | 3-6 months |
| `operator-policy` | absorb | missing evidence/blockers ported | parity tests | 2-3 months |
| `operator-surface` | absorb/deprecate UI vocabulary | UI reads buyerAction | static import restriction | 2-3 months |
| `media-buyer-scoring` | keep as signal or absorb | scorecard signals mapped to V2.1 | signal tests | 1-2 months |
| old-rule-challenger | keep script-only then delete | regression cases moved to golden tests | no imports except tests | 1-2 months |
| V2 preview routes | deprecate after V2.1 default | decisionCenter shadow/live surface replaces it | preview usage zero | 2-4 months |
| old snapshot contract | keep indefinitely via adapter | read-time adapter stable | old fixture tests | indefinite |

Do not delete anything until imports are gone and old snapshots render.

## Final Go / No-Go Gate

| Area | Status | Evidence | Blocker | Required next action | Can MVP proceed? |
|---|---|---|---|---|---|
| data readiness | red | 24h/policy/firstSpend fields missing from current contracts | Meta enrichment/live coverage | PR3 data loader + backend enrichment | contracts/tests only |
| vocabulary mapping | yellow | docs map four vocabularies | operator absorption work large | PR2 golden tests | yes for tests |
| golden tests | yellow | 35 cases documented + artifact test | not yet runtime resolver tests | convert to fixtures | yes |
| shadow conflict rate | yellow | fixture conflict 0 | no live snapshot comparison | read-only DB run | shadow only |
| UI migration risk | red | many V1/operator consumers | high import surface | flag + adapter | not UI default |
| operator absorption | red | operator-policy/surface are production logic | 6-12 weeks | parity tests | no default |
| snapshot compatibility | yellow | additive shape proposed | adapter not built | read-time adapter tests | yes behind flag |
| security/tenant isolation | yellow | routes use `requireBusinessAccess` | generated live scripts need review | no raw reports | yes for read-only |
| observability | yellow | plan exists | metrics not implemented | PR13 | shadow only |
| performance | green | 5k fixture rows ~5-6ms adapter runtime | excludes React/DB | server-side compute | yes |
| config readiness | yellow | defaults proposed, sensitivity artifact exists | no config module | PR5 | yes for tests |
| aggregate readiness | red | backlog/status missing | data unavailable | disable or low confidence | no except flag |

Final decision: **CONDITIONAL GO**.

Only start contracts, tests, config, shadow adapter, and read-only data coverage. Do not implement production resolver behavior or default UI decisions until live snapshot coverage proves `fix_delivery`, `fix_policy`, `watch_launch`, and aggregate actions have the required input data.

