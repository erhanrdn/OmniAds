# Creative Segmentation Calibration Lab - Final Report

Last updated: 2026-04-23 by Codex

## Result

Live Meta cohort recovery succeeded and the Data Accuracy Gate now passes.

## What Was Verified

- Live Meta connectivity is real in the production-equivalent runtime.
- The earlier local `0 eligible` result was caused by environment mismatch, not by absent live Meta businesses.
- `DATABASE_URL` alone is not sufficient parity for this helper when Meta credentials are encrypted.
- The helper now distinguishes missing token-key env from present-but-unreadable encrypted credentials, and it no longer reports those runtime mismatches as `0 live businesses`.
- One candidate was still not sampleable because its assigned Meta account returned an OAuth checkpoint/token error.
- After skipping that candidate, the recovered cohort produced 3 sampled businesses and 32 sanitized rows with 0 table/Decision OS mismatches.
- Runtime skip totals are now derived from the classified runtime skip reasons, so the gate artifact stays internally consistent.

## Corrected Counts

- Historical snapshot candidates: 8
- DB-eligible candidates: 8
- Runtime-eligible candidates: 7
- Runtime-skipped candidates: 1
- Runtime skip reason: `meta_token_checkpointed`
- Sampled candidates: 3
- Sampled rows: 32
- Zero-row eligible candidates: 0
- Gate passed: true

## Remaining Follow-Up

Not a calibration blocker:

- reconnect or refresh the Meta credential for `candidate-01`
- `meta_creative_daily` remains empty, so independent warehouse-level creative verification is still unavailable

## Panel Status

The 10-agent media-buyer panel may start next.

It was not run in this pass.
