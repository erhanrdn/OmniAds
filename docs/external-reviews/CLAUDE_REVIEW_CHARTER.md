# Adsecute External Review Charter

Reviewer: Claude Code acting as independent external reviewer
Purpose: Establish consistent, doctrine-faithful review standards across all Adsecute phases.

---

## Product Doctrine

Adsecute is an expert Meta media buyer operator system. It is not a dashboard.

The system must tell the operator:
- what to do
- what not to touch
- what to watch
- what to investigate
- why
- what evidence supports the decision
- what evidence is missing
- whether an action is push-eligible, review-required, or blocked

### Ten Core Principles Every Phase Must Preserve

1. A freeform LLM must not be the final decision maker.
2. Final action decisions must be deterministic, evidence-based, testable, and conservative when data is missing.
3. UI-selected reporting date range must not authorize primary actions.
4. Operator decisions must use stable Operator Decision Context (anchored by `decisionAsOf` and source windows, not the analytics display range).
5. User examples are intent signals, not exhaustive rules. Logic must generalize.
6. The system must not overfit to a few hardcoded examples.
7. Missing data must block, downgrade, or contextualize aggressive actions.
8. Non-live/demo/snapshot/fallback evidence must not become primary command or push-eligible by default.
9. Provenance, evidenceHash, actionFingerprint, and source metadata matter. They must be stable and locale-neutral.
10. Push-to-account readiness must be very conservative.

---

## What Every Phase Review Must Check

### 1. Repository State
- Current branch and whether it is the correct feature branch
- Whether main was touched directly (never acceptable outside of merge PRs)
- Whether there is an open PR or whether the phase already merged
- What files changed vs what the phase claims changed

### 2. Phase Goal Alignment
- What the phase report claims was accomplished
- What the code actually accomplished
- What is missing
- Whether it accidentally started the next phase
- Whether it left critical logic incomplete

### 3. Deterministic Decision Safety
- No freeform LLM as final decision maker
- Policy logic is deterministic and branchable in tests
- Missing data downgrades or blocks; never permits aggressive action
- Demo/snapshot/fallback/unknown evidence cannot become primary command or push-eligible
- Push eligibility is conservative: `safe_to_queue` only with clean provenance + explicit evidence floors
- Provenance required for queue and push eligibility
- `canApply` is false by default until a provider execution contract exists
- `decisionAsOf` and source windows anchor action authority, not analytics display dates

### 4. Decision Window Integrity

This is one of the most important checks.

The reporting range (user's selected UI dates) must NOT authorize primary action decisions.

Verify:
- `evidenceHash` and `actionFingerprint` do not include user-selected analytics display dates
- Fingerprints remain stable when the user changes the date picker
- Fingerprints DO change when `decisionAsOf` changes (as expected)
- Historical analysis / selected-period data feeds into display only, not into primary operator decisions
- Deep links that include date params use them for navigation context only, not as action authority

### 5. Evidence Source Safety
- `live` → primary action eligible
- `demo` → contextual only, blocked from push
- `snapshot` → contextual only, blocked from push
- `fallback` → contextual only, blocked from push
- `unknown` → contextual only, blocked from push
- When combining evidence sources, use worst-case (most conservative) combination rule

### 6. Media Buyer Logic Quality

Review as a senior Meta media buyer.

For Creative policy specifically:
- ROAS alone must not authorize scale or kill
- Very low spend or very low conversion count must not become scale_ready or kill_candidate
- Missing commercial truth must block aggressive scale, kill, and refresh actions
- Protected winners must stay do_not_touch
- Strong creative inside weak campaign context must become investigate, not a clean scale command
- Kill evidence floor must require sufficient negative evidence before labeling something a kill candidate
- Undersampled creatives must stay in learning or promising states, not be promoted or killed

For Meta adset/campaign policy:
- Bid constraints and delivery issues must not be confused with performance issues
- Scaling decisions must require signal density in addition to ROAS
- Budget shift recommendations must respect donor campaign viability

### 7. Test Quality
- Scenario tests must exercise meaningful behavior, not just snapshot/copy
- Tests must cover: missing data, low evidence, non-live source, push safety, decision window stability
- Determinism: running the same test twice must produce the same result
- Phase 3 Meta tests must not be broken by Creative changes (regression protection)
- Tests should verify fingerprint stability across date range changes
- Tests should verify demo/snapshot/fallback evidence stays contextual

### 8. Push Eligibility Safety
- Missing provenance → blocked_from_push
- Non-live evidence → blocked_from_push
- contextual_only state → blocked_from_push
- do_not_touch state → blocked_from_push
- watch state → read_only_insight at most
- kill/refresh actions → operator_review_required at most
- Provider apply (`canApply: true`) must never appear until a provider execution contract exists for that entity type
- The Command Center must re-verify row-level operator policy before exposing any action as queue-eligible

### 9. UX / Information Surface Quality
- The UI must show what to do, what not to touch, watch, investigate, and blocked states
- Blockers must be visible and explanatory
- The selected reporting range label must not appear as decision authority
- Degraded commercial truth must show clearly in the UI
- Push readiness and evidence source must be visible per row
- Explanations must be useful to a non-expert operator

### 10. Command Center Safety
- Missing operator policy on Creative rows must block queue/push surfaces
- Creative opportunity board eligibility must be re-verified against row-level policy
- Contextual/fallback/demo/snapshot-backed Creative rows must not appear as queue-eligible
- Manual-only fallback remains safe
- Action identity must not rely on UI-selected reporting dates

---

## Merge-Readiness Criteria

A phase is safe to merge only when:

1. `npx tsc --noEmit` passes
2. `npm test` passes (all suites)
3. `npm run build` passes
4. `git diff --check` passes
5. All blocking correctness issues are resolved
6. Push eligibility for aggressive actions is correctly gated
7. Non-live evidence is verified to be blocked from primary action
8. Decision window integrity is verified (fingerprints stable across date range changes)
9. Regression tests protecting prior phases pass

---

## Runtime Validation Expectations

Runtime smoke cannot be performed by the reviewer unless a local environment is running. If smoke was performed by Codex:
- Mark as UNVERIFIED unless the reviewer can independently reproduce
- Check that the smoke tested relevant scenarios (not just page load)
- Check that connected-account production was NOT validated as part of routine phase smoke (it should be monitored post-merge separately)

---

## Push Eligibility Safety Expectations

These are non-negotiable:

- `canApply: false` for all Creative actions until a provider-backed creative mutation contract exists
- `eligible_for_push_when_enabled` must not appear for Creative rows in Phase 4 or Phase 5
- `safe_to_queue` is the maximum for Creative actions and must require:
  - live evidence source
  - present and valid provenance
  - no blockers
  - economics eligible
  - sufficient evidence floor met
- Any path that allows `safe_to_queue` on a non-live Creative must be considered a blocking issue

---

## Selected Reporting Range vs Operator Decision Context

This is the most important doctrine invariant.

The user may change the date picker at any time. This is their exploration/reporting range.

It must NEVER change:
- The primary operator decisions (what to do, what not to touch, etc.)
- The action fingerprints
- The evidence hash
- The push readiness
- The provenance window

The selected range may legitimately affect:
- The "historical analysis" / "selected-period patterns" section (analysis-only, labeled clearly)
- The display metrics shown alongside a creative or campaign (cosmetic context)
- The date params in deep links for navigation (cosmetic, not action-authoritative)

When reviewing code, always check:
- Does `evidenceHash` include the selected date range? → BLOCKER if yes
- Does `actionFingerprint` include the selected date range? → BLOCKER if yes
- Does the primary data fetch use the selected range as the primary window? → BLOCKER if yes
- Does a reporting-range change mutate the segment, state, or push readiness? → BLOCKER if yes

---

## How Future Reviews Should Proceed

When the user says "Güncel durumu incele" or "Review the current phase":

1. Read this charter.
2. Run `git log --oneline -10` and `git status` to identify current branch, phase, and recent commits.
3. Read the phase report at `docs/operator-policy/phaseN/completion/reports/final.md`.
4. Read the Phase N+1 handoff doc if available.
5. Read the changed files from the phase diff.
6. Run `npm test`, `npx tsc --noEmit`, `npm run build`, `git diff --check`.
7. Apply every check listed in this charter.
8. Write the review report to `docs/external-reviews/<phase-slug>/claude-review.md`.
9. Print a terminal summary with: verdict, blockers, test status, runtime status, safe to merge, safe to start next phase.

Do not trust Codex phase reports without code verification.
Do not flatter.
Do not invent facts.
Mark claims requiring runtime validation as UNVERIFIED if you cannot run them.
