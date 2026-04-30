# Creative Decision Center V2.1 Risk Register

## Risk Table

| risk | likelihood | impact | why | mitigation | owner area |
|---|---|---|---|---|---|
| Missing Meta data for policy/delivery/fatigue | High | High | Current public row contracts lack 24h spend/impressions, review status, effective status, policy reasons, first spend | Data readiness gate; fallback to `diagnose_data`; enrich backend before emitting actions | data/backend |
| Operator-policy/surface hidden logic loss | High | High | These files drive production labels, blockers, quick filters, and push readiness | Treat as first-class migration scope; adapter tests from operator cases | backend/frontend |
| UI consumers still compute decisions | High | High | `creative-operator-surface.ts`, `CreativeDecisionOsOverview`, top section support map labels/filters | Move meaning into `decisionCenter`; UI renders contract only | frontend |
| Old snapshots breaking | Medium | High | Current response shape has `decisionOs`; consumers are typed to V1 | Additive field only; read-time adapter; snapshot fixture tests | backend |
| Duplicate vocabularies survive too long | High | Medium | V1, operator, surface, V2 all active | Define owner vocabulary and deprecation gates | product/backend |
| Hard-coded thresholds | Medium | High | Existing engines contain thresholds | Central config module and tests forbidding unapproved constants | backend |
| Aggregate decisions overfitting | Medium | Medium | Supply/backlog data missing; family signals partial | Keep aggregates disabled/low confidence until data exists | product/data |
| Confidence/priority/maturity confusion | High | Medium | They mean different things but often look correlated | Contract docs and golden tests assert all three | product/frontend |
| AI-generated resolver drift | High | High | Future AI edits can rewrite logic without preserving safety | Golden tests + shadow diff required before merge | backend |
| `fix_delivery` emitted without proof | Medium | High | Status + 24h fields unavailable today | Required-data gate | backend |
| `fix_policy` emitted without proof | Medium | High | Review/effective status not exposed today | Required-data gate | backend |
| Row-level `brief_variation` | Medium | Medium | Product language can tempt row action | Type system: aggregate-only action union | product/backend |
| Hard scale/cut on stale data | Medium | High | Current V2 handles degraded truth but not explicit stale hours | staleDataHours gate | backend |
| New launch hard cut | Medium | High | Launch date is partial and can be misleading | launchWindowHours + maturity gate | backend |
| Live snapshot comparison absent | High right now | High | `DATABASE_URL` missing in this environment | Add read-only loader and rerun before implementation | data |

## Final Recommendation

Proceed with V2.1 extension as the plan, but do not implement runtime behavior until the data-readiness and shadow comparison run against real snapshots.

New core is still unnecessary. The real work is not a new algorithm; it is data enrichment, deterministic adapter, operator-policy/surface absorption, compatibility, and tests.

Can safely ship now behind flags/shadow:

| Buyer action | Status |
|---|---|
| `test_more` | safe |
| `protect` | conditional |
| `scale` | conditional, review-only |
| `cut` | conditional, review-only |
| `refresh` | conditional if fatigue evidence exists |
| `diagnose_data` | safe fallback |

Must stay gated/fallback until data proves readiness:

| Buyer action | Blocker |
|---|---|
| `fix_delivery` | needs ad/campaign/adset status + spend24h/impressions24h |
| `fix_policy` | needs review/effective status + reasons |
| `watch_launch` | needs reliable firstSeenAt/firstSpendAt/launch age |
| `brief_variation` | aggregate only; needs family/backlog/backup status |
| `creative_supply_warning` | needs backlog/production/winner-gap data |
| `winner_gap` | needs historical winner dates |
| `fatigue_cluster` | needs reliable top-N + composite fatigue trends |
| `unused_approved_creatives` | needs approval status + delivery proof |

Work likely underestimated:

| Area | Realistic effort |
|---|---|
| Audit/mapping | 3-5 days |
| Golden cases and tests | 3-5 days |
| Read-only live snapshot loader + data coverage | 3-5 days |
| Meta data enrichment for delivery/policy/24h/launch | 2-3 weeks |
| V2.1 resolver changes | 1-2 weeks after data |
| Buyer adapter | 3-5 days |
| Aggregate decisions | 2-4 weeks depending on backlog data |
| UI migration MVP | 2-4 weeks |
| Backward compatibility adapters | 1-2 weeks |
| Operator-policy/surface absorption | 6-12 weeks if fully normalized |

Smallest next action: add PR 2 golden tests and PR 3 read-only live snapshot/data readiness loader. Do not build UI before proving the data.

