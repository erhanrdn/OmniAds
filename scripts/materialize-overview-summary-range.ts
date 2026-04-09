import { materializeOverviewSummaryRangeForBusiness } from "@/lib/overview-summary-range-owner";

function readFlag(name: string) {
  const argv = process.argv.slice(2);
  const flag = `--${name}`;
  const index = argv.indexOf(flag);
  if (index === -1) return null;
  return argv[index + 1] ?? null;
}

function readRequiredFlag(name: string) {
  const value = readFlag(name);
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing required flag --${name}`);
  }
  return value;
}

function normalizeProvider(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "google_ads") return "google";
  if (normalized === "google" || normalized === "meta") return normalized;
  throw new Error(`Unsupported provider: ${value}`);
}

async function main() {
  const businessId = readRequiredFlag("business-id");
  const provider = normalizeProvider(readRequiredFlag("provider"));
  const startDate = readRequiredFlag("start-date");
  const endDate = readRequiredFlag("end-date");
  const providerAccountIdsRaw = readFlag("provider-account-ids");
  const providerAccountIds = providerAccountIdsRaw
    ? providerAccountIdsRaw
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : null;

  const result = await materializeOverviewSummaryRangeForBusiness({
    businessId,
    provider,
    startDate,
    endDate,
    providerAccountIds,
  });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

