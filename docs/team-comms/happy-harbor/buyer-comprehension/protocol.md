# Happy Harbor Buyer Comprehension Protocol

## Purpose

Validate whether a media buyer can read the canonical VerdictBand and answer the core question in under 3 seconds:

> What action does this creative need?

This protocol prepares the Faz E buyer sessions. Faz D only commits the protocol, example set, and result template.

## Session Design

- Participants: 5 media buyers.
- Items per participant: 10 creatives.
- Total micro-tests: 50.
- Stimulus: a screenshot or live crop containing only the VerdictBand for one creative.
- Question: "What action does this creative need?"
- Answer choices:
  - Scale
  - Keep Testing
  - Protect
  - Refresh
  - Cut
  - Investigate
- Timing: start the stopwatch when the VerdictBand becomes visible; stop when the buyer selects an answer.
- Success target: at least 95% of rows answered correctly in less than 3.0 seconds.

## Example Set Rules

The committed `example-set.json` is selected from `docs/team-comms/happy-harbor/audit-A/sample-200.json` and resolved with `lib/creative-verdict.ts:resolveCreativeVerdict`.

Coverage requirements:

- 10 creatives.
- Every action class appears at least once: scale, keep_testing, protect, refresh, cut, diagnose.
- At least 4 distinct businesses.
- Every phase appears at least once: test, scale, post-scale.
- Every readiness state appears at least once: ready, needs_review, blocked.

## Test Procedure

1. Randomize the 10 creative order per buyer.
2. Show one VerdictBand at a time. Do not show surrounding performance tables or explanatory copy.
3. Ask the buyer to choose one of the 6 action choices.
4. Record `action_correct`, `time_seconds`, and short notes if the buyer hesitates or verbalizes confusion.
5. Move to the next item immediately after answer capture.

## Scoring

For each row:

- `action_correct = true` when the selected answer matches `expectedAnswer` in `example-set.json`.
- `under_3s = true` when `time_seconds < 3.0`.
- `pass = action_correct && under_3s`.

Session pass:

- Total pass rate across 50 rows is at least 95%.
- Any repeated confusion between two actions should be logged as a pattern for Faz E/F copy or UI tuning.
