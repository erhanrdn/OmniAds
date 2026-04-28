# Direct-Actionability Substitute

CHATGPT_REVIEW_READY: YES
SANITIZED: YES

# Status

The authenticated workspace has not rendered a direct-actionability row during
the prior supervised sessions. This pass strengthens deterministic substitute
evidence. On 2026-04-28, the substitute evidence was accepted for read-only
default-visible buyer surface promotion because the surface does not create any
queue/apply, DB write, or Meta/platform write path.

# Tests Added Or Strengthened

Test file:

- `lib/creative-decision-os-v2-preview.test.tsx`

Assertions:

- review_only Scale ranks above direct Protect/Test More.
- high-spend Cut ranks above direct Protect/Test More.
- direct Protect/Test More rows appear in Ready for Buyer Confirmation and not
  Today Priority by default.
- direct rows can also appear in Today Priority only when urgency separately
  qualifies.
- Diagnose rows appear in Diagnose First, not Ready for Buyer Confirmation.
- empty Ready for Buyer Confirmation copy remains safe and understandable.

# Result

Result: passed locally through `npm run creative:v2:safety`.

# Why This Is Substitute Evidence Only

This is deterministic test evidence over constructed rows. It proves the model
and rendered copy behave correctly for the missing shape, but it is not a
workspace-rendered live observation from the authenticated self-hosted data.

Accepted for the 2026-04-28 read-only default-visible promotion. A future
self-hosted workspace observation with direct rows is still useful evidence, but
it is no longer a blocker for showing the current read-only buyer surface on the
normal Creative page.
