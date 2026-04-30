# Migration Plan

## Phase 0 — Repo Audit

Repo audit, vocabulary mapping, import/consumer graph.

No behavior change.

## Phase 1 — Golden Cases And Invariants

Add executable golden cases and invariant tests.

No resolver behavior change.

## Phase 2 — Data Readiness And Shadow Coverage

Add read-only data readiness and before/after shadow scripts.

No writes. No production data mutation.

## Phase 3 — V2.1 Contracts Only

Add TypeScript contract types and validators.

No runtime behavior change.

## Phase 4 — Config-As-Data

Centralize thresholds and defaults.

No scattered hard-coded thresholds inside resolver.

## Phase 5 — Buyer Adapter In Shadow Mode

Add deterministic table-driven buyer adapter.

Shadow mode only; UI does not default to it.

## Phase 6 — `decisionCenter` Response Behind Feature Flag

Add additive response field behind flag.

No route renames initially.

## Phase 7 — Minimal Detail Drawer Reads `decisionCenter`

Drawer reads row decision if present, otherwise old V1/operator fallback.

## Phase 8 — Today Brief Behind Flag

Render top action list from `decisionCenter`.

## Phase 9 — Action Board Behind Flag

Render buyer action buckets from `decisionCenter`.

## Phase 10 — Creative Table Badges Migrate To `buyerAction`

Table displays `buyerAction`, confidence, and reason from `decisionCenter`.

## Phase 11 — Aggregate Decisions Behind Flag

Add page/family aggregates only after data readiness proves required inputs.

## Phase 12 — Observability And Rollback

Add decision distribution metrics, conflict tracking, fallback rates, and rollback thresholds.

## Phase 13 — Legacy Vocabulary Sunset / Import Restrictions

Only after UI consumers stop importing old vocabularies and old snapshots render through adapters.

## Required Safety

- No route rename initially.
- No deletion of old engines initially.
- Read-time adapter for old snapshots.
- Dual-run before default.
- Rollback: feature flag off, legacy snapshot rendering, V2.1 shadow mode only.

