import type { MetaLandingPageAdRecord } from "@/lib/meta/landing-pages-fetchers";
import { getMetaLandingUrlDiagnosticSignals } from "@/lib/meta/landing-url-resolver";

export interface MetaLandingPageRowSummary {
  accountId: string;
  adId: string;
  rawUrl: string | null;
  urlSource: string;
  objectType: string | null;
}

export interface MetaLandingPageSummary {
  adsScanned: number;
  resolved: number;
  unresolved: number;
  coverageRate: number;
  bySource: Record<string, number>;
  byObjectType: Record<string, { total: number; resolved: number; unresolved: number }>;
  unresolvedReasons: {
    missingObjectStorySpec: number;
    missingObjectStorySpecWithEffectiveStoryId: number;
    hasObjectStorySpecButNoKnownUrlField: number;
  };
  requestedLimit: number;
  totalAvailableRows: number;
}

export function buildEmptyMetaLandingPageSummary(limit: number): MetaLandingPageSummary {
  return {
    adsScanned: 0,
    resolved: 0,
    unresolved: 0,
    coverageRate: 0,
    bySource: {},
    byObjectType: {},
    unresolvedReasons: {
      missingObjectStorySpec: 0,
      missingObjectStorySpecWithEffectiveStoryId: 0,
      hasObjectStorySpecButNoKnownUrlField: 0,
    },
    requestedLimit: limit,
    totalAvailableRows: 0,
  };
}

export function summarizeMetaLandingPageRows(params: {
  rows: MetaLandingPageRowSummary[];
  adsByAccountId: Map<string, Map<string, MetaLandingPageAdRecord>>;
  limit: number;
  totalAvailableRows: number;
}): MetaLandingPageSummary {
  const summary = params.rows.reduce(
    (acc, row) => {
      acc.adsScanned += 1;
      const resolved = Boolean(row.rawUrl);
      if (resolved) {
        acc.resolved += 1;
      } else {
        acc.unresolved += 1;
        const ad = params.adsByAccountId.get(row.accountId)?.get(row.adId);
        const signals = getMetaLandingUrlDiagnosticSignals(ad?.creative);
        if (!signals.hasObjectStorySpec) {
          acc.unresolvedReasons.missingObjectStorySpec += 1;
          if (signals.hasEffectiveObjectStoryId) {
            acc.unresolvedReasons.missingObjectStorySpecWithEffectiveStoryId += 1;
          }
        } else {
          acc.unresolvedReasons.hasObjectStorySpecButNoKnownUrlField += 1;
        }
      }

      acc.bySource[row.urlSource] = (acc.bySource[row.urlSource] ?? 0) + 1;
      const objectTypeKey = row.objectType ?? "UNKNOWN";
      acc.byObjectType[objectTypeKey] ??= { total: 0, resolved: 0, unresolved: 0 };
      acc.byObjectType[objectTypeKey].total += 1;
      if (resolved) acc.byObjectType[objectTypeKey].resolved += 1;
      else acc.byObjectType[objectTypeKey].unresolved += 1;
      return acc;
    },
    {
      ...buildEmptyMetaLandingPageSummary(params.limit),
      totalAvailableRows: params.totalAvailableRows,
    }
  );

  summary.coverageRate =
    summary.adsScanned > 0 ? Number((summary.resolved / summary.adsScanned).toFixed(4)) : 0;

  return summary;
}
