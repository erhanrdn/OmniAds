# Risk Register

| risk | likelihood | impact | why | mitigation | ownerArea | status |
|---|---|---|---|---|---|---|
| missing Meta data for policy/delivery/fatigue | high | high | V2 input likely lacks required fields | data readiness audit; enrich before emit | data/backend | open |
| operator-policy/surface hidden logic loss | high | high | production vocabulary and blockers live there | parity mapping + tests | backend/frontend | open |
| UI consumers still computing decisions | high | high | existing UI uses operator surface helpers | migrate to `decisionCenter`; static tests | frontend | open |
| old snapshots breaking | medium | high | response currently V1-oriented | read-time adapter; old snapshot fixtures | backend | open |
| duplicate vocabularies surviving too long | high | medium | V1/operator/V2 all exist | sunset plan + import restrictions | backend | open |
| hard-coded thresholds | medium | high | resolver edits may scatter constants | config-as-data | backend | open |
| aggregate decisions overfitting | medium | medium | backlog/supply data uncertain | aggregate flags + required data gates | product/data | open |
| confidence/priority/maturity confusion | high | medium | these are often conflated | contract docs + tests | product/backend | open |
| AI-generated resolver drift without golden cases | high | high | future AI edits may rewrite rules | golden + invariant tests before changes | backend | open |
| tenant/security risk | medium | high | snapshots can contain sensitive data | auth checks, redaction, no raw fixtures | backend/security | open |
| shadow conflict rate | unknown | high | live comparison not run | before/after shadow run | backend/data | open |
| config missing or ignored | medium | high | thresholds drive safety | config version in snapshot | backend | open |
| target/benchmark ambiguity | high | high | scale/cut needs target context | drawer target source + confidence cap | product/data | open |
| timezone/freshness ambiguity | high | high | launch/24h can be mislabeled | normalized time model | data | open |
| historical backtest unavailable | high | medium | no proof decisions predict outcomes | log decision/outcome joins | data | open |

## Risk Notes

### Missing Meta data for policy/delivery/fatigue

This is the primary MVP blocker. Do not emit confident `fix_delivery`, `fix_policy`, `watch_launch`, or fatigue actions until the required proof fields exist.

### Operator policy/surface hidden logic loss

`creative-operator-policy` and `creative-operator-surface` are first-class migration scope. Treating them as helpers will lose blockers, labels, and queue safety semantics.

### UI consumers still computing decisions

Existing UI surfaces already transform decision language. V2.1 must move buyer-facing meaning into `decisionCenter`, with UI rendering only.

### Old snapshots breaking

Old V1/operator snapshots must remain renderable. Add read-time adapters before changing default UI paths.

### Duplicate vocabularies surviving too long

The system can tolerate dual-run temporarily, but the migration needs import restrictions and sunset criteria after V2.1 stabilizes.

### Hard-coded thresholds

Thresholds should be config-as-data with config version recorded in snapshots. Resolver-local literals will make account overrides and audits unsafe.

### Aggregate decisions overfitting

Aggregate decisions need family/supply/backlog data. Missing data should disable the aggregate or cap confidence.

### Confidence/priority/maturity confusion

High priority can be low confidence. Mature data can be low confidence. Low maturity can still be high priority for policy blockers.

### AI-generated resolver drift

Golden cases and invariants are mandatory before resolver changes. Future AI edits should not rewrite decision semantics without failing tests.

### Tenant/security risk

Docs and generated artifacts must not contain secrets, tokens, raw account IDs, or customer-sensitive data.

### Shadow conflict rate

Scale/cut conflicts between legacy and V2.1 should block rollout until reviewed.

### Target/benchmark ambiguity

Hard scale/cut decisions need target or reliable benchmark context. Missing target should cap confidence.

### Timezone/freshness ambiguity

Do not call daily Meta insights "last 24h" unless that is actually the window basis. Drawer copy must expose freshness basis.
