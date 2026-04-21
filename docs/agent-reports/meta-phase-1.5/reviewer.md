# 1. Review scope and diff inspected

Reviewed branch `feature/meta-decision-os-operator-system` at `a7094815b2258015d39fbc29d64dc00b7a127cfd` against merge base `c447cbc86a6cec6b51a0f3071d1a5c34bc7a95ca` on `main`.

Changed files inspected:

- `lib/meta/analysis-state.ts`
- `components/meta/meta-analysis-status-card.tsx`
- `components/meta/meta-decision-os.tsx`
- `components/meta/meta-campaign-detail.tsx`
- `app/(dashboard)/platforms/meta/page.tsx`
- `app/api/meta/recommendations/route.ts`
- `lib/meta/recommendations.ts`
- Related tests in `lib/meta/analysis-state.test.ts`, `components/meta/meta-analysis-status-card.test.tsx`, `components/meta/meta-decision-os.test.tsx`, `components/meta/meta-campaign-detail.test.tsx`, `app/(dashboard)/platforms/meta/page.test.tsx`, and `app/api/meta/recommendations/route.test.ts`.

Targeted verification run:

```text
npx vitest run lib/meta/analysis-state.test.ts components/meta/meta-analysis-status-card.test.tsx components/meta/meta-decision-os.test.tsx components/meta/meta-campaign-detail.test.tsx app/\(dashboard\)/platforms/meta/page.test.tsx app/api/meta/recommendations/route.test.ts

Test Files  6 passed (6)
Tests       58 passed (58)
```

# 2. Findings, ordered by severity

No blocking correctness issue found.

# 3. Invariant checklist with pass/fail and evidence lines

| Invariant | Result | Evidence |
| --- | --- | --- |
| Decision OS surface readiness is not inferred from recommendations alone. | PASS | `decisionOsStatus` is derived from Decision OS fetching/error/data/range mismatch, not recommendation data, in `lib/meta/analysis-state.ts:258-269`. Decision OS-sourced recommendations without a ready surface are demoted to context at `lib/meta/analysis-state.ts:276-277` and returned as `not_run` at `lib/meta/analysis-state.ts:377-385`. Tests assert this in `lib/meta/analysis-state.test.ts:120-133` and page rendering in `app/(dashboard)/platforms/meta/page.test.tsx:619-647`. |
| Decision OS-sourced recommendation context is not shown as no guidance. | PASS | The presentation mode becomes `decision_os_recommendation_context` when source is `decision_os` and Decision OS is not ready at `lib/meta/analysis-state.ts:276-277`; the not-loaded message is explicit at `lib/meta/analysis-state.ts:377-382`. Status card renders the presentation label at `components/meta/meta-analysis-status-card.tsx:82-87`. Tests cover this in `components/meta/meta-analysis-status-card.test.tsx:66-91` and `app/(dashboard)/platforms/meta/page.test.tsx:642-647`. |
| `snapshot_fallback` is always contextual. | PASS | Fallback source maps to `fallback_context` at `lib/meta/analysis-state.ts:274-275`, returns `recommendation_fallback` with fallback copy at `lib/meta/analysis-state.ts:319-327`, and API fallback responses are labeled `snapshot_fallback` at `app/api/meta/recommendations/route.ts:260-295`. Campaign primary display demotes fallback recommendations to context at `components/meta/meta-campaign-detail.tsx:202-210` and renders fallback context copy at `components/meta/meta-campaign-detail.tsx:256-278`. Tests cover fallback context for act and non-act recommendations in `components/meta/meta-campaign-detail.test.tsx:347-386` and `components/meta/meta-campaign-detail.test.tsx:389-435`. |
| Demo source is contextual. | PASS | Demo recommendations are labeled with `analysisSource.system: "demo"` at `app/api/meta/recommendations/route.ts:88-117`; source detection recognizes demo at `lib/meta/analysis-state.ts:124-130`; presentation mode maps to `demo_context` at `lib/meta/analysis-state.ts:278-279` and returns contextual copy at `lib/meta/analysis-state.ts:388-396`. Tests assert demo context in `lib/meta/analysis-state.test.ts:180-195` and card rendering in `components/meta/meta-analysis-status-card.test.tsx:94-109`. |
| Missing authority blocks command-ready state. | PASS | `authorityAllowsPrimaryAction` returns false with missing authority at `components/meta/meta-decision-os.tsx:555-561`; command readiness requires that function for campaigns, ad sets, and geos at `components/meta/meta-decision-os.tsx:609-654`. Test coverage at `components/meta/meta-decision-os.test.tsx:615-628`. |
| Missing row trust blocks command-ready state. | PASS | `trustAllowsPrimaryAction` requires `Boolean(trust)` at `components/meta/meta-decision-os.tsx:570-582`; missing trust also produces a blocker at `components/meta/meta-decision-os.tsx:541-552`. Ad set command readiness requires row trust at `components/meta/meta-decision-os.tsx:631-633`. Test coverage at `components/meta/meta-decision-os.test.tsx:630-661`. |
| `degraded_missing_truth` and `inactive_or_immaterial` never render as primary command-ready. | PASS | Authority must be `live_confident`, complete, fresh, and stable at `components/meta/meta-decision-os.tsx:555-567`; row trust must be `live_confident` and standard at `components/meta/meta-decision-os.tsx:570-582`. Primary action core only renders `commandReady` items at `components/meta/meta-decision-os.tsx:909-913` and `components/meta/meta-decision-os.tsx:997-1012`; degraded rows go to contextual watchlist at `components/meta/meta-decision-os.tsx:914-927` and `components/meta/meta-decision-os.tsx:1015-1028`. Tests cover inactive/immaterial at `components/meta/meta-decision-os.test.tsx:664-704` and degraded/missing truth at `components/meta/meta-decision-os.test.tsx:706-717`. |
| `noTouch` rows never render as primary command-ready. | PASS | `trustAllowsPrimaryAction` requires `!noTouch` at `components/meta/meta-decision-os.tsx:570-582`; campaign/ad set work items pass each decision's `noTouch` into command readiness at `components/meta/meta-decision-os.tsx:606-633`. Protected/no-touch items render in a separate section at `components/meta/meta-decision-os.tsx:1031-1059`. Test coverage confirms separate protected/no-touch rendering at `components/meta/meta-decision-os.test.tsx:749-758`. |
| Timestamp copy does not imply "Decision OS last analyzed" when only recommendations succeeded. | PASS | Manual analysis records a timestamp when either usable recommendations or Decision OS data was returned at `app/(dashboard)/platforms/meta/page.tsx:813-823`, but the status card copy says `Last successful analysis`, not `Decision OS last analyzed`, at `components/meta/meta-analysis-status-card.tsx:91-95`. Tests explicitly assert the forbidden phrase is absent at `components/meta/meta-analysis-status-card.test.tsx:57-63` and `components/meta/meta-analysis-status-card.test.tsx:85-91`. |
| "Highlighted Action Core" does not imply unsupported global ranking. | PASS | The UI title is `Highlighted Action Core`, with empty copy limited to command-ready availability, at `components/meta/meta-decision-os.tsx:997-1005`. The code does sort command-ready items locally by priority/confidence before display at `components/meta/meta-decision-os.tsx:909-913`, but visible copy does not claim global rank, best action, or account-wide optimization order. Test coverage checks the section label and command-ready behavior at `components/meta/meta-decision-os.test.tsx:570-612`. |
| Opportunity blocker labels do not invent unavailable `eligibilityTrace` fields. | PASS | Row labels use optional `eligibilityTrace` fields only when present, otherwise fall back to queue metadata at `components/meta/meta-decision-os.tsx:299-310`. Summary blockers similarly combine queue data and optional trace fields without synthesizing trace-only labels at `components/meta/meta-decision-os.tsx:770-778`. Test coverage for missing `eligibilityTrace` is at `components/meta/meta-decision-os.test.tsx:781-810`. |

# 4. Test coverage observations

Targeted tests cover the requested analysis-state distinctions, status card copy, manual page query behavior, Decision OS command-ready gating, campaign fallback context, and recommendation API source labels.

Coverage gaps are non-blocking:

- There is no focused test that sets `noTouch: true` while authority and trust are otherwise fully command-ready; the code-level guard is explicit.
- The "Highlighted Action Core" invariant is mostly copy-level coverage; tests do not assert absence of ranking language beyond current rendered strings.
- Demo source contextual behavior is unit-tested through status derivation/card rendering, but the recommendations route does not have a dedicated demo-source response test.

# 5. Residual risks requiring runtime/live validation

- Live Decision OS payload shape still needs runtime validation, especially optional `authority.readiness`, `authority.readReliability`, `summary.readReliability`, and `eligibilityTrace` combinations.
- Snapshot fallback source labeling should be checked against a real feature-disabled or unavailable Decision OS business to confirm the UI receives `analysisSource.system: "snapshot_fallback"` end to end.
- Demo business behavior should be smoke-tested in-app to confirm the route's `demo` analysis source reaches the visible status card under normal auth/business-mode handling.

# 6. Reviewer recommendation: blocking / non-blocking / approve for PR review

approve for PR review
