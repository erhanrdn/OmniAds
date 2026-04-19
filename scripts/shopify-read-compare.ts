import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { getShopifyOverviewServingData } from "@/lib/overview-service";
import {
  getShopifyOverviewSummaryReadCandidate,
  type ShopifyOverviewServingMetadata,
} from "@/lib/shopify/read-adapter";
import type { ShopifyOverviewAggregate } from "@/lib/shopify/overview";
import type { ShopifyRevenueLedgerAggregate } from "@/lib/shopify/revenue-ledger";
import type { ShopifyWarehouseOverviewAggregate } from "@/lib/shopify/warehouse-overview";
import {
  configureOperationalScriptRuntime,
  runOperationalMigrationsIfEnabled,
} from "./_operational-runtime";

interface ParsedCliArgs {
  businessId: string;
  startDate: string;
  endDate: string;
  jsonOut: string | null;
}

export interface ShopifyReadCompareDiff {
  section: "aggregate" | "serving";
  field: string;
  expectedValue: unknown;
  actualValue: unknown;
}

function parseArgs(argv: string[]): Map<string, string> {
  const parsed = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value =
      argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[index + 1] : "true";
    parsed.set(key, value);
    if (value !== "true") index += 1;
  }
  return parsed;
}

export function parseShopifyReadCompareArgs(argv: string[]): ParsedCliArgs {
  const args = parseArgs(argv);
  const businessId = args.get("business-id") ?? args.get("businessId");
  const startDate = args.get("start-date") ?? args.get("startDate");
  const endDate = args.get("end-date") ?? args.get("endDate");
  if (!businessId || !startDate || !endDate) {
    throw new Error(
      "Missing required args. Required: --business-id --start-date --end-date",
    );
  }
  return {
    businessId,
    startDate,
    endDate,
    jsonOut: args.get("json-out") ?? args.get("jsonOut") ?? null,
  };
}

function stableSerialize(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) return value.map((entry) => stableSerialize(entry));
  if (typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = stableSerialize((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

function compareValues(
  expectedValue: unknown,
  actualValue: unknown,
  fieldPath: string,
  diffs: ShopifyReadCompareDiff[],
  section: ShopifyReadCompareDiff["section"],
  numericTolerance = 0.01,
) {
  const expected = expectedValue === undefined ? null : expectedValue;
  const actual = actualValue === undefined ? null : actualValue;
  if (typeof expected === "number" && typeof actual === "number") {
    if (Math.abs(expected - actual) > numericTolerance) {
      diffs.push({
        section,
        field: fieldPath,
        expectedValue: expected,
        actualValue: actual,
      });
    }
    return;
  }

  if (Array.isArray(expected) || Array.isArray(actual)) {
    const expectedArray = Array.isArray(expected) ? expected : [];
    const actualArray = Array.isArray(actual) ? actual : [];
    if (expectedArray.length !== actualArray.length) {
      diffs.push({
        section,
        field: fieldPath,
        expectedValue: stableSerialize(expectedArray),
        actualValue: stableSerialize(actualArray),
      });
      return;
    }
    for (let index = 0; index < expectedArray.length; index += 1) {
      compareValues(
        expectedArray[index],
        actualArray[index],
        `${fieldPath}[${index}]`,
        diffs,
        section,
        numericTolerance,
      );
    }
    return;
  }

  if (
    expected &&
    actual &&
    typeof expected === "object" &&
    typeof actual === "object"
  ) {
    const keys = Array.from(
      new Set([
        ...Object.keys(expected as Record<string, unknown>),
        ...Object.keys(actual as Record<string, unknown>),
      ]),
    ).sort();
    for (const childKey of keys) {
      compareValues(
        (expected as Record<string, unknown>)[childKey],
        (actual as Record<string, unknown>)[childKey],
        fieldPath ? `${fieldPath}.${childKey}` : childKey,
        diffs,
        section,
        numericTolerance,
      );
    }
    return;
  }

  if (Object.is(expected, actual)) return;
  if (stableSerialize(expected) === stableSerialize(actual)) return;
  diffs.push({
    section,
    field: fieldPath,
    expectedValue: stableSerialize(expected),
    actualValue: stableSerialize(actual),
  });
}

type ShopifyOverviewReadCandidate = Awaited<
  ReturnType<typeof getShopifyOverviewSummaryReadCandidate>
>;

function buildWarehouseBackedAggregate(input: {
  source: ShopifyWarehouseOverviewAggregate | ShopifyRevenueLedgerAggregate;
  live: ShopifyOverviewAggregate | null;
}) {
  const liveDailyByDate = new Map(
    (input.live?.dailyTrends ?? []).map((row) => [row.date, row]),
  );
  return {
    revenue: input.source.revenue,
    purchases: input.source.purchases,
    averageOrderValue: input.source.averageOrderValue,
    grossRevenue: input.source.grossRevenue,
    refundedRevenue: input.source.refundedRevenue,
    returnEvents: input.source.returnEvents,
    sessions: input.live?.sessions ?? null,
    conversionRate: input.live?.conversionRate ?? null,
    newCustomers: input.live?.newCustomers ?? null,
    returningCustomers: input.live?.returningCustomers ?? null,
    dailyTrends: input.source.daily.map((row) => {
      const liveRow = liveDailyByDate.get(row.date);
      return {
        date: row.date,
        revenue: row.netRevenue,
        grossRevenue: row.orderRevenue,
        refundedRevenue: row.refundedRevenue,
        returnEvents: row.returnEvents,
        purchases: row.orders,
        sessions: liveRow?.sessions ?? null,
        conversionRate: liveRow?.conversionRate ?? null,
        newCustomers: liveRow?.newCustomers ?? null,
        returningCustomers: liveRow?.returningCustomers ?? null,
      };
    }),
  } satisfies ShopifyOverviewAggregate;
}

export function buildExpectedShopifyOverviewServingData(
  candidate: ShopifyOverviewReadCandidate,
) {
  const aggregate =
    candidate.preferredSource === "warehouse" && candidate.warehouse
      ? buildWarehouseBackedAggregate({
          source: candidate.warehouse,
          live: candidate.live,
        })
      : candidate.preferredSource === "ledger" && candidate.ledger
        ? buildWarehouseBackedAggregate({
            source: candidate.ledger,
            live: candidate.live,
          })
        : candidate.live;
  return {
    aggregate,
    serving: candidate.servingMetadata,
  } satisfies {
    aggregate: ShopifyOverviewAggregate | null;
    serving: ShopifyOverviewServingMetadata;
  };
}

export function buildShopifyReadCompareArtifact(input: {
  businessId: string;
  startDate: string;
  endDate: string;
  candidate: ShopifyOverviewReadCandidate;
  actual: Awaited<ReturnType<typeof getShopifyOverviewServingData>>;
}) {
  const expected = buildExpectedShopifyOverviewServingData(input.candidate);
  const diffs: ShopifyReadCompareDiff[] = [];
  compareValues(expected.aggregate, input.actual.aggregate, "", diffs, "aggregate");
  compareValues(expected.serving, input.actual.serving, "", diffs, "serving");

  return {
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
    capturedAt: new Date().toISOString(),
    preferredSource: input.candidate.preferredSource,
    canServeWarehouse: input.candidate.canServeWarehouse,
    canaryEnabled: input.candidate.canaryEnabled,
    decisionReasons: input.candidate.decisionReasons,
    divergence: input.candidate.divergence,
    ledgerConsistency: input.candidate.ledgerConsistency,
    expected,
    actual: input.actual,
    blockingDiffCount: diffs.length,
    blockingDiffs: diffs,
  };
}

async function main() {
  const runtime = configureOperationalScriptRuntime();
  const parsed = parseShopifyReadCompareArgs(process.argv.slice(2));
  await runOperationalMigrationsIfEnabled(runtime);

  const candidate = await getShopifyOverviewSummaryReadCandidate({
    businessId: parsed.businessId,
    startDate: parsed.startDate,
    endDate: parsed.endDate,
  });
  const actual = await getShopifyOverviewServingData({
    businessId: parsed.businessId,
    startDate: parsed.startDate,
    endDate: parsed.endDate,
  });
  const artifact = buildShopifyReadCompareArtifact({
    businessId: parsed.businessId,
    startDate: parsed.startDate,
    endDate: parsed.endDate,
    candidate,
    actual,
  });

  if (parsed.jsonOut) {
    writeFileSync(resolve(parsed.jsonOut), JSON.stringify(artifact, null, 2));
  }
  console.log(JSON.stringify(artifact, null, 2));
}

if (process.argv[1]) {
  const entryHref = pathToFileURL(resolve(process.argv[1])).href;
  if (import.meta.url === entryHref) {
    main().catch((error) => {
      console.error(error);
      process.exit(1);
    });
  }
}
