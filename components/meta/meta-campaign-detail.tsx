"use client";

/**
 * components/meta/meta-campaign-detail.tsx
 *
 * Right panel in the master-detail layout.
 *
 * Two states:
 *  - No campaign selected: shows account-level recommendations + placement breakdown
 *  - Campaign selected: recommendation (if any) + metric grid + ad-set list
 */

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useCurrencySymbol } from "@/hooks/use-currency";
import type { MetaCampaignTableRow } from "@/components/meta/meta-campaign-table";
import type { MetaRecommendation, MetaRecommendationsResponse } from "@/lib/meta/recommendations";
import { MetaAccountRecs } from "@/components/meta/meta-account-recs";
import type { MetaAdSetsResponse } from "@/app/api/meta/adsets/route";
import type { MetaBreakdownsResponse } from "@/app/api/meta/breakdowns/route";
import { MetaBreakdownGrid, type BreakdownRow } from "@/components/meta/meta-breakdown-grid";
import type { PlacementChartRow } from "@/components/meta/placement-breakdown-chart";
import { MetaOperatingModeCard } from "@/components/meta/meta-operating-mode-card";
import type { CommandCenterAction, CommandCenterResponse } from "@/lib/command-center";
import type { MetaDecisionOsV1Response } from "@/lib/meta/decision-os";
import { MetaCampaignDecisionPanel, MetaDecisionOsOverview } from "@/components/meta/meta-decision-os";
import { buildMetaOperatorItemFromCampaign } from "@/lib/meta/operator-surface";
import { operatorStateLabel } from "@/lib/operator-surface";
import { getCommandCenter } from "@/src/services";

// ── Formatters ────────────────────────────────────────────────────────────────

function formatRelativeAge(isoValue: string | null | undefined): string | null {
  if (!isoValue) return null;
  const timestamp = new Date(isoValue).getTime();
  if (!Number.isFinite(timestamp)) return null;
  const diffMs = Date.now() - timestamp;
  if (diffMs < 0) return null;
  const minute = 60_000, hour = 60 * minute, day = 24 * hour, month = 30 * day, year = 365 * day;
  if (diffMs >= year) return `${Math.floor(diffMs / year)}y ago`;
  if (diffMs >= month) return `${Math.floor(diffMs / month)}mo ago`;
  if (diffMs >= day) return `${Math.floor(diffMs / day)}d ago`;
  if (diffMs >= hour) return `${Math.floor(diffMs / hour)}h ago`;
  if (diffMs >= minute) return `${Math.floor(diffMs / minute)}m ago`;
  return "just now";
}

function fmt$(n: number, sym = "$") {
  return `${sym}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtK(n: number, sym = "$") {
  if (n >= 1_000_000) return `${sym}${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${sym}${(n / 1_000).toFixed(1)}k`;
  return fmt$(n, sym);
}

// ── Decision badge ────────────────────────────────────────────────────────────

function DecisionBadge({ state }: { state: MetaRecommendation["decisionState"] }) {
  const cls =
    state === "act"
      ? "bg-foreground text-background"
      : state === "test"
      ? "bg-violet-500/10 text-violet-700"
      : "bg-muted text-muted-foreground";

  const labels: Record<typeof state, string> = { act: "ACT", test: "TEST", watch: "WATCH" };

  return (
    <span className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${cls}`}>
      {labels[state]}
    </span>
  );
}

// ── ROAS color ────────────────────────────────────────────────────────────────

function roasColor(roas: number) {
  if (roas > 2.5) return "text-emerald-600";
  if (roas >= 1.5) return "text-amber-500";
  return "text-red-500";
}

// ── Metric tile ───────────────────────────────────────────────────────────────

function MetricTile({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg border bg-white px-3 py-2 shadow-sm shadow-slate-100/60">
      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className={cn("mt-0.5 font-mono text-sm font-bold tabular-nums leading-tight", valueClass ?? "text-slate-950")}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[9px] text-slate-400">{sub}</p>}
    </div>
  );
}

function MetaCommandCenterCard({
  actions,
  href,
  isLoading = false,
}: {
  actions: CommandCenterAction[];
  href: string;
  isLoading?: boolean;
}) {
  const pendingCount = actions.filter((action) => action.status === "pending").length;
  const approvedCount = actions.filter((action) => action.status === "approved").length;
  const snoozedCount = actions.filter((action) => action.status === "snoozed").length;

  return (
    <div
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      data-testid="meta-command-center-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Command Center
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-950">
            {isLoading
              ? "Loading workflow items for this surface"
              : actions.length > 0
              ? `${actions.length} workflow items linked to this surface`
              : "Open the shared team workflow panel"}
          </p>
        </div>
        <a
          href={href}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Open in Command Center
        </a>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">
          Pending {pendingCount}
        </span>
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
          Approved {approvedCount}
        </span>
        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">
          Snoozed {snoozedCount}
        </span>
      </div>
    </div>
  );
}

function actionTone(action: string) {
  if (action === "pause" || action === "cut" || action === "reduce_budget") {
    return "bg-red-500/10 text-red-700";
  }
  if (action === "scale_budget" || action === "recover") {
    return "bg-emerald-500/10 text-emerald-700";
  }
  if (action === "rebuild" || action === "review_hold") {
    return "bg-amber-500/10 text-amber-700";
  }
  return "bg-slate-100 text-slate-700";
}

function trustTone(disposition: string) {
  if (disposition === "profitable_truth_capped") return "bg-fuchsia-500/10 text-fuchsia-700";
  if (disposition === "protected_watchlist") return "bg-blue-500/10 text-blue-700";
  if (disposition === "review_hold" || disposition === "review_reduce") return "bg-amber-500/10 text-amber-700";
  if (disposition === "monitor_low_truth") return "bg-sky-500/10 text-sky-700";
  if (disposition === "archive_only") return "bg-slate-100 text-slate-700";
  return "bg-slate-100 text-slate-700";
}

function CampaignOperatorHeadline({
  recommendation,
  campaignDecision,
}: {
  recommendation: MetaRecommendation | null;
  campaignDecision: MetaDecisionOsV1Response["campaigns"][number] | null;
}) {
  const operatorItem = campaignDecision ? buildMetaOperatorItemFromCampaign(campaignDecision) : null;

  if (!recommendation && !campaignDecision) return null;

  return (
    <div
      className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-4 shadow-sm"
      data-testid="meta-campaign-operator-headline"
    >
      <div className="flex flex-wrap items-center gap-2.5">
        {campaignDecision ? (
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide",
              actionTone(campaignDecision.primaryAction),
            )}
          >
            {operatorItem?.primaryAction ?? campaignDecision.primaryAction.replaceAll("_", " ")}
          </span>
        ) : recommendation ? (
          <DecisionBadge state={recommendation.decisionState} />
        ) : null}
        {operatorItem ? (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
            {operatorStateLabel(operatorItem.authorityState)}
          </span>
        ) : null}
        {campaignDecision?.trust?.operatorDisposition &&
        campaignDecision.trust.operatorDisposition !== "standard" ? (
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide",
              trustTone(campaignDecision.trust.operatorDisposition),
            )}
          >
            {campaignDecision.trust.operatorDisposition.replaceAll("_", " ")}
          </span>
        ) : null}
        <p className="text-[11px] text-slate-500">
          {campaignDecision
            ? "Primary action owner"
            : recommendation?.title ?? "Derived operator guidance"}
        </p>
      </div>
      <p className="mt-2.5 text-base font-semibold leading-snug text-slate-950">
        {campaignDecision
          ? operatorItem?.reason ?? campaignDecision.why
          : recommendation?.recommendedAction ?? "No operator headline available."}
      </p>
      {operatorItem?.secondaryLabels?.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {operatorItem.secondaryLabels.slice(0, 2).map((label) => (
            <span
              key={label}
              className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-slate-700"
            >
              {label}
            </span>
          ))}
        </div>
      ) : null}
      {campaignDecision?.creativeCandidates?.count ? (
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          {campaignDecision.creativeCandidates.summary}
        </p>
      ) : recommendation?.why ? (
        <p className="mt-3 text-xs leading-relaxed text-slate-500">{recommendation.why}</p>
      ) : null}
      {operatorItem?.blocker ? (
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          Blocker: {operatorItem.blocker}
        </p>
      ) : null}
      {(recommendation?.evidence.length ?? 0) > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {recommendation?.evidence.slice(0, 3).map((ev) => (
            <div
              key={ev.label}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm"
            >
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                {ev.label}
              </p>
              <p className="text-xs font-semibold text-slate-800">{ev.value}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface MetaCampaignDetailProps {
  campaign: MetaCampaignTableRow | null;
  recommendationsData: MetaRecommendationsResponse | undefined;
  decisionOsData: MetaDecisionOsV1Response | null | undefined;
  isDecisionOsLoading: boolean;
  isRecsLoading: boolean;
  lastAnalyzedAt: Date | null;
  recommendationsError?: string | null;
  checkedRecIds: Set<string>;
  onToggleCheck: (id: string) => void;
  onAnalyze: () => void;
  onClearSelection: () => void;
  businessId: string;
  since: string;
  until: string;
  language: "en" | "tr";
}

// ── Ad-set list ───────────────────────────────────────────────────────────────

function AdSetList({
  campaignId,
  businessId,
  since,
  until,
  sym,
  language,
}: {
  campaignId: string;
  businessId: string;
  since: string;
  until: string;
  sym: string;
  language: "en" | "tr";
}) {
  const { data, isLoading, isError } = useQuery<MetaAdSetsResponse>({
    queryKey: ["meta-adsets", businessId, campaignId, since, until],
    queryFn: async () => {
      const params = new URLSearchParams({ businessId, campaignId, startDate: since, endDate: until });
      const res = await fetch(`/api/meta/adsets?${params}`);
      if (!res.ok) throw new Error("adsets fetch failed");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="space-y-1.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" />
        ))}
      </div>
    );
  }

  if (isError || !data?.rows?.length) {
    return (
      <p className="text-xs text-muted-foreground">
        {language === "tr" ? "Ad set verisi yok." : "No ad set data for this range."}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {data.rows.map((adset) => {
        const roas = adset.spend > 0 ? adset.revenue / adset.spend : 0;
        const isActive = adset.status.toLowerCase() === "active";

        // Bid zone
        const bidLabel = adset.bidStrategyLabel ?? "—";
        const bidValueStr = adset.bidValue != null
          ? adset.bidValueFormat === "roas"
            ? `${adset.bidValue.toFixed(2)}×`
            : fmt$(adset.bidValue / 100, sym)
          : null;
        const prevBidValueStr = adset.previousBidValue != null
          ? (adset.previousBidValueFormat ?? adset.bidValueFormat) === "roas"
            ? `${adset.previousBidValue.toFixed(2)}×`
            : fmt$(adset.previousBidValue / 100, sym)
          : null;
        const prevBidAge = adset.previousBidValueCapturedAt
          ? formatRelativeAge(adset.previousBidValueCapturedAt)
          : null;

        // Link CTR: prefer inline_link_click_ctr (link clicks / impressions),
        // fall back to generic ctr (all clicks / impressions) for warehouse data.
        const linkCtr = adset.inlineLinkClickCtr ?? adset.ctr;
        const ctrStr = linkCtr != null && linkCtr > 0
          ? `${linkCtr.toFixed(2)}%`
          : "—";

        return (
          <div
            key={adset.id}
            className="rounded-xl border border-slate-100 bg-white px-3 py-2.5 shadow-sm"
          >
            <div className="flex items-start gap-3">
              {/* Zone 1 — Identity (fixed ~35% so short names don't expand) */}
              <div className="flex w-[35%] min-w-0 shrink-0 items-start gap-2">
                <span className={cn("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", isActive ? "bg-emerald-500" : "bg-slate-400")} />
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-semibold text-slate-800">{adset.name}</p>
                  {adset.optimizationGoal && (
                    <p className="mt-0.5 truncate text-[10px] uppercase tracking-wide text-slate-400">
                      {adset.optimizationGoal}
                    </p>
                  )}
                </div>
              </div>

              {/* Zone 2 — Bid (flex-1 so it fills remaining space between name and metrics) */}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                    {bidLabel}
                  </span>
                  {bidValueStr && (
                    <span className="font-mono text-[12px] font-bold text-slate-800">
                      {bidValueStr}
                    </span>
                  )}
                </div>
                {prevBidValueStr && (
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    ← {prevBidValueStr}{prevBidAge ? ` · ${prevBidAge}` : ""}
                  </p>
                )}
              </div>

              {/* Zone 3 — Metrics: Spend | ROAS | CPA | CTR */}
              <div className="flex shrink-0 items-center gap-3">
                <div className="text-right">
                  <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">Spend</p>
                  <p className="font-mono text-[11px] font-bold tabular-nums text-slate-700">{fmtK(adset.spend, sym)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">ROAS</p>
                  <p className={cn("font-mono text-[11px] font-bold tabular-nums", roasColor(roas))}>{roas.toFixed(2)}×</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">CPA</p>
                  <p className="font-mono text-[11px] font-bold tabular-nums text-slate-700">{fmt$(adset.cpa, sym)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">CTR</p>
                  <p className="font-mono text-[11px] font-bold tabular-nums text-slate-700">{ctrStr}</p>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Empty / account overview state ───────────────────────────────────────────

interface AccountOverviewProps {
  recommendationsData: MetaRecommendationsResponse | undefined;
  decisionOsData: MetaDecisionOsV1Response | null | undefined;
  isDecisionOsLoading: boolean;
  isRecsLoading: boolean;
  lastAnalyzedAt: Date | null;
  recommendationsError?: string | null;
  checkedRecIds: Set<string>;
  onToggleCheck: (id: string) => void;
  onAnalyze: () => void;
  ageRows: BreakdownRow[];
  placementRows: PlacementChartRow[];
  isBreakdownLoading: boolean;
  businessId: string;
  since: string;
  until: string;
  language: "en" | "tr";
  commandCenterActions: CommandCenterAction[];
  isCommandCenterLoading: boolean;
  supportingContextOpen: boolean;
  onSupportingContextToggle: (open: boolean) => void;
}

function AccountOverview(props: AccountOverviewProps) {
  return (
    <div className="space-y-4 p-6" data-testid="meta-account-overview">
      <MetaDecisionOsOverview
        decisionOs={props.decisionOsData}
        isLoading={props.isDecisionOsLoading}
        compact
      />
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
          Account Drilldown
        </p>
        <p className="mt-1 text-sm font-semibold text-slate-950">
          Use the operator surface here to pick the campaign that needs review next.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          Campaign Drilldown stays on the left, while account-level authority and supporting
          context now stay together in this detail pane.
        </p>
      </div>
      <details
        className="rounded-2xl border border-slate-200 bg-white shadow-sm"
        data-testid="meta-supporting-context"
        onToggle={(event) =>
          props.onSupportingContextToggle(event.currentTarget.open)
        }
      >
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-900">
          Workflow and context
        </summary>
        {props.supportingContextOpen ? (
          <div className="space-y-4 border-t border-slate-200 px-4 py-4">
            <MetaOperatingModeCard
              businessId={props.businessId}
              startDate={props.since}
              endDate={props.until}
              enabled={props.supportingContextOpen}
            />
            <MetaCommandCenterCard
              actions={props.commandCenterActions}
              href={`/command-center?startDate=${encodeURIComponent(props.since)}&endDate=${encodeURIComponent(props.until)}`}
              isLoading={props.isCommandCenterLoading}
            />
            <MetaAccountRecs
              recommendationsData={props.recommendationsData}
              isRecsLoading={props.isRecsLoading}
              lastAnalyzedAt={props.lastAnalyzedAt}
              checkedRecIds={props.checkedRecIds}
              onToggleCheck={props.onToggleCheck}
              onAnalyze={props.onAnalyze}
              analysisError={props.recommendationsError}
              language={props.language}
            />
            <MetaBreakdownGrid
              ageRows={props.ageRows}
              placementRows={props.placementRows}
              isLoading={props.isBreakdownLoading}
              language={props.language}
            />
          </div>
        ) : null}
      </details>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MetaCampaignDetail({
  campaign,
  recommendationsData,
  decisionOsData,
  isDecisionOsLoading,
  isRecsLoading,
  lastAnalyzedAt,
  recommendationsError,
  checkedRecIds,
  onToggleCheck,
  onAnalyze,
  onClearSelection,
  businessId,
  since,
  until,
  language,
}: MetaCampaignDetailProps) {
  const sym = useCurrencySymbol();
  const [supportingContextOpen, setSupportingContextOpen] = useState(false);
  const [workflowContextOpen, setWorkflowContextOpen] = useState(false);
  const shouldLoadBreakdowns = Boolean(
    !campaign && supportingContextOpen && businessId && since && until
  );
  const commandCenterQuery = useQuery<CommandCenterResponse>({
    queryKey: ["command-center-meta-overlay", businessId, since, until],
    enabled: Boolean(
      businessId &&
        since &&
        until &&
        (supportingContextOpen || workflowContextOpen)
    ),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: () => getCommandCenter(businessId, since, until),
  });
  const breakdownsQuery = useQuery<MetaBreakdownsResponse>({
    queryKey: ["meta-breakdowns", businessId, since, until],
    enabled: shouldLoadBreakdowns,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const params = new URLSearchParams({
        businessId,
        startDate: since,
        endDate: until,
      });
      const res = await fetch(`/api/meta/breakdowns?${params.toString()}`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.message ?? `Request failed (${res.status})`);
      }
      return payload as MetaBreakdownsResponse;
    },
  });
  const metaCommandCenterActions = (commandCenterQuery.data?.actions ?? []).filter(
    (action) => action.sourceSystem === "meta",
  );
  const placementRows = useMemo(
    () =>
      (breakdownsQuery.data?.placement ?? []).map((row) => ({
        key: row.key,
        label: row.label,
        spend: row.spend,
        roas: row.spend > 0 ? row.revenue / row.spend : 0,
      })),
    [breakdownsQuery.data?.placement]
  );

  useEffect(() => {
    if (campaign) setSupportingContextOpen(false);
  }, [campaign]);

  useEffect(() => {
    if (!campaign) setWorkflowContextOpen(false);
  }, [campaign]);

  if (!campaign) {
    return (
      <AccountOverview
        recommendationsData={recommendationsData}
        decisionOsData={decisionOsData}
        isDecisionOsLoading={isDecisionOsLoading}
        isRecsLoading={isRecsLoading}
        lastAnalyzedAt={lastAnalyzedAt}
        recommendationsError={recommendationsError}
        checkedRecIds={checkedRecIds}
        onToggleCheck={onToggleCheck}
        onAnalyze={onAnalyze}
        ageRows={breakdownsQuery.data?.age ?? []}
        placementRows={placementRows}
        isBreakdownLoading={breakdownsQuery.isLoading}
        businessId={businessId}
        since={since}
        until={until}
        language={language}
        commandCenterActions={metaCommandCenterActions}
        isCommandCenterLoading={commandCenterQuery.isLoading}
        supportingContextOpen={supportingContextOpen}
        onSupportingContextToggle={setSupportingContextOpen}
      />
    );
  }

  // Find this campaign's recommendation (highest priority = act > test > watch)

  const ORDER: Record<MetaRecommendation["decisionState"], number> = { act: 0, test: 1, watch: 2 };
  const rec = (recommendationsData?.recommendations ?? [])
    .filter((r) => r.campaignId === campaign.id)
    .sort((a, b) => ORDER[a.decisionState] - ORDER[b.decisionState])[0] ?? null;
  const campaignDecision =
    decisionOsData?.campaigns.find((decision) => decision.campaignId === campaign.id) ?? null;
  const campaignAdSetDecisions =
    decisionOsData?.adSets.filter((decision) => decision.campaignId === campaign.id) ?? [];
  const campaignCommandCenterActions = metaCommandCenterActions.filter(
    (action) =>
      action.relatedEntities.some(
        (entity) => entity.type === "campaign" && entity.id === campaign.id,
      ),
  );

  const roas = campaign.roas;


  return (
    <div className="space-y-5 p-6" data-testid="meta-campaign-detail">
      {/* Back breadcrumb */}
      <button
        onClick={onClearSelection}
        className="flex items-center gap-1 text-[11px] text-slate-400 transition-colors hover:text-slate-600"
      >
        ← {language === "tr" ? "Hesap Geneli" : "Account Overview"}
      </button>

      {/* Campaign header */}
      <div>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              {campaign.objective ?? "—"}
            </p>
            <h2 className="mt-0.5 text-lg font-bold leading-tight text-slate-950">
              {campaign.name}
            </h2>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold uppercase",
              campaign.status.toLowerCase() === "active"
                ? "bg-emerald-500/10 text-emerald-700"
                : "bg-slate-400/10 text-slate-500"
            )}
          >
            {campaign.status}
          </span>
        </div>
      </div>

      <CampaignOperatorHeadline
        recommendation={rec}
        campaignDecision={campaignDecision}
      />

      {campaignDecision || campaignAdSetDecisions.length > 0 ? (
        <details className="rounded-2xl border border-slate-200 bg-white shadow-sm" data-testid="meta-campaign-reasoning">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-900">
            Show campaign reasoning
          </summary>
          <div className="border-t border-slate-200 px-4 py-4">
            <MetaCampaignDecisionPanel
              campaignDecision={campaignDecision}
              adSetDecisions={campaignAdSetDecisions}
            />
          </div>
        </details>
      ) : null}

      {/* Metric grid — Spend / Revenue / ROAS / CPA / Budget */}
      <div className="grid grid-cols-5 gap-1.5">
        <MetricTile label="Spend" value={fmtK(campaign.spend, sym)} />
        <MetricTile label="Revenue" value={fmtK(campaign.revenue, sym)} valueClass="text-emerald-600" />
        <MetricTile label="ROAS" value={`${roas.toFixed(2)}×`} valueClass={roasColor(roas)} />
        <MetricTile label="CPA" value={fmt$(campaign.cpa, sym)} />
        {(campaign.dailyBudget != null || campaign.lifetimeBudget != null) && (
          <MetricTile
            label={language === "tr" ? "Bütçe" : "Budget"}
            value={campaign.dailyBudget != null
              ? `${fmt$(campaign.dailyBudget / 100, sym)}/day`
              : `${fmt$(campaign.lifetimeBudget! / 100, sym)} lifetime`}
            sub={(campaign.previousDailyBudget != null || campaign.previousLifetimeBudget != null)
              ? `prev ${campaign.previousDailyBudget != null
                  ? `${fmt$(campaign.previousDailyBudget / 100, sym)}/d`
                  : `${fmt$(campaign.previousLifetimeBudget! / 100, sym)}`}${campaign.previousBudgetCapturedAt ? ` · ${formatRelativeAge(campaign.previousBudgetCapturedAt)}` : ""}`
              : undefined}
          />
        )}
      </div>

      <details
        className="rounded-2xl border border-slate-200 bg-white shadow-sm"
        data-testid="meta-campaign-secondary-context"
        onToggle={(event) => setWorkflowContextOpen(event.currentTarget.open)}
      >
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-900">
          Workflow context
        </summary>
        {workflowContextOpen ? (
          <div className="border-t border-slate-200 px-4 py-4">
            <MetaCommandCenterCard
              actions={campaignCommandCenterActions}
              href={`/command-center?startDate=${encodeURIComponent(since)}&endDate=${encodeURIComponent(until)}${campaignCommandCenterActions[0] ? `&action=${encodeURIComponent(campaignCommandCenterActions[0].actionFingerprint)}` : ""}`}
              isLoading={commandCenterQuery.isLoading}
            />
          </div>
        ) : null}
      </details>

      {/* Ad sets */}
      <div className="space-y-2" data-testid="meta-adsets-section">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
          {language === "tr" ? "Ad Set'ler" : "Ad Sets"}
        </p>
        <AdSetList
          campaignId={campaign.id}
          businessId={businessId}
          since={since}
          until={until}
          sym={sym}
          language={language}
        />
      </div>

    </div>
  );
}
