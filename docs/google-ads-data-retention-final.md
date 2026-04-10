# Google Ads Data Retention Final

This document becomes the canonical final retention model once runtime enforcement and observability are wired.

Until that runtime work lands, treat this document as the target contract, not as proof that cleanup is already running.

## Retention Tiers

- Core daily tables: 25 months
- Breakdown daily tables: 13 months
- Creative daily tables: 180 days
- Raw search query hot daily: 120 days
- Top queries weekly: 365 days
- Search cluster aggregate daily: 25 months
- Decision action and outcome logs: 25 months

## Runtime Posture

Expected final posture:

- dry run available at all times
- destructive execution gated by `GOOGLE_ADS_RETENTION_EXECUTION_ENABLED`
- retention runs recorded in a dedicated observability table
- retention work executed under a lease so overlapping workers do not double-delete
- product gate reports whether retention is disabled, dry-run only, recently executed, or not verified

## Current Session Constraint

The current environment does not expose `DATABASE_URL`, so live retention execution cannot be verified from this session.

Any runtime implementation shipped from this task must therefore report `NOT VERIFIED` until a DB-backed run proves otherwise.
