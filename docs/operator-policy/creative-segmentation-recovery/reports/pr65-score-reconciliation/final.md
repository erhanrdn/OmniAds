# PR #65 Score Reconciliation

Date: 2026-04-25

Branch / PR: `feature/adsecute-creative-claude-fix-plan-implementation` /
`https://github.com/erhanrdn/OmniAds/pull/65`

Current commit: `c5ee6a12bbbc8db795649da05f2120ef251b9063`

## Executive Result

The mismatch is real and is an artifact/runtime truth problem, not a reason to
change policy in this pass.

Findings:

- `company-08 / company-08-creative-10` is currently `Refresh` in the committed
  PR #65 live artifact, not `Watch`.
- Claude's latest `company-08 / creative-10 is Watch` statement is stale for
  that specific row against the current committed artifact.
- STATE.md overclaimed acceptance-level scores because it described
  deterministic reviewed-set estimates as if they were regenerated current
  equal-segment scores.
- The repo does not contain an executable equal-segment scoring helper that can
  regenerate the independent media-buyer score from current live data.
- A live-firm audit rerun was attempted with the SSH DB tunnel and a raised
  `DB_QUERY_TIMEOUT_MS=60000`, but it did not complete after several minutes and
  was stopped without changing committed live-firm artifacts.

No policy change was made.

## Current Branch State

- branch: `feature/adsecute-creative-claude-fix-plan-implementation`
- remote head: matches local head
- latest commit: `c5ee6a1 Verify Creative Watch Refresh edge`
- PR #65: open, not merged

An unstaged external-review edit exists at
`docs/external-reviews/creative-segmentation-recovery/equal-segment-review.md`.
It was not staged or modified by this reconciliation pass.

## Artifacts Produced

Committed reconciliation artifact:

- `docs/operator-policy/creative-segmentation-recovery/reports/equal-segment-scoring/artifacts/pr65-current-equal-segment.json`

Local private copy:

- `/tmp/adsecute-pr65-current-equal-segment-local.json`

Important caveat: this artifact is a reconciliation artifact, not a fresh
independent equal-segment score. It joins:

- current committed live artifact:
  `docs/operator-policy/creative-segmentation-recovery/reports/live-firm-audit/artifacts/sanitized-live-firm-audit.json`
- stale local expected-label artifact:
  `/tmp/adsecute-creative-equal-segment-scoring-local.json`

Because the expected-label artifact predates PR #65 final commits and aliases /
metrics drift between artifacts, the joined score is explicitly marked
`not_valid_for_acceptance`.

## Current Live Segment Distribution

From the current committed sanitized live artifact:

| Segment | Count |
|---|---:|
| Scale | 0 |
| Scale Review | 6 |
| Test More | 7 |
| Protect | 1 |
| Watch | 10 |
| Refresh | 23 |
| Retest | 0 |
| Cut | 12 |
| Campaign Check | 0 |
| Not Enough Data | 14 |
| Not eligible for evaluation | 5 |

## Disputed Row Trace

### `company-08 / company-08-creative-10`

- current segment: `Refresh`
- current primary decision: `refresh`
- instruction: `Refresh: company-08-creative-10`
- lifecycle / action: `validating` / `keep_in_test`
- spend: `377.85`
- purchases: `2`
- ROAS: `0.64`
- CPA: `188.93`
- account baseline ROAS: `1.74`
- benchmark ratio: `0.368x`
- recent 7d ROAS: `0`
- trend ratio: `0`
- gate: `isValidatingBelowBaselineCollapseRefreshCandidate`
- queue/apply: false / false

Conclusion: Claude's `Watch` observation is stale for this row against the
current committed artifact.

### `company-05 / company-05-creative-04`

- current segment: `Watch`
- instruction: `Watch: company-05-creative-04`
- lifecycle / action: `validating` / `keep_in_test`
- spend: `35592.79`
- purchases: `14`
- ROAS: `2.8`
- account baseline ROAS: `2.98`
- benchmark ratio: `0.94x`
- gate: hold-monitor fallback / evidence floor guard

Conclusion: the alias no longer matches the earlier high-relative review-candidate
shape. This is a strong sign that prior alias-based scoring artifacts are stale
or not directly comparable.

### `company-03 / company-03-creative-01`

- current segment: `Cut`
- lifecycle / action: `fatigued_winner` / `refresh_replace`
- benchmark ratio: `0.108x`
- trend ratio: `0`
- gate: `isFatiguedCpaRatioCutCandidate`
- queue/apply: false / false

Conclusion: current output agrees with the severe CPA Cut fix.

### `company-07 / company-07-creative-01`

- current segment: `Cut`
- lifecycle / action: `fatigued_winner` / `refresh_replace`
- benchmark ratio: `0.749x`
- trend ratio: `0`
- gate: `isFatiguedCpaRatioCutCandidate`
- queue/apply: false / false

Conclusion: current output agrees with the severe CPA Cut fix.

### `company-01 / company-01-creative-04`

- current segment: `Refresh`
- lifecycle / action: `fatigued_winner` / `refresh_replace`
- benchmark ratio: `1.075x`
- trend ratio: `1.178x`
- gate: `needs_new_variant / refresh_replace`

Conclusion: this remains a judgment boundary, not a stale Watch issue.

### Additional Claude-listed rows in the current artifact

- `company-08 / company-08-creative-06`: current `Watch`, benchmark ratio
  `0.661x`, trend `0.513x`; it does not match the strict Round 5
  `<=0.40x` / trend `0` Refresh gate.
- `company-08 / company-08-creative-05`: current `Cut`, benchmark ratio
  `0.362x`; current output agrees with Cut direction.
- `company-05 / company-05-creative-09`: current `Cut`, benchmark ratio
  `0.601x`; current output agrees with Cut direction.
- `company-05 / company-05-creative-10`: current `Watch`, benchmark ratio
  `0.886x`; possible future policy candidate if a fresh review confirms it is
  truly Cut/Refresh, but not part of the `company-08 / creative-10` dispute.

## Claude vs STATE Reconciliation

### Was Claude reviewing stale data?

For `company-08 / company-08-creative-10`, yes. The current committed live
artifact says `Refresh`, not `Watch`.

For global scores, Claude appears to have mixed at least one stale expected-label
artifact and/or stale alias mapping with current PR notes. The stale local
artifact predates the latest PR #65 commits and is not safe as the score of
record.

### Was STATE.md overclaiming?

Yes. STATE.md should not claim acceptance-level current scores from estimated
post-fix reviewed-set reasoning. It can say the target row is fixed, but the
actual current per-segment score remains unproven until a fresh equal-segment
review is regenerated.

### Are Watch / Refresh / Protect actually 90+?

Not proven. The current code artifact proves current segment distribution and
specific disputed row outcomes. It does not prove independent equal-segment
quality scores because expected media-buyer labels were not regenerated.

### Which artifact should Claude use next?

Claude should use:

1. `docs/operator-policy/creative-segmentation-recovery/reports/equal-segment-scoring/artifacts/pr65-current-equal-segment.json`
2. `docs/operator-policy/creative-segmentation-recovery/reports/live-firm-audit/artifacts/sanitized-live-firm-audit.json`
3. this reconciliation report

Claude should not use `/tmp/adsecute-creative-equal-segment-scoring-local.json`
as the current score of record.

### Is another policy fix needed before Claude review?

Not from the `company-08 / creative-10` dispute. That row is already Refresh.

A future policy fix may be needed if a fresh review confirms other current rows,
such as high-spend validating below-baseline Watch/Refresh boundaries, remain
wrong. That should be decided after scoring against the current artifact, not
from stale alias-based artifacts.

## Validation

- targeted audit/scoring helper tests changed: not applicable; no helper code
  was changed
- policy code changed: no
- `npm test`: not rerun in this reconciliation pass because no code changed;
  previous PR #65 local validation remains recorded in STATE
- `npx tsc --noEmit`: not rerun; no code changed
- `npm run build`: not rerun; no code changed
- touched-file `git diff --check`: passed
- hidden/bidi/control scan on touched reports/artifacts: passed
- raw ID scan on touched reports/artifacts: passed

## Final Read

Result: artifact mismatch resolved enough to stop policy work. The correct next
step is a fresh Claude/supervisor review using the current reconciliation and
live artifacts. Do not merge PR #65 as final and do not start another policy pass
until that review confirms the actual remaining failure class.
