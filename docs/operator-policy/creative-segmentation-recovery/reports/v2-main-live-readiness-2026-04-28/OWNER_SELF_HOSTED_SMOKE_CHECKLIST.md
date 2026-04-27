# Owner Self-Hosted Smoke Checklist

Date: 2026-04-28

Purpose: collect the missing main/live/product-ready runtime evidence for Creative Decision OS v2 preview without exposing private runtime values.

## Preconditions

- Run only in an authorized local environment.
- Use the active self-hosted site and self-hosted PostgreSQL runtime.
- Do not paste or commit domains, tokens, cookies, browser states, DB URLs, server credentials, sessions, or private runtime credentials.
- Do not use Vercel/Neon evidence for this release gate.
- Do not enable queue/apply.
- Do not connect Command Center.
- Do not add DB/Meta/platform writes.

## Command

When the authorized environment already has the required smoke configuration loaded, run:

```bash
npm run creative:v2:self-hosted-smoke
```

If the command requires local environment variables, set them only in the private owner shell/session and do not include their values in reports, commits, screenshots, or chat.

## Expected Evidence

The smoke must verify:

- v2 preview is absent/off when the preview flag is not present.
- v2 preview renders only when the explicit preview flag is present.
- The preview surface shows the expected read-only decision support sections.
- Rendered UI does not expose direct action terms such as Apply, Queue, Push live, Auto, Approve, Scale now, or Cut now.
- Rendered UI does not expose internal artifact terms such as gold labels, fixtures, PR notes, ChatGPT/Claude/Codex, WIP, or internal evaluation wording.
- Runtime network capture records no unsafe `POST`, `PUT`, `PATCH`, or `DELETE` requests during v2 preview load and row-detail interactions.
- Row-detail/open interactions remain local/read-only and do not write to DB, Meta/platform APIs, queue/apply, or Command Center.

## Reporting

Record only sanitized results:

```text
npm run creative:v2:self-hosted-smoke
PASS/FAIL
unsafeMutationRequests=0/positive-count
forbiddenRenderedActionTerms=0/positive-count
forbiddenRenderedInternalTerms=0/positive-count
v2PreviewOffByDefault=true/false
v2PreviewWithFlag=true/false
```

Do not include private URLs, cookies, tokens, storage-state contents, DB URLs, account IDs, user IDs, business IDs, ad account IDs, campaign IDs, creative IDs, or screenshots containing private data.

## Main/Live Gate

Until this owner smoke passes with sanitized evidence, main merge-ready remains NO, live deploy-ready remains NO, and product-ready remains NO.
