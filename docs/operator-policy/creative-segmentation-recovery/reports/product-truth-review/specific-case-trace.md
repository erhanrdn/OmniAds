# Product-Truth Review - Specific Case Trace

Last updated: 2026-04-24 by Codex

## Privacy

The user-provided business and creative names were used only for local private matching. The committed report uses sanitized aliases only.

Sanitized aliases:

- business: `company-03`
- creative: `company-03-creative-07`

## Current Trace

| Field | Value |
| --- | --- |
| Active status | false |
| Active source | campaign and ad set |
| Campaign status | PAUSED |
| Ad set status | CAMPAIGN_PAUSED |
| Benchmark scope | account |
| Benchmark label | Account-wide |
| Baseline reliability | strong |
| Business validation | missing |
| Commercial truth | target pack not configured |
| Evidence source | live |
| Trust state | live_confident |
| Current internal segment | fatigued_winner |
| Current user-facing segment | Refresh |
| Current instruction headline | Refresh: `company-03-creative-07` |
| Primary action | refresh_replace |
| Push readiness | blocked_from_push |
| Queue eligible | false |
| Can apply | false |
| Old challenger segment | Watch |
| Relative strength class | none |
| Campaign context limited | false |

## Metrics

| Window | Spend | Purchase value | ROAS | CPA | Purchases | Impressions | Link clicks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Recent 7d | 95.36 | 599.05 | 6.28 | 23.84 | 4 | 17171 | 385 |
| Primary 30d | 225.34 | 968.42 | 4.30 | 22.53 | 10 | 43334 | 956 |
| Long 90d | 454.21 | 2116.16 | 4.66 | 21.63 | 21 | 117311 | 2447 |

Account baseline summary:

| Baseline field | Value |
| --- | ---: |
| Sample size | 11 |
| Eligible creative count | 11 |
| Spend basis | 1757.39 |
| Purchase basis | 47 |
| Weighted ROAS | 4.21 |
| Weighted CPA | 37.39 |
| Median ROAS | 7.42 |
| Median CPA | 20.79 |
| Median spend | 106.34 |

## Diagnosis

The prior `Pause` output was not current product truth.

Current runtime resolves the row as `Refresh`, not `Pause`. The previous wording was either stale UI/detail language or a legacy action-label collision.

Is the current decision media-buyer sensible?

- It is not a clean `Scale Review` candidate under account-wide benchmark because its 30-day ROAS is below the account median ROAS.
- It is not active in current campaign/ad set context.
- It has meaningful purchase evidence and a strong recent 7-day read, so it should not be dismissed as weak.
- `Refresh` is defensible if the product interpretation is "fatigued/replacement case."
- A campaign-level benchmark might tell a different story, but this trace did not prove an explicit campaign benchmark path for this row.

Likely wrong gate:

- No clear downstream gate bug was found for this specific row.
- The open product question is whether inactive but recently strong rows should surface a clearer `Retest` or `Refresh` instruction rather than looking like a soft pause.

Product-truth result:

- The user concern was valid because `Pause` wording would be misleading.
- The current data does not support forcing this row into `Scale Review` from the account-wide path.
- This row should become a fixture candidate for `Refresh` vs `Retest` wording, not a broad scale-threshold fixture.
