# ADR-001 — Legacy-First Sync Control Plane

See also:

- [Sync Control Plane Product Readiness And Google Ads Runtime](/Users/harmelek/Adsecute/docs/architecture/sync-control-plane-product-readiness-and-google-ads-runtime.md)

## Status
Accepted

## Context

Adsecute currently contains two sync models:

- provider-specific runtimes that actively consume Meta and Google Ads work
- a generic provider orchestration abstraction that is not yet the production runtime

The hybrid shape increases ambiguity around which runtime owns queue consumption,
checkpoint progression, and recovery.

At the same time, user-request paths must not mutate sync state directly, and
historical serving must remain warehouse-first.

## Decision

Until the generic orchestration path is fully implemented end-to-end for a
provider, the production runtime is defined as:

- Meta: provider-specific runtime
- Google Ads: provider-specific runtime

The generic orchestration layer is not authoritative in production.

Additional enforcement decisions:

- `POST /api/sync/refresh` is not public. Only admin sessions and signed
  internal callers may trigger it.
- read routes do not trigger sync work
- historical warehouse reads do not depend on current live token presence
- worker/cron/admin recovery are the only allowed sync mutation paths

## Operational Truth

For P0/P1 stabilization, the following are authoritative operational surfaces:

- provider-specific sync workers
- provider queue/state tables currently used by those runtimes
- worker heartbeat and runner lease health
- admin sync recovery actions

## Follow-Up

If the team later decides to cut over to generic orchestration, that change must
be introduced by a separate ADR after one provider is fully migrated and proven
in soak testing.
