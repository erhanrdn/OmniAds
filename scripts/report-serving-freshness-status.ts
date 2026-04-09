import { configureOperationalScriptRuntime } from "@/scripts/_operational-runtime";
import { readServingFreshnessStatus } from "@/lib/serving-freshness-status";

configureOperationalScriptRuntime();

async function withStartupLogsSilenced<T>(callback: () => Promise<T>) {
  const originalInfo = console.info;
  console.info = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].startsWith("[startup]")) {
      return;
    }
    originalInfo(...args);
  };
  try {
    return await callback();
  } finally {
    console.info = originalInfo;
  }
}

function parseArgs(argv: string[]) {
  const [businessId, ...rest] = argv;
  const options = {
    businessId: businessId?.trim() || "",
    startDate: null as string | null,
    endDate: null as string | null,
    overviewProvider: null as "google" | "meta" | null,
    demographicsDimension: null as string | null,
  };

  for (const arg of rest) {
    if (arg.startsWith("--start-date=")) {
      options.startDate = arg.slice("--start-date=".length).trim() || null;
      continue;
    }
    if (arg.startsWith("--end-date=")) {
      options.endDate = arg.slice("--end-date=".length).trim() || null;
      continue;
    }
    if (arg.startsWith("--overview-provider=")) {
      const value = arg.slice("--overview-provider=".length).trim();
      if (value === "google" || value === "meta") {
        options.overviewProvider = value;
      }
      continue;
    }
    if (arg.startsWith("--demographics-dimension=")) {
      options.demographicsDimension =
        arg.slice("--demographics-dimension=".length).trim() || null;
      continue;
    }
  }

  return options;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.businessId) {
    console.error(
      "usage: node --import tsx scripts/report-serving-freshness-status.ts <businessId> [--start-date=YYYY-MM-DD] [--end-date=YYYY-MM-DD] [--overview-provider=google|meta] [--demographics-dimension=<dimension>]",
    );
    process.exit(1);
  }

  await withStartupLogsSilenced(async () => {
    const result = await readServingFreshnessStatus({
      businessId: args.businessId,
      startDate: args.startDate,
      endDate: args.endDate,
      overviewProvider: args.overviewProvider,
      demographicsDimension: args.demographicsDimension,
    });

    console.log(JSON.stringify(result, null, 2));
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
