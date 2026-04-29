# Codex Agent Notes - Faz G

## Approach

Codex used a deterministic-programmatic rater approach, executed as three isolated worker agents. I chose this over an external LLM/API flow because Faz G needs reproducible persona boundaries more than open-ended language generation. Each worker received the same masked input file and only its own persona thresholds/output path.

Input isolation:

- Shared input: `raw-input-for-agents.json`
- Source: `three-systems.json` with `system1`, `system2`, and `system3` removed
- Verification: raw input contains 75 rows and no `system1/system2/system3` fields
- Worker isolation: Agent A, B, and C were launched separately and instructed not to read `three-systems.json`, `merged-4-rater.json`, Claude ratings, or other Codex agent outputs

No new runtime code path was added. The only validation needed was artifact/schema validation, not app test execution.

## Distribution Check

| Agent | Persona | Scale | Test More | Protect | Refresh | Cut | Diagnose |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A | Aggressive Growth / Scaling-First | 13 | 44 | 7 | 8 | 3 | 0 |
| B | Conservative / Efficiency-First | 1 | 13 | 3 | 14 | 17 | 27 |
| C | Funnel / Creative-Quality-First | 4 | 27 | 0 | 5 | 4 | 35 |

Persona separation is visible:

- Agent A is growth-biased: highest scale count, no diagnose, few cuts.
- Agent B is efficiency-biased: highest cut count, high diagnose, only one scale.
- Agent C is funnel-biased: highest diagnose/test-more mix, protects nothing when creative/funnel quality is ambiguous.

## Deep Dives

### Agent A - Aggressive Growth / Scaling-First

1. `IwaStore|creative_bzfqye` / WallArtCatalog

Agent A rated this `scale`: spend was `$2349`, purchases `47`, ROAS `3.20`, and the fallback break-even proxy was `2.00`. This clears the aggressive winner gate (`2.20`) and scale spend gate (`baseline median spend 160.19 * 1.5`). A ignored softer trust degradation and C2P decay because the persona is designed to move mature winners quickly.

2. `TheSwaf|creative_1emvy5x` / EMB - CatalogAd

Agent A rated this `protect`: spend and purchase volume are large (`$10280`, `70` purchases), but ROAS `1.26` does not clear the winner gate against break-even `1.71`. It also does not fall below the hard cut gate (`break-even * 0.5 = 0.85`). Growth-first therefore avoids cutting a large-delivery asset and preserves it for review.

3. `IwaStore|creative_6ip33q` / Loved styling

Agent A rated this `test_more`: ROAS `24.86`, CTR `3.25`, attention `87.09`, and C2P `3.03` are excellent, but there is only `1` purchase and `$18.74` spend. The persona is aggressive, but still requires at least 4 purchases before calling a test winner.

### Agent B - Conservative / Efficiency-First

1. `IwaStore|creative_kgfoui` / A misbaha

Agent B rated this `scale`, its only scale call. It clears the strict winner gate: ROAS `4.04 >= 3.00`, purchases `20 >= 8`, CTR strength `2.04`, spend above `baseline median * 3`, and stable decay. This is the kind of narrow, high-proof case the conservative persona accepts.

2. `IwaStore|creative_gav4ek` / WoodenWallArtCatalog

Agent B rated this `refresh`: ROAS `5.45`, `60` purchases, and funnel quality are strong, but ROAS decay `0.61`, CTR decay `0.48`, and C2P decay `0.66` all breach early-fatigue thresholds. Efficiency-first avoids adding spend into a decaying winner.

3. `TheSwaf|creative_1emvy5x` / EMB - CatalogAd

Agent B rated this `cut`: spend is very high (`$10280`) and ROAS `1.26` is below the conservative cut line (`break-even 1.71 * 0.8 = 1.37`). Even with `70` purchases, this persona prioritizes efficiency protection and cuts below-threshold scale spend.

### Agent C - Funnel / Creative-Quality-First

1. `IwaStore|creative_gav4ek` / WoodenWallArtCatalog

Agent C rated this `refresh`: CTR `1.92`, attention `22.29`, C2P `0.4984`, and ROAS `5.45` all clear creative/funnel winner thresholds, but decay is active across ROAS, CTR, and C2P. The creative is good, but the active problem is fatigue.

2. `IwaStore|creative_kgfoui` / A misbaha

Agent C rated this `test_more`: CTR is very strong (`3.37` vs benchmark `1.66`) and ROAS is profitable, but attention is far below benchmark (`6.59` vs `81.09`) and C2P is below the 90% funnel threshold (`0.6764 < 0.7287`). Funnel-first treats this as a click-attracting creative with unresolved hook/offer quality, not an immediate scale.

3. `TheSwaf|creative_2bbb9e` / alphawolfnecklace

Agent C rated this `cut`: CTR `1.32` and attention `1.32` are both below 70% of their benchmarks, with zero purchases and ROAS `0.00`. This is exactly the persona's weak-creative cut case, even though spend is low.

## Self-Review

- [x] `codex-agent-a.json`, `codex-agent-b.json`, and `codex-agent-c.json` exist.
- [x] Each agent produced 75/75 rows.
- [x] Schema fields are present and enum values are valid.
- [x] Action enum uses `test_more`; no `keep_testing` appears in agent outputs.
- [x] Action distributions are materially different across the three personas.
- [x] `raw-input-for-agents.json` was produced and contains no `system1`, `system2`, or `system3` fields.
- [x] Notes include at least 3 examples per agent.
- [x] App tests were not run because this task only added audit artifacts, not runtime code.
