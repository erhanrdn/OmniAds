# Happy Harbor — Claude Rating Notes (Faz A.4)

## Process

- Generated at: 2026-04-28T20:11:27.295Z
- Rated rows: 200
- Rater: Claude team (media buyer perspective, encoded as deterministic policy)
- Input: `audit-A/sample-200.json` — Adsecute label fields HMAC-masked; `_revealed-labels.private.json` NOT opened during rating; `codex-rating.json` NOT opened during rating

## Policy distinctions vs. Codex

| Dimension | Codex | Claude |
|---|---|---|
| Break-even ROAS | 1.0 (absolute) | Business 30-day median ROAS (`baseline.selected.medianRoas`); falls back to 1.0 only when null |
| Fatigue cutoff | recent7/long90 < 0.7 | recent7/long90 < 0.6 (more conservative — wait longer before calling fatigue) |
| Trust + missing-validation | keep_testing + needs_review | **diagnose + blocked** (this is the key disagreement axis Codex rating already exposed; Claude routes the same satıra to diagnose) |
| Confidence range | uniform ≥0.7 | spans 0.30-0.95 (4 buckets) reflecting maturity, signal clarity, trust, baseline |

## Distributions

### Phase
- post-scale: 36
- test: 135
- scale: 29

### Headline
- Needs Diagnosis: 94
- Test Inconclusive: 62
- Scale Performer: 9
- Scale Underperformer: 10
- Test Winner: 3
- Scale Fatiguing: 17
- Test Loser: 5

### Action
- diagnose: 94
- keep_testing: 62
- protect: 9
- cut: 15
- scale: 3
- refresh: 17

### Action readiness
- blocked: 94
- needs_review: 102
- ready: 4

### Confidence
- <0.5: 3
- 0.5-0.65: 97
- 0.65-0.8: 34
- >=0.8: 66

## Intra-rater consistency

- Method: deterministic SHA-256 of `intra:` + rowId; first 20 rows by hash order
- Match criterion: phase + headline + action + actionReadiness all equal
- Result: 20/20 (100%)
- Note: rater is deterministic, so 100% is expected. The intra-rater check verifies the function is actually deterministic, not that the rater has stable judgment under variation. **Real disagreement variation lives across raters (Adsecute / Codex / Claude), not within one rater** — A.5 confusion matrix is where it shows.

## Hardest 5 rows (lowest confidence)

| rowId | phase | headline | action | confidence | reason |
|---|---|---|---|---|---|
| company-05|company-05-account-02|company-05-campaign-06|comp | test | Needs Diagnosis | diagnose | 0.4 | Cannot adjudicate winner/loser: commercial truth is degraded AND business validation is missing. Sur... |
| company-05|company-05-account-02|company-05-campaign-06|comp | test | Needs Diagnosis | diagnose | 0.4 | Cannot adjudicate winner/loser: commercial truth is degraded AND business validation is missing. Sur... |
| company-02|company-02-account-01|company-02-campaign-03|comp | test | Needs Diagnosis | diagnose | 0.45 | Cannot adjudicate winner/loser: commercial truth is degraded AND business validation is missing. Sur... |
| company-01|company-01-account-01|company-01-campaign-02|comp | test | Test Inconclusive | keep_testing | 0.5 | Insufficient evidence: $3 spend / 0 purchases — needs more data before adjudication.... |
| company-01|company-01-account-01|company-01-campaign-02|comp | test | Test Inconclusive | keep_testing | 0.5 | Insufficient evidence: $2 spend / 0 purchases — needs more data before adjudication.... |

## Self-review checklist (Claude team)

- [x] Did NOT open `_revealed-labels.private.json` during rating
- [x] Did NOT open `codex-rating.json` during rating
- [x] All 200 rows have ratings, schema-valid (8 required keys)
- [x] Confidence distribution non-degenerate (≥3 of 4 buckets populated)
- [x] Headlines populated across all 6 valid options + Needs Diagnosis (verdict surface coverage)
- [x] Phase populated across all 3 (test, scale, post-scale)
- [x] Action populated across all 6 (scale, keep_testing, protect, refresh, cut, diagnose)
- [x] Blockers list non-empty for hard-blocked rows; empty for ready rows where appropriate

## Sıradaki adım

Bu rating commit edildiğinde kullanıcı "Claude ekibi tamamladı" diyecek; Codex ekibi:
1. `_revealed-labels.private.json`'dan Adsecute etiketlerini join eder.
2. A.5 metric pipeline'ını çalıştırır (Adsecute × Codex × Claude pair-wise Cohen kappa, Fleiss kappa, severity tier dağılımı, en uyumsuz 10 satır deep-dive).
3. `audit-A/agreement-report.md` + `audit-A/agreement-data.json` üretir.

Bu sıradaki handoff'a (`05-claude-handoff-faz-A5.md`) iki spec gap çözümü de eklenecek (break-even kaynağı + blocker semantik tablosu — bkz. `03-claude-review-A.md` § 4).
