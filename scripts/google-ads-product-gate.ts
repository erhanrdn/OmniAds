import { spawnSync } from "node:child_process";
import { loadEnvConfig } from "@next/env";
import {
  runGoogleAdsProductGate,
  shouldGoogleAdsProductGateFailStrict,
  type GoogleAdsProductGateResult,
} from "@/lib/google-ads/product-gate";

loadEnvConfig(process.cwd());

interface ParsedArgs {
  businessId: string | null;
  startDate: string | null;
  endDate: string | null;
  sinceIso: string | null;
  json: boolean;
  strict: boolean;
  skipBuild: boolean;
  skipAdmin: boolean;
  help: boolean;
}

function printHelp() {
  console.log(`Usage: npm run google:ads:product-gate -- <businessId> [options]

Options:
  --start=YYYY-MM-DD     Selected window start date
  --end=YYYY-MM-DD       Selected window end date
  --sinceIso=ISO         Freshness boundary for runtime observations
  --json                 Print machine-readable JSON
  --strict               Exit non-zero on WARN, FAIL, or NOT VERIFIED
  --skip-build           Skip running npm run build inside the gate
  --skip-admin           Skip admin sync-health visibility verification
  --help                 Show this message
`);
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    businessId: null,
    startDate: null,
    endDate: null,
    sinceIso: null,
    json: false,
    strict: false,
    skipBuild: false,
    skipAdmin: false,
    help: false,
  };

  for (const arg of argv) {
    if (arg === "--json") {
      parsed.json = true;
      continue;
    }
    if (arg === "--strict") {
      parsed.strict = true;
      continue;
    }
    if (arg === "--skip-build") {
      parsed.skipBuild = true;
      continue;
    }
    if (arg === "--skip-admin") {
      parsed.skipAdmin = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (arg.startsWith("--start=")) {
      parsed.startDate = arg.slice("--start=".length) || null;
      continue;
    }
    if (arg.startsWith("--end=")) {
      parsed.endDate = arg.slice("--end=".length) || null;
      continue;
    }
    if (arg.startsWith("--sinceIso=")) {
      parsed.sinceIso = arg.slice("--sinceIso=".length) || null;
      continue;
    }
    if (!arg.startsWith("-") && !parsed.businessId) {
      parsed.businessId = arg;
    }
  }

  return parsed;
}

function runBuildCheck(skipBuild: boolean) {
  if (skipBuild) {
    return {
      skipped: true,
      summary: "Skipped by --skip-build.",
    };
  }
  const result = spawnSync("npm", ["run", "build"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });
  return {
    skipped: false,
    ok: result.status === 0,
    summary:
      result.status === 0
        ? "npm run build passed."
        : `npm run build failed with exit code ${result.status ?? "unknown"}.`,
  };
}

function printText(result: GoogleAdsProductGateResult) {
  console.log(`Google Ads Product Gate for ${result.businessId}`);
  console.log(`Checked at: ${result.checkedAt}`);
  if (result.startDate || result.endDate) {
    console.log(`Window: ${result.startDate ?? "?"} -> ${result.endDate ?? "?"}`);
  }
  if (result.sinceIso) {
    console.log(`sinceIso: ${result.sinceIso}`);
  }
  console.log(`Overall: ${result.overallLevel}`);
  console.log("");

  for (const section of result.sections) {
    console.log(`${section.level} ${section.title}`);
    console.log(section.summary);
    for (const detail of section.details) {
      console.log(`- ${detail}`);
    }
    console.log("");
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

  const buildCheck = runBuildCheck(args.skipBuild);
  const result = await runGoogleAdsProductGate({
    businessId: args.businessId,
    startDate: args.startDate,
    endDate: args.endDate,
    sinceIso: args.sinceIso,
    strict: args.strict,
    skipAdmin: args.skipAdmin,
    buildCheck,
  });

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printText(result);
  }

  if (args.strict && shouldGoogleAdsProductGateFailStrict(result)) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
