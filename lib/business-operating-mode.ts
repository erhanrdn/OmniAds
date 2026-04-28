import type { MetaBreakdownsResponse } from "@/app/api/meta/breakdowns/route";
import type { MetaCampaignsResponse } from "@/app/api/meta/campaigns/route";
import { buildOperatorDecisionMetadata } from "@/lib/operator-decision-metadata";
import { buildDecisionFreshness } from "@/lib/decision-trust/kernel";
import { buildDecisionSurfaceAuthority } from "@/lib/decision-trust/surface";
import type {
  AccountOperatingMode,
  AccountOperatingModePayload,
  BusinessCommercialTruthSnapshot,
  BusinessCountryEconomicsRow,
} from "@/src/types/business-commercial";
import type { DecisionSafeActionLabel } from "@/src/types/decision-trust";

interface AggregatedPerformanceMetrics {
  spend: number;
  revenue: number;
  purchases: number;
  roas: number | null;
  cpa: number | null;
  campaignCount: number;
}

interface GeoPerformanceShare {
  countryCode: string;
  label: string;
  spend: number;
  spendShare: number;
  revenue: number;
  roas: number | null;
}

export interface OperatingModePlatformSnapshot {
  totals: AggregatedPerformanceMetrics;
  geoShares: GeoPerformanceShare[];
  topCampaigns: Array<{
    id: string;
    name: string;
    roas: number | null;
    spend: number;
  }>;
  hasCampaignData: boolean;
  hasLocationData: boolean;
}

function round(input: number, precision = 2) {
  return Number(input.toFixed(precision));
}

function formatCurrency(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "Unavailable";
  return `$${round(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatRatio(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "Unavailable";
  return `${round(value)}x`;
}

function isCriticalIssue(status: string | null | undefined) {
  return status === "critical";
}

function isWatchIssue(status: string | null | undefined) {
  return status === "watch";
}

function isPromoActiveOnDate(
  startDate: string,
  endDate: string,
  asOfDate: string,
) {
  return startDate <= asOfDate && endDate >= asOfDate;
}

function buildPerformanceSnapshot(
  campaigns: MetaCampaignsResponse | null,
  breakdowns: MetaBreakdownsResponse | null,
): OperatingModePlatformSnapshot {
  const rows = campaigns?.rows ?? [];
  const spend = rows.reduce((sum, row) => sum + Number(row.spend ?? 0), 0);
  const revenue = rows.reduce((sum, row) => sum + Number(row.revenue ?? 0), 0);
  const purchases = rows.reduce((sum, row) => sum + Number(row.purchases ?? 0), 0);
  const totals = {
    spend,
    revenue,
    purchases,
    roas: spend > 0 ? revenue / spend : null,
    cpa: purchases > 0 ? spend / purchases : null,
    campaignCount: rows.length,
  };

  const locationRows = breakdowns?.location ?? [];
  const locationSpend = locationRows.reduce((sum, row) => sum + Number(row.spend ?? 0), 0);
  const geoShares = locationRows
    .map((row) => ({
      countryCode: String(row.label ?? row.key ?? "").trim().toUpperCase(),
      label: String(row.label ?? row.key ?? "Unknown"),
      spend: Number(row.spend ?? 0),
      spendShare:
        locationSpend > 0 ? Number(row.spend ?? 0) / locationSpend : 0,
      revenue: Number(row.revenue ?? 0),
      roas: Number(row.spend ?? 0) > 0 ? Number(row.revenue ?? 0) / Number(row.spend ?? 0) : null,
    }))
    .filter((row) => row.countryCode.length > 0)
    .sort((left, right) => right.spend - left.spend)
    .slice(0, 5);

  return {
    totals,
    geoShares,
    topCampaigns: rows
      .map((row) => ({
        id: row.id,
        name: row.name,
        roas: Number(row.spend ?? 0) > 0 ? Number(row.revenue ?? 0) / Number(row.spend ?? 0) : null,
        spend: Number(row.spend ?? 0),
      }))
      .sort((left, right) => right.spend - left.spend)
      .slice(0, 3),
    hasCampaignData: rows.length > 0,
    hasLocationData: geoShares.length > 0,
  };
}

function findGeoConstraints(
  geoRows: BusinessCountryEconomicsRow[],
  geoShares: GeoPerformanceShare[],
) {
  const shareByCountry = new Map(
    geoShares.map((row) => [row.countryCode.toUpperCase(), row]),
  );
  return geoRows
    .map((row) => ({
      row,
      share: shareByCountry.get(row.countryCode.toUpperCase()) ?? null,
    }))
    .filter(
      ({ row, share }) =>
        row.scaleOverride !== "default" ||
        row.serviceability !== "full" ||
        (share?.spendShare ?? 0) >= 0.2,
    );
}

function evaluatePerformanceAgainstTargets(
  snapshot: BusinessCommercialTruthSnapshot,
  platform: OperatingModePlatformSnapshot,
) {
  const targetPack = snapshot.targetPack;
  const roas = platform.totals.roas;
  const cpa = platform.totals.cpa;

  const meetsTargetRoas =
    targetPack?.targetRoas != null && roas != null ? roas >= targetPack.targetRoas : null;
  const belowBreakEvenRoas =
    targetPack?.breakEvenRoas != null && roas != null
      ? roas < targetPack.breakEvenRoas
      : null;
  const meetsTargetCpa =
    targetPack?.targetCpa != null && cpa != null ? cpa <= targetPack.targetCpa : null;
  const belowBreakEvenCpa =
    targetPack?.breakEvenCpa != null && cpa != null
      ? cpa > targetPack.breakEvenCpa
      : null;

  const meetsTarget =
    meetsTargetRoas === true ||
    meetsTargetCpa === true ||
    (targetPack?.targetRoas == null &&
      targetPack?.targetCpa == null &&
      platform.totals.roas != null &&
      platform.totals.roas >= 2.5);
  const belowBreakEven = belowBreakEvenRoas === true || belowBreakEvenCpa === true;
  const nearTarget =
    (targetPack?.targetRoas != null && roas != null
      ? roas >= targetPack.targetRoas * 0.9 && roas < targetPack.targetRoas
      : false) ||
    (targetPack?.targetCpa != null && cpa != null
      ? cpa <= targetPack.targetCpa * 1.1 && cpa > targetPack.targetCpa
      : false);

  return {
    meetsTarget,
    belowBreakEven,
    nearTarget,
  };
}

function guardrailsForMode(mode: AccountOperatingMode, context: {
  hasPromo: boolean;
  geoConstraints: ReturnType<typeof findGeoConstraints>;
  hasLandingConcern: boolean;
  hasMerchandisingConcern: boolean;
}) {
  if (mode === "Recovery") {
    return [
      "Do not scale budgets until the blocking site, feed, checkout, or stock issue clears.",
      "Keep spend focused on brand protection or must-run coverage only.",
      "Re-check conversion tracking and merchandising truth before resuming normal decision loops.",
    ];
  }
  if (mode === "Peak / Promo") {
    return [
      "Scale only while promo landing pages, inventory, and checkout remain stable.",
      "Keep promo messaging and site merchandising aligned with the active offer.",
      "Hold back if stock pressure or feed quality degrades during the promo window.",
    ];
  }
  if (mode === "Margin Protect") {
    return [
      "Favor restricted scaling and tighter GEO filters until break-even or target efficiency recovers.",
      "Shift spend away from constrained or low-margin geos first.",
      "Do not expand broad prospecting until contribution targets are back inside range.",
    ];
  }
  if (mode === "Exploit") {
    return [
      "Scale in controlled steps and keep the winning GEO mix intact.",
      "Watch landing-page and merchandising concerns before widening spend.",
      "Preserve the deterministic recommendation split; this mode is a decision guardrail, not AI commentary.",
    ];
  }
  if (mode === "Stabilize") {
    return [
      "Prefer incremental changes while signals remain mixed.",
      "Use GEO and promo context to narrow the next move before major budget shifts.",
      "Promote clean data capture and keep truth inputs current before increasing risk posture.",
    ];
  }
  return [
    "Avoid broad budget moves until more signal or more commercial truth is available.",
    "Fill in target pack, GEO economics, or operating constraints to raise confidence.",
    "Use creative and recommendation surfaces as supporting inputs, not replacements for missing commercial truth.",
  ];
}

function changeTriggersForMode(mode: AccountOperatingMode, primaryWindowLabel: string) {
  if (mode === "Recovery") {
    return [
      "Critical site, checkout, feed, or conversion blocker clears.",
      "Manual do-not-scale reason is removed.",
      "Blocked stock pressure returns to healthy.",
    ];
  }
  if (mode === "Peak / Promo") {
    return [
      "Promo window ends or severity is reduced.",
      "Stock pressure or checkout health worsens during the promo.",
      `${primaryWindowLabel} efficiency falls below break-even while the promo is active.`,
    ];
  }
  if (mode === "Margin Protect") {
    return [
      "ROAS or CPA returns above target or break-even thresholds.",
      "High-spend constrained GEOs are cleared or deprioritized cleanly.",
      "Landing-page or merchandising concerns are resolved.",
    ];
  }
  if (mode === "Exploit") {
    return [
      "Performance slips back toward target instead of materially beating it.",
      "A high-severity promo or blocker changes the account posture.",
      "Top GEO economics or serviceability constraints tighten.",
    ];
  }
  if (mode === "Stabilize") {
    return [
      "Signals become decisively above target, enabling Exploit.",
      "Signals fall below break-even, requiring Margin Protect.",
      "Signal volume drops low enough that Explore is safer.",
    ];
  }
  return [
    `Commercial truth is filled in and ${primaryWindowLabel} signal becomes strong enough for another mode.`,
    "A promo, blocker, or material GEO constraint becomes active.",
    `${primaryWindowLabel} purchases and spend reach meaningful signal volume.`,
  ];
}

function buildDegradedMode(input: {
  snapshot: BusinessCommercialTruthSnapshot;
  lowSignal: boolean;
  missingInputs: string[];
}) {
  const reasons: string[] = [];
  let confidenceCap: number | null = null;
  const safeActionLabels: DecisionSafeActionLabel[] = [];

  if (!input.snapshot.targetPack) {
    reasons.push("Target pack is missing, so aggressive pause/scale actions stay in review mode.");
    confidenceCap = 0.68;
    safeActionLabels.push("review_hold", "review_reduce", "degraded_no_scale");
  }
  if (!input.snapshot.operatingConstraints) {
    reasons.push("Operating constraints are missing, so commercial guardrails stay conservative.");
    confidenceCap = confidenceCap == null ? 0.72 : Math.min(confidenceCap, 0.72);
    safeActionLabels.push("review_hold", "monitor_low_truth");
  }
  if (input.lowSignal) {
    reasons.push("Live signal depth is thin, so decisions stay capped to review-safe actions.");
    confidenceCap = confidenceCap == null ? 0.62 : Math.min(confidenceCap, 0.62);
    safeActionLabels.push("review_hold", "monitor_low_truth");
  }

  return {
    active: reasons.length > 0 || input.missingInputs.length > 0,
    confidenceCap,
    reasons,
    safeActionLabels: Array.from(new Set(safeActionLabels)),
  } satisfies AccountOperatingModePayload["degradedMode"];
}

export function buildAccountOperatingMode(input: {
  businessId: string;
  startDate: string;
  endDate: string;
  snapshot: BusinessCommercialTruthSnapshot;
  campaigns: MetaCampaignsResponse | null;
  breakdowns: MetaBreakdownsResponse | null;
  analyticsWindow?: AccountOperatingModePayload["analyticsWindow"];
  decisionWindows?: AccountOperatingModePayload["decisionWindows"];
  historicalMemory?: AccountOperatingModePayload["historicalMemory"];
  decisionAsOf?: string;
}): AccountOperatingModePayload {
  const decisionMetadata = {
    ...buildOperatorDecisionMetadata({
      analyticsStartDate: input.startDate,
      analyticsEndDate: input.endDate,
      decisionAsOf: input.decisionAsOf ?? input.endDate,
    }),
    ...(input.analyticsWindow ? { analyticsWindow: input.analyticsWindow } : {}),
    ...(input.decisionWindows ? { decisionWindows: input.decisionWindows } : {}),
    ...(input.historicalMemory ? { historicalMemory: input.historicalMemory } : {}),
    ...(input.decisionAsOf ? { decisionAsOf: input.decisionAsOf } : {}),
  };
  const platform = buildPerformanceSnapshot(input.campaigns, input.breakdowns);
  const activePromos = input.snapshot.promoCalendar.filter(
    (promo) =>
      promo.severity !== "low" &&
      isPromoActiveOnDate(
        promo.startDate,
        promo.endDate,
        decisionMetadata.decisionAsOf,
      ),
  );
  const constraints = input.snapshot.operatingConstraints;
  const criticalConstraint =
    Boolean(constraints?.manualDoNotScaleReason) ||
    constraints?.stockPressureStatus === "blocked" ||
    isCriticalIssue(constraints?.siteIssueStatus) ||
    isCriticalIssue(constraints?.checkoutIssueStatus) ||
    isCriticalIssue(constraints?.conversionTrackingIssueStatus) ||
    isCriticalIssue(constraints?.feedIssueStatus);
  const watchConstraint =
    constraints?.stockPressureStatus === "watch" ||
    isWatchIssue(constraints?.siteIssueStatus) ||
    isWatchIssue(constraints?.checkoutIssueStatus) ||
    isWatchIssue(constraints?.conversionTrackingIssueStatus) ||
    isWatchIssue(constraints?.feedIssueStatus);

  const geoConstraints = findGeoConstraints(
    input.snapshot.countryEconomics,
    platform.geoShares,
  );
  const majorGeoConstraint = geoConstraints.some(
    ({ row, share }) =>
      row.serviceability === "blocked" ||
      row.scaleOverride === "hold" ||
      row.scaleOverride === "deprioritize" ||
      row.priorityTier === "tier_1" ||
      (share?.spendShare ?? 0) >= 0.25,
  );
  const performance = evaluatePerformanceAgainstTargets(input.snapshot, platform);
  const missingInputs: string[] = [];
  if (!input.snapshot.targetPack) {
    missingInputs.push("Target pack is not configured yet.");
  }
  if (!platform.hasCampaignData) {
    missingInputs.push("Meta live decision-window campaign data is unavailable.");
  }
  if (!platform.hasLocationData) {
    missingInputs.push("Meta location breakdown is unavailable for the live decision window.");
  }
  if (!input.snapshot.operatingConstraints) {
    missingInputs.push("Site health and stock pressure constraints are not configured.");
  }

  const sufficientSignal =
    platform.totals.spend >= 300 && platform.totals.purchases >= 8;
  const lowSignal =
    platform.totals.spend < 150 || platform.totals.purchases < 3 || !platform.hasCampaignData;

  let mode: AccountOperatingMode = "Explore";
  const why: string[] = [];

  if (criticalConstraint) {
    mode = "Recovery";
    why.push(
      constraints?.manualDoNotScaleReason
        ? `Manual do-not-scale is active: ${constraints.manualDoNotScaleReason}.`
        : "A critical site, checkout, feed, conversion, or stock blocker is active.",
    );
  } else if (activePromos.length > 0) {
    mode = "Peak / Promo";
    why.push(
      `Active ${activePromos[0].severity} promo is live as of ${decisionMetadata.decisionAsOf}: ${activePromos[0].title}.`,
    );
  } else if (performance.belowBreakEven || majorGeoConstraint) {
    mode = "Margin Protect";
    if (performance.belowBreakEven) {
      why.push("Live decision-window performance is below break-even or target protection thresholds.");
    }
    if (majorGeoConstraint) {
      why.push("High-priority GEO economics or serviceability constraints are limiting scale.");
    }
  } else if (performance.meetsTarget && sufficientSignal && !watchConstraint) {
    mode = "Exploit";
    why.push("Live decision-window performance is beating the configured targets with enough signal to scale.");
  } else if (performance.nearTarget || watchConstraint || geoConstraints.length > 0) {
    mode = "Stabilize";
    why.push("Signals are usable but mixed, so controlled moves are safer than aggressive scaling.");
  } else if (lowSignal || missingInputs.length > 0) {
    mode = "Explore";
    why.push("Signal volume or commercial truth coverage is still too thin for a higher-conviction operating mode.");
  }

  if (why.length === 0) {
    why.push("Commercial truth inputs and live decision-window Meta signal are still incomplete, so Explore remains the safe default.");
  }

  const activeCommercialInputs = [];
  if (input.snapshot.targetPack) {
    if (input.snapshot.targetPack.targetRoas != null) {
      activeCommercialInputs.push({
        label: "Target ROAS",
        detail: formatRatio(input.snapshot.targetPack.targetRoas),
      });
    }
    if (input.snapshot.targetPack.breakEvenRoas != null) {
      activeCommercialInputs.push({
        label: "Break-even ROAS",
        detail: formatRatio(input.snapshot.targetPack.breakEvenRoas),
      });
    }
    if (input.snapshot.targetPack.targetCpa != null) {
      activeCommercialInputs.push({
        label: "Target CPA",
        detail: formatCurrency(input.snapshot.targetPack.targetCpa),
      });
    }
    activeCommercialInputs.push({
      label: "Risk posture",
      detail: input.snapshot.targetPack.defaultRiskPosture,
    });
  }
  if (input.snapshot.countryEconomics.length === 0) {
    activeCommercialInputs.push({
      label: "Country economics",
      detail: "No country overrides; global cost structure applies to every location.",
    });
  }
  for (const promo of activePromos.slice(0, 2)) {
    activeCommercialInputs.push({
      label: "Active promo",
      detail: `${promo.title} (${promo.severity})`,
    });
  }
  for (const { row, share } of geoConstraints.slice(0, 2)) {
    activeCommercialInputs.push({
      label: `GEO ${row.countryCode}`,
      detail:
        `${row.scaleOverride.replaceAll("_", " ")} / ${row.serviceability}` +
        (share ? ` / ${round(share.spendShare * 100)}% spend share` : ""),
    });
  }
  if (constraints?.manualDoNotScaleReason) {
    activeCommercialInputs.push({
      label: "Manual guardrail",
      detail: constraints.manualDoNotScaleReason,
    });
  }
  if (constraints?.landingPageConcern) {
    activeCommercialInputs.push({
      label: "Landing page concern",
      detail: constraints.landingPageConcern,
    });
  }
  if (constraints?.merchandisingConcern) {
    activeCommercialInputs.push({
      label: "Merchandising concern",
      detail: constraints.merchandisingConcern,
    });
  }
  if (input.snapshot.costModelContext) {
    activeCommercialInputs.push({
      label: "Cost model",
      detail: "Configured separately for overview margins.",
    });
  }

  const platformInputs = [
    {
      label: "Primary window spend",
      detail: formatCurrency(platform.totals.spend),
    },
    {
      label: "Primary window ROAS",
      detail: formatRatio(platform.totals.roas),
    },
    {
      label: "Primary window CPA",
      detail: formatCurrency(platform.totals.cpa),
    },
    {
      label: "Purchases",
      detail: String(platform.totals.purchases),
    },
  ];

  if (platform.geoShares[0]) {
    platformInputs.push({
      label: "Top GEO",
      detail:
        `${platform.geoShares[0].label} (${round(platform.geoShares[0].spendShare * 100)}% spend share)`,
    });
  }
  if (platform.topCampaigns[0]) {
    platformInputs.push({
      label: "Top campaign",
      detail:
        `${platform.topCampaigns[0].name} / ${formatRatio(platform.topCampaigns[0].roas)}`,
    });
  }

  let confidence = 0.9;
  if (!input.snapshot.targetPack) confidence -= 0.18;
  if (!platform.hasCampaignData) confidence -= 0.2;
  if (!platform.hasLocationData) confidence -= 0.08;
  if (!input.snapshot.operatingConstraints) confidence -= 0.08;
  if (lowSignal) confidence -= 0.12;
  if (mode === "Explore") confidence -= 0.05;
  confidence = Math.min(0.98, Math.max(0.3, round(confidence, 2)));
  const degradedMode = buildDegradedMode({
    snapshot: input.snapshot,
    lowSignal,
    missingInputs,
  });
  if (degradedMode.active && degradedMode.confidenceCap != null) {
    confidence = Math.min(confidence, degradedMode.confidenceCap);
  }

  const authority = buildDecisionSurfaceAuthority({
    scope: "Operating Mode",
    truthState: degradedMode.active
      ? "degraded_missing_truth"
      : "live_confident",
    completeness:
      missingInputs.length === 0
        ? "complete"
        : missingInputs.length >= 3
          ? "missing"
          : "partial",
    freshness: buildDecisionFreshness({
      status: !platform.hasCampaignData || !platform.hasLocationData ? "partial" : "fresh",
      updatedAt: null,
      reason:
        !platform.hasCampaignData || !platform.hasLocationData
          ? "One or more Meta decision-window sources are incomplete."
          : null,
    }),
    missingInputs,
    reasons: degradedMode.reasons,
    actionCoreCount: degradedMode.active ? 0 : 1,
    watchlistCount: degradedMode.active ? 1 : 0,
    archiveCount: 0,
    note: degradedMode.active
      ? "Operating Mode is present but trust-capped by missing truth or low-signal inputs."
      : "Operating Mode is running on the live decision window without active truth caps.",
    sourceHealth: [
      {
        source: "Meta decision window",
        status:
          platform.hasCampaignData && platform.hasLocationData
            ? "healthy"
            : "stale",
        detail:
          platform.hasCampaignData && platform.hasLocationData
            ? "Campaign and GEO window inputs are available."
            : "One or more Meta decision-window inputs are incomplete.",
        fallbackLabel:
          platform.hasCampaignData && platform.hasLocationData
            ? null
            : "low-signal fallback",
      },
      {
        source: "Commercial truth",
        status:
          input.snapshot.coverage?.freshness.status === "fresh"
            ? "healthy"
            : input.snapshot.coverage?.freshness.status === "stale"
              ? "stale"
              : "degraded",
        detail:
          input.snapshot.coverage?.freshness.reason ??
          "Commercial truth is configured for operating mode.",
        fallbackLabel:
          input.snapshot.coverage?.freshness.status === "fresh"
            ? null
            : "shared trust ceiling",
      },
    ],
    readReliability:
      platform.hasCampaignData && platform.hasLocationData
        ? {
            status:
              input.snapshot.coverage?.freshness.status === "fresh"
                ? "stable"
                : "fallback",
            determinism:
              input.snapshot.coverage?.freshness.status === "fresh"
                ? "stable"
                : "watch",
            detail:
              input.snapshot.coverage?.freshness.status === "fresh"
                ? "Operating Mode is reading stable platform and commercial inputs."
                : "Operating Mode is readable, but missing or stale truth keeps the mode trust-capped.",
          }
        : {
            status: "fallback",
            determinism: "watch",
            detail:
              "Operating Mode is using labeled fallback posture because platform inputs are incomplete.",
          },
  });

  return {
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
    analyticsWindow: decisionMetadata.analyticsWindow,
    decisionWindows: decisionMetadata.decisionWindows,
    historicalMemory: decisionMetadata.historicalMemory,
    decisionAsOf: decisionMetadata.decisionAsOf,
    currentMode: mode,
    recommendedMode: mode,
    confidence,
    why,
    guardrails: guardrailsForMode(mode, {
      hasPromo: activePromos.length > 0,
      geoConstraints,
      hasLandingConcern: Boolean(constraints?.landingPageConcern),
      hasMerchandisingConcern: Boolean(constraints?.merchandisingConcern),
    }),
    changeTriggers: changeTriggersForMode(
      mode,
      decisionMetadata.decisionWindows.primary30d.label,
    ),
    activeCommercialInputs,
    platformInputs,
    missingInputs,
    degradedMode,
    commercialSummary: input.snapshot.coverage,
    authority,
  };
}
