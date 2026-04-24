# Mature Loser Cut / Refresh Final

Last updated: 2026-04-24 by Codex

## Verdict

The mature below-baseline-with-purchases gap was real and has been fixed narrowly.

The failing gate was not Scale / Scale Review. It was the Cut admission path: mature `keep_in_test` / `validating` rows with meaningful spend, non-zero purchases, and ROAS materially below the active benchmark had no negative-admission branch. They fell through to `hold_monitor`, which surfaced as `Watch`.

## Scope

Changed only:

- mature below-baseline loser detection in `lib/creative-operator-policy.ts`
- Cut-review explanation and next-observation copy in `lib/creative-operator-surface.ts`
- deterministic policy and surface fixtures
- regenerated sanitized live audit artifact for post-fix counts

No changes were made to:

- Scale or Scale Review floors
- taxonomy
- UI structure
- queue/apply/push safety
- Commercial Truth logic
- benchmark semantics
- old-rule challenger authority

## Gate Fixed

New Cut-review admission requires:

- `primaryAction = keep_in_test`
- `lifecycleState = validating`
- reliable account/campaign relative baseline
- spend at least `max(1000, 3x peer median spend)`
- purchases at least `4`
- ROAS at or below `0.8x` active benchmark median ROAS
- impressions at least `8000`
- creative age greater than `10` days
- no primary campaign/ad set context blocker

If campaign/ad set context is blocked, the row remains `Campaign Check` instead of Cut. If evidence is still thin, the row does not enter Cut. Queue/apply remains blocked or review-required.

## Runtime Audit

Runtime path: corrected current Creative Decision OS source path, production-equivalent DB tunnel.

Readable live businesses: `8`

Sampled creatives: `78`

### Before

Prior post-actionability live counts:

- `Scale`: `0`
- `Scale Review`: `3`
- `Test More`: `8`
- `Protect`: `9`
- `Watch`: `17`
- `Refresh`: `15`
- `Retest`: `0`
- `Cut`: `5`
- `Campaign Check`: `0`
- `Not Enough Data`: `15`
- `Not eligible for evaluation`: `6`

### After

Post-fix live counts:

- `Scale`: `0`
- `Scale Review`: `5`
- `Test More`: `8`
- `Protect`: `11`
- `Watch`: `12`
- `Refresh`: `14`
- `Retest`: `0`
- `Cut`: `9`
- `Campaign Check`: `0`
- `Not Enough Data`: `13`
- `Not eligible for evaluation`: `6`

The global rerun includes normal live-data drift, but the targeted regression anchors are stable:

- `pdf-company-01` remains media-buyer-sensible: `Scale Review = 3`, `Protect = 1`, `Watch = 6`
- `pdf-company-02` now surfaces the mature below-baseline purchase losers as Cut review candidates

## Sanitized `pdf-company-02` Trace

Post-fix `pdf-company-02` sanitized sample:

- `Cut`: `3`
- `Scale Review`: `2`
- `Protect`: `3`
- `Watch`: `1`
- `Not Enough Data`: `1`

The headline mature-loser pattern now resolves correctly:

| Alias | Spend | ROAS | Purchases | Benchmark Median ROAS | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| `company-08-creative-01` | `6930.16` | `1.28` | `48` | `1.82` | `Cut` |
| `company-08-creative-02` | `3427.44` | `1.39` | `26` | `1.82` | `Cut` |
| `company-08-creative-03` | `1155.34` | `1.29` | `7` | `1.82` | `Cut` |

The remaining `Watch` row in the sanitized sample had lower spend and only two purchases. It did not meet the mature negative-evidence floor and should not be forced into Cut by this pass.

## Safety Result

- `Cut` is operator-review work, not automatic push/apply.
- Missing Commercial Truth does not prevent the negative relative read.
- Missing Commercial Truth still blocks absolute-profit claims and direct scale authority.
- Campaign/ad set blockers still produce `Campaign Check`.
- Strong protected winners remain `Protect` or review-only `Scale Review`.
- The old rule challenger remains comparison-only.

## Readiness

The exact targeted mature-loser gap from the live-data review is fixed. After merge and green checks, Creative output is ready for one final Claude product review focused on live product truth.
