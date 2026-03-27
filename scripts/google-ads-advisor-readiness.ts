import { loadEnvConfig } from "@next/env";
import { getDb } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";

loadEnvConfig(process.cwd());

const REQUIRED_SCOPES = ["campaign_daily", "search_term_daily", "product_daily"] as const;

async function main() {
  const businessId = process.argv[2];
  const startDate = process.argv[3];
  const endDate = process.argv[4];
  if (!businessId || !startDate || !endDate) {
    console.error(
      "usage: node --import tsx scripts/google-ads-advisor-readiness.ts <businessId> <startDate> <endDate>"
    );
    process.exit(1);
  }

  await runMigrations();
  const sql = getDb();

  const coverage = await Promise.all(
    REQUIRED_SCOPES.map(async (scope) => {
      const table =
        scope === "campaign_daily"
          ? "google_ads_campaign_daily"
          : scope === "search_term_daily"
            ? "google_ads_search_term_daily"
            : "google_ads_product_daily";
      const rows = await sql.query(
        `
          SELECT COUNT(DISTINCT date)::int AS completed_days, MIN(date) AS first_date, MAX(date) AS last_date
          FROM ${table}
          WHERE business_id = $1
            AND date >= $2
            AND date <= $3
        `,
        [businessId, startDate, endDate]
      ) as Array<Record<string, unknown>>;
      const row = rows[0] ?? {};
      return {
        scope,
        completedDays: Number(row.completed_days ?? 0),
        firstDate: row.first_date ? String(row.first_date).slice(0, 10) : null,
        lastDate: row.last_date ? String(row.last_date).slice(0, 10) : null,
      };
    })
  );

  const totalDays =
    Math.floor((new Date(`${endDate}T00:00:00Z`).getTime() - new Date(`${startDate}T00:00:00Z`).getTime()) / 86_400_000) +
    1;
  const missingSurfaces = coverage
    .filter((entry) => entry.completedDays < totalDays)
    .map((entry) => entry.scope);

  console.log(
    JSON.stringify(
      {
        businessId,
        startDate,
        endDate,
        totalDays,
        ready: missingSurfaces.length === 0,
        missingSurfaces,
        coverage,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
