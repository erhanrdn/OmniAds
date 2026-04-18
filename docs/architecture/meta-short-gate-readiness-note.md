# Meta Short-Gate Readiness Note

Meta short-gate closure uses a gate-led readiness policy.

- `creative_daily.readyThrough = null` is non-blocking for Meta short gate because `creative_daily` is deprecated after moving creative scoring to the live/snapshot path.
- `validationFailures24h > 0` and `retryableFailedPartitions > 0` remain non-blocking only while all of these stay true:
  - `deployGate = pass`
  - `releaseGate = pass`
  - `repairPlan = []`
  - `deadLetters = 0`
  - `staleLeases = 0`
  - Meta parity has `blockingDiffs = 0`
  - no Meta smoke route fails
- These residuals become blocking if they worsen between `T+0` and `T+30m`, produce a non-empty repair plan, drop release gate from `pass`, or re-open a Meta smoke failure.

This note is the operator policy for Meta closure. The next provider does not reopen this decision unless one of the escalation conditions is observed.
