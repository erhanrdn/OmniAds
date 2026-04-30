# Reusable Prompts

## Next Chat Startup Prompt

Adsecute / OmniAds Creative Decision Center çalışmasına devam ediyoruz.

Önce repodaki şu dosyayı oku:
docs/creative-decision-center/START_HERE.md

Oradaki read order’a göre context pack’i tara.
Sonra bana:
1. mevcut nihai kararları,
2. yapılmaması gerekenleri,
3. açık riskleri,
4. sıradaki en güvenli PR’ı
özetle.

Kod yazmaya başlamadan önce DECISION_LOG.md, DATA_READINESS.md, GOLDEN_CASES.md ve INVARIANTS.md dosyalarına göre planını kontrol et.

## Repo Audit Prompt

Audit the Creative Decision Center migration surface. Prioritize data readiness, import/consumer map, four-vocabulary mapping, before/after shadow readiness, golden/invariant coverage, snapshot compatibility, minimal drawer feasibility, observability/rollback, and PR sequence. Do not implement production behavior.

## Before/After Shadow Test Prompt

Create a read-only shadow comparison for current V1/operator/V2 preview decisions versus proposed V2.1 engine + deterministic buyer adapter. Do not mutate data. If live DB/env is missing, report exact missing env and run fixture fallback marked as fallback.

## Addendum Prompt

Extend the spike only where it prevents wrong migration: data readiness, identity, target/benchmark, timezone/freshness, invariants, backtest readiness, confidence calibration, observability, security, Meta dependencies, schema/backfill, reproducibility, validation, UI bad states, PR sequence, and go/no-go. Mark unrun work as NOT RUN.

## Implementation Prompt Template

Implement only the PR scope described in PR_SEQUENCE.md. Before coding, read DECISION_LOG.md, DATA_READINESS.md, GOLDEN_CASES.md, INVARIANTS.md, and CONTRACTS.md. Do not rename routes, delete old engines, or let UI compute `buyerAction`.

## PR-Specific Prompt Template

You are implementing PR <number>: <title>. Scope: <scope>. Allowed files: <files>. Behavior change: <yes/no>. Required tests: <tests>. Acceptance: <acceptance>. Rollback: <rollback>. Do not touch unrelated runtime behavior.

## Review Prompt Template

Review this PR for Creative Decision Center safety. Lead with blockers. Check invariants, data readiness, snapshot compatibility, UI decision computation, row-level `brief_variation`, high-confidence missing-data actions, and route/legacy compatibility.

