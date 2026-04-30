# Context Snapshot

## Project State

Adsecute / OmniAds Creative page should become a media buyer decision center, not a dashboard.

The user's main product need:

> What should I do, why, and with how much confidence?

## Current Problem

Multiple decision vocabularies and decision-like layers exist. They are valuable, but they can produce confusing product language unless normalized behind one buyer-facing contract.

Known layers:

- V1 `creative-decision-os`
- V2 `creative-decision-os-v2`
- `creative-media-buyer-scoring`
- `creative-old-rule-challenger`
- `creative-operator-policy`
- `creative-operator-surface`

## Current Decision

Evolve V2 into V2.1. Do not create a new standalone core.

Reason: V2 already has a cleaner primary decision contract and safety posture. The missing work is data enrichment, adapter mapping, aggregate separation, compatibility, and tests.

## Known Risks

- V2 input likely lacks data for confident `fix_delivery`, `fix_policy`, `watch_launch`, and reliable fatigue decisions.
- Known missing/weak fields include `ctr`, `cpm`, `frequency`, `firstSeenAt`, `firstSpendAt`, `reviewStatus`, `disapprovalReason`, `limitedReason`, and `spend24h`.
- `creative-operator-policy` and `creative-operator-surface` are large first-class migration scope, not helper files.
- Existing V1/operator snapshots must remain renderable.

## MVP

1. Today Brief
2. Action Board
3. Creative Table
4. Minimal Detail Drawer

## Deferred

- Asset library
- Timestamp comments
- Approval workflow
- Client share links
- PDF/Notion export
- TikTok/Meta merge
- Seasonality
- Hook library
- Automated queue/apply actions

