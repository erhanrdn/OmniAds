import { readGoogleAdsSearchIntelligenceCoverage } from "@/lib/google-ads/search-intelligence-storage";
import { getGoogleAdsDailyCoverage } from "@/lib/google-ads/warehouse";
import {
  configureOperationalScriptRuntime,
  runOperationalMigrationsIfEnabled,
} from "./_operational-runtime";

const REQUIRED_SCOPES = ["campaign_daily", "search_term_daily", "product_daily"] as const;

async function main() {
  const runtime = configureOperationalScriptRuntime();
  const businessId = process.argv[2];
  const startDate = process.argv[3];
  const endDate = process.argv[4];
  if (!businessId || !startDate || !endDate) {
    console.error(
      "usage: node --import tsx scripts/google-ads-advisor-readiness.ts <businessId> <startDate> <endDate>"
    );
    process.exit(1);
  }

  await runOperationalMigrationsIfEnabled(runtime);
  const coverage = await Promise.all(
    REQUIRED_SCOPES.map(async (scope) => {
      if (scope === "search_term_daily") {
        const additiveCoverage = await readGoogleAdsSearchIntelligenceCoverage({
          businessId,
          startDate,
          endDate,
        });
        return {
          scope,
          source: "additive_search_intelligence",
          completedDays: additiveCoverage.completedDays,
          firstDate: null,
          lastDate: additiveCoverage.readyThroughDate,
        };
      }

      const result = await getGoogleAdsDailyCoverage({
        businessId,
        providerAccountId: null,
        scope,
        startDate,
        endDate,
        includeMetadata: true,
      });
      return {
        scope,
        source: "warehouse_or_succeeded_partition",
        completedDays: Number(result.completed_days ?? 0),
        firstDate: null,
        lastDate: result.ready_through_date ? String(result.ready_through_date).slice(0, 10) : null,
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
