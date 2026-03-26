"use client";

import { SortableTable, type ColumnDef } from "./SortableTable";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrencySmart, formatPercentFromRatioSmart } from "@/lib/metric-format";

interface ProductRow {
  name: string;
  views: number;
  addToCarts: number;
  checkouts: number;
  purchases: number;
  revenue: number;
  atcRate: number;
  checkoutRate: number;
  purchaseRate: number;
}

function fmt(n: number, type: "number" | "percent" | "currency" = "number"): string {
  if (isNaN(n)) return "—";
  if (type === "percent") return formatPercentFromRatioSmart(n);
  if (type === "currency") {
    return formatCurrencySmart(n, "$");
  }
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

const columns: ColumnDef<ProductRow>[] = [
  {
    key: "name",
    header: "Product",
    accessor: (r) => r.name,
    sticky: true,
    render: (r) => (
      <span className="font-medium max-w-[200px] truncate block" title={r.name}>
        {r.name}
      </span>
    ),
  },
  {
    key: "views",
    header: "Views",
    accessor: (r) => r.views,
    align: "right",
    render: (r) => fmt(r.views),
  },
  {
    key: "addToCarts",
    header: "Add to Cart",
    accessor: (r) => r.addToCarts,
    align: "right",
    render: (r) => fmt(r.addToCarts),
  },
  {
    key: "checkouts",
    header: "Checkout",
    accessor: (r) => r.checkouts,
    align: "right",
    render: (r) => fmt(r.checkouts),
  },
  {
    key: "purchases",
    header: "Purchases",
    accessor: (r) => r.purchases,
    align: "right",
    render: (r) => fmt(r.purchases),
  },
  {
    key: "atcRate",
    header: "ATC Rate",
    accessor: (r) => r.atcRate,
    align: "right",
    heatmap: true,
    render: (r) => fmt(r.atcRate, "percent"),
  },
  {
    key: "checkoutRate",
    header: "Checkout Rate",
    accessor: (r) => r.checkoutRate,
    align: "right",
    heatmap: true,
    render: (r) => fmt(r.checkoutRate, "percent"),
  },
  {
    key: "purchaseRate",
    header: "Purchase Rate",
    accessor: (r) => r.purchaseRate,
    align: "right",
    heatmap: true,
    render: (r) => fmt(r.purchaseRate, "percent"),
  },
  {
    key: "revenue",
    header: "Revenue",
    accessor: (r) => r.revenue,
    align: "right",
    render: (r) => fmt(r.revenue, "currency"),
  },
];

interface ProductFunnelSectionProps {
  products?: ProductRow[];
  isLoading: boolean;
}

export function ProductFunnelSection({
  products,
  isLoading,
}: ProductFunnelSectionProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Shows where products lose users through the purchase funnel. Higher rates
        are better — red values need attention.
      </p>
      <SortableTable
        columns={columns}
        rows={products ?? []}
        defaultSortKey="views"
        emptyText="No product funnel data found for this date range."
      />
    </div>
  );
}
