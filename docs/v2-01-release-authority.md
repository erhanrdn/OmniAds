# V2-01 Release Authority

This document is the canonical release-authority doc for the accepted V2-01 baseline.

Current live release truth is not inferred from older phase docs alone. It is defined by:

- `lib/release-authority/inventory.ts`
- `GET /api/release-authority`
- `/admin/release-authority`

Current accepted live baseline for this authority layer:

- current live SHA: `5017c8d3d598b05bf384ce1c1149b68a297fab13`
- rollback target before the next release: `5017c8d3d598b05bf384ce1c1149b68a297fab13`
- repository authority: `erhanrdn/OmniAds` `main`

## Authority Rules

- `documented` means this document and `/api/release-authority` explain the surface explicitly.
- `live` means operator-visible in the current baseline without an allowlist gate.
- `flagged` means merged but not globally live; a feature gate still controls exposure.
- `legacy` means intentionally shipped for compatibility, not the canonical surface.
- `drifted` means the authority route reports a mismatch that still needs review.
- Older Phase 02-06 docs remain design and contract references only. They are not the final live release authority.

## Feature Matrix

| Surface | Runtime posture | Flag posture | Docs posture | Notes |
| --- | --- | --- | --- | --- |
| `Operating Mode` | `live` | `n/a` | `current` | Deterministic commercial-truth overlay remains live on Meta and Creative contexts. |
| `Recommendations` | `live` | `n/a` | `current` | Meta `Recommendations` wording remains current and operator-visible. |
| `Meta Decision OS` | `live` or `flagged` | `META_DECISION_OS_V1`, `META_DECISION_OS_CANARY_BUSINESSES` | `current` | Release authority must report whether the surface is globally enabled or allowlisted. The current baseline includes additive policy metadata and a read-only winner scale candidate board while keeping the execution subset unchanged. |
| `Creative Decision OS` | `live` or `flagged` | `CREATIVE_DECISION_OS_V1`, `CREATIVE_DECISION_OS_CANARY_BUSINESSES` | `current` | Deterministic creative surface remains separate from AI commentary; the current baseline uses a dedicated resizable drawer plus additive economics, compatibility, protected winners, and supply planning boards. |
| `Decision Signals` | `live` | `n/a` | `current` | Compatibility surface for deterministic creative actions. |
| `AI Commentary` | `live` | `n/a` | `current` | Commentary remains interpretation-only, never workflow authority. |
| `Command Center workflow` | `live` or `flagged` | `COMMAND_CENTER_V1`, `COMMAND_CENTER_CANARY_BUSINESSES` | `current` | Unified queue, journal, saved views, throughput budgeting, structured feedback, and status-only batch workflow. |
| `Command Center execution preview` | `live` or `flagged` | `COMMAND_CENTER_EXECUTION_V1` | `current` | Preview-first surface is inventoried separately from apply authority. |
| `Command Center apply / rollback` | `flagged` until canary apply is explicitly enabled | `COMMAND_CENTER_EXECUTION_V1`, `META_EXECUTION_APPLY_ENABLED`, `META_EXECUTION_CANARY_BUSINESSES` | `current` | This baseline must never present disabled apply as live. |
| `/copies` | `live` | `n/a` | `current` | The route stays visible in the matrix so copy-surface risk cannot go opaque. |
| `/meta -> /platforms/meta` | `legacy` | `n/a` | `current` | Intentional redirect alias, not the canonical Meta entrypoint. |

## Docs Role Split

Current workflow throughput baseline references:

- `docs/v2-06-command-center-throughput.md`
- `docs/v2-06-release-checklist.md`
- `docs/v2-06-rollout-runbook.md`

These V2-06 docs define the current additive workflow layer on top of the already accepted Phase 05 and Phase 06 baselines.

- `docs/phase-02-operating-modes.md`
- `docs/phase-03-meta-decision-os.md`
- `docs/phase-04-creative-decision-os.md`
- `docs/phase-05-command-center.md`
- `docs/phase-06-safe-execution-layer.md`

These older phase documents remain important references for design intent, contracts, and rollout context. They are not allowed to override the live/flagged/legacy posture reported by `/api/release-authority`.

## Drift Policy

- `live vs main` drift is real and must stay visible.
- `docs vs runtime` drift is real unless this doc and `/api/release-authority` explicitly cover the surface.
- `flagged` is not a failure when the manifest says it is intentional.
- `legacy` is not hidden; it stays visible so future phases do not assume it is canonical.

## Review Order

1. Verify the current live SHA from `/api/build-info`.
2. Verify `GET /api/release-authority` and `/admin/release-authority`.
3. Verify the surface matrix for live, flagged, and legacy posture.
4. Verify unresolved drift items before treating the baseline as release-ready.
5. Use older Phase 02-06 docs only after the authority route and this doc agree on the baseline.
