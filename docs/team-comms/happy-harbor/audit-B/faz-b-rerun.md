# Happy Harbor - Faz B Resolver Replay

Generated at: 2026-04-28T21:33:15.803Z
Rows: 200
Literal acceptance met: no
targetPackConfigured: 95/200 (assertion passed)
break_even_proxy_used evidence: 105/200 rows

## Fleiss Kappa

| Axis | Fleiss kappa | Observed agreement | Expected agreement |
| --- | --- | --- | --- |
| action | 0.1221 | 39.5% | 31.08% |
| headline | 0.1298 | 39.67% | 30.67% |
| actionReadiness | 0.1237 | 56.67% | 50.55% |

## Pairwise Agreement

| Pair | Axis | Matches | Rows | Agreement |
| --- | --- | --- | --- | --- |
| adsecute_vs_codex | action | 31 | 200 | 15.5% |
| adsecute_vs_codex | headline | 31 | 200 | 15.5% |
| adsecute_vs_codex | actionReadiness | 70 | 200 | 35% |
| adsecute_vs_claude | action | 168 | 200 | 84% |
| adsecute_vs_claude | headline | 169 | 200 | 84.5% |
| adsecute_vs_claude | actionReadiness | 199 | 200 | 99.5% |
| codex_vs_claude | action | 38 | 200 | 19% |
| codex_vs_claude | headline | 38 | 200 | 19% |
| codex_vs_claude | actionReadiness | 71 | 200 | 35.5% |

## Codex-Claude Ceiling

With Codex and Claude fixed from A.5, a third rater can only create full agreement on rows where Codex and Claude already agree; on disagreement rows the best possible per-row observed agreement is one matching pair out of three.

| Axis | Codex-Claude matches | Rows | Agreement | Max possible observed Fleiss |
| --- | --- | --- | --- | --- |
| action | 38 | 200 | 19% | 46% |
| headline | 38 | 200 | 19% | 46% |
| actionReadiness | 71 | 200 | 35.5% | 57% |

## Distributions

### New Adsecute Resolver

```json
{
  "phase": {
    "post-scale": 51,
    "test": 111,
    "scale": 38
  },
  "headline": {
    "Needs Diagnosis": 94,
    "Test Inconclusive": 51,
    "Scale Performer": 7,
    "Test Winner": 7,
    "Test Loser": 12,
    "Scale Underperformer": 15,
    "Scale Fatiguing": 14
  },
  "action": {
    "diagnose": 94,
    "keep_testing": 51,
    "protect": 7,
    "scale": 7,
    "cut": 26,
    "refresh": 15
  },
  "actionReadiness": {
    "blocked": 94,
    "needs_review": 101,
    "ready": 5
  }
}
```

## Severity Counts

| Pair | Severe | High | Medium | Low | None |
| --- | --- | --- | --- | --- | --- |
| adsecute_vs_codex | 1 | 7 | 36 | 125 | 31 |
| adsecute_vs_claude | 1 | 10 | 20 | 1 | 168 |
| codex_vs_claude | 0 | 7 | 29 | 126 | 38 |
