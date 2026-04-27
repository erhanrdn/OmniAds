# Direct-Actionability Substitute

CHATGPT_REVIEW_READY: YES
SANITIZED: YES

# Status

The authenticated workspace has not rendered a direct-actionability row during
the prior supervised sessions. This pass strengthens deterministic substitute
evidence but does not close the product-ready live-evidence blocker.

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

Product-ready blocker remains open unless ChatGPT later accepts this substitute
or a self-hosted workspace renders direct rows.
