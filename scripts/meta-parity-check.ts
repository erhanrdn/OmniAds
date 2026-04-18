import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { getMetaCampaignsForRange } from "@/lib/meta/campaigns-source";
import { getMetaAdSetsForRange } from "@/lib/meta/adsets-source";
import { getMetaBreakdownsForRange } from "@/lib/meta/breakdowns-source";
import { getMetaCreativesDbPayload } from "@/lib/meta/creatives-api";
import {
  coerceRawCreativeRow,
  getMetaCreativeHistoryWarehouseRows,
  hydrateWarehouseCreativeMetrics,
} from "@/lib/meta/creatives-warehouse";
import { fetchAssignedAccountIds } from "@/lib/meta/creatives-fetchers";
import { buildMetaCreativeApiRowLightweight } from "@/lib/meta/creatives-service-support";
import {
  groupRows,
  sortRows,
} from "@/lib/meta/creatives-row-mappers";
import {
  getMetaWarehouseAdSets,
  getMetaWarehouseBreakdowns,
  getMetaWarehouseCampaignTable,
} from "@/lib/meta/serving";
import type { FormatFilter, MetaCreativeApiRow, RawCreativeRow, SortKey } from "@/lib/meta/creatives-types";

export const META_SHORT_GATE_PRIMARY_CANARY = {
  label: "TheSwaf",
  businessId: "172d0ab8-495b-4679-a4c6-ffa404c389d3",
} as const;

export const META_SHORT_GATE_RELEASE_CANARIES = [
  META_SHORT_GATE_PRIMARY_CANARY,
  {
    label: "Grandmix",
    businessId: "5dbc7147-f051-4681-a4d6-20617170074f",
  },
  {
    label: "IwaStore",
    businessId: "f8a3b5ac-588c-462f-8702-11cd24ff3cd2",
  },
] as const;

export interface MetaParityDiff {
  surface: string;
  kind:
    | "surface_status"
    | "missing_current_row"
    | "missing_reference_row"
    | "field_mismatch"
    | "creative_business_fallback"
    | "surface_note";
  key: string;
  field?: string;
  currentValue?: unknown;
  referenceValue?: unknown;
  note?: string;
}

interface ParsedCliArgs {
  businessId: string;
  startDate: string;
  endDate: string;
  providerAccountIds: string[] | null;
  creativeBusinessId: string | null;
  jsonOut: string | null;
}

type CreativePayloadProbe = {
  status?: string;
  rows?: Array<unknown> | null;
};

export interface SelectedCreativeBusiness {
  requestedBusinessId: string;
  selectedBusinessId: string;
  selectedBusinessLabel: string;
  fallbackUsed: boolean;
  reason: "override" | "primary_non_zero" | "primary_zero_rows" | "fallback_non_zero" | "primary_non_ok";
  attempts: Array<{
    label: string;
    businessId: string;
    status: string | null;
    rowCount: number | null;
  }>;
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

export function parseMetaParityCliArgs(argv: string[]): ParsedCliArgs {
  const args = parseArgs(argv);
  const businessId = args.get("business-id") ?? args.get("businessId");
  const startDate = args.get("start-date") ?? args.get("startDate");
  const endDate = args.get("end-date") ?? args.get("endDate");
  if (!businessId || !startDate || !endDate) {
    throw new Error(
      "Missing required args. Required: --business-id --start-date --end-date",
    );
  }
  const providerAccountIds = (() => {
    const value = args.get("provider-account-ids") ?? args.get("providerAccountIds");
    if (!value) return null;
    const rows = Array.from(
      new Set(
        value
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean),
      ),
    );
    return rows.length > 0 ? rows : null;
  })();
  return {
    businessId,
    startDate,
    endDate,
    providerAccountIds,
    creativeBusinessId:
      args.get("creative-business-id") ?? args.get("creativeBusinessId") ?? null,
    jsonOut: args.get("json-out") ?? args.get("jsonOut") ?? null,
  };
}

function stableSerialize(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null) return null;
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

function normalizeFormatRows(rows: RawCreativeRow[], format: FormatFilter) {
  if (format === "all") return rows;
  return rows.filter((row) => row.format === format);
}

function buildCreativeUsageMap(rows: RawCreativeRow[]) {
  const usage = new Map<string, Set<string>>();
  for (const row of rows) {
    const bucket = usage.get(row.creative_id) ?? new Set<string>();
    bucket.add(row.id);
    usage.set(row.creative_id, bucket);
  }
  return usage;
}

function compareValues(
  currentValue: unknown,
  referenceValue: unknown,
  fieldPath: string,
  diffs: MetaParityDiff[],
  surface: string,
  key: string,
  numericTolerance = 0.01,
) {
  const current = currentValue === undefined ? null : currentValue;
  const reference = referenceValue === undefined ? null : referenceValue;
  if (typeof current === "number" && typeof reference === "number") {
    if (Math.abs(current - reference) > numericTolerance) {
      diffs.push({
        surface,
        kind: "field_mismatch",
        key,
        field: fieldPath,
        currentValue: current,
        referenceValue: reference,
      });
    }
    return;
  }

  if (Array.isArray(current) || Array.isArray(reference)) {
    const currentArray = Array.isArray(current) ? current : [];
    const referenceArray = Array.isArray(reference) ? reference : [];
    if (currentArray.length !== referenceArray.length) {
      diffs.push({
        surface,
        kind: "field_mismatch",
        key,
        field: fieldPath,
        currentValue: stableSerialize(currentArray),
        referenceValue: stableSerialize(referenceArray),
      });
      return;
    }
    for (let index = 0; index < currentArray.length; index += 1) {
      compareValues(
        currentArray[index],
        referenceArray[index],
        `${fieldPath}[${index}]`,
        diffs,
        surface,
        key,
        numericTolerance,
      );
    }
    return;
  }

  if (
    current &&
    reference &&
    typeof current === "object" &&
    typeof reference === "object"
  ) {
    const keys = Array.from(
      new Set([
        ...Object.keys(current as Record<string, unknown>),
        ...Object.keys(reference as Record<string, unknown>),
      ]),
    ).sort();
    for (const childKey of keys) {
      compareValues(
        (current as Record<string, unknown>)[childKey],
        (reference as Record<string, unknown>)[childKey],
        fieldPath ? `${fieldPath}.${childKey}` : childKey,
        diffs,
        surface,
        key,
        numericTolerance,
      );
    }
    return;
  }

  if (Object.is(current, reference)) return;
  if (stableSerialize(current) === stableSerialize(reference)) return;
  diffs.push({
    surface,
    kind: "field_mismatch",
    key,
    field: fieldPath,
    currentValue: stableSerialize(current),
    referenceValue: stableSerialize(reference),
  });
}

export function compareKeyedParityRows<T extends object>(input: {
  surface: string;
  keyField: string;
  currentRows: T[];
  referenceRows: T[];
  numericTolerance?: number;
}) {
  const currentMap = new Map<string, Record<string, unknown>>();
  const referenceMap = new Map<string, Record<string, unknown>>();
  for (const row of input.currentRows) {
    const record = row as Record<string, unknown>;
    currentMap.set(String(record[input.keyField] ?? ""), record);
  }
  for (const row of input.referenceRows) {
    const record = row as Record<string, unknown>;
    referenceMap.set(String(record[input.keyField] ?? ""), record);
  }
  const keys = Array.from(new Set([...currentMap.keys(), ...referenceMap.keys()])).sort();
  const blockingDiffs: MetaParityDiff[] = [];
  for (const key of keys) {
    const currentRow = currentMap.get(key);
    const referenceRow = referenceMap.get(key);
    if (!currentRow) {
      blockingDiffs.push({
        surface: input.surface,
        kind: "missing_current_row",
        key,
        referenceValue: stableSerialize(referenceRow),
      });
      continue;
    }
    if (!referenceRow) {
      blockingDiffs.push({
        surface: input.surface,
        kind: "missing_reference_row",
        key,
        currentValue: stableSerialize(currentRow),
      });
      continue;
    }
    const fieldKeys = Array.from(
      new Set([...Object.keys(currentRow), ...Object.keys(referenceRow)]),
    ).sort();
    for (const fieldKey of fieldKeys) {
      compareValues(
        currentRow[fieldKey],
        referenceRow[fieldKey],
        fieldKey,
        blockingDiffs,
        input.surface,
        key,
        input.numericTolerance,
      );
    }
  }
  return {
    surface: input.surface,
    currentRowCount: input.currentRows.length,
    referenceRowCount: input.referenceRows.length,
    blockingDiffs,
    nonBlockingDiffs: [] as MetaParityDiff[],
  };
}

export async function selectMetaCreativeGateBusiness(input: {
  requestedBusinessId: string;
  overrideBusinessId?: string | null;
  fetchPayload: (businessId: string) => Promise<CreativePayloadProbe>;
}) {
  if (input.overrideBusinessId) {
    const override =
      META_SHORT_GATE_RELEASE_CANARIES.find(
        (candidate) => candidate.businessId === input.overrideBusinessId,
      ) ?? {
        label: input.overrideBusinessId,
        businessId: input.overrideBusinessId,
      };
    return {
      requestedBusinessId: input.requestedBusinessId,
      selectedBusinessId: override.businessId,
      selectedBusinessLabel: override.label,
      fallbackUsed: override.businessId !== input.requestedBusinessId,
      reason: "override",
      attempts: [],
    } satisfies SelectedCreativeBusiness;
  }

  const attempts: SelectedCreativeBusiness["attempts"] = [];
  for (const candidate of META_SHORT_GATE_RELEASE_CANARIES) {
    const payload = await input.fetchPayload(candidate.businessId);
    const rowCount = Array.isArray(payload.rows) ? payload.rows.length : null;
    const status = payload.status ?? null;
    attempts.push({
      label: candidate.label,
      businessId: candidate.businessId,
      status,
      rowCount,
    });
    if (candidate.businessId === input.requestedBusinessId) {
      if (status === "ok" && rowCount === 0) {
        continue;
      }
      return {
        requestedBusinessId: input.requestedBusinessId,
        selectedBusinessId: candidate.businessId,
        selectedBusinessLabel: candidate.label,
        fallbackUsed: false,
        reason: status === "ok" ? "primary_non_zero" : "primary_non_ok",
        attempts,
      };
    }
    if (status === "ok" && (rowCount ?? 0) > 0) {
      return {
        requestedBusinessId: input.requestedBusinessId,
        selectedBusinessId: candidate.businessId,
        selectedBusinessLabel: candidate.label,
        fallbackUsed: true,
        reason: "fallback_non_zero",
        attempts,
      };
    }
  }

  return {
    requestedBusinessId: input.requestedBusinessId,
    selectedBusinessId: input.requestedBusinessId,
    selectedBusinessLabel:
      META_SHORT_GATE_RELEASE_CANARIES.find(
        (candidate) => candidate.businessId === input.requestedBusinessId,
      )?.label ?? input.requestedBusinessId,
    fallbackUsed: false,
    reason: "primary_zero_rows",
    attempts,
  };
}

async function buildLegacyCreativeReferencePayload(input: {
  businessId: string;
  startDate: string;
  endDate: string;
}) {
  const providerAccountIds = await fetchAssignedAccountIds(input.businessId);
  if (providerAccountIds.length === 0) {
    return { status: "no_accounts_assigned", rows: [] as MetaCreativeApiRow[] };
  }
  const sourceRows = await getMetaCreativeHistoryWarehouseRows({
    businessId: input.businessId,
    start: input.startDate,
    end: input.endDate,
    providerAccountIds,
  });
  const rawRows = sourceRows.reduce<RawCreativeRow[]>((acc, row) => {
    const projection = coerceRawCreativeRow(row.payloadJson);
    if (!projection) return acc;
    acc.push(
      hydrateWarehouseCreativeMetrics({
        row: projection,
        factRow: row,
      }),
    );
    return acc;
  }, []);
  const filteredRows = normalizeFormatRows(rawRows, "all");
  const usageMap = buildCreativeUsageMap(filteredRows);
  const groupedRows = groupRows(filteredRows, "creative", usageMap);
  const sortedRows = sortRows(groupedRows, "roas" satisfies SortKey);
  return {
    status: "ok" as const,
    rows: sortedRows.map((row) =>
      buildMetaCreativeApiRowLightweight({
        row,
        includeDebugFields: false,
      }),
    ),
  };
}

async function buildMetaParityArtifact(input: ParsedCliArgs) {
  const assignedProviderAccountIds =
    input.providerAccountIds ?? (await fetchAssignedAccountIds(input.businessId));
  const currentCampaigns = await getMetaCampaignsForRange({
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
    includePrev: true,
  });
  const currentAdSets = await getMetaAdSetsForRange({
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
    includePrev: true,
  });
  const currentBreakdowns = await getMetaBreakdownsForRange({
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
  });
  const creativeSelection = await selectMetaCreativeGateBusiness({
    requestedBusinessId: input.businessId,
    overrideBusinessId: input.creativeBusinessId,
    fetchPayload: async (businessId) =>
      getMetaCreativesDbPayload({
        businessId,
        start: input.startDate,
        end: input.endDate,
        groupBy: "creative",
        format: "all",
        sort: "roas",
        mediaMode: "metadata",
      }),
  });
  const currentCreatives = await getMetaCreativesDbPayload({
    businessId: creativeSelection.selectedBusinessId,
    start: input.startDate,
    end: input.endDate,
    groupBy: "creative",
    format: "all",
    sort: "roas",
    mediaMode: "metadata",
  });

  const referenceCampaigns = await getMetaWarehouseCampaignTable({
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
    providerAccountIds: assignedProviderAccountIds,
    includePrev: true,
  });
  const referenceAdSets = await getMetaWarehouseAdSets({
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
    providerAccountIds: assignedProviderAccountIds,
    includePrev: true,
  });
  const referenceBreakdowns = await getMetaWarehouseBreakdowns({
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
    providerAccountIds: assignedProviderAccountIds,
  });
  const referenceCreatives = await buildLegacyCreativeReferencePayload({
    businessId: creativeSelection.selectedBusinessId,
    startDate: input.startDate,
    endDate: input.endDate,
  });

  const campaignSurface = compareKeyedParityRows({
    surface: "campaigns",
    keyField: "id",
    currentRows: currentCampaigns.rows,
    referenceRows: referenceCampaigns,
  });
  const adSetSurface = compareKeyedParityRows({
    surface: "adsets",
    keyField: "id",
    currentRows: currentAdSets.rows,
    referenceRows: referenceAdSets,
  });
  const creativeSurface = compareKeyedParityRows({
    surface: "creatives",
    keyField: "id",
    currentRows: currentCreatives.rows ?? [],
    referenceRows: referenceCreatives.rows,
  });
  const breakdownSurfaces = [
    compareKeyedParityRows({
      surface: "breakdowns.age",
      keyField: "key",
      currentRows: currentBreakdowns.age,
      referenceRows: referenceBreakdowns.age,
    }),
    compareKeyedParityRows({
      surface: "breakdowns.location",
      keyField: "key",
      currentRows: currentBreakdowns.location,
      referenceRows: referenceBreakdowns.location,
    }),
    compareKeyedParityRows({
      surface: "breakdowns.placement",
      keyField: "key",
      currentRows: currentBreakdowns.placement,
      referenceRows: referenceBreakdowns.placement,
    }),
    compareKeyedParityRows({
      surface: "breakdowns.budget.campaign",
      keyField: "key",
      currentRows: currentBreakdowns.budget.campaign,
      referenceRows: referenceBreakdowns.budget.campaign,
    }),
    compareKeyedParityRows({
      surface: "breakdowns.budget.adset",
      keyField: "key",
      currentRows: currentBreakdowns.budget.adset,
      referenceRows: referenceBreakdowns.budget.adset,
    }),
  ];

  const blockingDiffs = [
    ...(currentCampaigns.status === "ok"
      ? []
      : [
          {
            surface: "campaigns",
            kind: "surface_status" as const,
            key: "campaigns",
            currentValue: currentCampaigns.status ?? "unknown",
            referenceValue: "ok",
          },
        ]),
    ...(currentAdSets.status === "ok"
      ? []
      : [
          {
            surface: "adsets",
            kind: "surface_status" as const,
            key: "adsets",
            currentValue: currentAdSets.status ?? "unknown",
            referenceValue: "ok",
          },
        ]),
    ...(currentBreakdowns.status === "ok"
      ? []
      : [
          {
            surface: "breakdowns",
            kind: "surface_status" as const,
            key: "breakdowns",
            currentValue: currentBreakdowns.status ?? "unknown",
            referenceValue: "ok",
          },
        ]),
    ...(currentCreatives.status === "ok"
      ? []
      : [
          {
            surface: "creatives",
            kind: "surface_status" as const,
            key: "creatives",
            currentValue: currentCreatives.status ?? "unknown",
            referenceValue: "ok",
          },
        ]),
    ...campaignSurface.blockingDiffs,
    ...adSetSurface.blockingDiffs,
    ...creativeSurface.blockingDiffs,
    ...breakdownSurfaces.flatMap((surface) => surface.blockingDiffs),
  ];

  const nonBlockingDiffs: MetaParityDiff[] = [
    ...(creativeSelection.fallbackUsed
      ? [
          {
            surface: "creatives",
            kind: "creative_business_fallback" as const,
            key: creativeSelection.selectedBusinessId,
            note: `Primary canary returned zero creative rows; using ${creativeSelection.selectedBusinessLabel}.`,
          },
        ]
      : []),
    ...(currentCampaigns.isPartial || currentCampaigns.notReadyReason
      ? [
          {
            surface: "campaigns",
            kind: "surface_note" as const,
            key: "campaigns",
            note: currentCampaigns.notReadyReason ?? "Campaigns surface is partial.",
          },
        ]
      : []),
    ...(currentAdSets.isPartial || currentAdSets.notReadyReason
      ? [
          {
            surface: "adsets",
            kind: "surface_note" as const,
            key: "adsets",
            note: currentAdSets.notReadyReason ?? "Ad sets surface is partial.",
          },
        ]
      : []),
    ...(currentBreakdowns.isPartial || currentBreakdowns.notReadyReason
      ? [
          {
            surface: "breakdowns",
            kind: "surface_note" as const,
            key: "breakdowns",
            note: currentBreakdowns.notReadyReason ?? "Breakdowns surface is partial.",
          },
        ]
      : []),
  ];

  return stableSerialize({
    capturedAt: new Date().toISOString(),
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
    providerAccountIds: assignedProviderAccountIds,
    creativeSelection,
    blockingDiffs,
    nonBlockingDiffs,
    summary: {
      blockingDiffCount: blockingDiffs.length,
      nonBlockingDiffCount: nonBlockingDiffs.length,
      surfaces: [
        campaignSurface,
        adSetSurface,
        ...breakdownSurfaces,
        creativeSurface,
      ].map((surface) => ({
        surface: surface.surface,
        currentRowCount: surface.currentRowCount,
        referenceRowCount: surface.referenceRowCount,
        blockingDiffCount: surface.blockingDiffs.length,
      })),
    },
  });
}

async function main() {
  const parsed = parseMetaParityCliArgs(process.argv.slice(2));
  const artifact = await buildMetaParityArtifact(parsed);
  if (parsed.jsonOut) {
    writeFileSync(resolve(parsed.jsonOut), JSON.stringify(artifact, null, 2));
  }
  console.log(JSON.stringify(artifact, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
