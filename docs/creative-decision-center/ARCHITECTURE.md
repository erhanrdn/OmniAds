# Target Architecture

```txt
Raw Meta / business / snapshot data
  -> Feature enrichment layer
  -> V2.1 engine
  -> Deterministic buyer adapter
  -> Row decisions + aggregate decisions
  -> DecisionCenter snapshot
  -> Today Brief / Action Board / Table / Minimal Drawer
```

## Responsibilities

| Layer | Responsibility |
|---|---|
| Feature enrichment | Build canonical feature rows with identity, metrics, status, freshness, targets, benchmark, and missing-data markers. |
| V2.1 engine | Produce engine root: `primaryDecision`, `problemClass`, `actionability`, `confidence`, `maturity`, `reasonTags`, `evidenceSummary`, blockers. |
| Buyer adapter | Deterministically map engine output and required proof fields to `buyerAction`, label, priority, next step, and UI bucket. |
| Row decisions | Per-row/ad/creative action context. Must state identity grain. |
| Aggregate decisions | Page/family-level decisions like `brief_variation`, supply warnings, winner gaps, fatigue clusters. |
| Snapshot | Persist reproducible `decisionCenter` output with versions, config, freshness, and coverage summaries. |
| UI | Render decisions. Do not compute `buyerAction`. |
| Config | Own thresholds and account/business overrides. |

## Must Not Happen

- UI must not compute `buyerAction`.
- Adapter must not score or rank like a second engine.
- Aggregate decisions must not be forced into row buyer actions.
- Same input + same config + same `engineVersion` + same `adapterVersion` must not produce different output.
- Resolver must not use hidden network calls or non-injected clocks.

