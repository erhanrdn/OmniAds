Adsecute is a [Next.js](https://nextjs.org) application for multi-platform ad management and creative analysis.

## Getting Started

Run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000).

The app uses `next/font` with Geist and Geist Mono through `next/font/google`.

## Local PostgreSQL

This repo can run against a plain local PostgreSQL instance. A typical flow is:

```bash
npm run local:db:ensure
npm run db:migrate:local
npm run dev:local
```

`local:db:ensure` checks that the `adsecuteDB` volume is mounted, warns if it is not, and starts PostgreSQL automatically when it is not already running.

For DB-backed test runs:

```bash
npm run test:local-db
```

## Self-Hosted Postgres Ops

For the self-hosted production or staging path, use the Meta/Postgres runbook and repo-managed diagnostics instead of ad-hoc shell notes:

```bash
npm run meta:readiness-snapshot -- --business <businessId>
npm run meta:benchmark -- --business <businessId> --samples 4 --interval-seconds 300
npm run meta:db:diagnostics
npm run meta:drain-rate
```

Docs:

- [`docs/meta-sync-hardening/release-acceptance.md`](docs/meta-sync-hardening/release-acceptance.md)
- [`docs/meta-sync-hardening/postgres-runbook.md`](docs/meta-sync-hardening/postgres-runbook.md)
- [`docs/self-hosted-db-ops.md`](docs/self-hosted-db-ops.md)

## Local Business Subset Sync

For realistic local testing, you can refresh a subset of production data into your local PostgreSQL.

Default command:

```bash
npm run db:sync:local-businesses
```

By default this runs in `incremental` mode.

- First run: it performs a full bootstrap for the configured business subset.
- Later runs: it reads the last successful sync timestamp and only fetches new or changed rows, then merges them into the local database.

You can also override the selection:

```bash
npm run db:sync:local-businesses -- --business IwaStore --business Grandmix --business TheSwaf
```

If you explicitly need the full subset copy:

```bash
npm run db:sync:local-businesses -- --mode full
```

Notes:

- Full mode truncates the local database before reloading the selected subset.
- Incremental mode keeps existing local rows and upserts only the delta since the last successful sync.
- Source connection settings should live in a local-only env file such as `.env.local.sync`.
- The script can open an SSH tunnel automatically when the source database is not directly reachable.
- The script also ensures local PostgreSQL is running before it refreshes data.

## Learn More

To learn more about Next.js, use:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive tutorial.
- [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) - deployment guidance for self-hosted or managed platforms.
