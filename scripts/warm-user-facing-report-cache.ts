import {
  type UserFacingReportCacheType,
  USER_FACING_REPORT_CACHE_TYPES,
  warmUserFacingReportCache,
} from "@/lib/user-facing-report-cache-owners";

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

function normalizeReportType(value: string): UserFacingReportCacheType {
  if ((USER_FACING_REPORT_CACHE_TYPES as readonly string[]).includes(value)) {
    return value as UserFacingReportCacheType;
  }
  throw new Error(`Unsupported report type: ${value}`);
}

async function main() {
  const businessId = readRequiredFlag("business-id");
  const reportType = normalizeReportType(readRequiredFlag("report-type"));
  const startDate = readRequiredFlag("start-date");
  const endDate = readRequiredFlag("end-date");
  const dimension = readFlag("dimension");

  const result = await warmUserFacingReportCache({
    businessId,
    reportType,
    startDate,
    endDate,
    dimension,
  });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

