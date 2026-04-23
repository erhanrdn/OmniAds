# Creative Segmentation Implementation Pass 2

Last updated: 2026-04-23 by Codex

## Scope

This pass implemented the narrow baseline-backed and benchmark-scope work that pass 1 intentionally deferred.

It did not widen queue, push, or apply authority.

It did not import old-rule challenger behavior into policy.

It did not add a broad UI rewrite.

## Implemented In Pass 2

### 1. Account-relative baseline wiring is active in the current policy path

- the existing relative-baseline contract remains the source of truth for relative winner diagnosis
- `Scale Review` stays available only when that baseline is readable enough for deterministic comparison
- relative-baseline admission is now stricter before policy can use it:
  - reliability must still be `medium` or `strong`
  - peer sample size must be at least `3`
  - eligible peer creative count must be at least `3`
  - spend basis must be at least `150`
  - purchase basis must be at least `3`
  - median ROAS and median spend must both be present
- this prevents borderline or half-readable peer sets from producing false-positive `Scale Review`

### 2. Explicit campaign benchmark scope support is active

- default benchmark scope remains account-wide
- campaign benchmarking is now explicitly supported through the current read contract
- the Creative Decision OS read path now accepts and propagates:
  - `benchmarkScope`
  - `benchmarkScopeId`
  - `benchmarkScopeLabel`
- this propagation now exists across:
  - `/api/creatives/decision-os`
  - additive Creative linkage inside `/api/meta/decision-os`
  - additive Creative linkage inside `/api/meta/recommendations`
  - client fetch helper `getCreativeDecisionOs(...)`
- a selected campaign filter alone still does not silently change benchmark authority

### 3. `Scale Review` is now live under explicit, conservative conditions

`Scale Review` is now live when all of the following are true:

- evidence source is live
- provenance and trust metadata are present
- the row is not blocked by campaign/ad set context as the primary issue
- the relative baseline is sufficiently readable under the stricter floor above
- evidence is materially positive enough for relative promotion review
- Commercial Truth may still be missing

`Scale Review` remains:

- review-only
- `operator_review_required`
- not queue-eligible
- not apply-eligible

Commercial Truth missing still blocks absolute-profit claims and execution authority, but no longer suppresses a valid relative-winner diagnosis.

### 4. Low-spend meaningful-evidence counterexample stays supported

- low spend alone still does not authorize `Scale Review`
- low spend with weak or missing purchase evidence remains conservative
- low spend with meaningful purchase/value evidence and a strong enough relative baseline is no longer auto-dismissed as ROAS-only noise
- this still stays review-only

### 5. Label and bucket alignment improved for review-oriented scale work

- the former `Watch` quick-filter and authority label are now `Review`
- this keeps `Scale Review` out of a misleading “just watch it” bucket description
- `Campaign Check` stays under the neutral `Check` bucket
- `Protect`, `Refresh`, `Not Enough Data`, `Test More`, and `Watch` keep their existing user-facing row labels

## Fixture Coverage Added Or Hardened

This pass added or hardened fixture-backed coverage for:

- account-relative strong creative + missing Commercial Truth => `Scale Review`, review-only
- campaign-relative strong creative + explicit campaign benchmark => `Scale Review`
- weak or missing baseline => no `Scale Review`
- medium baseline that fails peer-count / spend-basis / purchase-basis floors => no `Scale Review`
- strong account signal + weak campaign/ad set context => `Campaign Check`, not `Scale Review`
- low-spend weak-evidence row => not `Scale Review`
- low-spend meaningful-evidence row => not automatically treated as ROAS-only noise
- benchmark-scope metadata presence on `Scale Review` rows
- no silent benchmark-scope switch from unrelated route filters
- review-bucket alignment for `Scale Review`, `Test More`, `Not Enough Data`, `Watch`

## Minimal UI Follow-up Still Deferred

No new UI control was added in this pass.

Safe default remains account-wide benchmarking.

The minimal next UI step, if product wants explicit operator control later, is:

- an explicit benchmark-scope control such as `Evaluate within this campaign`

That control is not required for the underlying policy contract to work.

## Safety Status

Still preserved:

- old-rule challenger is comparison-only
- missing provenance still blocks queue/apply/push
- non-live/demo/snapshot/fallback evidence stays non-push eligible
- selected reporting range remains analysis context only
- missing Commercial Truth still blocks absolute-profit claims and push/apply eligibility
- `Scale Review` remains review-only

## Validation

Ran targeted:

- `npx vitest run lib/creative-operator-policy.test.ts lib/creative-operator-surface.test.ts lib/creative-decision-os.test.ts app/api/creatives/decision-os/route.test.ts app/api/meta/decision-os/route.test.ts app/api/meta/recommendations/route.test.ts lib/creative-old-rule-challenger.test.ts lib/command-center.test.ts`

Planned full validation for this pass:

- `npm test`
- `npx tsc --noEmit`
- `npm run build`
- `git diff --check`
- hidden/bidi/control scan on touched docs/code
- raw ID scan on updated docs/code

## Result

Implementation pass 2 makes relative-winner review real instead of only theoretical:

- account-relative baseline-backed `Scale Review` is live
- explicit campaign benchmark scope support is active in the contract and route path
- benchmark authority stays explicit instead of silently following a selected campaign
- review-oriented labeling is clearer for operators
- safety posture is unchanged

Pass 3 is still needed for any further scale-path expansion, broader baseline work, or threshold retuning.
