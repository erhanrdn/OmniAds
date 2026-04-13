import { addDaysToIsoDate } from "@/lib/google-ads/history";
import {
  GOOGLE_ADS_ADVISOR_READY_WINDOW_DAYS,
  GOOGLE_ADS_SEARCH_TERM_DAILY_RETENTION_DAYS,
} from "@/lib/google-ads/google-contract";
import { readGoogleAdsSearchIntelligenceCoverage } from "@/lib/google-ads/search-intelligence-storage";
import {
  executeGoogleAdsRetentionPolicyDryRunOnly,
  getGoogleAdsRetentionRuntimeStatus,
} from "@/lib/google-ads/warehouse-retention";
import {
  getGoogleAdsSearchIntelligenceReport,
  getGoogleAdsSearchTermsReport,
} from "@/lib/google-ads/serving";

function todayIsoUtc() {
  return new Date().toISOString().slice(0, 10);
}

function uniqueStrings(values: unknown[]) {
  return Array.from(
    new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))
  );
}

export interface GoogleAdsRetentionCanaryVerification {
  businessId: string;
  accountId: string | null;
  asOfDate: string;
  passed: boolean;
  blockers: string[];
  retentionRuntime: ReturnType<typeof getGoogleAdsRetentionRuntimeStatus> & {
    defaultExecutionDisabled: boolean;
  };
  rawHotWindow: {
    retentionDays: number;
    supportStartDate: string;
    probeStartDate: string;
    probeEndDate: string;
    outsideHotWindow: boolean;
  };
  rawSearchTermsProbe: {
    rowCount: number;
    warnings: string[];
    sources: string[];
  };
  searchIntelligenceProbe: {
    rowCount: number;
    warnings: string[];
    sources: string[];
    aggregateBacked: boolean;
  };
  recentAdvisorSupport: {
    startDate: string;
    endDate: string;
    completedDays: number;
    readyThroughDate: string | null;
    ready: boolean;
  };
  retentionDryRun: {
    rawHotTables: Array<{
      tableName: string;
      cutoffDate: string;
      observed: boolean;
      eligibleRows: number | null;
      oldestEligibleValue: string | null;
      newestEligibleValue: string | null;
      retainedRows: number | null;
      latestRetainedValue: string | null;
    }>;
  };
}

export async function verifyGoogleAdsRetentionCanary(input: {
  businessId: string;
  accountId?: string | null;
  asOfDate?: string | null;
  probeStartDate?: string | null;
  probeEndDate?: string | null;
  env?: NodeJS.ProcessEnv;
}): Promise<GoogleAdsRetentionCanaryVerification> {
  const asOfDate = input.asOfDate?.slice(0, 10) ?? todayIsoUtc();
  const supportStartDate = addDaysToIsoDate(
    asOfDate,
    -(GOOGLE_ADS_SEARCH_TERM_DAILY_RETENTION_DAYS - 1)
  );
  const probeEndDate =
    input.probeEndDate?.slice(0, 10) ?? addDaysToIsoDate(supportStartDate, -1);
  const probeStartDate =
    input.probeStartDate?.slice(0, 10) ?? addDaysToIsoDate(probeEndDate, -6);
  const recentAdvisorStartDate = addDaysToIsoDate(
    asOfDate,
    -(GOOGLE_ADS_ADVISOR_READY_WINDOW_DAYS - 1)
  );
  const retentionRuntime = getGoogleAdsRetentionRuntimeStatus(input.env);

  const [dryRun, rawSearchTermsProbe, searchIntelligenceProbe, recentAdvisorSupport] =
    await Promise.all([
      executeGoogleAdsRetentionPolicyDryRunOnly({
        asOfDate,
        env: input.env,
      }),
      getGoogleAdsSearchTermsReport({
        businessId: input.businessId,
        accountId: input.accountId ?? null,
        dateRange: "custom",
        customStart: probeStartDate,
        customEnd: probeEndDate,
      }),
      getGoogleAdsSearchIntelligenceReport({
        businessId: input.businessId,
        accountId: input.accountId ?? null,
        dateRange: "custom",
        customStart: probeStartDate,
        customEnd: probeEndDate,
      }),
      readGoogleAdsSearchIntelligenceCoverage({
        businessId: input.businessId,
        providerAccountId: input.accountId ?? null,
        startDate: recentAdvisorStartDate,
        endDate: asOfDate,
      }),
    ]);

  const rawHotTables = dryRun.dryRun
    .filter((row) =>
      [
        "google_ads_search_query_hot_daily",
        "google_ads_search_term_daily",
      ].includes(row.tableName)
    )
    .map((row) => ({
      tableName: row.tableName,
      cutoffDate: row.cutoffDate,
      observed: row.observed,
      eligibleRows: row.eligibleRows,
      oldestEligibleValue: row.oldestEligibleValue,
      newestEligibleValue: row.newestEligibleValue,
      retainedRows: row.retainedRows,
      latestRetainedValue: row.latestRetainedValue,
    }));

  const rawSources = uniqueStrings(
    rawSearchTermsProbe.rows.map((row) => row.source ?? row.matchSource ?? "unknown")
  );
  const intelligenceSources = uniqueStrings(
    searchIntelligenceProbe.rows.map((row) => row.source ?? row.matchSource ?? "unknown")
  );
  const aggregateBacked =
    searchIntelligenceProbe.rows.length > 0 &&
    intelligenceSources.every((source) =>
      ["top_query_weekly", "search_cluster_daily"].includes(source)
    );

  const blockers: string[] = [];
  if (probeEndDate >= supportStartDate) {
    blockers.push(
      `Probe window ${probeStartDate}..${probeEndDate} is not older than the raw hot-window boundary ${supportStartDate}.`
    );
  }
  if (rawSearchTermsProbe.rows.length > 0) {
    blockers.push(
      `Raw search-term probe returned ${rawSearchTermsProbe.rows.length} row(s) outside the 120-day hot window.`
    );
  }
  if (searchIntelligenceProbe.rows.length === 0) {
    blockers.push(
      "Historical search-intelligence probe returned no additive rows outside the raw hot window."
    );
  } else if (!aggregateBacked) {
    blockers.push(
      `Historical search-intelligence probe was not aggregate-backed. Sources: ${intelligenceSources.join(", ")}.`
    );
  }
  if (recentAdvisorSupport.completedDays < GOOGLE_ADS_ADVISOR_READY_WINDOW_DAYS) {
    blockers.push(
      `Recent advisor support is incomplete: ${recentAdvisorSupport.completedDays}/${GOOGLE_ADS_ADVISOR_READY_WINDOW_DAYS} additive search-intelligence days.`
    );
  }

  return {
    businessId: input.businessId,
    accountId: input.accountId ?? null,
    asOfDate,
    passed: blockers.length === 0,
    blockers,
    retentionRuntime: {
      ...retentionRuntime,
      defaultExecutionDisabled: !retentionRuntime.executionEnabled,
    },
    rawHotWindow: {
      retentionDays: GOOGLE_ADS_SEARCH_TERM_DAILY_RETENTION_DAYS,
      supportStartDate,
      probeStartDate,
      probeEndDate,
      outsideHotWindow: probeEndDate < supportStartDate,
    },
    rawSearchTermsProbe: {
      rowCount: rawSearchTermsProbe.rows.length,
      warnings: rawSearchTermsProbe.meta.warnings,
      sources: rawSources,
    },
    searchIntelligenceProbe: {
      rowCount: searchIntelligenceProbe.rows.length,
      warnings: searchIntelligenceProbe.meta.warnings,
      sources: intelligenceSources,
      aggregateBacked,
    },
    recentAdvisorSupport: {
      startDate: recentAdvisorStartDate,
      endDate: asOfDate,
      completedDays: recentAdvisorSupport.completedDays,
      readyThroughDate: recentAdvisorSupport.readyThroughDate,
      ready:
        recentAdvisorSupport.completedDays >= GOOGLE_ADS_ADVISOR_READY_WINDOW_DAYS,
    },
    retentionDryRun: {
      rawHotTables,
    },
  };
}
