# Recommended Rebuild Plan

Last updated: 2026-04-25 by Codex

## Direction

Recommended direction: **baseline-first rebuild**.

The current architecture has valuable safety, provenance, benchmark, and instruction layers. The weak part is the first-pass media-buyer action classification. Continue preserving safety gates, but rebuild the winner/loser classifier around baseline-relative truth before applying lifecycle smoothing.

## First Implementation Task

Create a parallel `creative-media-buyer-action-classifier` behind reports/tests only. Inputs should be raw metrics, account/campaign baseline, active/test context, trend, CPA, evidence maturity, and Commercial Truth availability. It should emit candidate action classes: `scale_review_candidate`, `test_more_candidate`, `protect_candidate`, `refresh_candidate`, `cut_candidate`, `diagnose_candidate`, with reason tags.

Do not connect it to UI or queue/apply until it beats the current Decision OS on this review artifact.

## Required Fixture Groups

- active test strong relative winners
- active test below-baseline mature losers
- high-spend Refresh-vs-Cut boundary rows
- thin but promising Test More rows
- Not Enough Data rows with truly low evidence
- paused/comeback winners
- campaign-context blockers

## Stop Criteria

A targeted patch is enough only if the parallel classifier shows that fewer than three gate families explain nearly all critical/high mismatches. If critical/high mismatches remain spread across Watch, Refresh, Not Enough Data, and Scale Review boundaries, move to a baseline-first rebuild.
