# ChatGPT Pro Review PR #84 Round 2

Date: 2026-04-29

Source: user-provided Round 2 review prompt in the Codex thread.

## Verdict

ChatGPT Pro reviewed Round 2 commit `ef0d366` and approved PR #84 for INTERNAL STAGING PREVIEW only under the `canonicalResolver=v1` flag.

The verdict explicitly stated:

- No production cohort.
- No customer-facing release.
- Six minor follow-ups must land before any production cohort.
- Production base stabilization must happen separately because production was reported to be running the post-Happy-Harbor regressed SHA `bc6d1b6`.

## Track 1: Round 3 Fixes

### FIX-1: Zero-purchase boundary test coverage

File: `lib/creative-canonical-decision.test.ts`

Add four boundary tests:

- Below spend floor should not cut: `spend=179`, `purchases=0`, `impressions=12000`, active delivery, live confident trust, commercial truth configured.
- Tiny spend / high impressions should not cut: `spend=40`, `purchases=0`, `impressions=50000`.
- Paused mature zero-purchase should not apply the active-leak cut path.
- Degraded commercial truth plus mature active zero-purchase leakage should cut with `needs_review`, not `diagnose:blocked`.

### FIX-2: Confidence label policy for zero-feedback high-deterministic case

File: `lib/creative-decision-confidence.ts`

When `feedbackCount < 20`, a capped confidence value of `0.72` must not be labeled `high`. Recommended resolution: keep the cap at `0.72` but return label `medium` under low-N feedback. Add a unit test proving the label does not overstate calibration certainty.

### FIX-3: 75-row confidence repeatability test

File: `lib/creative-canonical-decision.test.ts`

Add a regression test that runs the full 75-row fixture twice and asserts byte-identical `action`, `actionReadiness`, `confidence.value`, and `confidence.label` projections.

### FIX-4: Define exact metric formulas in the plan

File: `docs/team-comms/happy-harbor/IMPLEMENTATION-PLAN-V1.md`

Add metric formulas and windows for:

- `critical_high_conf_override_rate`
- `high_plus_critical_override_rate`
- `all_severe_override_rate`
- `overdiagnose_override_rate`
- `confidence_histogram_per_business`
- `canonical_vs_legacy_action_delta`
- `fallback_rerun_badge_rate`

Mark these as pre-production-cohort prerequisites.

### FIX-5: Define manual calibration approval process

File: `docs/team-comms/happy-harbor/IMPLEMENTATION-PLAN-V1.md`

Add a calibration activation approval section requiring engineering and product/media-buyer approval, optional customer/account owner approval for the first calibrated business, required artifacts, and approval records under `docs/team-comms/happy-harbor/calibration-approvals/`.

### FIX-6: Business-relative spend threshold in severe-override queue

File: `lib/creative-calibration-store.ts`

Replace the fixed `$1000` spend trigger with:

```ts
const businessRelativeSpendFloor = Math.max(
  1000,
  5 * (input.minSpendForDecision ?? 180)
);
```

Critical overrides should queue realtime when confidence is high, spend exceeds the business-relative floor, or user strength is strong.

## Track 2: Production Base Stabilization

The review stated that production was running SHA `bc6d1b6` in both `web` and `worker` images and that this was the post-Happy-Harbor state that prompted rollback. Required work:

1. Identify the auto-deploy trigger on main pushes.
2. Disable or guard docs-only/audit commits from re-deploying production.
3. Re-run the rollback to `96bd0386208868b18d9763d64917ab9d4aa22b53`.
4. Document final production SHA, guard configuration, and staging preview plan.

## Acceptance Status

Accepted:

- FIX-1 through FIX-6 are accepted and addressed in Round 3.
- The production auto-deploy investigation and docs-only guard are accepted as required stabilization work.

Rejected:

- None in this Round 2 review. The prior Round 1 formatting claim was already rejected because it was a GitHub raw rendering artifact, not a code-formatting bug.

Implementation note:

- The prompt's final "APPENDED: ChatGPT Pro Round 2 review (full text)" section contained a placeholder rather than an additional pasted review body. This file archives the substantive Round 2 review content provided in the prompt and records how it was handled.
