# Creative Segmentation Recovery — Strategy Review

Reviewer: Claude Code (product-strategy and media buyer logic reviewer)
Date: 2026-04-22
Charter: `docs/external-reviews/PRODUCT_REVIEW_CHARTER.md`
Scope: Pre-implementation strategy review for Creative Segmentation Recovery effort

---

## Executive Verdict: GOOD APPROACH WITH RISKS

The multi-agent calibration direction is correct. The real danger is not the agent design — it is the conversion step: turning agent outputs into deterministic policy rather than letting consensus drift into de facto rules. The approach is worth executing, but it requires a strict firewall between "agent findings" and "policy candidates."

---

## 1. What Is Right About the Proposed Approach

**Using agents to surface calibration failures, not to run the policy.** The failure mode is not that the system is architecturally broken — it is that the thresholds and segment logic were set without sufficient empirical grounding across real accounts. Agents reviewing live sanitized data and comparing three signals (old rule engine / current Decision OS / observed performance) is exactly the right diagnostic pattern.

**Keeping the old rule engine as challenger, not ground truth.** This is the most important constraint in the brief. The old engine has real limitations (ROAS-only, not evidence-aware, no lifecycle awareness). But it captures something the current engine misses: practical media buyer intuition about what a creative actually looks like when it is scaling. A system that the owner refuses to use in practice has failed its primary job.

**Separating the review from the UI.** The brief is explicit: ten agents reviewing behind the scenes, one simple output. This is the right product structure. A segmentation calibration lab is a development tool, not a UI feature.

**Requiring deterministic policy output.** The stopping condition is not "agents agree." The stopping condition is: the findings have been translated into specific threshold changes, tested against fixtures, and produce correct labels for the known failure cases. This framing is correct.

**Account-relative performance as a gap to fix.** The current `hasScaleEvidence` uses absolute floors ($250 spend, 5 purchases). For a small account where $50/day is a large creative test, these floors guarantee zero `scale_ready` outputs. Making performance relative to account context is the single highest-leverage fix available.

---

## 2. What Is Wrong or Risky About the Proposed Approach

**Risk 1: Agent consensus becomes the policy.** If 7 of 10 agents say a creative is `scale_ready`, that cannot become the deterministic rule. Every agent judgment must produce a specific, falsifiable threshold proposal ("account-relative spend floor: 30% of account average spend per creative"), not just a verdict. If you do not enforce this, the calibration lab produces opinions instead of policy.

**Risk 2: Overfitting to the reviewed accounts.** Calibrating against a handful of companies may produce thresholds that work for those accounts and fail everywhere else. The evidence floor (currently $250 spend, 5 purchases) exists because low-evidence creatives genuinely should not be promoted. If you relax it based on a small account, you risk the system calling a creative `scale_ready` at $40 spend.

**Risk 3: The old rule engine's gravity.** ROAS and spend alone are sticky. If the Legacy Rule Engine Auditor Agent is not explicitly tasked to identify where the old engine would give a wrong answer, the calibration will drift toward reproducing the old engine with extra steps. The old engine's known failure modes (ROAS > threshold with one purchase from a discount order; new creative at day 3 with low spend but high ROAS) must be in the fixture set as cases where the old engine is wrong.

**Risk 4: Lifecycle and campaign context are underweighted in the current policy.** `isUnderSampled` uses age ≤ 10 days as a proxy for learning, but a 3-day creative with $400 spend is not under-sampled. Spend velocity is the right signal, not age. Agents will identify this. The risk is that fixing it by lowering the age threshold is the wrong fix — the right fix is spend velocity gating.

**Risk 5: The double-gating problem will not be solved by calibration alone.** `scale_ready` requires upstream `primaryAction === "promote_to_scaling"` from Decision OS AND the own evidence floors. If Decision OS is systematically conservative, no threshold change in `creative-operator-policy.ts` will produce `scale_ready` outputs. The agents need explicit mandate to check whether Decision OS is the upstream blocker, not just whether the downstream policy floors are wrong.

**Risk 6: Dead code obscures intent during review.** Line 211 in `creative-operator-policy.ts` — the inner `hasRoasOnlyPositiveSignal` inside the `isUnderSampled` block — is permanently unreachable. Agents reading the policy will waste reasoning cycles on a code path that does nothing. Remove it before the calibration review begins.

---

## 3. Recommended Agent Design

The 10 proposed agents are reasonable but some roles overlap and one critical perspective is missing. Recommended structure:

### Agent 1: Account Baseline Agent
**Not in the original list — highest priority addition.**
Before any creative-level judgment, this agent establishes account-relative context: median creative spend, median purchases per creative, distribution of ROAS across all actives, typical creative run duration before the owner pauses manually. Every other agent's judgment is anchored against these baselines.
Output: account baseline record (not a creative segment).

### Agent 2: Performance Media Buyer Agent
Reviews whether the current segment matches what an experienced buyer would do given the metrics. Not ROAS-only — spend efficiency, velocity, and purchase volume relative to account baseline. Explicit flag if the segment would cause inaction on a creative the buyer would actually scale.

### Agent 3: Scaling Specialist Agent
Focuses only on `scale_ready` and `promising_under_sampled` cases. For each creative, proposes whether the current evidence floor is too strict given account context. Produces the specific threshold proposal: what spend floor, what purchase floor, what evidence pattern would have called this correctly.

### Agent 4: Kill/Pause Risk Agent
Focuses only on `pause_candidate` and cases where the system recommends action but the creative may need more time. Identifies false kill signals: fatigued metrics that are actually seasonal, low ROAS that is above account average, spend that looks low but is velocity-appropriate.

### Agent 5: Measurement & Attribution Skeptic Agent
Reviews whether the purchase counts and ROAS figures are trustworthy. Flags attribution window artifacts (7-day click vs. 1-day click discrepancies), conversion event quality issues, and cases where the evidence count is technically above floor but the quality is suspect (e.g., 5 purchases all from a single order value outlier).

### Agent 6: Commercial Truth / Profitability Agent
Reviews `economics.status === "eligible"` gating. This is the third gate in `hasScaleEvidence` and may be the silent blocker. If commercial truth configuration is missing or restrictive, no creative can be `scale_ready` regardless of performance. This agent checks how many accounts have commercial truth configured, what it excludes, and whether the exclusion is warranted.

### Agent 7: Fatigue & Lifecycle Agent
Reviews `creativeAgeDays` and impression trajectory. Identifies the spend-velocity-vs-age gap: creatives that are new by age but not by spend, creatives that are old by age but recently redeployed. Proposes replacing the age floor in `isUnderSampled` with spend velocity (spend per active day).

### Agent 8: Campaign Context Agent
Reviews `hasWeakCampaignContext` behavior. Identifies cases where a creative is segmented as `investigate` because of campaign context conflict, but where the conflict is structural (campaign always has weak context) rather than a genuine uncertainty. Proposes whether the weak-context gate should be advisory or blocking.

### Agent 9: Legacy Rule Engine Auditor Agent
For each creative, records what the old rule engine would have output. Then explicitly evaluates three cases:
- Old engine right, new engine wrong → threshold calibration candidate
- Old engine wrong, new engine right → fixture confirming current policy is correct
- Both wrong → root cause to escalate (may require upstream Decision OS fix)

This agent must be as focused on cases where the old engine is wrong as where the new engine is wrong.

### Agent 10: UX Simplification Agent
Reviews whether the instruction text, segment label, and recommended action are clear enough that a media buyer would act on them without second-guessing. Does not evaluate correctness — evaluates legibility. The test: would a buyer who does not know the policy internals read this and know what to do?

---

## 4. Recommended Output Schema

Each agent, for each creative reviewed, produces a structured record:

```typescript
type AgentCreativeJudgment = {
  // Identity
  agentRole: string;
  accountId: string;
  creativeId: string;
  reviewedAt: string;

  // Three-signal comparison
  oldRuleEngineSegment: string | null;        // what old engine would say
  currentDecisionOSSegment: string;           // what system says now
  agentExpectedSegment: string;               // what agent believes is correct

  // Judgment
  agreesWithCurrent: boolean;
  confidence: "high" | "medium" | "low";
  evidenceQuality: "sufficient" | "partial" | "insufficient";

  // Reasoning
  primaryDisagreementReason: string | null;   // specific, not generic
  missingData: string[];                      // what would change the judgment

  // Policy output (required — not optional)
  proposedDeterministicRuleCandidate: {
    targetFunction: string;                   // e.g., "hasScaleEvidence", "isUnderSampled"
    proposedChange: string;                   // e.g., "lower spend floor from $250 to 20% of account median"
    preconditions: string[];                  // when this rule applies
    risks: string[];                          // what false positives this creates
  } | null;

  // UI
  proposedUILabel: string | null;
  proposedInstructionHeadline: string | null;

  // Test fixture
  shouldBeTestFixture: boolean;
  fixtureExpectedSegment: string | null;
  fixtureRationale: string | null;
};
```

**Key constraints on the schema:**
- `proposedDeterministicRuleCandidate` is required if `agreesWithCurrent === false`. An agent cannot disagree and produce no policy candidate. Opinions without candidates are discarded.
- `confidence: "low"` judgments are logged but not counted toward policy threshold.
- Fixtures are proposed, not automatically created. A human (owner) approves each fixture before it enters the test suite.

---

## 5. Recommended Calibration Workflow

### Step 1: Pre-calibration baseline (before Codex writes a line of code)
1. Remove the dead code at `creative-operator-policy.ts` line 211 (the unreachable `hasRoasOnlyPositiveSignal` inside `isUnderSampled`). This is a two-line removal. Do it first so agents read clean code.
2. Document the current failure inventory: how many creatives across all accounts are in each segment. Establish the baseline distribution.
3. Establish the old rule engine output for the same creative set. This is the challenger baseline.
4. Identify the known wrong cases: creatives the owner manually knew should be `scale_ready` or `pause_candidate` but were segmented incorrectly. These become the fixture targets.

### Step 2: Agent review pass
1. Run all 10 agents against the sanitized dataset.
2. Each agent produces a structured judgment per creative (schema above).
3. No agent output is applied to code. All output is data.

### Step 3: Synthesis (human-led)
1. Cluster disagreements by policy function: which functions have the most `agreesWithCurrent === false` records?
2. Extract `proposedDeterministicRuleCandidate` entries from high-confidence judgments.
3. Group proposed rule changes by function. Where multiple agents propose the same change with different parameters, take the intersection, not the union.
4. Review old engine auditor output: for each case where old engine is right and new is wrong, confirm the proposed fix covers it. For each case where new engine is right and old is wrong, confirm the fix does not regress it.

### Step 4: Threshold candidates → deterministic rules → fixtures
1. Each accepted rule candidate becomes a specific code change proposal (function name, parameter, before/after).
2. Before any code is written, write the fixture first: the input context that should produce the expected output.
3. Run the existing test suite against proposed changes. If the proposed change breaks an existing fixture, the change needs refinement.
4. Add the new fixtures to the test suite. Verify they fail under current policy (confirming they capture real gaps). Then implement the policy change.

### Step 5: Validation pass
1. Run the updated policy against the full account dataset.
2. Compare new segment distribution against old distribution and challenger baseline.
3. Confirm: `scale_ready` count is nonzero and matches the owner's known-good set.
4. Confirm: the known-wrong cases from Step 1 are now correctly segmented.
5. Confirm: the old rule engine's known-wrong cases are still correctly handled.

---

## 6. Recommended Data Sample Strategy

**Minimum viable sample:** 5–8 accounts, selected for diversity, not convenience. Must include:
- At least one account with zero `scale_ready` outputs under current policy (to find where floors fail)
- At least one account where the owner manually scaled a creative that the system did not flag (known false negative)
- At least one account with high-ROAS but low-volume creatives (the false winner trap)
- At least one account without commercial truth configured (to measure the commercial truth gate's impact)
- At least one account with clear fatigue cases (creative performing at day 7, declining at day 21)

**What to exclude from the agent review dataset:**
- Demo, snapshot, or fallback evidence — these are already known non-eligible
- Creatives with fewer than 3 active days (genuinely too early — not a calibration target)
- Accounts where the owner has no opinion on expected segments (no ground truth anchor)

**Overfitting guard:** After calibration, test the proposed rules against an unseen holdout set (accounts not used during calibration). If the new rules produce dramatically different segment distributions on the holdout set, the calibration overfit.

---

## 7. How to Use the Old Rule Engine Correctly

The old rule engine is a **challenger, not a target.** Use it as follows:

1. Compute old engine output for all creatives in the sample.
2. For each creative where old engine and new engine disagree, classify the disagreement:
   - **Old engine likely right:** New engine is calling a clearly scaling creative `blocked` or `promising_under_sampled` with no compelling reason.
   - **New engine likely right:** Old engine is calling a creative `scale` based on ROAS alone with purchase count < 3 and evidence that the ROAS is attribution-inflated.
   - **Both wrong:** Creative is borderline; owner judgment required. Add as a fixture with explicit boundary note.

3. Build a list of cases where the old engine is definitively wrong. These cases become validation fixtures confirming the new system's correctness. Do not accidentally fix the new system back toward these old failure modes.

4. Do not implement any threshold change that makes the new system reproduce old-engine behavior as a primary rationale. The rationale must be media buyer logic, not "the old engine said so."

---

## 8. How to Convert Findings into Deterministic Policy

The conversion step has exactly one correct form:

1. Agent judgment produces: "This creative should be `scale_ready`. It fails because `hasScaleEvidence` requires spend ≥ $250, but this account's median creative spend is $90 and this creative at $180 is at the 95th percentile of spend for this account."

2. Synthesis step converts this to: "Proposed change to `hasScaleEvidence`: add account-relative floor as an alternative path — if `spend ≥ 0.3 * accountMedianCreativeSpend && spend ≥ 80 && purchases >= 3 && economics.eligible` then scale evidence is met."

3. Precondition check: "This requires `accountMedianCreativeSpend` to be in the input context. Is it? If not, this fix requires a data pipeline change before a policy change."

4. Write the fixture first. The fixture input is the specific creative context from step 1 (sanitized). The fixture expected output is `scale_ready`. Run it against current policy — it should fail. Implement the policy change. Run it again — it should pass. Run the full suite — nothing else should break.

5. The policy change ships as a code PR with: the fixture, the test, the implementation, and a note in the PR description explaining the agent finding that motivated the change.

**What does not count as conversion:**
- "Agents generally agreed the floors are too high" → lower the floors. This is not a specific change. It will produce regressions.
- "The old engine called this scale, so we should too." The old engine is a challenger, not an authority.
- "8 of 10 agents voted `scale_ready`." Votes are not thresholds.

---

## 9. How to Measure Improvement

**Primary metrics (owner-verified):**
- `scale_ready` recall: What fraction of creatives the owner manually identified as "should scale" does the system correctly label? Target: ≥ 80%.
- `pause_candidate` precision: What fraction of creatives the system labels `pause_candidate` does the owner agree should be paused? Target: ≥ 90% (false kills are expensive).
- `promising_under_sampled` usefulness: Does the owner find these actionable? Evaluate qualitatively — this label should feel like a "watch closely" to a buyer, not a mystery.

**Secondary metrics (automated):**
- Segment distribution change: how does the account-wide distribution shift across the full sample? A useful distribution is not uniform — some skew toward `watch` and `protect` is expected. A system that labels 80% of creatives `scale_ready` is wrong in a different direction.
- Old engine alignment on the right cases: For creatives both engines agree are `scale_ready`, are there any the owner disagrees with? That is a regression risk.
- Test fixture coverage: does the fixture set cover the known failure cases? Count of fixtures per segment should grow after calibration, not shrink.

**What does not count as improvement:**
- "More creatives are labeled `scale_ready` than before." Volume is not accuracy.
- "Agents agree with the new policy more than the old policy." Agents were used to calibrate. Measuring agent agreement after calibration is circular.
- "The old rule engine disagrees with the new policy less often." The old engine is the challenger. Convergence with it is not a goal.

---

## 10. How to Keep the Creative Page Simple

The calibration lab is a development tool. Nothing from it enters the UI.

The UI must show, per creative:
- One segment label (the deterministic policy output)
- One instruction headline (the operator prescription)
- One primary action or "do not touch" signal
- One evidence quality indicator (sufficient / partial / insufficient)

Nothing else. No "agent confidence." No "old rule engine says X." No multi-panel comparison. The complexity happens in the calibration pass, not in the operator's workspace.

If the calibration reveals that operators need more context to act (e.g., account-relative performance matters and operators cannot evaluate it without seeing it), the answer is to include the relevant metric in the instruction text (`performingAt95thPercentileForThisAccount`) — not to add panels or comparison views.

The UX Simplification Agent's job is to verify that every instruction produced by the updated policy passes the "would a buyer who doesn't know the internals act on this" test. If not, the instruction text needs improvement before the policy ships.

---

## 11. What Codex Should Do First

In priority order:

1. **Remove dead code at `creative-operator-policy.ts` line 211.** Two-line deletion. Do it before the calibration review so agents read clean logic. This has been flagged in every review since Phase 4.

2. **Fix the HOLD bucket routing.** `investigate` + `blocked` (campaign structure conflict) routes to `needs_truth`/HOLD. This is a one-line change in `resolveCreativeAuthorityState`. Fix it so operators filtering to HOLD can distinguish "configuration missing" from "campaign structure conflict."

3. **Build the Account Baseline computation.** Before any threshold change, the account-relative context (median creative spend, median purchases per creative, spend velocity distribution) must be computable and available as policy input. This is a data pipeline task, not a policy task. It must exist before account-relative floors can be implemented.

4. **Write the calibration data export.** A sanitized export of creative performance context, current policy segment, and old rule engine segment for all creatives in the sample accounts. This is what the agents review. It should not contain PII, account IDs, or ad names in readable form.

5. **Run the calibration pass** using the agent structure defined above.

---

## 12. What Codex Should Not Do

- **Do not change policy thresholds without a fixture first.** Any threshold change that does not have a corresponding fixture is a regression risk.
- **Do not implement account-relative floors without the Account Baseline computation in the data pipeline.** A policy that references `accountMedianCreativeSpend` when that field does not exist in the input will silently fall back to the absolute floor (if there is a fallback) or crash.
- **Do not remove the double-gating requirement without understanding the upstream problem.** If Decision OS is the upstream blocker (its `primaryAction === "promote_to_scaling"` is too conservative), the fix is in Decision OS, not in `creative-operator-policy.ts`. Lowering the downstream floors without fixing the upstream gate will produce no change in `scale_ready` counts.
- **Do not add UI elements to show calibration results.** The calibration lab is internal. Agent outputs are not operator outputs.
- **Do not use agent majority vote as the policy.** See conversion workflow above.
- **Do not treat old rule engine output as a regression signal.** The old engine is a challenger. Some divergence from it is expected and correct.
- **Do not ship any policy change that moves `scale_ready` count from zero to a large number in a single step.** Incremental calibration: fix one compounding gate at a time, validate, then proceed.

---

## 13. Suggested Acceptance Criteria for Creative Segmentation Recovery

**Must pass (blocking):**
- Full test suite passes: all existing fixtures still correct.
- At least 3 new fixtures added per modified policy function, covering the known failure cases identified in calibration.
- Owner manually verifies ≥ 80% recall on their identified "should scale" creative set.
- Owner manually verifies ≥ 90% precision on `pause_candidate` labels (no false kills).
- The HOLD bucket routing fix is in. Operators can distinguish configuration-blocked from structure-blocked.
- Dead code removed from `creative-operator-policy.ts`.
- No new UI elements for calibration internals.
- PR flow maintained: all policy changes go through PR, not direct-to-main.

**Should pass (non-blocking but flagged if missing):**
- Account Baseline computation is available as policy input before account-relative floors ship.
- Telemetry sink is activated before calibration results are used to validate production segment distribution.
- Instruction text for updated segments passes the UX Simplification Agent test for at least 5 reviewed accounts.
- Old rule engine auditor confirms no regressions on its known-wrong cases.

---

## 14. Should This Happen Before Further Phase 8/Production Rollout Work?

**Yes, with one constraint.**

The constraint: Phase 8 production rollout (telemetry sink activation, canary business configuration, supervised apply window) is independent of Creative Segmentation Recovery. These should proceed in parallel, not blocked on each other. The Meta ad set execution subset is ready for canary rollout. Creative execution is manual-only and not affected by Creative segmentation accuracy.

The reason Creative Segmentation Recovery should not wait: the system's primary value proposition — telling an expert operator what to do with creatives — is currently failing its user. An expert media buyer who cannot understand the Creative Decision OS output, and prefers to read the raw table instead, is using Adsecute as a dashboard rather than an operator system. The 8-phase safety architecture is sound, but it is protecting a signal that is not yet trustworthy enough to act on.

The ordering:
1. **Now:** Remove dead code, fix HOLD bucket routing (unblocks both Creative calibration and ongoing ops).
2. **In parallel:** Phase 8 canary rollout tasks (telemetry sink, canary config) — these are Meta-only and independent.
3. **Next:** Creative Segmentation Recovery calibration pass.
4. **After calibration:** Implement deterministic policy changes with fixtures, validate, ship via PR.

Do not block Phase 8 canary rollout on Creative calibration. Do not block Creative calibration on Phase 8 canary rollout. Run them on separate tracks.

---

## Final Chat Summary

**Verdict:** GOOD APPROACH WITH RISKS

**Top 5 Risks:**
1. Agent consensus becomes the policy (majority votes replacing deterministic thresholds)
2. Double-gating: Decision OS upstream conservatism means downstream Creative policy changes may produce no change in `scale_ready` counts — agents must check the upstream blocker explicitly
3. Overfitting to the calibration account set — holdout validation is required before shipping threshold changes
4. Account-relative floors require the Account Baseline computation in the data pipeline before they can be implemented — rushing the policy change without the data will silently fall back or break
5. Old rule engine gravity — calibration converges toward reproducing old engine behavior rather than correcting it

**Recommended Workflow (5 steps):**
1. Remove dead code, fix HOLD bucket routing (immediate, before calibration)
2. Build Account Baseline computation and sanitized calibration data export
3. Run 10-agent review pass — structured judgment records per creative, no code changes
4. Human-led synthesis: cluster disagreements by policy function, extract deterministic rule candidates, write fixtures before code
5. Implement one policy function change at a time, validate against fixtures and holdout set, ship via PR

**Whether to proceed: Yes.**
The 8-phase system is structurally sound and the safety gates are correct. What is not yet acceptable is the primary output — the Creative segment and instruction. Fixing that is the right next milestone. The calibration approach is the right diagnostic method, provided the conversion from agent findings to deterministic policy is executed with the same discipline as the rest of the program.
