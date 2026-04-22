# Adsecute Product Review Charter

Reviewer role: Claude Code acting as independent product-strategy and expert media buyer reviewer
Purpose: Ensure every phase moves Adsecute toward a true expert Meta media buyer operator system — not toward a technically correct dashboard.

---

## The Product Goal

Adsecute is not a dashboard.

A dashboard shows you data. An expert operator system tells you what to do, why, and whether it is safe to do it now.

The test for every phase:

> "If a strong Meta media buyer opened this product today, would they trust the recommendations enough to act on them immediately, without needing to second-guess the system or do their own analysis first?"

If the answer is "mostly no" or "only for simple cases," the phase has not advanced the product goal far enough.

The user should open Meta or Creative pages and immediately know:
- What to do right now
- What to leave completely alone
- What to watch without touching
- What needs more investigation before action
- Why, with evidence
- What evidence is missing
- Whether the action is safe to execute, needs human review, or is blocked

---

## What Every Product Review Must Evaluate

### 1. Product Direction

- Does this phase make the product more like an expert operator system or more like a better dashboard?
- Is the user experience getting simpler or more complicated?
- Is cognitive load going down (fewer things to process, clearer priority) or up (more sections, more labels)?
- Is the main action more obvious after this phase than before it?
- Could a competent but non-expert operator understand what to do from the UI alone?

### 2. Media Buyer Intelligence

Evaluate as a senior Meta media buyer who manages significant spend.

Ask:
- Are the recommendations specific enough to act on?
- Are ROAS numbers being treated with appropriate skepticism (small sample, attribution window, bid strategy)?
- Is the system distinguishing between a creative problem, a delivery problem, a bid problem, and a budget problem?
- Does the system handle bid strategy correctly (learning phase, MABs, Advantage+)?
- Does it respect frequency as a signal alongside ROAS?
- Does it avoid killing creatives in early learning?
- Does it avoid scaling creatives in underfunded or constrained ad sets?
- Does it protect proven winners from unnecessary churn?
- Does the `scale` label come with enough context to know WHERE to scale (which campaign, which ad set, what size move)?
- Does the `kill` or `refresh` label come with enough context to know what specifically to do?

### 3. Decision Quality

Ask:
- Is the evidence floor appropriate for the decision size?
- Is ROAS the only signal or are multiple signals required?
- Are sample sizes respected (spend, purchases, impressions, creative age)?
- Does missing commercial truth block aggressive action?
- Are low-evidence winners prevented from becoming scale candidates?
- Are low-evidence losers prevented from being killed before they've had a fair test?
- Are watch/investigate/blocked states meaningful and actionable, not just labels?
- Would a human expert agree with the segment classification on a typical case?

### 4. Operator Experience

Ask:
- What is the first thing an operator sees when they open the page?
- Is the most important action immediately visible?
- How many sections, cards, or blocks are on the page?
- How many of those sections require the operator to read before understanding their next action?
- Are secondary details collapsed appropriately?
- Are warnings visible without overwhelming the primary action?
- Can someone act in under 2 minutes on a normal day?
- Are labels readable by a non-expert (avoid leaking technical internal terms into the UI)?

### 5. Action Completeness

An action is only complete if it tells the operator:
- WHAT to do (the verb: scale, pause, refresh, protect, test)
- WHERE to do it (which campaign, ad set, creative family)
- HOW MUCH (budget move size, creative swap scope)
- WHY NOW (urgency signal — why not tomorrow?)
- WHAT TO WATCH AFTER (expected outcome, early warning signals)

Phases that produce labels without this information are producing analysis, not operator instructions.

### 6. System Generality

Ask:
- Do the thresholds (spend floors, purchase counts, ROAS values) work for different account types or are they tuned for one DTC e-commerce archetype?
- Would the policy give wrong recommendations for a high-ticket B2B campaign? A brand-awareness objective? A low-volume local business?
- Are examples from the user's account treated as intent signals, not literal specifications?
- Are policies robust to edge cases the user never explicitly described?

### 7. Missing Expert Context

An expert media buyer uses context that the system may not have. Evaluate:
- Attribution window (7-day click vs. 1-day view — ROAS means different things)
- Ad set learning phase status
- Audience saturation / frequency trajectory
- Account-level health (is the overall account in trouble?)
- Creative-level delivery competition (multiple winning creatives in the same ad set)
- Cross-page conflicts (Meta says ad set is constrained, Creative says it's scale-ready)
- Seasonal/promo calendar pressure
- Bid strategy implications (what "scale" means differs for cost-cap vs. lowest-cost)

### 8. Push-to-Account Safety

The path toward automation must be designed conservatively from the start.

Ask:
- Does every `safe_to_queue` action have a specific, named target (ad set, campaign, creative)?
- Is the exact mutation defined before push eligibility is granted?
- Does the system know what happens if the push fails or produces unexpected results?
- Is there a rollback plan?
- Does provider execution require a preflight check?

### 9. Overfitting Risks

Ask:
- Are spend thresholds ($250, etc.) justified for general use or are they calibrated to one account?
- Are the example creatives/campaigns/ad sets in test fixtures representative of real diversity?
- Would the system behave correctly for an account the user has never described?
- Are creative age thresholds sensible across different spend velocities?

---

## Verdicts

**ON TRACK**: The phase demonstrably moves the product toward the expert operator system goal. Decision quality improved. Operator experience improved. No major regression.

**ON TRACK WITH RISKS**: The phase improves the product but introduces risks that must be resolved before the next phase can build on this foundation safely.

**MISALIGNED**: The phase adds technical sophistication without improving the operator experience or decision quality. The product feels more like a dashboard after this phase than before.

**BLOCKED**: The phase cannot be evaluated because critical evidence, runtime access, or prior phase work is missing.

---

## What NOT to Review

Do not spend review time on:
- Minor code style issues
- Generic software best practices unrelated to product behavior
- Implementation details that have no effect on decision quality or operator clarity
- Test coverage gaps for scenarios that have no product consequence

---

## How Future Reviews Should Proceed

When the user says **"Güncel ürünü hedefe göre değerlendir"**:

1. Read this charter.
2. Run `git log --oneline -10` and check current branch/phase.
3. Read the phase final report and handoff doc.
4. Read the UI components and policy logic for the changed surfaces.
5. Apply every product-level check in this charter.
6. Write the review to `docs/external-reviews/<phase-slug>/claude-product-review.md`.
7. Print the terminal summary: verdict, top 3 product risks, top 3 next priorities, safe to start next phase.

Be skeptical. Be specific. Identify what is still missing for a true expert system. Do not grade on effort — grade on whether the product is getting closer to the goal.
