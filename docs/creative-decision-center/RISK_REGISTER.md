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

