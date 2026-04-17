import { loadEnvConfig } from "@next/env";
import { generateGoogleAdsAdvisorSnapshot } from "@/lib/google-ads/advisor-snapshots";
import {
  assertOperationalOwnerMaintenance,
  configureOperationalScriptRuntime,
  runOperationalMigrationsIfEnabled,
} from "./_operational-runtime";

loadEnvConfig(process.cwd());

interface ParsedArgs {
  businessId: string | null;
  accountId: string | null;
  json: boolean;
  help: boolean;
}

function printHelp() {
  console.log(`Usage: npm run google:ads:advisor-refresh -- <businessId> [options]

Options:
  --accountId=<accountId>  Optional Google Ads account id
  --json                   Print machine-readable JSON
  --help                   Show this message
`);
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    businessId: null,
    accountId: null,
    json: false,
    help: false,
  };

  for (const arg of argv) {
    if (arg === "--json") {
      parsed.json = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (arg.startsWith("--accountId=")) {
      parsed.accountId = arg.slice("--accountId=".length) || null;
      continue;
    }
    if (!arg.startsWith("-") && !parsed.businessId) {
      parsed.businessId = arg;
    }
  }

  return parsed;
}

async function main() {
  const runtime = configureOperationalScriptRuntime({
    lane: "owner_maintenance",
  });
  assertOperationalOwnerMaintenance({
    runtimeMigrationsEnabled: runtime.runtimeMigrationsEnabled,
    scriptName: "google-ads-advisor-refresh",
  });
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  if (!args.businessId) {
    printHelp();
    process.exit(1);
  }

  await runOperationalMigrationsIfEnabled({
    runtimeMigrationsEnabled: runtime.runtimeMigrationsEnabled,
    lane: runtime.lane,
    scriptName: "google-ads-advisor-refresh",
  });
  const snapshot = await generateGoogleAdsAdvisorSnapshot({
    businessId: args.businessId,
    accountId: args.accountId,
  });

  const summary = {
    businessId: snapshot.businessId,
    accountId: snapshot.accountId,
    generatedAt: snapshot.generatedAt,
    asOfDate: snapshot.asOfDate,
    status: snapshot.status,
    actionContractVersion: snapshot.advisorPayload.metadata?.actionContract?.version ?? null,
    actionContractSource: snapshot.advisorPayload.metadata?.actionContract?.source ?? null,
    aiAssist: snapshot.advisorPayload.metadata?.aiAssist ?? null,
    recommendationCount: snapshot.advisorPayload.recommendations.length,
    sectionCount: snapshot.advisorPayload.sections.length,
  };

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`Google Ads advisor snapshot refreshed for ${summary.businessId}`);
    console.log(`Generated at: ${summary.generatedAt ?? "unknown"}`);
    console.log(`As of date: ${summary.asOfDate}`);
    console.log(`Status: ${summary.status}`);
    console.log(
      `Action contract: ${summary.actionContractVersion ?? "unknown"} (${summary.actionContractSource ?? "unknown"})`
    );
    console.log(`Recommendations: ${summary.recommendationCount}`);
    if (summary.aiAssist) {
      console.log(
        `AI assist: enabled=${summary.aiAssist.enabled} eligible=${summary.aiAssist.eligibleCount} applied=${summary.aiAssist.appliedCount} rejected=${summary.aiAssist.rejectedCount} failed=${summary.aiAssist.failedCount} skipped=${summary.aiAssist.skippedCount}`
      );
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
