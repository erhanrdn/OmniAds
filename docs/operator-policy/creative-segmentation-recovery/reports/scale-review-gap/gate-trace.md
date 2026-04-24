# Scale Review Gap - Gate Trace

Last updated: 2026-04-24 by Codex

## Root Suppressor

The main suppressor is **not** the `Scale Review` policy branch.

It is the upstream source-authority aggregation:

1. `getCreativeDecisionOsForRange()` combines the primary creative window, support windows, and campaign/ad set snapshot evidence into one top-level `evidenceSource`
2. any `unknown` support source currently degrades the combined value to `unknown`
3. the operator policy receives that single `evidenceSource`
4. `resolveSegment()` exits early to `contextual_only` when `evidenceSource !== live`
5. the Creative surface renders `contextual_only` as `Not eligible for evaluation`

This means review-level diagnosis never gets the chance to run for affected rows, even when the primary 30d creative window is the actual decision-authority source.

## Candidate Trace - `company-01-creative-04`

### Raw Metrics

- 30d spend: `770.86`
- 30d purchases: `21`
- 30d ROAS: `4.78`
- 30d CPA: `36.71`
- 7d spend: `197.67`
- 7d purchases: `6`
- 7d ROAS: `3.78`

### Baseline and Scope

- benchmark scope: `account`
- baseline reliability: `strong`
- relative-strength class: `strong_relative`

### Gate Walk

1. raw row is present in the current Decision OS sample
2. benchmark scope is explicit and stable
3. baseline reliability is strong enough for review-level diagnosis
4. evidence floors are materially above thin-signal behavior
5. campaign/ad set context is **not** the primary blocker
6. business validation is `missing`, which should cap this at review-only, not direct `Scale`
7. operator policy never reaches the review-only branch because `evidenceSource = unknown`
8. final surface becomes:
   - segment: `Not eligible for evaluation`
   - instruction: `Use as context: company-01-creative-04`

### Diagnosis

This is the cleanest live likely miss.

The only visible blocker is the aggregate evidence-source downgrade. The row otherwise looks like a valid review-only candidate.

## Comparison Trace - `company-01-creative-03`

### Why it looked suspicious

- `true_scale_candidate`
- strong baseline
- missing business validation
- `Not eligible for evaluation`

### Why it is probably not the same miss

- underlying lifecycle/action shape is more consistent with stable shipped-winner handling
- once the source gate is removed, this row is more likely to surface as `Protect` than `Scale Review`

### Diagnosis

This row supports the source fix, but not a broader `Scale Review` retune.

## Comparison Trace - `company-04-creative-03`

### Why it looked suspicious

- `strong_relative`
- live sampled row
- currently buried as contextual-only

### Why it is probably not a `Scale Review` miss

- underlying row shape is more consistent with fatigue / `refresh_replace`
- once unmasked, this row should surface as `Refresh`, not `Scale Review`

### Diagnosis

This is another example of the same source-layer suppression, but with a different correct downstream outcome.

## Comparison Trace - `company-05-creative-06`

### Why it looked suspicious

- `strong_relative`
- live evidence
- `Watch`

### Why the current blocker still matters

- `campaignContextLimited = true`
- business validation is still missing
- the row is not capped only by missing Commercial Truth

### Diagnosis

This is not a source-authority miss. It is a context-limited row and should not be promoted by the recovery patch.

## Safe Fix Shape

The safe fix is to change the source resolver, not the policy:

- treat the primary 30d creative window as the authoritative row-evidence source
- do **not** let support windows or campaign/ad set snapshot unreadability downgrade a live primary window to `unknown`
- keep non-live primary windows (`snapshot`, `fallback`, `demo`, `unknown`) contextual-only

This preserves:

- no queue/push/apply loosening
- no Commercial Truth loosening
- no benchmark-scope changes
- no taxonomy rewrite

## Conclusion

The trace supports a narrow recovery:

- fix the source-authority aggregation
- rerun live-firm audit
- expect a mixture of newly surfaced `Protect`, `Refresh`, `Campaign Check` / `Watch`, and a smaller number of genuine `Scale Review` rows

It does **not** support a broad review-level threshold retune.
