import { loadEnvConfig } from "@next/env";
import { GOOGLE_ADS_ADVISOR_READY_WINDOW_DAYS } from "@/lib/google-ads/google-contract";
import { verifyGoogleAdsRetentionCanary } from "@/lib/google-ads/retention-canary";

loadEnvConfig(process.cwd());

interface ParsedArgs {
  businessId: string | null;
  accountId: string | null;
  asOfDate: string | null;
  probeStartDate: string | null;
  probeEndDate: string | null;
  json: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    businessId: null,
    accountId: null,
    asOfDate: null,
    probeStartDate: null,
    probeEndDate: null,
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
    if (arg.startsWith("--account=")) {
      parsed.accountId = arg.slice("--account=".length) || null;
      continue;
    }
    if (arg.startsWith("--as-of=")) {
      parsed.asOfDate = arg.slice("--as-of=".length) || null;
      continue;
    }
    if (arg.startsWith("--probe-start=")) {
      parsed.probeStartDate = arg.slice("--probe-start=".length) || null;
      continue;
    }
    if (arg.startsWith("--probe-end=")) {
      parsed.probeEndDate = arg.slice("--probe-end=".length) || null;
      continue;
    }
    if (!arg.startsWith("-") && !parsed.businessId) {
      parsed.businessId = arg;
    }
  }

  return parsed;
}

function printHelp() {
  console.log(`Usage: npm run google:ads:retention-canary -- <businessId> [options]

Options:
  --account=<providerAccountId>  Limit verification to one assigned provider account
  --as-of=YYYY-MM-DD             Override the verification as-of date
  --probe-start=YYYY-MM-DD       Override the historical probe start date
  --probe-end=YYYY-MM-DD         Override the historical probe end date
  --json                         Print machine-readable JSON
  --help                         Show this message
`);
}

function printText(result: Awaited<ReturnType<typeof verifyGoogleAdsRetentionCanary>>) {
  console.log(`Google Ads Retention Canary for ${result.businessId}`);
  console.log(`As of: ${result.asOfDate}`);
  console.log(`Result: ${result.passed ? "PASS" : "FAIL"}`);
  console.log(
    `Execution default: ${
      result.retentionRuntime.defaultExecutionDisabled ? "disabled" : "enabled"
    } (${result.retentionRuntime.mode})`
  );
  console.log(
    `Probe window: ${result.rawHotWindow.probeStartDate} -> ${result.rawHotWindow.probeEndDate} (hot window starts ${result.rawHotWindow.supportStartDate})`
  );
  console.log("");

  if (result.blockers.length > 0) {
    console.log("Blockers:");
    for (const blocker of result.blockers) {
      console.log(`- ${blocker}`);
    }
    console.log("");
  }

  console.log("Raw search-term probe:");
  console.log(
    `- rows=${result.rawSearchTermsProbe.rowCount}, sources=${result.rawSearchTermsProbe.sources.join(", ") || "none"}`
  );
  for (const warning of result.rawSearchTermsProbe.warnings) {
    console.log(`- warning: ${warning}`);
  }
  console.log("");

  console.log("Historical search-intelligence probe:");
  console.log(
    `- rows=${result.searchIntelligenceProbe.rowCount}, aggregateBacked=${result.searchIntelligenceProbe.aggregateBacked ? "yes" : "no"}, sources=${result.searchIntelligenceProbe.sources.join(", ") || "none"}`
  );
  for (const warning of result.searchIntelligenceProbe.warnings) {
    console.log(`- warning: ${warning}`);
  }
  console.log("");

  console.log("Recent advisor support:");
  console.log(
    `- ${result.recentAdvisorSupport.completedDays}/${GOOGLE_ADS_ADVISOR_READY_WINDOW_DAYS} additive days, readyThrough=${result.recentAdvisorSupport.readyThroughDate ?? "none"}, ready=${result.recentAdvisorSupport.ready ? "yes" : "no"}`
  );
  console.log("");

  console.log("Raw hot-table dry-run:");
  for (const row of result.retentionDryRun.rawHotTables) {
    console.log(
      `- ${row.tableName}: eligible=${row.eligibleRows ?? "unknown"}, oldest=${row.oldestEligibleValue ?? "none"}, newest=${row.newestEligibleValue ?? "none"}, retained=${row.retainedRows ?? "unknown"}, latestRetained=${row.latestRetainedValue ?? "none"}`
    );
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  if (!args.businessId) {
    printHelp();
    process.exit(1);
  }

  const result = await verifyGoogleAdsRetentionCanary({
    businessId: args.businessId,
    accountId: args.accountId,
    asOfDate: args.asOfDate,
    probeStartDate: args.probeStartDate,
    probeEndDate: args.probeEndDate,
  });

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printText(result);
  }

  process.exit(result.passed ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
