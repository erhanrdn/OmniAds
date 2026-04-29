# Phase 04 - Creative Action Contract v2

This is the canonical creative action contract after Happy Harbor Faz B-E.

Archived v1 references live under `docs/operator-policy/creative-segmentation-recovery/archive/`.

## Canonical Contract

Every buyer-facing creative decision must resolve to one `CreativeVerdict`.

```ts
type CreativePhase = "test" | "scale" | "post-scale";

type CreativeVerdictHeadline =
  | "Test Winner"
  | "Test Loser"
  | "Test Inconclusive"
  | "Scale Performer"
  | "Scale Underperformer"
  | "Scale Fatiguing"
  | "Needs Diagnosis";

type CreativeAction =
  | "scale"
  | "keep_testing"
  | "protect"
  | "refresh"
  | "cut"
  | "diagnose";

type CreativeActionReadiness = "ready" | "needs_review" | "blocked";

interface CreativeVerdict {
  contractVersion: "creative-verdict.v1";
  phase: CreativePhase | null;
  phaseSource?: CreativePhaseSource | null;
  headline: CreativeVerdictHeadline;
  action: CreativeAction;
  actionReadiness: CreativeActionReadiness;
  confidence: number;
  evidence: CreativeReason[];
  blockers: CreativeBlockerReason[];
  derivedAt: string;
}
```

Source of truth:

- Resolver: `lib/creative-verdict.ts:resolveCreativeVerdict`
- Phase resolver: `lib/creative-phase.ts:deriveCreativePhaseResolution`
- Buyer UI band: `components/creatives/VerdictBand.tsx`
- Drift audit: `npm run creative:agreement-audit`
- Safety gate: `npm run creative:v2:safety`

## Action Semantics

| Action | Buyer label | Meaning |
| --- | --- | --- |
| `scale` | Promote to Scale | Move a validated test winner into a scale lane. |
| `keep_testing` | Continue Testing | Keep evidence collection running; no scale/cut decision yet. |
| `protect` | Keep Active | Preserve a stable scale performer without unnecessary edits. |
| `refresh` | Refresh Creative | Replace or refresh angle/format while preserving proven learning. |
| `cut` | Cut Now | Pause, retire, or materially reduce spend. |
| `diagnose` | Investigate | Fix missing truth, validation, or deployment context before performance action. |

Readiness modifies the action:

- `ready`: buyer can proceed under normal account governance.
- `needs_review`: buyer must check blockers, commercial truth, or account context first.
- `blocked`: no platform move; diagnose the blocker.

## Phase Semantics

| Phase | Meaning | Primary signals |
| --- | --- | --- |
| `test` | Creative is still gathering validation evidence. | Low spend/maturity, test campaign family, test naming convention. |
| `scale` | Creative has production-level maturity or scale campaign context. | Scale campaign family, scale naming convention, high spend relative to median, purchase maturity. |
| `post-scale` | Creative has scale memory plus fatigue/decay or post-scale review context. | Recent-vs-long-window ROAS collapse, fatigue override, scale-like delivery with decay. |
| `null` | Legacy snapshot needs analysis. | Old snapshot without phase field. |

## Policy Rules

### Commercial Truth

- If a target pack is configured, use target ROAS as break-even.
- If no target pack exists, use selected 30-day median ROAS as a median proxy and emit `break_even_proxy_used`.
- If neither target pack nor median proxy exists, fall back to a default floor and emit blocker evidence.
- Missing commercial truth does not hide the decision; it downgrades readiness unless paired with hard trust blockers.

### Business Validation

- `favorable`: action can remain ready if no other blockers exist.
- `missing`: action usually becomes `needs_review`.
- `unfavorable`: scale-phase underperformance can cut; otherwise readiness is review-biased.

### Hard Truth Blocker

When source trust is `degraded_missing_truth` and business validation is missing:

- headline: `Needs Diagnosis`
- action: `diagnose`
- readiness: `blocked`

This rule wins over apparent ROAS strength.

### Test Policy

- Strong break-even outperformance with enough spend and purchases: `Test Winner` + `scale`.
- Clear break-even miss with mature spend: `Test Loser` + `cut`.
- Low evidence or mixed signal: `Test Inconclusive` + `keep_testing`.

### Scale Policy

- Stable above/near break-even performance: `Scale Performer` + `protect`.
- Clear underperformance: `Scale Underperformer` + `cut` or `refresh`, depending on severity.
- Recent-vs-long-window fatigue: `Scale Fatiguing` + `refresh`.

### Deployment Compatibility

Limited or blocked deployment compatibility downgrades readiness to `needs_review` or `blocked`.

## UI Requirements

All buyer-facing surfaces must render the same verdict for the same creative ID:

- Detail drawer full `VerdictBand`
- Creatives table compact `VerdictBand`
- Public share compact `VerdictBand`
- Decision OS canonical surface compact `VerdictBand`

Legacy lifecycle/action labels must not be reintroduced as competing buyer guidance.

## Verification

Required before merge:

- `npm test`
- `npx tsc --noEmit`
- `npm run creative:v2:safety`
- `npm run creative:agreement-audit`

`creative:v2:safety` is wired into `.github/workflows/ci.yml` for pull requests. Repository branch protection must mark the `test` job as required in GitHub settings.
