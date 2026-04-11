# V2-08 Historical Intelligence & Self-Tuning

> Live release posture for this surface now lives in `docs/v3-01-release-authority.md` and `/api/release-authority`.

## Goal

Make selected periods useful again for descriptive analysis and tuning without changing live decision authority.

## Current additive surfaces

- `Creative Decision OS` now includes a separate selected-period historical analysis panel.
- `Command Center` now includes a separate historical intelligence and self-tuning panel.

## Guardrails

- Selected period remains analysis-only.
- Live decisions still come from `decisionWindows.primary30d`.
- `Recommendations`, `Decision Signals`, and `AI Commentary` wording is unchanged.
- No route-to-route internal HTTP was introduced.
- No new mutation path or schema change was introduced.

## Creative selected-period analysis

- Uses the existing direct creative source path for the user-selected range.
- Excludes tiny selected-period noise when spend is below `40`, purchases are `0`, and impressions are below `2000`.
- Surfaces:
  - winning formats
  - hook trends
  - angle trends
  - family performance
- Remains descriptive only and does not change deterministic `Decision Signals`.

## Command Center historical intelligence

- Uses the full additive action snapshot plus selected-period Meta campaign rows.
- Surfaces:
  - selected-period Meta campaign-family summaries
  - queue quality
  - suppression rates
  - false-positive hotspots
  - false-negative hotspots
  - degraded-mode guidance
  - deterministic calibration suggestions

## Calibration priority defaults

1. Missing commercial-truth inputs
2. High degraded share
3. Repeated false-positive hotspots on the same source family
4. Repeated queue-gap hotspots showing missing coverage

## Test expectations

- Selected-period historical panels must change across date-range presets.
- Meta, Creative, and Command Center live decision signatures must remain stable across those same presets.
- Reviewer smoke verifies visibility on read-only seeded surfaces.
- Commercial smoke verifies variance in historical panels while live decision authority remains unchanged.
