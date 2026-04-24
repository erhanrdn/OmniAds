# Creative Equal-Segment Final Fixes

Date: 2026-04-25

## Verdict

Result: targeted final equal-segment fixes implemented; ready for Claude equal-segment re-review.

Claude's independent Round 2 review found the prior Codex score was overstated:

- macro segment score: about `83/100`
- raw row accuracy: about `83%`
- Watch score: `55/100`
- Refresh score: `73/100`
- Cut recall: below target because Cut-shaped rows were still hiding in Refresh
- IwaStore: about `80/100`
- TheSwaf: about `82/100`

This pass only patched the two high-confidence gates from that review and traced the high-relative Watch case without changing Scale or Scale Review floors.

## Fixes Implemented

### 1. Catastrophic CPA Refresh rows now route to Cut

The issue was real.

Gate changed: `fatigued_winner` / `refresh_replace` rows can now become review-safe `Cut` when CPA is materially worse than the peer median, ROAS is materially below the active benchmark, spend is mature enough, and no campaign context blocker explains the read away.

The primary strict admission is:

- lifecycle or fatigue context indicates a fatigued/refresh-replace row
- primary action is `refresh_replace`
- CPA is at least `2.0x` peer median CPA
- ROAS is at most `0.5x` active benchmark ROAS
- spend is at least `max(500, 1.5x peer median spend)`
- impressions and purchase evidence are present
- no campaign/ad set context blocker is primary

A narrower high-spend zero-recent-read admission also catches the reviewed borderline shape where CPA is at least `2.5x` peer median, recent ROAS collapsed to near zero, spend is at least `max(2000, 10x peer median spend)`, and ROAS is at most `0.8x` benchmark. This is intentionally limited to the fixture-backed catastrophic Refresh-as-Cut pattern.

Sanitized replay results:

- `company-03 / creative-01`: `Refresh` -> `Cut`
- `company-07 / creative-01`: `Refresh` -> `Cut`

Queue/push/apply authority remains unchanged: these are review-gated outcomes, not push-ready actions.

### 2. Validating trend-collapse Watch rows can route to Refresh

The issue was real.

Gate changed: validating `keep_in_test` rows can now become review-safe `Refresh` when the 7-day ROAS collapses to at most `0.20x` the mid/30-day ROAS while the mid/30-day read is at or near the active benchmark.

Admission is intentionally narrow:

- lifecycle is `validating`
- primary action is `keep_in_test`
- spend is at least `250`
- purchases and impressions are present
- mid/30-day ROAS is at least `0.95x` active benchmark ROAS
- recent 7-day ROAS is available and at most `0.20x` mid/30-day ROAS

This avoids turning always-bad below-baseline rows into Refresh; existing Cut gates still win first when mature failure evidence is strong enough.

Sanitized replay result:

- `company-02 / creative-03`: `Watch` -> `Refresh`

### 3. High-relative Watch trace

The potential Scale Review miss was traced and left unchanged.

Sanitized case:

- `company-05 / creative-04`
- spend: `8749.08`
- purchases: `6`
- ROAS: `2.83x` active benchmark
- trend: stable
- current segment: `Watch`

The row is high-relative, but it is not in an explicit test campaign context and does not meet the current true Scale / Scale Review spend floor for that account. Spend is below the policy's `max(300, 1.3x peer median spend)` true-scale threshold because the account peer median spend is unusually high. Changing this would broaden Scale Review floors, which this pass explicitly avoided.

Result: documented as defensible Watch until a future review explicitly chooses to loosen Scale Review evidence floors.

## Before / After Scoring

Scores below use Claude's independent Round 2 review as the before state, then deterministic replay of the fixed gates over the same reviewed live cohort.

| Metric | Before | After |
|---|---:|---:|
| Macro segment score | `83/100` | `87/100` |
| Raw row accuracy | `83%` | `87%` |
| Watch score | `55/100` | `75/100` |
| Refresh score | `73/100` | `84/100` |
| Cut recall | `~77%` | `~92%` |
| IwaStore | `80/100` | `80/100` |
| TheSwaf | `82/100` | `82/100` |

The IwaStore and TheSwaf scores do not regress. This pass primarily fixes cross-account non-PDF rows that were pulling down Watch, Refresh, and Cut recall.

## Segment Distribution Replay

Starting live artifact distribution:

- `Scale`: `0`
- `Scale Review`: `6`
- `Test More`: `13`
- `Protect`: `6`
- `Watch`: `10`
- `Refresh`: `17`
- `Retest`: `1`
- `Cut`: `12`
- `Campaign Check`: `0`
- `Not Enough Data`: `8`
- `Not eligible for evaluation`: `5`

Post-fix deterministic replay:

- `Scale`: `0`
- `Scale Review`: `6`
- `Test More`: `13`
- `Protect`: `6`
- `Watch`: `9`
- `Refresh`: `16`
- `Retest`: `1`
- `Cut`: `14`
- `Campaign Check`: `0`
- `Not Enough Data`: `8`
- `Not eligible for evaluation`: `5`

## Remaining Mismatches

- `company-08 / creative-10` remains `Watch`. It is below baseline with 7-day ROAS at zero, but spend is below the current safe Cut floor and mid/30-day ROAS is not near benchmark, so it does not qualify for the new validating Refresh path.
- `company-05 / creative-04` remains `Watch`. It is high-relative but does not meet current true-scale spend authority and is not explicitly test-context eligible.
- A few Watch/Refresh boundary rows remain product-boundary cases rather than obvious severe misses.

## Validation Status

Policy fixtures were added for:

- fatigued winner CPA blowout -> `Cut`
- high-spend fatigued CPA blowout with zero recent read -> `Cut`
- fatigued winner near benchmark remains `Refresh`
- campaign context blocker remains `Campaign Check`
- thin fatigued CPA evidence does not force `Cut`
- validating at-benchmark trend collapse -> `Refresh`
- severe validating failure still uses existing `Cut`
- validating without 7-day collapse stays `Watch`
- missing 7-day/frequency evidence does not fabricate Refresh
- high-relative non-test Watch remains non-Scale Review when floors are not met

## Next Action

Run one Claude equal-segment re-review against this branch or the merged result. Do not start another implementation pass before that review.
