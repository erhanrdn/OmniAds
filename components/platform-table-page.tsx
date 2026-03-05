"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BUSINESSES, useAppStore } from "@/store/app-store";
import { getPlatformTable } from "@/src/services";
import { MetricsRow, Platform, PlatformLevel, PlatformTableRow } from "@/src/types";
import { LoadingSkeleton } from "@/components/states/loading-skeleton";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Plus, X } from "lucide-react";

interface PlatformTablePageProps {
  platform: Platform;
  title: string;
  description: string;
}

type TabValue = "campaigns" | "adSets" | "ads";
type SortDirection = "asc" | "desc";
type StatusFilter = "all" | "active" | "paused";
type MetricColumn = keyof Pick<
  MetricsRow,
  "spend" | "purchases" | "revenue" | "roas" | "cpa" | "ctr" | "cpm"
>;
type SortColumn = "name" | "status" | MetricColumn;

const DATE_RANGE = {
  startDate: "2026-02-01",
  endDate: "2026-03-01",
};

const TAB_TO_LEVEL: Record<TabValue, PlatformLevel> = {
  campaigns: PlatformLevel.CAMPAIGN,
  adSets: PlatformLevel.AD_SET,
  ads: PlatformLevel.AD,
};

const DEFAULT_COLUMNS: MetricColumn[] = [
  "spend",
  "purchases",
  "revenue",
  "roas",
  "cpa",
  "ctr",
  "cpm",
];

const ALL_METRIC_OPTIONS: Array<{ key: MetricColumn; label: string }> = [
  { key: "spend", label: "Spend" },
  { key: "purchases", label: "Purchases" },
  { key: "revenue", label: "Revenue" },
  { key: "roas", label: "ROAS" },
  { key: "cpa", label: "CPA" },
  { key: "ctr", label: "CTR" },
  { key: "cpm", label: "CPM" },
];

export function PlatformTablePage({
  platform,
  title,
  description,
}: PlatformTablePageProps) {
  const selectedBusinessId = useAppStore((state) => state.selectedBusinessId);
  const businessId = selectedBusinessId ?? BUSINESSES[0].id;

  const [activeTab, setActiveTab] = useState<TabValue>("campaigns");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortColumn, setSortColumn] = useState<SortColumn>("spend");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selectedAccountId, setSelectedAccountId] = useState<string>("all");
  const [visibleColumns, setVisibleColumns] = useState<MetricColumn[]>(DEFAULT_COLUMNS);
  const [draftColumns, setDraftColumns] = useState<MetricColumn[]>(DEFAULT_COLUMNS);
  const [isMetricsModalOpen, setIsMetricsModalOpen] = useState(false);

  const accountQuery = useQuery({
    queryKey: ["platform-accounts", platform, businessId],
    queryFn: () =>
      getPlatformTable(
        platform,
        PlatformLevel.ACCOUNT,
        businessId,
        null,
        DATE_RANGE,
        ["spend", "purchases", "revenue", "roas", "cpa", "ctr", "cpm"]
      ),
  });

  const level = TAB_TO_LEVEL[activeTab];
  const tableQuery = useQuery({
    queryKey: [
      "platform-table",
      platform,
      level,
      businessId,
      selectedAccountId,
      visibleColumns.join(","),
    ],
    queryFn: () =>
      getPlatformTable(
        platform,
        level,
        businessId,
        selectedAccountId === "all" ? null : selectedAccountId,
        DATE_RANGE,
        visibleColumns
      ),
  });

  const enabledAccounts = useMemo(() => {
    const rows = accountQuery.data ?? [];
    const activeRows = rows.filter((row) => row.status === "active");
    return activeRows.length > 0 ? activeRows : rows;
  }, [accountQuery.data]);

  useEffect(() => {
    if (enabledAccounts.length === 0) return;
    if (
      selectedAccountId !== "all" &&
      !enabledAccounts.some((account) => account.accountId === selectedAccountId)
    ) {
      setSelectedAccountId(enabledAccounts[0].accountId);
    }
  }, [enabledAccounts, selectedAccountId]);

  const filteredRows = useMemo(() => {
    const rows = tableQuery.data ?? [];
    const byStatus =
      statusFilter === "all" ? rows : rows.filter((row) => row.status === statusFilter);

    const sorted = [...byStatus].sort((a, b) => {
      const multiplier = sortDirection === "asc" ? 1 : -1;
      if (sortColumn === "name" || sortColumn === "status") {
        return a[sortColumn].localeCompare(b[sortColumn]) * multiplier;
      }
      const aValue = a.metrics[sortColumn] ?? 0;
      const bValue = b.metrics[sortColumn] ?? 0;
      return (aValue - bValue) * multiplier;
    });

    return sorted;
  }, [tableQuery.data, sortColumn, sortDirection, statusFilter]);

  const openMetricsModal = () => {
    setDraftColumns(visibleColumns);
    setIsMetricsModalOpen(true);
  };

  const toggleDraftColumn = (column: MetricColumn) => {
    setDraftColumns((prev) =>
      prev.includes(column) ? prev.filter((item) => item !== column) : [...prev, column]
    );
  };

  const applyMetricsSelection = () => {
    if (draftColumns.length === 0) return;
    const ordered = ALL_METRIC_OPTIONS.map((item) => item.key).filter((key) =>
      draftColumns.includes(key)
    );
    setVisibleColumns(ordered);
    setIsMetricsModalOpen(false);
  };

  const tabs: Array<{ key: TabValue; label: string }> = [
    { key: "campaigns", label: "Campaigns" },
    { key: "adSets", label: platform === Platform.GOOGLE ? "Ad Groups" : "Ad Sets" },
    { key: "ads", label: "Ads" },
  ];

  const isLoading = tableQuery.isLoading || accountQuery.isLoading;
  const isError = tableQuery.isError || accountQuery.isError;

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              activeTab === tab.key
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Account
        </label>
        <select
          value={selectedAccountId}
          onChange={(event) => setSelectedAccountId(event.target.value)}
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          <option value="all">All enabled accounts</option>
          {enabledAccounts.map((account) => (
            <option key={account.accountId} value={account.accountId}>
              {account.name}
            </option>
          ))}
        </select>

        <label className="ml-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Status
        </label>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
        </select>

        <label className="ml-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Sort
        </label>
        <select
          value={sortColumn}
          onChange={(event) => setSortColumn(event.target.value as SortColumn)}
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          <option value="name">Name</option>
          <option value="status">Status</option>
          {ALL_METRIC_OPTIONS.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>

        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))
          }
        >
          {sortDirection === "asc" ? "Asc" : "Desc"}
        </Button>

        <Button variant="outline" size="sm" onClick={openMetricsModal}>
          <Plus className="h-4 w-4" />
          Add metrics
        </Button>
      </div>

      {isLoading && <LoadingSkeleton rows={3} />}
      {isError && <ErrorState onRetry={() => tableQuery.refetch()} />}
      {!isLoading && !isError && filteredRows.length === 0 && (
        <EmptyState
          title="No rows found"
          description="No rows match the selected account, level, or filters."
        />
      )}

      {!isLoading && !isError && filteredRows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/45 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Status</th>
                {visibleColumns.map((column) => (
                  <th key={column} className="px-4 py-3 font-medium uppercase">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-4 py-3">{row.name}</td>
                  <td className="px-4 py-3">
                    <Badge variant={row.status === "active" ? "default" : "secondary"}>
                      {row.status}
                    </Badge>
                  </td>
                  {visibleColumns.map((column) => (
                    <td key={column} className="px-4 py-3">
                      {formatMetricCell(column, row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isMetricsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-xl border bg-background p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold">Manage metric columns</h3>
              <button
                type="button"
                className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                onClick={() => setIsMetricsModalOpen(false)}
                aria-label="Close metrics modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2">
              {ALL_METRIC_OPTIONS.map((option) => (
                <label
                  key={option.key}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <span>{option.label}</span>
                  <input
                    type="checkbox"
                    checked={draftColumns.includes(option.key)}
                    onChange={() => toggleDraftColumn(option.key)}
                  />
                </label>
              ))}
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              At least one metric column must remain selected.
            </p>

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsMetricsModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={applyMetricsSelection} disabled={draftColumns.length === 0}>
                Apply
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatMetricCell(column: MetricColumn, row: PlatformTableRow) {
  const value = row.metrics[column];
  if (typeof value !== "number") return "-";
  if (column === "spend" || column === "revenue" || column === "cpa" || column === "cpm") {
    return `$${value.toLocaleString()}`;
  }
  if (column === "roas") return value.toFixed(2);
  if (column === "ctr") return `${value.toFixed(2)}%`;
  return value.toLocaleString();
}
