# V2-06 Rollout Runbook

## Preflight

1. Run `npx tsc --noEmit --pretty false`.
2. Run targeted Vitest for Command Center throughput, feedback, batch routes, and execution regressions.
3. Run `npm run test`.
4. Run `npm run build`.
5. Run local reviewer and commercial Playwright smoke.

## Exact-SHA Deploy

1. Confirm `HEAD` is the intended release SHA.
2. Merge to `main`.
3. Deploy the same exact SHA through the existing CI or Hetzner workflow.
4. Verify `https://adsecute.com/api/build-info` and `https://www.adsecute.com/api/build-info` match the release SHA.
5. Verify `GET /api/release-authority` reports aligned live, flagged, and docs posture.

## Live Workflow Smoke

1. Open `/command-center` as the seeded reviewer.
2. Confirm the read-only banner, workload cards, queue budget summary, and disabled batch or feedback controls.
3. Open `/command-center` as the commercial operator.
4. Confirm queue budget, overflow, shift digest, and feedback summary render.
5. Execute one status-only batch workflow.
6. Capture one action feedback entry and one queue-gap false-negative entry.
7. Use the digest prefill path for a shift handoff.
8. Follow a Meta deep link and confirm the expected campaign opens.

## Execution Guardrail Verification

1. Open an execution-preview-capable action.
2. Confirm support mode, preview diff, and audit slice still render.
3. Confirm apply or rollback posture matches the existing flag configuration.
4. Do not expand execution scope during V2-06 rollout.

## Rollback

1. Identify the previous known-good SHA before deploy.
2. Redeploy that exact SHA through the same workflow if rollback is needed.
3. Leave `command_center_feedback` and `command_center_mutation_receipts` in place.
4. Re-run build-info, release-authority, reviewer smoke, and commercial smoke after rollback.
