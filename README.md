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
npm run db:migrate
npm run dev
```

If you keep PostgreSQL on an external disk, start it first with your local `pg_ctl` command, then run the app.

## Local Business Subset Sync

For realistic local testing, you can refresh a subset of production data into your local PostgreSQL.

Default command:

```bash
npm run db:sync:local-businesses
```

By default this refreshes the configured business subset from production into the local database. You can also override the selection:

```bash
npm run db:sync:local-businesses -- --business IwaStore --business Grandmix --business TheSwaf
```

Notes:

- The command truncates the local database before reloading the selected subset.
- Source connection settings should live in a local-only env file such as `.env.local.sync`.
- The script can open an SSH tunnel automatically when the source database is not directly reachable.

## Learn More

To learn more about Next.js, use:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive tutorial.
- [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) - deployment guidance for self-hosted or managed platforms.
