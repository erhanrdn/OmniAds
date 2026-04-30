# Generated Artifact Provenance

This folder contains generated JSON artifacts for Creative Decision Center V2.1 planning and shadow validation.

These files are not production runtime behavior. They are context artifacts for future GPT/Codex/Claude chats and for migration planning.

## Files

- `aggregate-test.json`
- `before-after-shadow.json`
- `config-sensitivity.json`
- `data-readiness-coverage.json`
- `golden-cases.json`
- `live-status.json`
- `performance-smoke.json`

## Live Status

`live-status.json` is the authority for whether a live DB/API read occurred.

If `live-status.json` says `attempted=false`, `DATABASE_URL` was missing, or no live read occurred, do not describe these artifacts as live DB/API evidence.

At the time this provenance note was added, the checked `live-status.json` reported:

```json
{
  "attempted": false,
  "reason": "DATABASE_URL is not set; no live DB/snapshot read was attempted.",
  "missingEnv": ["DATABASE_URL"]
}
```

That means these artifacts should be treated as fixture-backed planning outputs unless regenerated later with a reviewed read-only live loader.

## Regeneration

Regenerate these artifacts from the separate spike tools branch once available:

```bash
npx tsx scripts/creative-decision-center-v21-spike.ts
```

Then verify:

```bash
npx vitest run scripts/creative-decision-center-v21-spike.test.ts
```

Do not run or add any script that mutates DB/API state. Spike tools must remain non-production and read-only.

## Data Safety

Do not store secrets, tokens, raw customer identifiers, raw ad account identifiers, or customer-sensitive data in this folder.

If future generated artifacts include live data, sanitize or redact them before committing. Keep only fields necessary for regression planning and shadow validation.
